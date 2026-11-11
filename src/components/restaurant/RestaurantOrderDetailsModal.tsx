import React, { useState } from 'react';
import {
  X,
  Phone,
  MapPin,
  UtensilsCrossed,
  Store,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  DollarSign,
  Clock,
  Bike,
  ShieldCheck,
  CheckSquare,
} from 'lucide-react';
import { DeliveryOrder } from '../../types';
import { getRestaurantStatusBadge } from '../../lib/restaurantService';
import { formatSafeDateTime } from '../../App';

interface RestaurantOrderDetailsModalProps {
  order: DeliveryOrder | null;
  currentDriverId?: string | null;
  canAccept?: boolean;
  isWorking?: boolean;
  isActionLoading: boolean;
  onClose: () => void;
  onAcceptOrder: (order: DeliveryOrder) => void;
  onStartShopping: (order: DeliveryOrder) => void;
  onUpdateDeliveryItem: (
    item: any,
    newStatus: 'purchased' | 'missing',
    actualPrice?: number,
    missingReason?: string
  ) => Promise<void>;
  onCompleteShopping: (order: DeliveryOrder) => void;
  onCompleteOrder: (order: DeliveryOrder) => void;
  onOpenCancellationModal: (order: DeliveryOrder) => void;
  onCallPhone: (phone: string) => void;
}

export const RestaurantOrderDetailsModal: React.FC<RestaurantOrderDetailsModalProps> = ({
  order,
  currentDriverId,
  canAccept = true,
  isWorking = true,
  isActionLoading,
  onClose,
  onAcceptOrder,
  onStartShopping,
  onUpdateDeliveryItem,
  onCompleteShopping,
  onCompleteOrder,
  onOpenCancellationModal,
  onCallPhone,
}) => {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemPriceInput, setItemPriceInput] = useState<string>('');
  const [missingItemId, setMissingItemId] = useState<string | null>(null);
  const [missingReasonInput, setMissingReasonInput] = useState<string>('غير متوفر بالمطعم');

  if (!order) return null;

  const isAssignedToMe = order.assigned_driver_id === currentDriverId;
  const statusBadge = getRestaurantStatusBadge(order.status);
  const isShopping = order.status === 'shopping' && isAssignedToMe;

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

  const subtotal = Number(order.subtotal || (totalAmount > 15 ? totalAmount - 15 : totalAmount));
  const deliveryFee = Number(order.delivery_fee || order.deliveryFee || 15);
  const items = order.items || [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-orange-200 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="bg-gradient-to-l from-amber-600 via-orange-600 to-amber-700 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <h3 className="font-extrabold text-base sm:text-lg">تفاصيل طلب المطعم</h3>
                <span className="font-mono text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full border border-white/30">
                  {order.orderNumber || order.order_number || `#REST-${order.id.slice(0, 6)}`}
                </span>
              </div>
              <p className="text-xs text-amber-100/90 mt-0.5">
                توصيل طلباتي • {formatSafeDateTime(order.createdAt || order.created_at)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer text-white"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Work Warning when driver is stopped */}
          {order.status === 'pending_review' && !isWorking && (
            <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-center space-x-3 space-x-reverse text-amber-950">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs leading-relaxed">
                <strong className="block text-amber-950 font-bold mb-0.5">
                  أنت متوقف عن العمل حاليًا
                </strong>
                <span>
                  لقبول هذا الطلب والبدء في استلامه، يجب الضغط أولاً على <strong>«بدء العمل»</strong> في الشريط العلوي لتفعيل حالة التوافر.
                </span>
              </div>
            </div>
          )}

          {/* Status & Cash Collection Header */}
          <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 space-x-reverse">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
              <span className="text-xs text-neutral-600 font-semibold">{statusBadge.sublabel}</span>
            </div>

            <div className="inline-flex items-center space-x-2 space-x-reverse bg-emerald-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-2xs">
              <Banknote className="w-4 h-4 text-emerald-200" />
              <span>المطلوب تحصيله كاش (COD):</span>
              <span className="font-mono text-sm">{totalAmount.toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* Restaurant Card */}
          <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-amber-100 pb-2.5">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Store className="w-4 h-4 text-amber-700" />
                <h4 className="text-sm font-extrabold text-amber-950">بيانات المطعم</h4>
              </div>
              {restaurantPhone && (
                <button
                  type="button"
                  onClick={() => onCallPhone(restaurantPhone)}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 space-x-reverse cursor-pointer transition shadow-2xs"
                >
                  <Phone className="w-3.5 h-3.5 text-amber-700" />
                  <span>اتصال بالمطعم ({restaurantPhone})</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-500 font-bold block mb-0.5">اسم المطعم:</span>
                <span className="font-extrabold text-neutral-900 text-sm">{restaurantName}</span>
              </div>
              <div>
                <span className="text-neutral-500 font-bold block mb-0.5">عنوان الاستلام:</span>
                <span className="text-neutral-800 flex items-start space-x-1 space-x-reverse">
                  <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{restaurantAddress}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Customer Card */}
          <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
              <div className="flex items-center space-x-2 space-x-reverse">
                <h4 className="text-sm font-extrabold text-neutral-900">بيانات العميل وموقع التسليم</h4>
              </div>
              {customerPhone && (
                <button
                  type="button"
                  onClick={() => onCallPhone(customerPhone)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center space-x-1.5 space-x-reverse cursor-pointer transition shadow-2xs"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  <span>اتصال بالعميل ({customerPhone})</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-500 font-bold block mb-0.5">اسم المستلم:</span>
                <span className="font-bold text-neutral-900 text-sm">{customerName}</span>
              </div>
              <div>
                <span className="text-neutral-500 font-bold block mb-0.5">العنوان التفصيلي:</span>
                <span className="text-neutral-800 flex items-start space-x-1 space-x-reverse">
                  <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{customerAddress}</span>
                </span>
              </div>
              {order.customer?.buildingNumber && (
                <div>
                  <span className="text-neutral-500 font-bold">رقم العمارة: </span>
                  <span className="font-semibold text-neutral-800">{order.customer.buildingNumber}</span>
                </div>
              )}
              {order.customer?.floorNumber && (
                <div>
                  <span className="text-neutral-500 font-bold">الدور / الشقة: </span>
                  <span className="font-semibold text-neutral-800">
                    الدور {order.customer.floorNumber} - شقة {order.customer?.apartmentNumber || '---'}
                  </span>
                </div>
              )}
            </div>

            {(order.delivery_notes || order.notes || order.specialInstructions) && (
              <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-700 space-y-1">
                <span className="font-extrabold text-neutral-900 block">ملاحظات العميل للتوصيل:</span>
                <p className="leading-relaxed">{order.delivery_notes || order.notes || order.specialInstructions}</p>
              </div>
            )}
          </div>

          {/* Dishes & Order Items List */}
          <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
              <div className="flex items-center space-x-2 space-x-reverse">
                <UtensilsCrossed className="w-4 h-4 text-orange-600" />
                <h4 className="text-sm font-extrabold text-neutral-900">
                  الوجبات والأصناف المطلوبة ({items.length})
                </h4>
              </div>
              <span className="text-[11px] text-neutral-500">
                {isShopping
                  ? 'يمكنك تأكيد توفر الوجبة أو تسجيل النقص إن وجد'
                  : 'قائمة الأصناف المحضرة'}
              </span>
            </div>

            <div className="space-y-2.5">
              {items.length > 0 ? (
                items.map((item: any, idx: number) => {
                  const isPurchased = item.item_status === 'purchased' || item.isPurchased;
                  const isMissing = item.item_status === 'missing';
                  const isPending = !isPurchased && !isMissing;

                  return (
                    <div
                      key={item.id || idx}
                      className={`p-3 rounded-xl border transition ${
                        isPurchased
                          ? 'bg-emerald-50/60 border-emerald-300'
                          : isMissing
                          ? 'bg-rose-50/60 border-rose-300'
                          : 'bg-neutral-50 border-neutral-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center space-x-2 space-x-reverse">
                            <span className="font-mono text-xs font-extrabold bg-orange-100 text-orange-950 px-2 py-0.5 rounded-lg border border-orange-200">
                              {item.quantity}x
                            </span>
                            <span className="font-extrabold text-xs text-neutral-900">
                              {item.name || item.product_name || 'وجبة'}
                            </span>
                          </div>
                          {item.notes && (
                            <p className="text-[11px] text-amber-800 pr-7 font-semibold">
                              ملاحظة: {item.notes}
                            </p>
                          )}
                          {isMissing && item.missing_reason && (
                            <p className="text-[11px] text-rose-700 pr-7 font-bold">
                              سبب النقص: {item.missing_reason}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 space-x-reverse">
                          <span className="font-mono text-xs font-bold text-neutral-800">
                            {Number(
                              item.totalPrice ||
                                item.total_price ||
                                (item.unitPrice || item.unit_price || 0) * item.quantity
                            ).toFixed(2)}{' '}
                            ج.م
                          </span>

                          {/* Item status buttons during shopping/pickup stage */}
                          {isShopping && (
                            <div className="flex items-center space-x-1 space-x-reverse mr-2">
                              {isPending ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isActionLoading}
                                    onClick={() =>
                                      onUpdateDeliveryItem(
                                        item,
                                        'purchased',
                                        Number(item.unitPrice || item.unit_price || 0)
                                      )
                                    }
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition shadow-2xs"
                                  >
                                    متوفر وتم الاستلام
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isActionLoading}
                                    onClick={() => {
                                      setMissingItemId(item.id);
                                      setMissingReasonInput('غير متوفر بالمطعم');
                                    }}
                                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition shadow-2xs"
                                  >
                                    غير متوفر
                                  </button>
                                </>
                              ) : isPurchased ? (
                                <span className="inline-flex items-center space-x-1 space-x-reverse text-[11px] text-emerald-800 font-bold bg-white px-2 py-0.5 rounded-md border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>تم الاستلام</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1 space-x-reverse text-[11px] text-rose-800 font-bold bg-white px-2 py-0.5 rounded-md border border-rose-300">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>غير متوفر</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Missing Reason Input Prompt */}
                      {missingItemId === item.id && (
                        <div className="mt-2.5 pt-2 border-t border-rose-200 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={missingReasonInput}
                            onChange={(e) => setMissingReasonInput(e.target.value)}
                            placeholder="اكتب سبب النقص..."
                            className="flex-1 min-w-[180px] px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-rose-600"
                          />
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => {
                              onUpdateDeliveryItem(item, 'missing', undefined, missingReasonInput);
                              setMissingItemId(null);
                            }}
                            className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            تأكيد النقص
                          </button>
                          <button
                            type="button"
                            onClick={() => setMissingItemId(null)}
                            className="px-2 py-1.5 text-neutral-600 text-xs font-bold hover:bg-neutral-200 rounded-lg cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 bg-neutral-50 rounded-xl text-center text-xs text-neutral-500">
                  لا توجد أصناف تفصيلية مسجلة في هذا الطلب
                </div>
              )}
            </div>
          </div>

          {/* Pricing & Financial Summary (COD) */}
          <div className="bg-amber-50/70 p-4 rounded-2xl border-2 border-amber-200 space-y-2.5">
            <div className="flex items-center justify-between border-b border-amber-200 pb-2">
              <div className="flex items-center space-x-2 space-x-reverse">
                <DollarSign className="w-4 h-4 text-amber-700" />
                <h4 className="font-extrabold text-sm text-amber-950">
                  الحساب المالي للطلب والدفع عند الاستلام (COD)
                </h4>
              </div>
              <span className="text-[11px] font-bold text-amber-900 bg-white px-2 py-0.5 rounded-md border border-amber-300">
                دفع نقدي كاش (COD)
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-700">
                <span>إجمالي وجبات المطعم:</span>
                <span className="font-mono font-bold">{subtotal.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-neutral-700">
                <span>رسوم التوصيل المعتمدة:</span>
                <span className="font-mono font-bold">{deliveryFee.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-amber-950 pt-2 border-t border-amber-300 font-extrabold text-sm">
                <span>المبلغ المطلوب تحصيله من العميل نقداً:</span>
                <span className="font-mono text-base text-amber-900">{totalAmount.toFixed(2)} ج.م</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-2 space-x-reverse">
            {isAssignedToMe &&
              (order.status === 'accepted' ||
                order.status === 'shopping' ||
                order.status === 'shopping_completed') &&
              order.status !== 'cancellation_pending' && (
                <button
                  type="button"
                  onClick={() => onOpenCancellationModal(order)}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  طلب إلغاء
                </button>
              )}
          </div>

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
                className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer ${
                  !canAccept
                    ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed opacity-80'
                    : 'bg-orange-600 hover:bg-orange-700 text-white active:scale-95'
                }`}
              >
                {!isWorking ? 'بدء العمل مطلوب لقبول الطلب' : 'قبول طلب المطعم'}
              </button>
            )}

            {/* Move to Restaurant / Start Pickup */}
            {order.status === 'accepted' && isAssignedToMe && (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onStartShopping(order)}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
              >
                <Bike className="w-4 h-4" />
                <span>التوجه للمطعم وبدء الاستلام</span>
              </button>
            )}

            {/* Complete Shopping / Moving to Customer */}
            {order.status === 'shopping' && isAssignedToMe && (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onCompleteShopping(order)}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
              >
                <CheckSquare className="w-4 h-4" />
                <span>تم استلام الوجبات والتوجه للعميل</span>
              </button>
            )}

            {/* Complete Delivery and COD collection */}
            {order.status === 'shopping_completed' && isAssignedToMe && (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onCompleteOrder(order)}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تأكيد التسليم للعميل وتحصيل الكاش</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
