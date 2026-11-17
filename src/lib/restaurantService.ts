import { DeliveryOrder } from '../types';

export type RestaurantAllowedRpc =
  | 'accept_delivery_order'
  | 'driver_start_shopping'
  | 'driver_update_delivery_item'
  | 'driver_complete_shopping'
  | 'complete_delivery_order'
  | 'request_order_cancellation';

export interface RestaurantFinancialSummary {
  subtotal: number | null;
  deliveryFee: number | null;
  deliveryBaseFee: number | null;
  deliveryAdminCommission: number | null;
  deliveryDriverNet: number | null;
  customerDeliveryFee: number | null;
  totalAmount: number | null;
  hasIncompletePricing: boolean;
}

export interface RpcCompatibilityResult {
  compatible: boolean;
  blockerCode:
    | 'OK'
    | 'NOT_RESTAURANT_ORDER'
    | 'DELIVERY_RESPONSIBILITY_UNPROVEN'
    | 'INVALID_ORDER_STATUS'
    | 'RPC_COMPATIBILITY_UNPROVEN';
  reason: string;
}

/**
 * Checks if an order belongs to the Restaurant category.
 * STRICT: Only uses explicit, reliable metadata present on the order.
 * Strictly forbidden to guess based on store name, restaurant name text, or keywords.
 */
export function isRestaurantOrder(order: any): boolean {
  if (!order) return false;

  // 1. Explicit type or category fields
  if (
    order.type === 'restaurant' ||
    order.order_type === 'restaurant' ||
    order.category === 'restaurant'
  ) {
    return true;
  }

  // 2. Explicit restaurant ID identifiers from schema/relations
  if (
    (typeof order.restaurant_id === 'string' && order.restaurant_id.trim().length > 0) ||
    (order.restaurant && typeof order.restaurant.id === 'string' && order.restaurant.id.trim().length > 0)
  ) {
    return true;
  }

  return false;
}

const RESTAURANT_SELF_DELIVERY_VALUES = new Set([
  'restaurant',
  'merchant',
  'store',
  'self',
  'restaurant_delivery',
  'self_delivery',
]);

const TALABATY_DRIVER_DELIVERY_VALUES = new Set([
  'talabaty',
  'talabaty_driver',
  'talabaty_drivers',
  'driver',
  'captain',
  'platform',
]);

/**
 * Checks if the restaurant is responsible for its own delivery (self-delivery).
 */
export function isOrderDeliveredByRestaurant(order: any): boolean {
  if (!order) return false;

  const routingFields = [
    order.delivery_by,
    order.delivered_by,
    order.delivery_type,
    order.delivery_provider,
    order.fulfillment_type,
    order.store?.delivery_by,
  ]
    .map((v) => String(v || '').toLowerCase().trim())
    .filter(Boolean);

  if (routingFields.some((val) => RESTAURANT_SELF_DELIVERY_VALUES.has(val))) {
    return true;
  }

  if (
    order.is_restaurant_delivery === true ||
    order.restaurant_delivers === true ||
    order.self_delivery === true ||
    order.store?.is_restaurant_delivery === true
  ) {
    return true;
  }

  return false;
}

/**
 * Verifies that delivery responsibility is explicitly assigned to a Talabaty driver.
 * STRICT REQUIREMENT:
 * - Absence of self-delivery data does NOT imply Talabaty responsibility.
 * - Any conflicting routing values across fields fail closed (return false).
 * - Responsibility MUST be explicitly proven by delivery routing metadata or existing assignment (without self-delivery conflict).
 */
export function isTalabatyDeliveryResponsibility(
  order: any,
  currentDriverId?: string | null
): boolean {
  if (!order) return false;

  // Self-delivery takes strict precedence as NOT Talabaty responsibility
  if (isOrderDeliveredByRestaurant(order)) {
    return false;
  }

  if (order.is_talabaty_delivery === false) {
    return false;
  }

  const routingFields = [
    order.delivery_by,
    order.delivered_by,
    order.delivery_provider,
    order.fulfillment_type,
    order.delivery_type,
    order.store?.delivery_by,
  ]
    .map((v) => String(v || '').toLowerCase().trim())
    .filter(Boolean);

  // Check for conflicting/unknown routing values if multiple fields are present
  const hasUnknownOrConflictingRouting = routingFields.some(
    (val) => !TALABATY_DRIVER_DELIVERY_VALUES.has(val)
  );
  if (hasUnknownOrConflictingRouting) {
    return false;
  }

  // If already assigned to this driver and no conflicting/self-delivery markers exist
  if (
    currentDriverId &&
    (order.assigned_driver_id === currentDriverId || order.driver_id === currentDriverId)
  ) {
    return true;
  }

  // Must have explicit positive Talabaty delivery routing evidence
  if (routingFields.some((val) => TALABATY_DRIVER_DELIVERY_VALUES.has(val))) {
    return true;
  }

  if (order.is_talabaty_delivery === true) {
    return true;
  }

  // Missing or unclear routing data -> fail closed
  return false;
}

function isRestaurantStaffDriverMarker(driver: any): boolean {
  if (!driver) return false;
  const typeMarkers = [
    driver.driver_type,
    driver.driver_category,
    driver.employment_type,
    driver.role,
  ]
    .map((v) => String(v || '').toLowerCase().trim())
    .filter(Boolean);

  const isExplicitPlatform = typeMarkers.some(
    (v) => v === 'platform' || v === 'talabaty' || v === 'delivery_driver' || v === 'platform_driver'
  );
  const isExplicitRestaurant = typeMarkers.some(
    (v) =>
      v === 'restaurant' ||
      v === 'restaurant_driver' ||
      v === 'restaurant_staff' ||
      v === 'store_driver' ||
      v === 'merchant_driver'
  );

  if (isExplicitRestaurant) return true;
  if (!isExplicitPlatform && typeof driver.restaurant_id === 'string' && driver.restaurant_id.trim().length > 0) {
    return true;
  }
  return false;
}

/**
 * Checks if a restaurant order is eligible for Talabaty drivers (or matching restaurant staff driver) to view and accept.
 */
export function isRestaurantOrderForDriver(
  order: any,
  currentDriverId?: string | null,
  driver?: any
): boolean {
  if (!isRestaurantOrder(order)) return false;

  if (driver && isRestaurantStaffDriverMarker(driver)) {
    const driverRestId = driver.restaurant_id ? String(driver.restaurant_id) : null;
    const orderRestId = order?.restaurant_id ? String(order.restaurant_id) : null;
    if (driverRestId && orderRestId && driverRestId !== orderRestId) {
      return false;
    }
    const assigned = order?.assigned_driver_id || order?.driver_id || null;
    if (assigned && currentDriverId && String(assigned) !== String(currentDriverId)) {
      return false;
    }
    return true;
  }

  return isTalabatyDeliveryResponsibility(order, currentDriverId);
}

/**
 * Computes financial fields for a restaurant order strictly from real order fields.
 * NEVER falls back to a fixed fee (such as 15) and NEVER subtracts an arbitrary amount from total.
 */
function toFiniteOrNull(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeRestaurantFinancials(order: any): RestaurantFinancialSummary {
  if (!order) {
    return {
      subtotal: null,
      deliveryFee: null,
      deliveryBaseFee: null,
      deliveryAdminCommission: null,
      deliveryDriverNet: null,
      customerDeliveryFee: null,
      totalAmount: null,
      hasIncompletePricing: true,
    };
  }

  const deliveryFee = toFiniteOrNull(order.delivery_fee ?? order.deliveryFee);
  const deliveryBaseFee = toFiniteOrNull(order.delivery_base_fee);
  const deliveryAdminCommission = toFiniteOrNull(order.delivery_admin_commission);
  const deliveryDriverNet = toFiniteOrNull(order.delivery_driver_net);
  const customerDeliveryFee = toFiniteOrNull(order.customer_delivery_fee);

  const rawTotal =
    order.actual_total_amount !== null &&
    order.actual_total_amount !== undefined &&
    Number(order.actual_total_amount) > 0
      ? order.actual_total_amount
      : order.total_amount ?? order.total;

  const totalAmount = toFiniteOrNull(rawTotal);

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsSum = items.reduce((acc: number, it: any) => {
    const lineRaw =
      it?.actual_total_price ??
      it?.total_price ??
      it?.totalPrice ??
      (it?.unit_price !== undefined && it?.unit_price !== null
        ? Number(it.unit_price) * Number(it.quantity || 1)
        : it?.unitPrice !== undefined && it?.unitPrice !== null
        ? Number(it.unitPrice) * Number(it.quantity || 1)
        : null);

    const parsed = lineRaw !== null && lineRaw !== undefined ? Number(lineRaw) : 0;
    return acc + (isNaN(parsed) ? 0 : parsed);
  }, 0);

  const rawSubtotal = order.subtotal ?? order.items_total;
  const subtotal =
    toFiniteOrNull(rawSubtotal) ??
    (items.length > 0 && itemsSum > 0 ? itemsSum : null);

  const hasIncompletePricing = deliveryFee === null || totalAmount === null || subtotal === null;

  return {
    subtotal,
    deliveryFee,
    deliveryBaseFee,
    deliveryAdminCommission,
    deliveryDriverNet,
    customerDeliveryFee,
    totalAmount,
    hasIncompletePricing,
  };
}

/**
 * Verifies whether calling a Regular Delivery RPC on a restaurant order is proven safe and compatible.
 * Based on docs/SUPABASE_OPENAPI_REFERENCE.md:
 * - Current Regular Delivery RPCs operate exclusively on delivery_orders / delivery_order_items.
 * - OpenAPI schema for delivery_orders does NOT include restaurant columns (restaurant_id, delivery_by, etc.)
 *   and does not expose PL/pgSQL function bodies or RLS rules.
 * Therefore, unless explicitly marked as verified against the live backend (`restaurant_rpc_verified === true`)
 * AND matching required source status & Talabaty responsibility, calling Home RPCs is blocked safely.
 */
export function checkRestaurantRpcCompatibility(
  order: any,
  rpcName: RestaurantAllowedRpc,
  currentDriverId?: string | null
): RpcCompatibilityResult {
  if (!isRestaurantOrder(order)) {
    return {
      compatible: false,
      blockerCode: 'NOT_RESTAURANT_ORDER',
      reason: 'الطلب لا ينتمي إلى طلبات المطاعم الموثقة.',
    };
  }

  if (!isTalabatyDeliveryResponsibility(order, currentDriverId)) {
    return {
      compatible: false,
      blockerCode: 'DELIVERY_RESPONSIBILITY_UNPROVEN',
      reason: 'بيانات مسؤولية التوصيل لهذا الطلب غير مثبتة لصالح سائق طلباتي.',
    };
  }

  const expectedStatusesByRpc: Record<RestaurantAllowedRpc, string[]> = {
    accept_delivery_order: ['pending_review'],
    driver_start_shopping: ['accepted'],
    driver_update_delivery_item: ['shopping'],
    driver_complete_shopping: ['shopping'],
    complete_delivery_order: ['shopping_completed'],
    request_order_cancellation: ['accepted', 'shopping', 'shopping_completed'],
  };

  const allowedStatuses = expectedStatusesByRpc[rpcName] || [];
  if (!allowedStatuses.includes(order.status)) {
    return {
      compatible: false,
      blockerCode: 'INVALID_ORDER_STATUS',
      reason: `حالة الطلب الحالية (${order.status}) لا تتوافق مع الدالة ${rpcName}.`,
    };
  }

  if (order.restaurant_rpc_verified !== true) {
    return {
      compatible: false,
      blockerCode: 'RPC_COMPATIBILITY_UNPROVEN',
      reason: `تعذر إثبات توافق الدالة (${rpcName}) مع بنية طلبات المطاعم من مواصفة قاعدة البيانات الحالية (OpenAPI Schema لا يتضمن أعمدة المطاعم داخل delivery_orders ولا يكشف منطق PL/pgSQL الداخلي). يلزم التحقق الخادمي المستقل قبل التنفيذ.`,
    };
  }

  return {
    compatible: true,
    blockerCode: 'OK',
    reason: 'تم التحقق من التوافق.',
  };
}

/**
 * Returns user-facing badge configuration for restaurant order statuses.
 * STRICT: Only uses authoritative database statuses without invented ones.
 */
export function getRestaurantStatusBadge(status: string) {
  switch (status) {
    case 'pending_review':
      return {
        label: 'متاح للقبول',
        sublabel: 'بانتظار قبول السائق',
        className: 'bg-amber-50 text-amber-900 border-amber-200',
        badgeColor: 'bg-amber-600',
      };
    case 'accepted':
      return {
        label: 'تم القبول (accepted)',
        sublabel: 'التوجه إلى المطعم',
        className: 'bg-blue-50 text-blue-900 border-blue-200',
        badgeColor: 'bg-blue-600',
      };
    case 'shopping':
      return {
        label: 'جاري الاستلام من المطعم (shopping)',
        sublabel: 'مراجعة وتأكيد الوجبات',
        className: 'bg-orange-50 text-orange-900 border-orange-200',
        badgeColor: 'bg-orange-600',
      };
    case 'shopping_completed':
      return {
        label: 'تم الاستلام - جاري التوصيل (in_transit)',
        sublabel: 'في الطريق إلى العميل',
        className: 'bg-indigo-50 text-indigo-900 border-indigo-200',
        badgeColor: 'bg-indigo-600',
      };
    case 'completed':
    case 'delivered':
      return {
        label: 'تم التسليم بنجاح (delivered)',
        sublabel: 'تم تحصيل المبلغ نقداً (COD)',
        className: 'bg-emerald-50 text-emerald-950 border-emerald-200',
        badgeColor: 'bg-emerald-600',
      };
    case 'cancellation_pending':
      return {
        label: 'طلب إلغاء قيد المراجعة',
        sublabel: 'بانتظار قرار الإدارة',
        className: 'bg-rose-50 text-rose-900 border-rose-200',
        badgeColor: 'bg-rose-600',
      };
    case 'cancelled':
    default:
      return {
        label: 'ملغي (cancelled)',
        sublabel: 'الطلب ملغي',
        className: 'bg-neutral-100 text-neutral-800 border-neutral-300',
        badgeColor: 'bg-neutral-600',
      };
  }
}
