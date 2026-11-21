import React, { useState } from 'react';
import {
  Package,
  Phone,
  MapPin,
  Eye,
  CheckCircle2,
  ShoppingCart,
  Navigation,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import type { DeliveryDriver } from '../types';
import { extractOrderFinancialBreakdown } from '../lib/geoCoverageService';
import { DeliveryOrder, formatSafeTime, formatSafeDateTime } from '../App';

interface HouseholdOrderCardProps {
  order: DeliveryOrder;
  currentDriver?: DeliveryDriver | null;
  sequenceNumber?: number;
  canAccept: boolean;
  isWorking: boolean;
  isActionLoading: boolean;
  onOpenDetails: (order: DeliveryOrder) => void;
  onAcceptOrder: (order: DeliveryOrder) => void;
  onStartShopping: (order: DeliveryOrder) => void;
  onStartDelivery?: (order: DeliveryOrder) => void;
  onCompleteOrder: (order: DeliveryOrder) => void;
  onRequestCancellation: (order: DeliveryOrder) => void;
  onCallCustomer: (phone: string) => void;
  onOpenMap: (order: DeliveryOrder) => void;
}

function getHouseholdStatusBadge(status: DeliveryOrder['status']) {
  switch (status) {
    case 'pending_review':
      return {
        label: 'طلب جديد',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'accepted':
      return {
        label: 'مقبول • جاهز للتسوق',
        className: 'bg-blue-50 text-blue-800 border-blue-200',
      };
    case 'shopping':
      return {
        label: 'جاري التسوق',
        className: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    case 'shopping_completed':
      return {
        label: 'جاهز للتسليم',
        className: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    case 'completed':
      return {
        label: 'مكتمل ومسلّم',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'cancellation_pending':
      return {
        label: 'بانتظار قرار الإلغاء',
        className: 'bg-orange-50 text-orange-800 border-orange-200',
      };
    case 'cancelled':
    default:
      return {
        label: 'ملغي',
        className: 'bg-rose-50 text-rose-800 border-rose-200',
      };
  }
}

export const HouseholdOrderCard: React.FC<HouseholdOrderCardProps> = ({
  order,
  currentDriver,
  sequenceNumber,
  canAccept,
  isWorking,
  isActionLoading,
  onOpenDetails,
  onAcceptOrder,
  onStartShopping,
  onStartDelivery,
  onCompleteOrder,
  onRequestCancellation,
  onCallCustomer,
  onOpenMap,
}) => {
  const [itemsExpanded, setItemsExpanded] = useState(false);

  const isAssignedToCurrent = order.assigned_driver_id === currentDriver?.id;
  const statusBadge = getHouseholdStatusBadge(order.status);

  const canStartShopping = order.status === 'accepted' && isAssignedToCurrent;
  const isShopping = order.status === 'shopping' && isAssignedToCurrent;
  const canComplete = order.status === 'shopping_completed' && isAssignedToCurrent;
  const canCancel =
    (order.status === 'accepted' || order.status === 'shopping') &&
    isAssignedToCurrent;

  const fin = extractOrderFinancialBreakdown(order);

  const items = order.items || [];
  const PREVIEW_LIMIT = 2;
  const hasMoreItems = items.length > PREVIEW_LIMIT;
  const visibleItems = itemsExpanded ? items : items.slice(0, PREVIEW_LIMIT);
  const customerPhone = order.customer_phone || order.phone_number;

  return (
    <article className="bg-white rounded-2xl border border-blue-200/80 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between">
      {/* Calm Blue Accent Header Strip */}
      <div className="px-4 py-3 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {typeof sequenceNumber === 'number' && (
            <span className="font-mono text-[11px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-800 text-white">
              #{sequenceNumber}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold">
            <Package className="w-3.5 h-3.5" />
            <span>نواقص المنزل</span>
          </span>
          <span className="font-mono text-xs font-extrabold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-blue-200/80">
            {order.order_number || `#${order.id.slice(0, 8)}`}
          </span>
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
        {/* Customer & Location Row */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/70 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 font-semibold block">
                  العميل
                </span>
                <strong className="font-extrabold text-slate-900 text-xs sm:text-sm truncate block">
                  {order.customer_name || 'عميل طلباتي'}
                </strong>
              </div>
            </div>
          </div>

          <div className="text-slate-700 flex items-start gap-1.5 pt-1.5 border-t border-slate-200/70">
            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              <strong className="text-slate-800">
                {order.governorate_name || order.governorate} -{' '}
                {order.markaz_name || order.center}
                {order.delivery_area_name
                  ? ` - ${order.delivery_area_name}`
                  : ''}
                :
              </strong>{' '}
              {order.detailed_address}
            </span>
          </div>

          {isAssignedToCurrent && customerPhone && (
            <div
              className="text-slate-600 flex items-center gap-1.5 font-mono text-[11px] pt-0.5"
              dir="ltr"
            >
              <Phone className="w-3 h-3 text-slate-400" />
              <span>{customerPhone}</span>
            </div>
          )}
        </div>

        {/* Items & Quantities (Visible Before Acceptance with Expand/Collapse) */}
        {items.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-600" />
                <span>المنتجات المطلوبة ({items.length})</span>
              </span>
              {hasMoreItems && (
                <button
                  type="button"
                  onClick={() => setItemsExpanded((prev) => !prev)}
                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer py-0.5 px-1.5 rounded-md hover:bg-blue-50 transition"
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

            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/70 space-y-1.5 text-[11px] divide-y divide-slate-200/60">
              {visibleItems.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 text-slate-700 pt-1.5 first:pt-0"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200/70 font-mono text-[10px] font-bold shrink-0">
                      {it.quantity}×
                    </span>
                    <span className="font-semibold text-slate-900 truncate">
                      {it.product_name}
                    </span>
                    {it.item_status === 'purchased' && (
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                        تم الشراء
                      </span>
                    )}
                    {it.item_status === 'missing' && (
                      <span
                        className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[9px] font-bold"
                        title={it.missing_reason || ''}
                      >
                        ناقص
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-800 shrink-0 tabular-nums">
                    {it.item_status === 'purchased' &&
                    it.actual_total_price != null
                      ? `${Number(it.actual_total_price).toFixed(2)} ج.م`
                      : it.item_status === 'missing'
                      ? '0.00 ج.م'
                      : `${Number(it.total_price).toFixed(2)} ج.م`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancellation Alert */}
        {order.status === 'cancellation_pending' && (
          <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-orange-900">
                طلب إلغاء قيد المراجعة:
              </strong>
              <p className="text-[11px]">{order.cancellation_reason}</p>
            </div>
          </div>
        )}

        {/* Financial Totals (Stored authoritative fields only) */}
        <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
            <span className="text-slate-600">
              التوصيل:{' '}
              <strong className="text-slate-800">
                {fin.deliveryFee != null
                  ? `${fin.deliveryFee.toFixed(2)} ج.م`
                  : 'غير متوفر'}
              </strong>
            </span>
            {fin.deliveryDriverNet != null && (
              <span className="text-blue-700 font-bold">
                صافي السائق: {fin.deliveryDriverNet.toFixed(2)} ج.م
              </span>
            )}
            <span className="font-bold text-sm text-slate-900">
              {order.status === 'shopping_completed' ||
              order.status === 'completed' ? (
                <>
                  الإجمالي الفعلي:{' '}
                  <span className="text-blue-700 font-extrabold">
                    {fin.actualTotalAmount != null || fin.totalAmount != null
                      ? `${Number(fin.actualTotalAmount ?? fin.totalAmount).toFixed(2)} ج.م`
                      : 'غير محدد'}
                  </span>
                </>
              ) : (
                <>
                  الإجمالي التقديري:{' '}
                  <span className="text-slate-900">
                    {fin.totalAmount != null
                      ? `${fin.totalAmount.toFixed(2)} ج.م`
                      : 'غير محدد'}
                  </span>
                </>
              )}
            </span>
          </div>
          {fin.hasIncompleteFinancials && (
            <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
              البيانات المالية غير مكتملة
            </div>
          )}
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
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {order.status === 'shopping' ? 'إدارة التسوق' : 'عرض التفاصيل'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenMap(order)}
            className="min-h-[40px] px-3 py-2 bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            title="عرض الخريطة والملاحة"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>الخريطة</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(order.status === 'accepted' ||
            order.status === 'shopping' ||
            order.status === 'shopping_completed') &&
            isAssignedToCurrent &&
            Boolean(customerPhone) && (
              <button
                type="button"
                onClick={() => onCallCustomer(customerPhone!)}
                className="min-h-[40px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>اتصال</span>
              </button>
            )}

          {order.status === 'pending_review' && (
            <button
              type="button"
              disabled={!canAccept || isActionLoading}
              onClick={() => onAcceptOrder(order)}
              className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-xl text-xs font-extrabold shadow-xs transition cursor-pointer"
              title={
                currentDriver?.status !== 'approved'
                  ? 'حسابك غير معتمد'
                  : !currentDriver?.is_active
                  ? 'حسابك معطل'
                  : !isWorking
                  ? 'يجب الضغط على «بدء العمل» أولاً لقبول الطلبات'
                  : 'قبول الطلب'
              }
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
              <span>بدء التسوق</span>
            </button>
          )}

          {isShopping && (
            <button
              type="button"
              onClick={() => onOpenDetails(order)}
              className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>متابعة التسوق</span>
            </button>
          )}

          {canComplete && (
            <>
              <button
                type="button"
                onClick={() => (onStartDelivery ? onStartDelivery(order) : onOpenMap(order))}
                className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-extrabold shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>بدء التوصيل</span>
              </button>

              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onCompleteOrder(order)}
                className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>إتمام التوصيل</span>
              </button>
            </>
          )}

          {canCancel && (
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
