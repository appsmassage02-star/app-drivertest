import { DeliveryOrder } from '../types';

/**
 * Checks if an order belongs to the Restaurant category.
 * Sourced from order.type, restaurant_id, restaurant_name, or restaurant keywords in store_name.
 */
export function isRestaurantOrder(order: any): boolean {
  if (!order) return false;
  if (order.type === 'restaurant' || order.order_type === 'restaurant' || order.category === 'restaurant') {
    return true;
  }
  if (Boolean(order.restaurant_id || order.restaurant_name)) {
    return true;
  }
  const storeName = String(
    order.store?.name ||
    order.store_name ||
    order.household_name ||
    ''
  ).toLowerCase().trim();

  const restaurantKeywords = [
    'مطعم',
    'مشاوي',
    'وجبات',
    'بيتزا',
    'شاورما',
    'برجر',
    'مأكولات',
    'كافيه',
    'حلويات',
    'كباب',
    'فطائر',
    'سندوتشات',
    'فلافل',
    'عصائر',
    'فطاير',
    'restaurant',
    'cafe',
    'kitchen',
  ];

  return restaurantKeywords.some((kw) => storeName.includes(kw));
}

/**
 * Checks if the restaurant is responsible for its own delivery.
 * When true, this order MUST NOT appear in the available orders for Talabaty drivers,
 * and Talabaty drivers cannot accept or alter its lifecycle.
 */
export function isOrderDeliveredByRestaurant(order: any): boolean {
  if (!order) return false;

  const deliveryBy = String(
    order.delivery_by ||
    order.delivered_by ||
    order.delivery_type ||
    order.delivery_provider ||
    order.fulfillment_type ||
    order.store?.delivery_by ||
    ''
  ).toLowerCase().trim();

  if (
    deliveryBy === 'restaurant' ||
    deliveryBy === 'merchant' ||
    deliveryBy === 'store' ||
    deliveryBy === 'self' ||
    deliveryBy === 'restaurant_delivery' ||
    deliveryBy === 'self_delivery'
  ) {
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
 * Checks if a restaurant order is assigned to or available for Talabaty drivers.
 * Must be a restaurant order AND NOT delivered by the restaurant.
 */
export function isRestaurantOrderForDriver(order: any): boolean {
  return isRestaurantOrder(order) && !isOrderDeliveredByRestaurant(order);
}

/**
 * Returns user-facing badge configuration for restaurant order statuses.
 */
export function getRestaurantStatusBadge(status: string) {
  switch (status) {
    case 'pending_review':
    case 'new':
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
