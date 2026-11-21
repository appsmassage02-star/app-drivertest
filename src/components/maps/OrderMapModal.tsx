import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  AlertTriangle,
  X,
  ExternalLink,
  Home,
  UtensilsCrossed,
  Pill,
  ArrowRight,
  Phone,
} from 'lucide-react';
import {
  MISSING_DESTINATION_COORDS_MESSAGE,
  buildCustomerGoogleMapsNav,
  openExternalNavigation,
} from '../../lib/gpsService';

interface OrderMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  orderType: 'restaurant' | 'pharmacy' | 'regular';
  autoLaunchedExternal?: boolean;
  onCallPhone?: (phone: string) => void;
}

export const OrderMapModal: React.FC<OrderMapModalProps> = ({
  isOpen,
  onClose,
  order,
  orderType,
  autoLaunchedExternal = false,
  onCallPhone,
}) => {
  const [launchFeedback, setLaunchFeedback] = useState<string | null>(null);

  useEffect(() => {
    setLaunchFeedback(null);
  }, [isOpen, order?.id]);

  if (!isOpen || !order) return null;

  // Strictly build Google Maps navigation target from saved customer delivery coordinates
  const customerNav = buildCustomerGoogleMapsNav(order);

  const customerName = order.customer_name || order.customer?.name || 'العميل';
  const customerPhone =
    order.customer_phone || order.phone_number || order.customer?.phone || null;
  const customerAreaLabel =
    (orderType === 'pharmacy' ? order.address_area_name : order.delivery_area_name) ||
    [order.governorate_name || order.governorate, order.markaz_name || order.center]
      .filter(Boolean)
      .join(' - ') ||
    null;
  const customerAddress =
    order.detailed_address ||
    order.customer?.address ||
    order.address_text ||
    'عنوان التوصيل المسجل';

  const pickupName =
    orderType === 'restaurant'
      ? order.restaurant_name || order.store?.name || order.store_name || 'المطعم'
      : orderType === 'pharmacy'
      ? order.requested_pharmacy_name ||
        (order.has_customer_specified_pharmacy ? 'الصيدلية المحددة' : null)
      : null;

  const pickupAddress =
    orderType === 'restaurant'
      ? order.pickup_address || order.store?.address || order.store_address || null
      : orderType === 'pharmacy'
      ? order.requested_pharmacy_address || order.pharmacy_address || null
      : null;

  const handleOpenExternalGoogleMaps = () => {
    if (!customerNav.valid || customerNav.latitude === null || customerNav.longitude === null) {
      setLaunchFeedback(MISSING_DESTINATION_COORDS_MESSAGE);
      return;
    }

    const res = openExternalNavigation(customerNav.latitude, customerNav.longitude, customerName);
    if (!res.success) {
      setLaunchFeedback(res.error || MISSING_DESTINATION_COORDS_MESSAGE);
    } else {
      setLaunchFeedback('تم فتح خرائط Google بإحداثيات العميل.');
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Modal Header with clear "الرجوع إلى التطبيق" navigation control */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/25 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Navigation className="w-5 h-5 text-blue-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base truncate">
                  التوصيل إلى وجهة العميل — Google Maps
                </h3>
                <span className="font-mono text-xs font-bold bg-white/15 px-2.5 py-0.5 rounded-lg border border-white/20 tabular-nums">
                  {order.order_number || order.orderNumber || `#${String(order.id || '').slice(0, 8)}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                الملاحة المباشرة باستخدام إحداثيات العميل المحفوظة في الطلب
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 flex items-center gap-1.5 text-xs font-bold transition cursor-pointer text-white shrink-0 whitespace-nowrap"
            aria-label="الرجوع إلى التطبيق"
          >
            <ArrowRight className="w-4 h-4" />
            <span>الرجوع إلى التطبيق</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {autoLaunchedExternal && customerNav.valid && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-950 flex items-center justify-between gap-2">
              <span className="font-semibold leading-relaxed">
                تم تجهيز رابط الملاحة إلى موقع العميل في خرائط Google. يمكنك استخدام العرض المدمج أدناه أو الضغط على زر «الرجوع إلى التطبيق» في أي وقت دون فقدان حالة الطلب.
              </span>
            </div>
          )}

          {launchFeedback && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 border ${
                customerNav.valid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{launchFeedback}</span>
              <button
                type="button"
                onClick={() => setLaunchFeedback(null)}
                className="p-1 rounded-lg hover:bg-black/5 shrink-0 cursor-pointer"
                aria-label="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Customer Destination Info (Textual address ALWAYS visible even if coordinates are missing) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-blue-600" />
                <h4 className="font-extrabold text-sm text-slate-900">
                  عنوان توصيل العميل
                </h4>
              </div>

              {onCallPhone && customerPhone && (
                <button
                  type="button"
                  onClick={() => onCallPhone(customerPhone)}
                  className="min-h-[40px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>اتصال بالعميل</span>
                </button>
              )}
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
              <strong className="block text-slate-900 font-extrabold text-sm">
                {customerName}
              </strong>
              {customerAreaLabel && (
                <div className="text-[11px] font-bold text-blue-900 bg-blue-50 inline-block px-2.5 py-0.5 rounded-lg border border-blue-200">
                  {customerAreaLabel}
                </div>
              )}
              <p className="text-xs text-slate-700 flex items-start gap-1.5 leading-relaxed pt-0.5">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>{customerAddress}</span>
              </p>

              {customerNav.valid && customerNav.latitude !== null && customerNav.longitude !== null && (
                <div
                  className="text-[11px] text-slate-500 font-mono pt-1 tabular-nums"
                  dir="ltr"
                >
                  Destination: {customerNav.latitude.toFixed(6)}, {customerNav.longitude.toFixed(6)}
                </div>
              )}
            </div>
          </div>

          {/* Optional pickup textual info for restaurant/pharmacy orders */}
          {pickupName && pickupAddress && (
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3.5 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-extrabold text-amber-950">
                {orderType === 'restaurant' ? (
                  <UtensilsCrossed className="w-4 h-4 text-amber-700" />
                ) : (
                  <Pill className="w-4 h-4 text-emerald-700" />
                )}
                <span>جهة الاستلام: {pickupName}</span>
              </div>
              <p className="text-[11px] text-slate-700 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>{pickupAddress}</span>
              </p>
            </div>
          )}

          {/* Embedded Google Maps Destination View OR Clear Missing-Coords Error */}
          {customerNav.valid && customerNav.embedUrl && customerNav.directionsUrl ? (
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
                <iframe
                  title={`خريطة موقع العميل ${customerName}`}
                  src={customerNav.embedUrl}
                  className="w-full h-[250px] sm:h-[300px] border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleOpenExternalGoogleMaps}
                  className="flex-1 min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span>فتح المسار في تطبيق Google Maps</span>
                </button>

                <a
                  href={customerNav.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Navigation className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>فتح رابط الخرائط مباشر</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-950">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <strong className="block font-extrabold text-sm text-rose-900">
                  {MISSING_DESTINATION_COORDS_MESSAGE}
                </strong>
                <p className="text-rose-800 leading-relaxed">
                  لا تتوفر إحداثيات جغرافية صالحة لعنوان العميل في هذا الطلب، لذلك لن يتم فتح خرائط Google. يمكنك الاعتماد على العنوان النصي الموضح أعلاه أو الاتصال بالعميل لإتمام التسليم.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">
            حالة الطلب تبقى محفوظة كما هي عند فتح الخرائط أو الرجوع.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <ArrowRight className="w-4 h-4" />
            <span>الرجوع إلى التطبيق</span>
          </button>
        </div>
      </div>
    </div>
  );
};
