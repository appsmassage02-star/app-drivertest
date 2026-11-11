import React from 'react';
import {
  UtensilsCrossed,
  Phone,
  MapPin,
  Clock,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  Store,
  ChevronLeft,
  Bike,
} from 'lucide-react';
import { DeliveryOrder } from '../../types';
import { getRestaurantStatusBadge } from '../../lib/restaurantService';
import { formatSafeTime, formatSafeDateTime } from '../../App';

interface RestaurantOrderCardProps {
  order: DeliveryOrder;
  currentDriverId?: string | null;
  canAccept: boolean;
  isWorking?: boolean;
  isActionLoading: boolean;
  onOpenDetails: (order: DeliveryOrder) => void;
  onAcceptOrder: (order: DeliveryOrder) => void;
  onStartShopping: (order: DeliveryOrder) => void;
  onCompleteOrder: (order: DeliveryOrder) => void;
  onRequestCancellation: (order: DeliveryOrder) => void;
  onCallPhone: (phone: string) => void;
}

export const RestaurantOrderCard: React.FC<RestaurantOrderCardProps> = ({
  order,
  currentDriverId,
  canAccept,
  isWorking = true,
  isActionLoading,
  onOpenDetails,
  onAcceptOrder,
  onStartShopping,
  onCompleteOrder,
  onRequestCancellation,
  onCallPhone,
}) => {
  const isAssignedToCurrent = order.assigned_driver_id === currentDriverId;
  const statusBadge = getRestaurantStatusBadge(order.status);

  const canStartPickup = order.status === 'accepted' && isAssignedToCurrent;
  const isPickingUp = order.status === 'shopping' && isAssignedToCurrent;
  const canCompleteDelivery = order.status === 'shopping_completed' && isAssignedToCurrent;
  const canRequestCancel =
    (order.status === 'accepted' ||
      order.status === 'shopping' ||
      order.status === 'shopping_completed') &&
    isAssignedToCurrent &&
    order.status !== 'cancellation_pending';

  const restaurantName =
    order.restaurant_name ||
    order.store?.name ||
    order.store_name ||
    order.household_name ||
    'مطعم شريك';

  const restaurantPhone = order.restaurant_phone || order.store?.phone || order.store_phone;
  const restaurantAddress =
    order.pickup_address ||
    order.store?.address ||
    order.store_address ||
    'فرع المطعم المعتمد';

  const customerName = order.customer?.name || order.customer_name || 'عميل طلباتي';
  const customerPhone = order.customer?.phone || order.customer_phone || order.phone_number;
  const customerAddress =
    order.customer?.address ||
    order.detailed_address ||
    order.customer?.area ||
    'عنوان العميل المسجل';

  const totalAmount = Number(
    order.actual_total_amount && order.actual_total_amount > 0
      ? order.actual_total_amount
      : order.total_amount || order.total || 0
  );

  const items = order.items || [];
  const itemsCount = items.length > 0 ? items.length : order.itemsCount || 1;

  return (
    <div className="bg-white rounded-2xl border-2 border-orange-200/80 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between">
      {/* Restaurant Distinct Banner */}
      <div className="bg-gradient-to-l from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 space-x-reverse font-extrabold">
          <UtensilsCrossed className="w-4 h-4 text-amber-200" />
          <span>طلب مطعم • توصيل كابتن طلباتي</span>
        </div>
        <span className="text-[11px] text-amber-100 font-mono">
          {formatSafeDateTime(order.createdAt || order.created_at) ||
            formatSafeTime(order.createdAt || order.created_at)}
        </span>
      </div>

      <div className="p-5 space-y-3.5">
        {/* Order Number & Status Badge */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="font-mono text-xs font-bold bg-orange-50 text-orange-950 px-2.5 py-1 rounded-lg border border-orange-200">
              {order.orderNumber || order.order_number || `#REST-${order.id.slice(0, 6)}`}
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>

          {/* COD Cash Collection Badge */}
          <div className="inline-flex items-center space-x-1.5 space-x-reverse bg-emerald-50 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-xl text-xs font-extrabold">
            <Banknote className="w-3.5 h-3.5 text-emerald-700" />
            <span>تحصيل كاش:</span>
            <span className="font-mono">{totalAmount.toFixed(2)} ج.م</span>
          </div>
        </div>

        {/* Restaurant Info Card */}
        <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 space-x-reverse">
              <Store className="w-4 h-4 text-amber-700 shrink-0" />
              <strong className="text-xs text-amber-950 font-extrabold">{restaurantName}</strong>
            </div>
            {restaurantPhone && (
              <button
                type="button"
                onClick={() => onCallPhone(restaurantPhone)}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[11px] font-bold flex items-center space-x-1 space-x-reverse cursor-pointer shadow-2xs"
                title="الاتصال بالمطعم للتجهيز والاستلام"
              >
                <Phone className="w-3 h-3 text-amber-700" />
                <span>اتصال بالمطعم</span>
              </button>
            )}
          </div>
          <div className="flex items-start space-x-1.5 space-x-reverse text-[11px] text-amber-900/90 pr-1">
            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span className="line-clamp-1">استلام من: {restaurantAddress}</span>
          </div>
        </div>

        {/* Customer Info Card */}
        <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 space-x-reverse">
              <strong className="text-xs text-neutral-900 font-bold">{customerName}</strong>
            </div>
            {customerPhone && (
              <button
                type="button"
                onClick={() => onCallPhone(customerPhone)}
                className="px-2.5 py-1 bg-white hover:bg-neutral-100 text-emerald-700 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center space-x-1 space-x-reverse cursor-pointer shadow-2xs"
                title="الاتصال بالعميل"
              >
                <Phone className="w-3 h-3 text-emerald-600" />
                <span>اتصال بالعميل</span>
              </button>
            )}
          </div>
          <div className="flex items-start space-x-1.5 space-x-reverse text-[11px] text-neutral-600 pr-1">
            <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
            <span className="line-clamp-1">توصيل إلى: {customerAddress}</span>
          </div>
        </div>

        {/* Order Items Preview */}
        <div className="text-xs space-y-1 pt-1 border-t border-neutral-100">
          <div className="flex items-center justify-between text-neutral-700 font-bold">
            <span className="flex items-center space-x-1.5 space-x-reverse">
              <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
              <span>الوجبات والأصناف المطلوبة ({itemsCount}):</span>
            </span>
            <span className="text-neutral-500 text-[11px]">
              رسوم التوصيل: {Number(order.delivery_fee || order.deliveryFee || 15).toFixed(2)} ج.م
            </span>
          </div>
          <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/80 text-[11px] text-neutral-700 max-h-24 overflow-y-auto space-y-1 divide-y divide-neutral-200/60">
            {items.length > 0 ? (
              items.map((it, idx) => (
                <div key={it.id || idx} className="flex justify-between items-center pt-1 first:pt-0">
                  <span className="truncate pr-1">
                    <strong className="text-orange-950 font-bold ml-1">{it.quantity}x</strong>
                    {it.name || (it as any).product_name || 'صنف'}
                    {it.notes && (
                      <span className="text-[10px] text-amber-700 mr-1">({it.notes})</span>
                    )}
                  </span>
                  <span className="font-mono text-neutral-600 shrink-0">
                    {Number(it.totalPrice || (it as any).total_price || (it.unitPrice || (it as any).unit_price || 0) * it.quantity).toFixed(2)} ج.م
                  </span>
                </div>
              ))
            ) : (
              <span className="text-neutral-500">تفاصيل الوجبات مسجلة في شاشة التفاصيل الكاملة</span>
            )}
          </div>
        </div>

        {/* Delivery / Customer Instructions */}
        {(order.delivery_notes || order.notes || order.specialInstructions) && (
          <div className="p-2 bg-amber-50/50 rounded-xl border border-amber-200/60 text-[11px] text-amber-950 flex items-start space-x-1.5 space-x-reverse">
            <span className="font-bold shrink-0">ملاحظات العميل:</span>
            <span className="line-clamp-2">{order.delivery_notes || order.notes || order.specialInstructions}</span>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenDetails(order)}
          className="px-3.5 py-2 bg-white hover:bg-neutral-100 active:scale-95 text-neutral-700 border border-neutral-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-2xs"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>تفاصيل الطلب</span>
        </button>

        <div className="flex items-center space-x-2 space-x-reverse">
          {/* Accept Order Button */}
          {(order.status === 'pending_review' || order.status === 'new') && (
            <button
              type="button"
              disabled={!canAccept || isActionLoading}
              onClick={() => onAcceptOrder(order)}
              title={
                !isWorking
                  ? 'يجب الضغط على «بدء العمل» أولاً لقبول الطلبات'
                  : !canAccept
                  ? 'غير مؤهل لقبول الطلب (تحقق من اعتماد الحساب وتفعيل الخدمة)'
                  : 'قبول طلب المطعم'
              }
              className={`px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer ${
                !canAccept
                  ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed opacity-80'
                  : 'bg-orange-600 hover:bg-orange-700 text-white active:scale-95'
              }`}
            >
              {!isWorking ? 'بدء العمل مطلوب' : 'قبول الطلب'}
            </button>
          )}

          {/* Start Pickup from Restaurant */}
          {canStartPickup && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onStartShopping(order)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
            >
              <Bike className="w-3.5 h-3.5" />
              <span>التوجه للمطعم والاستلام</span>
            </button>
          )}

          {/* Continue Pickup / Items at Restaurant */}
          {isPickingUp && (
            <button
              type="button"
              onClick={() => onOpenDetails(order)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>متابعة استلام الوجبات</span>
            </button>
          )}

          {/* Complete Delivery to Customer */}
          {canCompleteDelivery && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onCompleteOrder(order)}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تأكيد التسليم وتحصيل الكاش</span>
            </button>
          )}

          {/* Request Cancellation */}
          {canRequestCancel && (
            <button
              type="button"
              onClick={() => onRequestCancellation(order)}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              طلب إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
