import React, { useState } from 'react';
import {
  UtensilsCrossed,
  Phone,
  MapPin,
  Eye,
  CheckCircle2,
  Banknote,
  Store,
  Bike,
  Navigation,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
} from 'lucide-react';
import { DeliveryOrder } from '../../types';
import type { DriverGPSLocation } from '../../lib/gpsService';
import {
  getRestaurantStatusBadge,
  computeRestaurantFinancials,
} from '../../lib/restaurantService';
import { computeOrderDistanceFromDriver } from '../../lib/orderDisplayHelpers';
import { formatSafeTime, formatSafeDateTime } from '../../App';

interface RestaurantOrderCardProps {
  order: DeliveryOrder;
  currentDriverId?: string | null;
  driverLocation?: DriverGPSLocation | null;
  canAccept: boolean;
  isWorking?: boolean;
  isActionLoading: boolean;
  onOpenDetails: (order: DeliveryOrder) => void;
  onAcceptOrder: (order: DeliveryOrder) => void;
  onStartShopping: (order: DeliveryOrder) => void;
  onCompleteOrder: (order: DeliveryOrder) => void;
  onRequestCancellation: (order: DeliveryOrder) => void;
  onCallPhone: (phone: string) => void;
  onOpenMap?: (order: DeliveryOrder) => void;
}

export const RestaurantOrderCard: React.FC<RestaurantOrderCardProps> = ({
  order,
  currentDriverId,
  driverLocation,
  canAccept,
  isWorking = true,
  isActionLoading,
  onOpenDetails,
  onAcceptOrder,
  onStartShopping,
  onCompleteOrder,
  onRequestCancellation,
  onCallPhone,
  onOpenMap,
}) => {
  const [itemsExpanded, setItemsExpanded] = useState(false);

  const isAssignedToCurrent = order.assigned_driver_id === currentDriverId;
  const statusBadge = getRestaurantStatusBadge(order.status);

  const canStartPickup = order.status === 'accepted' && isAssignedToCurrent;
  const isPickingUp = order.status === 'shopping' && isAssignedToCurrent;
  const canCompleteDelivery =
    order.status === 'shopping_completed' && isAssignedToCurrent;
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

  const restaurantPhone =
    order.restaurant_phone || order.store?.phone || order.store_phone;
  const restaurantAddress =
    order.pickup_address ||
    order.store?.address ||
    order.store_address ||
    'فرع المطعم المعتمد';

  const customerName =
    order.customer?.name || order.customer_name || 'عميل طلباتي';
  const customerPhone =
    order.customer?.phone || order.customer_phone || order.phone_number;
  const customerAddress =
    order.customer?.address ||
    order.detailed_address ||
    order.customer?.area ||
    'عنوان العميل المسجل';
  const areaLabel =
    order.delivery_area_name ||
    order.markaz_name ||
    order.governorate_name ||
    null;

  // Distance strictly from driver GPS location to restaurant coordinates
  const distanceInfo = computeOrderDistanceFromDriver(
    order,
    'restaurant',
    driverLocation
  );

  const {
    totalAmount,
    deliveryFee,
    deliveryDriverNet,
    deliveryAdminCommission,
    hasIncompletePricing,
  } = computeRestaurantFinancials(order);

  const items = order.items || [];
  const itemsCount = items.length > 0 ? items.length : order.itemsCount ?? null;
  const PREVIEW_LIMIT = 2;
  const hasMoreItems = items.length > PREVIEW_LIMIT;
  const visibleItems = itemsExpanded ? items : items.slice(0, PREVIEW_LIMIT);

  return (
    <article className="bg-white rounded-2xl border border-orange-200/80 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between">
      {/* Calm Orange Accent Header Strip */}
      <div className="px-4 py-3 bg-orange-50/70 border-b border-orange-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500 text-white text-[11px] font-bold">
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>المطاعم</span>
          </span>
          <span className="font-mono text-xs font-extrabold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-orange-200/80">
            {order.orderNumber ||
              order.order_number ||
              `#REST-${order.id.slice(0, 6)}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] px-2.5 py-0.5 rounded-full border font-bold ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
          <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>
              {formatSafeDateTime(order.createdAt || order.created_at) ||
                formatSafeTime(order.createdAt || order.created_at)}
            </span>
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Restaurant Name + Distance Pill + COD */}
        <div className="bg-orange-50/50 p-3.5 rounded-xl border border-orange-200/70 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-orange-700 font-semibold block">
                  المطعم
                </span>
                <strong className="text-xs sm:text-sm text-slate-900 font-extrabold truncate block">
                  {restaurantName}
                </strong>
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border tabular-nums ${
                distanceInfo.available
                  ? 'bg-orange-100/80 text-orange-900 border-orange-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
              title="المسافة من موقعك الحالي إلى المطعم"
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>{distanceInfo.formatted}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-700 pt-1 border-t border-orange-200/50">
            <div className="flex items-start gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
              <span className="truncate">استلام من: {restaurantAddress}</span>
            </div>
            {restaurantPhone && (
              <button
                type="button"
                onClick={() => onCallPhone(restaurantPhone)}
                className="px-2 py-1 bg-white hover:bg-orange-50 text-orange-800 border border-orange-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Phone className="w-3 h-3" />
                <span>المطعم</span>
              </button>
            )}
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-slate-900 font-bold">
              <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>{customerName}</span>
            </div>
            {isAssignedToCurrent && customerPhone && (
              <button
                type="button"
                onClick={() => onCallPhone(customerPhone)}
                className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Phone className="w-3 h-3" />
                <span>العميل</span>
              </button>
            )}
          </div>
          <div className="flex items-start gap-1.5 text-[11px] text-slate-600">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              توصيل إلى: {areaLabel ? `${areaLabel} — ` : ''}
              {customerAddress}
            </span>
          </div>
        </div>

        {/* Order Items Preview (Visible Before Acceptance with Expand/Collapse) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
              <span>
                الوجبات والأصناف
                {itemsCount !== null ? ` (${itemsCount})` : ''}
              </span>
            </span>

            {hasMoreItems && (
              <button
                type="button"
                onClick={() => setItemsExpanded((prev) => !prev)}
                className="text-[11px] font-bold text-orange-700 hover:text-orange-900 flex items-center gap-1 cursor-pointer py-0.5 px-1.5 rounded-md hover:bg-orange-50 transition"
              >
                <span>
                  {itemsExpanded
                    ? 'عرض أقل'
                    : `عرض المزيد (+${items.length - PREVIEW_LIMIT})`}
                </span>
                {itemsExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-[11px] text-slate-700 space-y-1.5 divide-y divide-slate-200/60">
            {items.length > 0 ? (
              visibleItems.map((it, idx) => (
                <div
                  key={it.id || idx}
                  className="flex justify-between items-center gap-2 pt-1.5 first:pt-0"
                >
                  <span className="truncate flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-200/70 font-mono text-[10px] font-bold shrink-0">
                      {it.quantity}×
                    </span>
                    <span className="font-semibold text-slate-900 truncate">
                      {it.name || (it as any).product_name || 'صنف'}
                    </span>
                    {it.notes && (
                      <span className="text-[10px] text-amber-700">
                        ({it.notes})
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold text-slate-800 shrink-0 tabular-nums">
                    {Number(
                      it.totalPrice ||
                        (it as any).total_price ||
                        (it.unitPrice || (it as any).unit_price || 0) *
                          it.quantity
                    ).toFixed(2)}{' '}
                    ج.م
                  </span>
                </div>
              ))
            ) : (
              <span className="text-slate-500">
                تفاصيل الوجبات مسجلة في شاشة التفاصيل
              </span>
            )}
          </div>
        </div>

        {(order.delivery_notes || order.notes || order.specialInstructions) && (
          <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/70 text-[11px] text-amber-950 flex items-start gap-1.5">
            <span className="font-bold shrink-0">ملاحظات:</span>
            <span className="line-clamp-2">
              {order.delivery_notes || order.notes || order.specialInstructions}
            </span>
          </div>
        )}

        {/* Financial Summary Line */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
          <span className="text-slate-600">
            {deliveryDriverNet !== null
              ? `صافي السائق: ${deliveryDriverNet.toFixed(2)} ج.م`
              : deliveryFee !== null
              ? `التوصيل: ${deliveryFee.toFixed(2)} ج.م`
              : hasIncompletePricing || deliveryAdminCommission === null
              ? 'البيانات المالية غير مكتملة'
              : 'البيانات المالية غير مكتملة'}
          </span>

          <div className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-900 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-extrabold">
            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
            <span>كاش:</span>
            <span className="font-mono">
              {totalAmount !== null ? `${totalAmount.toFixed(2)} ج.م` : 'غير مكتمل'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="bg-slate-50/90 px-4 py-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetails(order)}
            className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-100 active:scale-95 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-orange-600" />
            <span>عرض التفاصيل</span>
          </button>

          {onOpenMap && (
            <button
              type="button"
              onClick={() => onOpenMap(order)}
              className="min-h-[40px] px-3 py-2 bg-orange-50 hover:bg-orange-100 active:scale-95 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="عرض الخريطة والملاحة"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>الخريطة</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {order.status === 'pending_review' && (
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
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-extrabold shadow-xs transition cursor-pointer bg-blue-600 hover:bg-blue-700 text-white active:scale-95 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              قبول الطلب
            </button>
          )}

          {canStartPickup && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onStartShopping(order)}
              className="min-h-[40px] px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Bike className="w-3.5 h-3.5" />
              <span>التوجه للمطعم والاستلام</span>
            </button>
          )}

          {isPickingUp && (
            <button
              type="button"
              onClick={() => onOpenDetails(order)}
              className="min-h-[40px] px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>متابعة الاستلام</span>
            </button>
          )}

          {canCompleteDelivery && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onCompleteOrder(order)}
              className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تأكيد التسليم وتحصيل الكاش</span>
            </button>
          )}

          {canRequestCancel && (
            <button
              type="button"
              onClick={() => onRequestCancellation(order)}
              className="min-h-[40px] px-3 py-2 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              طلب إلغاء
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
