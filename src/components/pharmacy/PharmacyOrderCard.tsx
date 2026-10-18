import React from 'react';
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
} from 'lucide-react';
import { PharmacyOrder, PharmacyOrderStatus } from '../../types/pharmacy';
import { formatSafeTime, formatSafeDateTime } from '../../App';

interface PharmacyOrderCardProps {
  order: PharmacyOrder;
  currentDriverId?: string | null;
  canAccept: boolean;
  isActionLoading: boolean;
  onOpenDetails: (order: PharmacyOrder) => void;
  onAcceptOrder: (order: PharmacyOrder) => void;
  onStartShopping: (order: PharmacyOrder) => void;
  onCompleteDelivery: (orderId: string) => void;
  onRequestCancellation: (order: PharmacyOrder) => void;
  onCallCustomer: (phone: string) => void;
}

export function getPharmacyStatusBadge(status: PharmacyOrderStatus) {
  switch (status) {
    case 'pending_review':
      return {
        label: 'قيد المراجعة (pending_review)',
        className: 'bg-amber-50 text-amber-900 border-amber-200',
      };
    case 'accepted':
      return {
        label: 'مقبول / جاهز للتجهيز (accepted)',
        className: 'bg-blue-50 text-blue-900 border-blue-200',
      };
    case 'shopping':
      return {
        label: 'جاري تجهيز الأدوية (shopping)',
        className: 'bg-purple-50 text-purple-900 border-purple-200',
      };
    case 'ready_for_delivery':
      return {
        label: 'جاهز للتوصيل (ready_for_delivery)',
        className: 'bg-teal-50 text-teal-900 border-teal-200',
      };
    case 'completed':
      return {
        label: 'مكتمل ومسلّم (completed)',
        className: 'bg-emerald-50 text-emerald-950 border-emerald-200',
      };
    case 'unable_to_fulfill':
      return {
        label: 'تعذر التنفيذ - غير متوفر (unable_to_fulfill)',
        className: 'bg-orange-50 text-orange-950 border-orange-200',
      };
    case 'cancelled':
    default:
      return {
        label: 'ملغي (cancelled)',
        className: 'bg-rose-50 text-rose-900 border-rose-200',
      };
  }
}

export const PharmacyOrderCard: React.FC<PharmacyOrderCardProps> = ({
  order,
  currentDriverId,
  canAccept,
  isActionLoading,
  onOpenDetails,
  onAcceptOrder,
  onStartShopping,
  onCompleteDelivery,
  onRequestCancellation,
  onCallCustomer,
}) => {
  const isAssignedToCurrent = order.assigned_driver_id === currentDriverId;
  const statusBadge = getPharmacyStatusBadge(order.status);

  const canStartShopping = order.status === 'accepted' && isAssignedToCurrent;
  const isShopping = order.status === 'shopping' && isAssignedToCurrent;
  const canComplete = order.status === 'ready_for_delivery' && isAssignedToCurrent;
  const canRequestCancel =
    (order.status === 'accepted' ||
      order.status === 'shopping' ||
      order.status === 'ready_for_delivery') &&
    isAssignedToCurrent &&
    !order.cancellation_request;

  const allItemsUnavailable =
    order.items.length > 0 &&
    order.items.every((i) => i.status === 'unavailable' && i.purchased_quantity === 0);

  return (
    <div className="bg-white rounded-2xl border-2 border-teal-200/80 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between">
      {/* Distinct Pharmacy Invoice Banner */}
      <div className="bg-gradient-to-l from-teal-700 to-emerald-700 text-white px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 space-x-reverse font-extrabold">
          <Pill className="w-4 h-4 text-teal-200" />
          <span>فاتورة صيدلية</span>
        </div>
        <span className="text-[11px] text-teal-100 font-mono">
          {formatSafeDateTime(order.created_at) || formatSafeTime(order.created_at)}
        </span>
      </div>

      <div className="p-5 space-y-3">
        {/* Order Number & Status Badge */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="font-mono text-xs font-bold bg-teal-50 text-teal-900 px-2.5 py-1 rounded-lg border border-teal-200">
              {order.order_number}
            </span>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>
          {order.prescription_images.length > 0 && (
            <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200 flex items-center space-x-1 space-x-reverse">
              <FileText className="w-3 h-3" />
              <span>روشتة ({order.prescription_images.length} صور)</span>
            </span>
          )}
        </div>

        {/* Customer & Address details */}
        <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-200/70 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <div className="font-bold text-neutral-900 flex items-center space-x-1.5 space-x-reverse">
              <User className="w-3.5 h-3.5 text-teal-700" />
              <span>{order.customer_name}</span>
            </div>
            {isAssignedToCurrent && order.customer_phone && (
              <div
                className="text-neutral-600 flex items-center space-x-1 space-x-reverse font-mono text-[11px]"
                dir="ltr"
              >
                <Phone className="w-3 h-3 text-neutral-400" />
                <span>{order.customer_phone}</span>
              </div>
            )}
          </div>

          <div className="text-neutral-700 flex items-start space-x-1.5 space-x-reverse pt-1 border-t border-neutral-200/60">
            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
            <span>
              <strong>
                {order.governorate_name} - {order.markaz_name}:
              </strong>{' '}
              {order.detailed_address}
            </span>
          </div>

          {/* Rule 2 & 6: Show customer-requested pharmacy if specified, otherwise clean guidance */}
          {order.has_customer_specified_pharmacy && order.requested_pharmacy_name ? (
            <div className="text-teal-900 bg-teal-50/80 p-2 rounded-lg border border-teal-200/80 flex items-start space-x-1.5 space-x-reverse mt-1">
              <Building className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">الصيدلية المحددة من العميل:</span>
                <span>{order.requested_pharmacy_name}</span>
              </div>
            </div>
          ) : (
            <div className="text-neutral-600 bg-white p-2 rounded-lg border border-neutral-200/70 flex items-center space-x-1.5 space-x-reverse mt-1 text-[11px]">
              <Building className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span>لم يحدد العميل صيدلية معينة (التنفيذ من أي صيدلية متاحة)</span>
            </div>
          )}

          {/* Customer Notes (Strictly separated from pharmacy name & medicines summary) */}
          <div className="text-[11px] pt-1 border-t border-neutral-200/60 flex items-start space-x-1.5 space-x-reverse">
            <span className="font-bold text-neutral-600 shrink-0">ملاحظات العميل:</span>
            {order.delivery_notes ? (
              <span className="text-amber-900 font-semibold">{order.delivery_notes}</span>
            ) : (
              <span className="text-neutral-400">لا توجد ملاحظات</span>
            )}
          </div>
        </div>

        {/* Medicines Summary */}
        {order.items.length > 0 ? (
          <div className="text-xs space-y-1">
            <span className="font-semibold text-neutral-600 flex items-center space-x-1 space-x-reverse">
              <Pill className="w-3.5 h-3.5 text-teal-700" />
              <span>الأدوية المطلوبة ({order.items.length}):</span>
            </span>
            <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200/50 space-y-1.5 text-[11px]">
              {order.items.map((item) => {
                const isPartial =
                  item.status === 'purchased' &&
                  item.purchased_quantity > 0 &&
                  item.unavailable_quantity > 0;
                const unitLabel = item.unit ? ` ${item.unit}` : '';
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-neutral-700 py-0.5"
                  >
                    <div className="flex items-center space-x-1.5 space-x-reverse flex-wrap gap-1">
                      <span className="font-bold text-neutral-900">{item.medicine_name}</span>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        (المطلوب: {item.requested_quantity}{unitLabel})
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
                          تم الشراء ({item.purchased_quantity}{unitLabel})
                        </span>
                      )}
                      {isPartial && (
                        <span className="px-2 py-0.5 bg-sky-100 text-sky-900 rounded-md text-[10px] font-bold">
                          جزئي: شراء {item.purchased_quantity} / نقص {item.unavailable_quantity}
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
            <div className="font-bold text-amber-900 flex items-center space-x-1 space-x-reverse">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>تنبيه تشخيصي لأصناف الطلب:</span>
            </div>
            <p className="leading-relaxed">{order.items_diagnostic_message}</p>
          </div>
        ) : null}

        {/* Cancellation Request Badge if submitted */}
        {order.cancellation_request && (
          <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 space-y-1">
            <div className="flex items-center space-x-1.5 space-x-reverse font-bold text-orange-900">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
              <span>طلب إلغاء قيد المراجعة الإدارية ({order.cancellation_request.reason_category})</span>
            </div>
            <p className="text-[11px]">{order.cancellation_request.reason_text}</p>
          </div>
        )}

        {/* Totals Bar (Rule 8: Only medicines_total + delivery_fee) */}
        <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
          <span className="text-neutral-500">
            رسوم التوصيل: {Number(order.totals.delivery_fee).toFixed(2)} ج.م
          </span>
          <span className="font-bold text-sm text-neutral-900">
            {order.totals.final_total != null ? (
              <>
                الإجمالي النهائي:{' '}
                <span className="text-teal-700 font-extrabold font-mono">
                  {Number(order.totals.final_total).toFixed(2)} ج.م
                </span>
              </>
            ) : (
              <span className="text-neutral-500 text-xs font-semibold">
                يُحدد إجمالي الأدوية عند نهاية التجهيز
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="bg-neutral-50 px-5 py-3 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenDetails(order)}
          className="text-xs font-bold text-teal-800 hover:text-teal-950 active:scale-95 transition flex items-center space-x-1 space-x-reverse cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>
            {order.status === 'shopping' ? 'تجهيز الأدوية والروشتة' : 'تفاصيل فاتورة الصيدلية'}
          </span>
        </button>

        <div className="flex items-center space-x-2 space-x-reverse flex-wrap gap-1">
          {/* Call Customer Button */}
          {isAssignedToCurrent && order.customer_phone && (
            <button
              type="button"
              onClick={() => onCallCustomer(order.customer_phone)}
              className={`px-3.5 py-2 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
                allItemsUnavailable
                  ? 'bg-rose-600 hover:bg-rose-700 ring-2 ring-rose-300'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{allItemsUnavailable ? 'اتصال بالعميل (الأصناف غير متوفرة)' : 'اتصال'}</span>
            </button>
          )}

          {/* Accept Order Button */}
          {order.status === 'pending_review' && (
            <button
              type="button"
              disabled={!canAccept || isActionLoading}
              onClick={() => onAcceptOrder(order)}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
            >
              قبول الطلب
            </button>
          )}

          {/* Start Preparation / Shopping */}
          {canStartShopping && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onStartShopping(order)}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>بدء تجهيز الأدوية</span>
            </button>
          )}

          {/* Continue Preparation */}
          {isShopping && !allItemsUnavailable && (
            <button
              type="button"
              onClick={() => onOpenDetails(order)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>متابعة التجهيز</span>
            </button>
          )}

          {/* Complete Delivery */}
          {canComplete && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => onCompleteDelivery(order.id)}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>إتمام التوصيل</span>
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
