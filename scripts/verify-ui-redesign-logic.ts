import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnifiedChronologicalOrders,
  computeDriverAccountingSummary,
  computeOrderDistanceFromDriver,
  sortOrdersOldestFirst,
} from '../src/lib/orderDisplayHelpers';
import type { CentralGeoContext, DeliveryDriver } from '../src/types';
import type { DeliveryOrder } from '../src/App';
import type { PharmacyOrder } from '../src/types/pharmacy';
import type { DriverGPSLocation } from '../src/lib/gpsService';
import { createEmptyAppSectionSettingsState } from '../src/lib/sectionSettingsService';

const driverLocation: DriverGPSLocation = {
  latitude: 31.0409,
  longitude: 31.3785,
  accuracy: 15,
  speed: null,
  heading: null,
  timestamp: Date.now(),
  recordedAt: new Date().toISOString(),
  isMock: false,
  source: 'browser_geolocation',
};

const approvedDriver: DeliveryDriver = {
  id: 'drv-1',
  user_id: 'usr-1',
  full_name: 'أحمد محمد',
  phone: '01000000000',
  is_active: true,
  vehicle_type: 'motorcycle',
  notes: null,
  role: 'delivery_driver',
  status: 'approved',
  governorate_name: 'الدقهلية',
  governorate_code: 'DKH',
  markaz_name: 'المنصورة',
  vehicle_plate: null,
  national_id: null,
  approved_at: '2026-01-01T00:00:00Z',
  approved_by: null,
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function makeGeoContext(): CentralGeoContext {
  return {
    driverAffiliation: 'platform',
    governorates: [{ id: 'gov-1', name: 'الدقهلية', is_active: true }],
    centers: [{ id: 'ctr-1', governorate_id: 'gov-1', name: 'المنصورة', is_active: true }],
    areas: [{ id: 'area-1', governorate_id: 'gov-1', center_id: 'ctr-1', name: 'حي الجامعة', is_active: true }],
    coverageRows: [
      {
        id: 'cov-1',
        driver_id: 'drv-1',
        governorate_id: 'gov-1',
        center_id: 'ctr-1',
        area_id: 'area-1',
        is_active: true,
        source_table: 'delivery_driver_area_coverage',
      },
    ],
    geoLoadState: 'loaded',
    coverageLoadState: 'loaded',
    coverageError: null,
  };
}

function makeReadySectionSettings() {
  const state = createEmptyAppSectionSettingsState();
  state.load_state = 'loaded';
  (['household_shortages', 'pharmacy', 'ready_food'] as const).forEach((k) => {
    state.sections[k] = {
      section_key: k,
      label_ar: k,
      short_label_ar: k,
      section_enabled: true,
      section_visible: true,
      delivery_enabled: true,
      updated_at: '2026-01-01T00:00:00Z',
      load_state: 'loaded',
      error_message: null,
    };
  });
  return state;
}

function makePharmacyOrder(overrides: Partial<PharmacyOrder>): PharmacyOrder {
  return {
    id: 'ph-default',
    order_number: 'PH-1',
    household_id: 'hh-1',
    customer_name: 'عميل',
    customer_phone: '010',
    country: 'مصر',
    governorate_name: 'الدقهلية',
    markaz_name: 'المنصورة',
    detailed_address: 'عنوان',
    address_governorate_id: 'gov-1',
    address_center_id: 'ctr-1',
    address_area_id: 'area-1',
    delivery_notes: null,
    has_customer_specified_pharmacy: false,
    requested_pharmacy_name: null,
    pharmacy_change_suggestion: null,
    driver_visited_pharmacies: [],
    items: [],
    prescription_images: [],
    totals: {
      medicines_total: null,
      delivery_fee: 25,
      final_total: null,
    },
    receipt_image_url: null,
    receipt_captured_at: null,
    assigned_driver_id: null,
    status: 'pending_review',
    accepted_at: null,
    shopping_started_at: null,
    ready_for_delivery_at: null,
    completed_at: null,
    unable_to_fulfill_at: null,
    cancellation_request: null,
    compensation_status: 'not_applicable',
    compensation_amount: null,
    compensation_note: null,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
    ...overrides,
  };
}

test('sortOrdersOldestFirst places oldest created_at at index 0 and newest last', () => {
  const orders = [
    { id: 'new', created_at: '2026-05-01T12:30:00Z' },
    { id: 'old', created_at: '2026-05-01T08:15:00Z' },
    { id: 'mid', created_at: '2026-05-01T10:00:00Z' },
  ];
  const sorted = sortOrdersOldestFirst(orders);
  assert.deepEqual(
    sorted.map((o) => o.id),
    ['old', 'mid', 'new']
  );
});

test('computeOrderDistanceFromDriver enforces destination coordinate rules and returns unavailable when missing', () => {
  const restOrder: any = {
    id: 'r-1',
    restaurant_latitude: 31.049,
    restaurant_longitude: 31.385,
    delivery_latitude: 30.0444,
    delivery_longitude: 31.2357,
    distanceKm: 4.2,
  };
  const restDist = computeOrderDistanceFromDriver(
    restOrder,
    'restaurant',
    driverLocation
  );
  assert.equal(restDist.available, true);
  assert.ok(restDist.distanceKm !== null && restDist.distanceKm < 2);

  const restMissingPickup: any = {
    id: 'r-2',
    delivery_latitude: 31.045,
    delivery_longitude: 31.38,
    distanceKm: 4.2,
  };
  const restMissingDist = computeOrderDistanceFromDriver(
    restMissingPickup,
    'restaurant',
    driverLocation
  );
  assert.equal(restMissingDist.available, false);
  assert.equal(restMissingDist.formatted, 'المسافة غير متاحة');

  const homeOrder: any = {
    id: 'h-1',
    delivery_latitude: 31.05,
    delivery_longitude: 31.38,
  };
  const homeDist = computeOrderDistanceFromDriver(
    homeOrder,
    'regular',
    driverLocation
  );
  assert.equal(homeDist.available, true);

  const pharmOrder: any = {
    id: 'p-1',
    address_latitude: 31.055,
    address_longitude: 31.39,
    requested_pharmacy_latitude: 30.0444,
    requested_pharmacy_longitude: 31.2357,
    distanceKm: 4.2,
  };
  const pharmDist = computeOrderDistanceFromDriver(
    pharmOrder,
    'pharmacy',
    driverLocation
  );
  assert.equal(pharmDist.available, true);
  assert.ok(pharmDist.distanceKm !== null && pharmDist.distanceKm < 5);

  const noGps = computeOrderDistanceFromDriver(pharmOrder, 'pharmacy', null);
  assert.equal(noGps.available, false);
  assert.equal(noGps.formatted, 'المسافة غير متاحة');
});

test('buildUnifiedChronologicalOrders merges all 3 categories oldest-first', () => {
  const baseDelivery: Omit<DeliveryOrder, 'id' | 'created_at'> = {
    household_id: 'hh-1',
    invoice_id: null,
    address_id: null,
    customer_name: 'عميل',
    customer_phone: '01011111111',
    country: 'مصر',
    governorate_name: 'الدقهلية',
    markaz_name: 'المنصورة',
    detailed_address: 'شارع الجامعة',
    subtotal: 100,
    delivery_fee: 20,
    total_amount: 120,
    delivery_governorate_id: 'gov-1',
    delivery_center_id: 'ctr-1',
    delivery_area_id: 'area-1',
    delivery_notes: null,
    assigned_driver_id: null,
    status: 'pending_review',
    cancellation_reason: null,
    cancellation_requested_at: null,
    cancellation_decision_note: null,
    cancellation_decided_at: null,
    updated_at: '2026-05-01T10:00:00Z',
    order_number: 'ORD-1',
    household_name: null,
    phone_number: null,
    governorate: null,
    center: null,
    items_total: 100,
    notes: null,
    accepted_at: null,
    delivered_at: null,
    cancellation_requested_by: null,
    user_id: null,
    items: [],
  };

  const newestHome: DeliveryOrder = {
    ...baseDelivery,
    id: 'home-newest',
    order_number: 'ORD-NEW',
    created_at: '2026-05-01T12:00:00Z',
  };

  const oldestRest = {
    ...baseDelivery,
    id: 'rest-oldest',
    order_number: 'REST-OLD',
    type: 'restaurant',
    restaurant_id: 'res-1',
    restaurant_name: 'مطعم النيل',
    delivery_by: 'talabaty',
    created_at: '2026-05-01T09:00:00Z',
  } as DeliveryOrder;

  const middlePharm = makePharmacyOrder({
    id: 'pharm-mid',
    order_number: 'PH-MID',
    customer_name: 'سارة',
    customer_phone: '01022222222',
    detailed_address: 'المشاية',
    created_at: '2026-05-01T10:30:00Z',
    updated_at: '2026-05-01T10:30:00Z',
  });

  const merged = buildUnifiedChronologicalOrders({
    activeTab: 'pending',
    searchQuery: '',
    orders: [newestHome, oldestRest],
    pharmacyOrders: [middlePharm],
    currentDriver: approvedDriver,
    isWorking: true,
    deliveryEnabled: true,
    geoContext: makeGeoContext(),
    sectionSettings: makeReadySectionSettings(),
  });

  assert.deepEqual(
    merged.map((m) => ({ kind: m.kind, id: m.order.id })),
    [
      { kind: 'restaurant', id: 'rest-oldest' },
      { kind: 'pharmacy', id: 'pharm-mid' },
      { kind: 'regular', id: 'home-newest' },
    ]
  );
});

test('computeDriverAccountingSummary reads ONLY authoritative stored fields without inventing formulas', () => {
  const emptySummary = computeDriverAccountingSummary([], [], approvedDriver.id);
  assert.equal(emptySummary.driverNetAmount, null);
  assert.equal(emptySummary.adminCommissionAmount, null);

  const completedWithNullAdmin: any[] = [
    {
      id: 'o1',
      assigned_driver_id: 'drv-1',
      status: 'completed',
      delivery_fee: 20,
      delivery_driver_net: 18,
      delivery_admin_commission: null,
    },
    {
      id: 'o2',
      assigned_driver_id: 'drv-1',
      status: 'pending_review',
      delivery_fee: 30,
      delivery_driver_net: 27,
      delivery_admin_commission: 3,
    },
  ];

  const partial = computeDriverAccountingSummary(
    completedWithNullAdmin as DeliveryOrder[],
    [],
    approvedDriver.id
  );
  assert.equal(partial.completedOrdersCount, 1);
  assert.equal(partial.driverNetAmount, 18);
  assert.equal(partial.adminCommissionAmount, null);

  const pharmCompleted = [
    makePharmacyOrder({
      id: 'p1',
      assigned_driver_id: 'drv-1',
      status: 'completed',
      totals: {
        medicines_total: 100,
        delivery_fee: 25,
        final_total: 125,
        delivery_driver_net: 22.5,
        delivery_admin_commission: 2.5,
      },
    }),
  ];

  const fullSummary = computeDriverAccountingSummary(
    completedWithNullAdmin as DeliveryOrder[],
    pharmCompleted,
    approvedDriver.id
  );
  assert.equal(fullSummary.completedOrdersCount, 2);
  assert.equal(fullSummary.driverNetAmount, 40.5);
  assert.equal(fullSummary.adminCommissionAmount, 2.5);
});
