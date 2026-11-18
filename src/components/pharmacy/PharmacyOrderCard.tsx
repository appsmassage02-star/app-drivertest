import React, { useState } from 'react';
import {
  User,
  Phone,
  MapPin,
  Eye,
  Building,
  FileText,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  Pill,
  Navigation,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { PharmacyOrder, PharmacyOrderStatus } from '../../types/pharmacy';
import type { DriverGPSLocation } from '../../lib/gpsService';
import { computeOrderDistanceFromDriver } from '../../lib/orderDisplayHelpers';
import { formatSafeTime, formatSafeDateTime } from '../../App';

interface PharmacyOrderCardProps {
  order: PharmacyOrder;
  currentDriverId?: string | null;
  driverLocation?: DriverGPSLocation | null;
  canAccept: boolean;
  isWorking?: boolean;
  isActionLoading: boolean;
  onOpenDetails: (order: PharmacyOrder) => void;
  onAcceptOrder: (order: PharmacyOrder) => void;
  onStartShopping: (order: PharmacyOrder) => void;
  onCompleteDelivery: (orderId: string) => void;
  onRequestCancellation: (order: PharmacyOrder) => void;
  onCallCustomer: (phone: string) => void;
  onOpenMap?: (order: PharmacyOrder) => void;
}

export function getPharmacyStatusBadge(status: PharmacyOrderStatus) {
  switch (status) {
    case 'pending_review':
      return {
        label: 'طلب جديد',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'accepted':
      return {
        label: 'مقبول • جاهز للتجهيز',
        className: 'bg-blue-50 text-blue-800 border-blue-200',
      };
    case 'shopping':
      return {
        label: 'جاري تجهيز الأدوية',
        className: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    case 'ready_for_delivery':
      return {
        label: 'جاهز للتوصيل',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'completed':
      return {
        label: 'مكتمل ومسلّم',
        className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      };
    case 'unable_to_fulfill':
      return {
        label: 'تعذر التنفيذ',
        className: 'bg-orange-50 text-orange-900 border-orange-200',
      };
    case 'cancelled':
    default:
      return {
        label: 'ملغي',
        className: 'bg-rose-50 text-rose-800 border-rose-200',
      };
  }
}

export const PharmacyOrderCard: React.FC<PharmacyOrderCardProps> = ({
  order,
  currentDriverId,
  driverLocation,
  canAccept,
  isWorking = true,
  isActionLoading,
  onOpenDetails,
  onAcceptOrder,
  onStartShopping,
  onCompleteDelivery,
  onRequestCancellation,
  onCallCustomer,
  onOpenMap,
}) => {
  const [itemsExpanded, setItemsExpanded] = useState(false);

  const isAssignedToCurrent = order.assigned_driver_id === currentDriverId;
  const statusBadge = getPharmacyStatusBadge(order.status);

  const canStartShopping = order.status === 'accepted' && isAssignedToCurrent;
  const isShopping = order.status === 'shopping' && isAssignedToCurrent;
  const canComplete =
    order.status === 'ready_for_delivery' && isAssignedToCurrent;
  const canRequestCancel =
    (order.status === 'accepted' ||
      order.status === 'shopping' ||
      order.status === 'ready_for_delivery') &&
    isAssignedToCurrent &&
    !order.cancellation_request;

  const allItemsUnavailable =
    order.items.length > 0 &&
    order.items.every(
      (i) => i.status === 'unavailable' && i.purchased_quantity === 0
    );

  // Distance strictly from driver GPS location to customer delivery coordinates
  const distanceInfo = computeOrderDistanceFromDriver(
    order,
    'pharmacy',
    driverLocation
  );

  const PREVIEW_LIMIT = 2;
  const hasMoreItems = order.items.length > PREVIEW_LIMIT;
  const visibleItems = itemsExpanded
    ? order.items
    : order.items.slice(0, PREVIEW_LIMIT);

  return (
    <article className="bg-white rounded-2xl border border-emerald-200/80 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between">
      {/* Calm Green Accent Header Strip */}
      <div className="px-4 py-3 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">
            <Pill className="w-3.5 h-3.5" />
            <span>الصيدلية</span>
          </span>
          <span className="font-mono text-xs font-extrabold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200/80">
            {order.order_number}
          </span>
          {order.prescription_images.length > 0 && (
            <span className="text-[11px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              <span>روشتة ({order.prescription_images.length})</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
          <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>
              {formatSafeDateTime(order.created_at) ||
                formatSafeTime(order.created_at)}
            </span>
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Requested Pharmacy / Customer + GPS Distance */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/70 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Building className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 font-semibold block">
                  {order.has_customer_specified_pharmacy &&
                  order.requested_pharmacy_name
                    ? 'الصيدلية المطلوبة'
                    : 'العميل'}
                </span>
                <strong className="font-extrabold text-slate-900 text-xs sm:text-sm truncate block">
                  {order.has_customer_specified_pharmacy &&
                  order.requested_pharmacy_name
                    ? order.requested_pharmacy_name
                    : order.customer_name}
                </strong>
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border tabular-nums ${
                distanceInfo.available
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
              title="المسافة من موقعك الحالي إلى عنوان العميل"
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>{distanceInfo.formatted}</span>
            </div>
          </div>

          {order.has_customer_specified_pharmacy &&
            order.requested_pharmacy_name && (
              <div className="flex items-center gap-1.5 text-slate-700 font-semibold pt-1 border-t border-slate-200/70">
                <User className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>العميل: {order.customer_name}</span>
              </div>
            )}

          {!order.has_customer_specified_pharmacy && (
            <div className="text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70">
              التنفيذ من أي صيدلية متاحة (لم يحدد العميل صيدلية معينة)
            </div>
          )}

          <div className="text-slate-700 flex items-start gap-1.5 pt-1 border-t border-slate-200/70">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              <strong className="text-slate-800">
                {order.governorate_name} - {order.markaz_name}
                {order.address_area_name ? ` - ${order.address_area_name}` : ''}
                :
              </strong>{' '}
              {order.detailed_address}
            </span>
          </div>

          {isAssignedToCurrent && order.customer_phone && (
            <div
              className="text-slate-600 flex items-center gap-1.5 font-mono text-[11px]"
              dir="ltr"
            >
              <Phone className="w-3 h-3 text-slate-400" />
              <span>{order.customer_phone}</span>
            </div>
          )}

          {order.delivery_notes && (
            <div className="text-[11px] pt-1 border-t border-slate-200/60 flex items-start gap-1.5">
              <span className="font-bold text-slate-600 shrink-0">ملاحظات:</span>
              <span className="text-amber-900 font-semibold">
                {order.delivery_notes}
              </span>
            </div>
          )}
        </div>

        {/* Medicines Summary (Visible Before Acceptance with Expand/Collapse) */}
        {order.items.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-emerald-600" />
                <span>الأدوية المطلوبة ({order.items.length})</span>
              </span>
              {hasMoreItems && (
                <button
                  type="button"
                  onClick={() => setItemsExpanded((prev) => !prev)}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer py-0.5 px-1.5 rounded-md hover:bg-emerald-50 transition"
                >
                  <span>
                    {itemsExpanded
                      ? 'عرض أقل'
                      : `عرض المزيد (+${order.items.length - PREVIEW_LIMIT})`}
                  </span>
                  {itemsExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/70 space-y-1.5 text-[11px] divide-y divide-slate-200/60">
              {visibleItems.map((item) => {
                const isPartial =
                  item.status === 'purchased' &&
                  item.purchased_quantity > 0 &&
                  item.unavailable_quantity > 0;
                const unitLabel = item.unit ? ` ${item.unit}` : '';
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 text-slate-700 pt-1.5 first:pt-0"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200/70 font-mono text-[10px] font-bold shrink-0">
                        {item.requested_quantity}
                        {unitLabel}
                      </span>
                      <span className="font-bold text-slate-900 truncate">
                        {item.medicine_name}
                      </span>
                    </div>
                    <div className="shrink-0">
                      {item.status === 'pending' && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md text-[10px] font-bold">
                          معلق
                        </span>
                      )}
                      {item.status === 'purchased' && !isPartial && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-bold">
                          تم الشراء ({item.purchased_quantity}
                          {unitLabel})
                        </span>
                      )}
                      {isPartial && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded-md text-[10px] font-bold">
                          جزئي: {item.purchased_quantity} / نقص{' '}
                          {item.unavailable_quantity}
                        </span>
                      )}
                      {item.status === 'unavailable' && (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md text-[10px] font-bold">
                          غير متوفر
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : order.items_diagnostic_message ? (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-950 space-y-1">
            <div className="font-bold text-amber-900 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>تنبيه أصناف الفاتورة:</span>
            </div>
            <p className="leading-relaxed">{order.items_diagnostic_message}</p>
          </div>
        ) : null}

        {/* Cancellation Request Alert */}
        {order.cancellation_request && (
          <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-orange-900">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span>
                طلب إلغاء قيد المراجعة ({order.cancellation_request.reason_category})
              </span>
            </div>
            <p className="text-[11px]">{order.cancellation_request.reason_text}</p>
          </div>
        )}

        {/* Financial Totals Row */}
        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs gap-2 flex-wrap tabular-nums">
          <span className="text-slate-600">
            التوصيل:{' '}
            <strong className="text-slate-800">
              {order.totals.delivery_fee != null
                ? `${Number(order.totals.delivery_fee).toFixed(2)} ج.م`
                : 'غير محدد'}
            </strong>
          </span>
          {order.totals.delivery_driver_net != null && (
            <span className="text-emerald-700 font-bold">
              صافي السائق: {Number(order.totals.delivery_driver_net).toFixed(2)}{' '}
              ج.م
            </span>
          )}
          <span className="font-bold text-sm text-slate-900">
            {order.totals.final_total != null ? (
              <>
                الإجمالي:{' '}
                <span className="text-emerald-700 font-extrabold font-mono">
                  {Number(order.totals.final_total).toFixed(2)} ج.م
                </span>
              </>
            ) : (
              <span className="text-slate-500 text-xs font-semibold">
                يُحدد الإجمالي عند التجهيز
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="bg-slate-50/90 px-4 py-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetails(order)}
            className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-100 active:scale-95 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {order.status === 'shopping' ? 'تجهيز الأدوية' : 'عرض التفاصيل'}
            </span>
          </button>

          {onOpenMap && (
            <button
              type="button"
              onClick={() => onOpenMap(order)}
              className="min-h-[40px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="عرض الخريطة والملاحة"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>الخريطة</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAssignedToCurrent && order.customer_phone && (
            <button
              type="button"
              onClick={() => onCallCustomer(order.customer_phone)}
              className={`min-h-[40px] px-3.5 py-2 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                allItemsUnavailable
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>
                {allItemsUnavailable ? 'اتصال (الأصناف غير متوفرة)' : 'اتصال'}
              </span>
            </button>
          )}

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
                  : 'قبول فاتورة الصيدلية'
              }
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-extrabold shadow-xs transition cursor-pointer bg-blue-600 hover:bg-blue-700 text-white active:scale-95 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              قبول الطلب
            </button>
          )}

          {canStartShopping && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onStartShopping(order)}
              className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>بدء تجهيز الأدوية</span>
            </button>
          )}

          {isShopping && (
            <button
              type="button"
              onClick={() => onOpenDetails(order)}
              className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>متابعة التجهيز</span>
            </button>
          )}

          {canComplete && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onCompleteDelivery(order.id)}
              className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>إتمام التوصيل</span>
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
