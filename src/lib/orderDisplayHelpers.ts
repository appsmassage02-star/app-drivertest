import type {
  AppSectionSettingsState,
  CentralGeoContext,
  DeliveryDriver,
} from '../types';
import type { DeliveryOrder } from '../App';
import type { PharmacyOrder } from '../types/pharmacy';
import {
  DriverGPSLocation,
  extractOrderCoordinates,
  isValidCoordinate,
} from './gpsService';
import {
  evaluateCentralCoverageMatch,
  extractOrderFinancialBreakdown,
  isOrderEligibleForDriver,
} from './geoCoverageService';
import {
  isRestaurantOrder,
  isRestaurantOrderForDriver,
} from './restaurantService';
import { isPharmacyOrderMatchingDriverTerritory } from './pharmacyService';
import { evaluateSectionOperationalStatus } from './sectionSettingsService';

export type OrderCategoryKind = 'regular' | 'restaurant' | 'pharmacy';

export interface OrderDistanceDisplay {
  available: boolean;
  distanceKm: number | null;
  formatted: string;
}

export interface UnifiedChronologicalOrderItem {
  id: string;
  kind: OrderCategoryKind;
  sortTimestamp: number;
  order: DeliveryOrder | PharmacyOrder;
}

export interface DriverAccountingSummary {
  completedOrdersCount: number;
  driverNetAmount: number | null;
  driverNetPopulatedCount: number;
  adminCommissionAmount: number | null;
  adminCommissionPopulatedCount: number;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Standard Haversine distance in kilometers between two real WGS84 coordinates.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

/**
 * Resolves destination coordinates strictly according to order type:
 * - Restaurant orders: restaurant coordinates ONLY (pickup/restaurant)
 * - Household / regular orders: customer delivery coordinates ONLY
 * - Pharmacy orders: customer delivery coordinates ONLY
 */
export function getOrderDistanceTargetCoordinates(
  order: any,
  orderType: OrderCategoryKind
): { latitude: number; longitude: number } | null {
  if (!order) return null;
  if (orderType === 'restaurant') {
    return extractOrderCoordinates(order, 'restaurant');
  }
  return extractOrderCoordinates(order, 'customer');
}

/**
 * Computes distance strictly from real driver GPS coordinates and real target coordinates.
 * Never invents fallback numbers (such as legacy hardcoded 4.2 km).
 */
export function computeOrderDistanceFromDriver(
  order: any,
  orderType: OrderCategoryKind,
  driverLocation: DriverGPSLocation | null | undefined
): OrderDistanceDisplay {
  if (
    !driverLocation ||
    !isValidCoordinate(driverLocation.latitude, driverLocation.longitude)
  ) {
    return {
      available: false,
      distanceKm: null,
      formatted: 'المسافة غير متاحة',
    };
  }

  const targetCoords = getOrderDistanceTargetCoordinates(order, orderType);
  if (
    !targetCoords ||
    !isValidCoordinate(targetCoords.latitude, targetCoords.longitude)
  ) {
    return {
      available: false,
      distanceKm: null,
      formatted: 'المسافة غير متاحة',
    };
  }

  const km = calculateHaversineDistanceKm(
    driverLocation.latitude,
    driverLocation.longitude,
    targetCoords.latitude,
    targetCoords.longitude
  );

  if (!Number.isFinite(km) || km < 0) {
    return {
      available: false,
      distanceKm: null,
      formatted: 'المسافة غير متاحة',
    };
  }

  const formatted =
    km < 1 ? `${Math.round(km * 1000)} م` : `${km.toFixed(1)} كم`;

  return {
    available: true,
    distanceKm: km,
    formatted,
  };
}

/**
 * Parses creation timestamp safely for chronological ascending sorting (oldest first).
 */
export function getOrderCreatedTimestamp(order: any): number {
  const raw = order?.created_at || order?.createdAt || null;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/**
 * Sorts any list of orders strictly ascending by creation time (oldest first at top, newest at bottom).
 */
export function sortOrdersOldestFirst<T extends Record<string, any>>(
  list: readonly T[]
): T[] {
  return [...list].sort((a, b) => {
    const diff = getOrderCreatedTimestamp(a) - getOrderCreatedTimestamp(b);
    if (diff !== 0) return diff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Merges regular (household), restaurant, and pharmacy orders matching the current tab,
 * eligibility rules, and search query, sorted strictly ascending (oldest first -> newest last).
 */
export function buildUnifiedChronologicalOrders(params: {
  activeTab: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'profile' | 'settings';
  searchQuery: string;
  orders: DeliveryOrder[];
  pharmacyOrders: PharmacyOrder[];
  currentDriver: DeliveryDriver | null;
  isWorking: boolean;
  deliveryEnabled: boolean;
  geoContext: CentralGeoContext;
  sectionSettings: AppSectionSettingsState;
}): UnifiedChronologicalOrderItem[] {
  const {
    activeTab,
    searchQuery,
    orders,
    pharmacyOrders,
    currentDriver,
    isWorking,
    deliveryEnabled,
    geoContext,
    sectionSettings,
  } = params;

  if (!['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab)) {
    return [];
  }

  const eligibilityCtx = {
    isWorking,
    deliveryEnabled,
    geoContext,
    sectionSettings,
  };

  const q = searchQuery.trim().toLowerCase();

  const matchesDeliverySearch = (o: DeliveryOrder): boolean => {
    if (!q) return true;
    return Boolean(
      o.order_number?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_phone?.includes(q) ||
        o.detailed_address?.toLowerCase().includes(q) ||
        o.delivery_area_name?.toLowerCase().includes(q) ||
        (o as any).restaurant_name?.toLowerCase().includes(q) ||
        (o as any).store?.name?.toLowerCase().includes(q)
    );
  };

  const result: UnifiedChronologicalOrderItem[] = [];

  for (const o of orders) {
    const isRest = isRestaurantOrder(o);
    if (isRest && !isRestaurantOrderForDriver(o, currentDriver?.id, currentDriver)) {
      continue;
    }

    let matchesTab = false;
    const rawStatus = o.status as string;
    if (activeTab === 'pending') {
      matchesTab =
        rawStatus === 'pending_review' &&
        !o.assigned_driver_id &&
        isOrderEligibleForDriver(o, currentDriver, eligibilityCtx).matched;
    } else if (activeTab === 'accepted') {
      matchesTab =
        (rawStatus === 'accepted' ||
          rawStatus === 'shopping' ||
          rawStatus === 'shopping_completed') &&
        o.assigned_driver_id === currentDriver?.id;
    } else if (activeTab === 'completed') {
      matchesTab =
        (rawStatus === 'completed' || rawStatus === 'delivered') &&
        o.assigned_driver_id === currentDriver?.id;
    } else if (activeTab === 'cancelled') {
      matchesTab =
        (rawStatus === 'cancelled' || rawStatus === 'cancellation_pending') &&
        (o.assigned_driver_id === currentDriver?.id ||
          (!o.assigned_driver_id &&
            evaluateCentralCoverageMatch(o, currentDriver, geoContext).matched));
    }

    if (!matchesTab || !matchesDeliverySearch(o)) continue;

    result.push({
      id: `delivery-${o.id}`,
      kind: isRest ? 'restaurant' : 'regular',
      sortTimestamp: getOrderCreatedTimestamp(o),
      order: o,
    });
  }

  const pharmacyEval = evaluateSectionOperationalStatus(sectionSettings, 'pharmacy');
  const canSeePendingPharmacy =
    Boolean(isWorking) &&
    Boolean(deliveryEnabled) &&
    pharmacyEval.canShowNewOrders &&
    currentDriver?.status === 'approved' &&
    Boolean(currentDriver?.is_active);

  for (const p of pharmacyOrders) {
    let matchesTab = false;
    if (activeTab === 'pending') {
      matchesTab =
        canSeePendingPharmacy &&
        p.status === 'pending_review' &&
        !p.assigned_driver_id &&
        isPharmacyOrderMatchingDriverTerritory(p, currentDriver, geoContext);
    } else if (activeTab === 'accepted') {
      matchesTab =
        (p.status === 'accepted' ||
          p.status === 'shopping' ||
          p.status === 'ready_for_delivery') &&
        p.assigned_driver_id === currentDriver?.id;
    } else if (activeTab === 'completed') {
      matchesTab =
        p.status === 'completed' &&
        (!p.assigned_driver_id || p.assigned_driver_id === currentDriver?.id);
    } else if (activeTab === 'cancelled') {
      matchesTab =
        (p.status === 'cancelled' ||
          p.status === 'unable_to_fulfill' ||
          Boolean(p.cancellation_request)) &&
        (!p.assigned_driver_id || p.assigned_driver_id === currentDriver?.id);
    }

    if (!matchesTab) continue;

    if (q) {
      const matchedPharmacySearch = Boolean(
        p.order_number?.toLowerCase().includes(q) ||
          p.customer_name?.toLowerCase().includes(q) ||
          p.customer_phone?.includes(q) ||
          p.detailed_address?.toLowerCase().includes(q) ||
          (p.requested_pharmacy_name &&
            p.requested_pharmacy_name.toLowerCase().includes(q))
      );
      if (!matchedPharmacySearch) continue;
    }

    result.push({
      id: `pharmacy-${p.id}`,
      kind: 'pharmacy',
      sortTimestamp: getOrderCreatedTimestamp(p),
      order: p,
    });
  }

  return result.sort((a, b) => {
    const diff = a.sortTimestamp - b.sortTimestamp;
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Aggregates driver net earnings and admin commission ONLY from stored authoritative fields
 * (`delivery_driver_net`, `delivery_admin_commission`) on completed orders of the current driver.
 * Never estimates percentages or fabricates missing totals.
 */
export function computeDriverAccountingSummary(
  orders: DeliveryOrder[],
  pharmacyOrders: PharmacyOrder[],
  currentDriverId?: string | null
): DriverAccountingSummary {
  if (!currentDriverId) {
    return {
      completedOrdersCount: 0,
      driverNetAmount: null,
      driverNetPopulatedCount: 0,
      adminCommissionAmount: null,
      adminCommissionPopulatedCount: 0,
    };
  }

  let completedOrdersCount = 0;
  let driverNetSum = 0;
  let driverNetPopulatedCount = 0;
  let adminCommissionSum = 0;
  let adminCommissionPopulatedCount = 0;

  for (const order of orders) {
    const rawStatus = order.status as string;
    if (
      order.assigned_driver_id === currentDriverId &&
      (rawStatus === 'completed' || rawStatus === 'delivered')
    ) {
      completedOrdersCount += 1;
      const fin = extractOrderFinancialBreakdown(order);
      if (fin.deliveryDriverNet !== null && Number.isFinite(fin.deliveryDriverNet)) {
        driverNetSum += fin.deliveryDriverNet;
        driverNetPopulatedCount += 1;
      }
      if (
        fin.deliveryAdminCommission !== null &&
        Number.isFinite(fin.deliveryAdminCommission)
      ) {
        adminCommissionSum += fin.deliveryAdminCommission;
        adminCommissionPopulatedCount += 1;
      }
    }
  }

  for (const pOrder of pharmacyOrders) {
    if (
      pOrder.assigned_driver_id === currentDriverId &&
      pOrder.status === 'completed'
    ) {
      completedOrdersCount += 1;
      const net = pOrder.totals?.delivery_driver_net;
      const comm = pOrder.totals?.delivery_admin_commission;
      if (net !== null && net !== undefined && Number.isFinite(Number(net))) {
        driverNetSum += Number(net);
        driverNetPopulatedCount += 1;
      }
      if (comm !== null && comm !== undefined && Number.isFinite(Number(comm))) {
        adminCommissionSum += Number(comm);
        adminCommissionPopulatedCount += 1;
      }
    }
  }

  return {
    completedOrdersCount,
    driverNetAmount:
      driverNetPopulatedCount > 0 ? Number(driverNetSum.toFixed(2)) : null,
    driverNetPopulatedCount,
    adminCommissionAmount:
      adminCommissionPopulatedCount > 0
        ? Number(adminCommissionSum.toFixed(2))
        : null,
    adminCommissionPopulatedCount,
  };
}
