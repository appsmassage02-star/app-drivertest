import React, { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MapPin,
  Navigation,
  Compass,
  AlertTriangle,
  CheckCircle2,
  X,
  ExternalLink,
  RefreshCw,
  LocateFixed,
  UtensilsCrossed,
  Pill,
  Home,
  Route,
  Square,
} from 'lucide-react';
import {
  DriverGPSLocation,
  GPSStatus,
  extractOrderCoordinates,
  isValidCoordinate,
} from '../../lib/gpsService';
import {
  endNavigationSession,
  evaluateNavigationSettings,
  getCachedActiveNavigationSession,
  startOrderNavigation,
} from '../../lib/navigationService';
import type { DeliverySystemSettings, RouteDistanceResult } from '../../types';
import type { TrackingPersistResult } from '../../lib/driverTrackingService';

interface OrderMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  orderType: 'restaurant' | 'pharmacy' | 'regular';
  driverLocation: DriverGPSLocation | null;
  gpsStatus: GPSStatus;
  gpsErrorMessage: string | null;
  isLoadingGPS: boolean;
  systemSettings?: DeliverySystemSettings | null;
  isTrackingActive?: boolean;
  lastTrackingResult?: TrackingPersistResult | null;
  onRefreshGPS: () => Promise<DriverGPSLocation | null>;
  supabase?: SupabaseClient | null;
  driverId?: string | null;
  routeDistance?: RouteDistanceResult | null;
  onRecalculateRoute?: (
    order: any,
    orderType: 'restaurant' | 'pharmacy' | 'regular'
  ) => Promise<RouteDistanceResult | null>;
}

export const OrderMapModal: React.FC<OrderMapModalProps> = ({
  isOpen,
  onClose,
  order,
  orderType,
  driverLocation,
  gpsStatus,
  gpsErrorMessage,
  isLoadingGPS,
  systemSettings,
  isTrackingActive = false,
  lastTrackingResult,
  onRefreshGPS,
  supabase = null,
  driverId = null,
  routeDistance = null,
  onRecalculateRoute,
}) => {
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [, setSessionRefreshTick] = useState(0);

  useEffect(() => {
    setNavigationNotice(null);
  }, [isOpen, order?.id]);

  if (!isOpen || !order) return null;

  // Extract pickup coordinates (Restaurant or Pharmacy)
  const pickupPrefix = orderType === 'restaurant' ? 'restaurant' : 'pharmacy';
  const pickupCoords =
    orderType === 'regular'
      ? null
      : extractOrderCoordinates(order, pickupPrefix);

  // Extract customer delivery coordinates
  const customerCoords = extractOrderCoordinates(order, 'customer');

  // Pickup place details (do not invent a specified pharmacy if customer did not specify one)
  const pickupName =
    orderType === 'restaurant'
      ? order.restaurant_name || order.store?.name || order.store_name || 'المطعم'
      : orderType === 'pharmacy'
      ? order.requested_pharmacy_name ||
        (order.has_customer_specified_pharmacy ? 'الصيدلية المحددة' : null)
      : null;

  const pickupAddress =
    orderType === 'restaurant'
      ? order.pickup_address || order.store?.address || order.store_address || 'عنوان المطعم غير مسجل'
      : orderType === 'pharmacy'
      ? order.requested_pharmacy_address || order.pharmacy_address || 'عنوان الصيدلية غير مسجل'
      : null;

  // Customer details
  const customerName = order.customer_name || order.customer?.name || 'العميل';
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

  const navEval = evaluateNavigationSettings(systemSettings);
  const activeSession = getCachedActiveNavigationSession(driverId, String(order.id));

  const handleStartNavigation = async (
    coords: { latitude: number; longitude: number } | null,
    destinationLabel: string
  ) => {
    if (!navEval.allowed) {
      setNavigationNotice(navEval.reason);
      return;
    }

    if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
      setNavigationNotice(`الإحداثيات الجغرافية لـ ${destinationLabel} غير متوفرة في بيانات هذا الطلب.`);
      return;
    }

    setIsUpdatingSession(true);
    try {
      const res = await startOrderNavigation({
        supabase,
        driverId,
        orderId: String(order.id),
        orderType,
        destinationLat: coords.latitude,
        destinationLng: coords.longitude,
        destinationLabel,
        driverLocation,
        routeDistance,
        systemSettings,
      });

      if (!res.success) {
        setNavigationNotice(res.error || 'تعذر بدء الملاحة.');
      } else {
        setNavigationNotice(null);
        setSessionRefreshTick((t) => t + 1);
      }
    } finally {
      setIsUpdatingSession(false);
    }
  };

  const handleStopNavigationSession = async () => {
    if (!driverId) return;
    setIsUpdatingSession(true);
    try {
      await endNavigationSession({
        supabase,
        driverId,
        orderId: String(order.id),
        endStatus: 'stopped',
      });
      setSessionRefreshTick((t) => t + 1);
    } finally {
      setIsUpdatingSession(false);
    }
  };

  const handleRefreshRouteDistance = async () => {
    if (!onRecalculateRoute) return;
    setIsRecalculatingRoute(true);
    try {
      await onRecalculateRoute(order, orderType);
    } finally {
      setIsRecalculatingRoute(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="bg-neutral-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <Navigation className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <h3 className="font-extrabold text-base sm:text-lg">الخرائط وملاحة الـ GPS</h3>
                <span className="font-mono text-xs font-bold bg-white/15 px-2.5 py-0.5 rounded-full border border-white/20">
                  {order.order_number || order.orderNumber || `#${order.id?.slice(0, 8)}`}
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                مسافة الطريق الفعلي، موقع السائق، وجلسات الملاحة المعتمدة
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

        {/* Modal Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {navigationNotice && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-center justify-between gap-2">
              <span>{navigationNotice}</span>
              <button
                type="button"
                onClick={() => setNavigationNotice(null)}
                className="text-amber-700 hover:text-amber-900 font-bold shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {/* 0. Server-Side Road Distance & Active Navigation Session */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-blue-700" />
                <h4 className="font-extrabold text-sm text-blue-950">
                  مسافة الطريق الفعلي ({orderType === 'restaurant' ? 'إلى المطعم' : 'إلى العميل'})
                </h4>
              </div>

              {onRecalculateRoute && (
                <button
                  type="button"
                  disabled={isRecalculatingRoute || !navEval.allowed}
                  onClick={handleRefreshRouteDistance}
                  className="px-3 py-1.5 bg-white hover:bg-blue-100 disabled:opacity-50 text-blue-800 border border-blue-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRecalculatingRoute ? 'animate-spin' : ''}`} />
                  <span>إعادة حساب الطريق</span>
                </button>
              )}
            </div>

            <div className="bg-white/95 p-3 rounded-xl border border-blue-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              {routeDistance?.status === 'road_distance' ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-extrabold text-blue-950 text-sm tabular-nums">
                    <span>{routeDistance.formattedDistance}</span>
                    {routeDistance.formattedDuration && (
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                        الزمن المتوقع: {routeDistance.formattedDuration}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    محسوبة فعليًا على شبكة الطرق ({routeDistance.provider || 'google'} / {routeDistance.engine || 'routes_api'})
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-700 font-bold">
                  <span>{!navEval.allowed ? 'الملاحة متوقفة من الإعدادات المركزية' : routeDistance?.formattedDistance || 'مسافة الطريق غير متاحة'}</span>
                  {routeDistance?.errorReason && (
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">{routeDistance.errorReason}</p>
                  )}
                </div>
              )}

              {activeSession && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-bold">
                    جلسة ملاحة نشطة ({activeSession.status === 'recalculated' ? 'محدّثة' : 'نشطة'})
                  </span>
                  <button
                    type="button"
                    disabled={isUpdatingSession}
                    onClick={handleStopNavigationSession}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Square className="w-3 h-3" />
                    <span>إيقاف الجلسة</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 1. Driver GPS Location Card */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2 space-x-reverse">
                <LocateFixed className="w-4 h-4 text-emerald-700" />
                <h4 className="font-extrabold text-sm text-emerald-950">موقع السائق الحالي (GPS)</h4>
              </div>

              <button
                type="button"
                disabled={isLoadingGPS}
                onClick={() => onRefreshGPS()}
                className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGPS ? 'animate-spin' : ''}`} />
                <span>{isLoadingGPS ? 'جاري القراءة...' : 'تحديث إشارة GPS'}</span>
              </button>
            </div>

            {driverLocation ? (
              <div className="bg-white/90 p-3 rounded-xl border border-emerald-200/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <div className="flex items-center space-x-2 space-x-reverse text-emerald-900 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>تم استقبال إشارة GPS الحقيقية من جهازك</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      isTrackingActive
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : systemSettings?.driver_tracking_enabled === false
                        ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}
                  >
                    {isTrackingActive
                      ? 'التتبع المركزي مسجل ونشط'
                      : systemSettings?.driver_tracking_enabled === false
                      ? 'التتبع المركزي معطل من الإعدادات'
                      : lastTrackingResult?.message || 'قراءة جهاز محلية'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-600 font-mono pt-1" dir="ltr">
                  <div>
                    <span className="text-neutral-400">Lat: </span>
                    <strong className="text-neutral-900">{driverLocation.latitude.toFixed(6)}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-400">Lng: </span>
                    <strong className="text-neutral-900">{driverLocation.longitude.toFixed(6)}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-400">Accuracy: </span>
                    <span>
                      ±{Math.round(driverLocation.accuracy)}m
                      {systemSettings?.max_accepted_gps_accuracy_m
                        ? ` (Max ${systemSettings.max_accepted_gps_accuracy_m}m)`
                        : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400">Source: </span>
                    <span>{driverLocation.source}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/90 p-3 rounded-xl border border-amber-200 space-y-1.5 text-xs text-amber-950">
                <div className="flex items-start space-x-2 space-x-reverse">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">
                      {gpsStatus === 'denied'
                        ? 'إذن الموقع الجغرافي مرفوض'
                        : gpsStatus === 'rejected_accuracy'
                        ? 'دقة الـ GPS أقل من الحد المسموح بالنظام'
                        : gpsStatus === 'rejected_mock'
                        ? 'تم رفض موقع وهمي (Mock Location)'
                        : gpsStatus === 'unavailable'
                        ? 'خدمة الـ GPS غير متوفرة'
                        : gpsStatus === 'timeout'
                        ? 'انتهت مهلة قراءة إشارة الـ GPS'
                        : 'لم يتم استلام إحداثيات GPS صالحة بعد'}
                    </strong>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                      {gpsErrorMessage ||
                        'اضغط على زر «تحديث إشارة GPS» لمنح المتصفح إذن قراءة موقع جهازك الحقيقي.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Destination 1: Pickup Location (Restaurant or Pharmacy) */}
          {pickupName && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2 space-x-reverse">
                  {orderType === 'restaurant' ? (
                    <UtensilsCrossed className="w-4 h-4 text-amber-700" />
                  ) : (
                    <Pill className="w-4 h-4 text-teal-700" />
                  )}
                  <h4 className="font-extrabold text-sm text-amber-950">
                    موقع استلام الطلب ({orderType === 'restaurant' ? 'المطعم' : 'الصيدلية'})
                  </h4>
                </div>

                {pickupCoords && (
                  <button
                    type="button"
                    disabled={!navEval.allowed || isUpdatingSession}
                    onClick={() => handleStartNavigation(pickupCoords, pickupName)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:text-slate-500 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-xs"
                    title={navEval.allowed ? 'بدء الملاحة بالـ GPS إلى موقع الاستلام' : navEval.reason}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{navEval.allowed ? 'بدء الملاحة للاستلام' : 'الملاحة متوقفة'}</span>
                  </button>
                )}
              </div>

              <div className="bg-white p-3 rounded-xl border border-amber-200/80 space-y-1 text-xs">
                <strong className="block text-amber-950 font-bold">{pickupName}</strong>
                <p className="text-[11px] text-neutral-600 flex items-center space-x-1 space-x-reverse">
                  <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{pickupAddress}</span>
                </p>

                {pickupCoords ? (
                  <div className="text-[10px] text-neutral-500 font-mono pt-1" dir="ltr">
                    GPS: {pickupCoords.latitude.toFixed(6)}, {pickupCoords.longitude.toFixed(6)}
                  </div>
                ) : (
                  <div className="pt-1 text-[11px] text-amber-800 bg-amber-100/60 px-2 py-1 rounded-md">
                    ⚠️ الإحداثيات الجغرافية (Latitude/Longitude) لموقع الاستلام غير مسجلة في بيانات هذا الطلب.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Destination 2: Delivery Location (Customer) */}
          <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Home className="w-4 h-4 text-sky-700" />
                <h4 className="font-extrabold text-sm text-sky-950">موقع تسليم الطلب (عنوان العميل)</h4>
              </div>

              {customerCoords && (
                <button
                  type="button"
                  disabled={!navEval.allowed || isUpdatingSession}
                  onClick={() => handleStartNavigation(customerCoords, customerName)}
                  className="px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 disabled:bg-slate-300 disabled:text-slate-500 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-xs"
                  title={navEval.allowed ? 'بدء الملاحة بالـ GPS إلى عنوان العميل' : navEval.reason}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{navEval.allowed ? 'بدء الملاحة للعميل' : 'الملاحة متوقفة'}</span>
                </button>
              )}
            </div>

            <div className="bg-white p-3 rounded-xl border border-sky-200/80 space-y-1 text-xs">
              <strong className="block text-neutral-900 font-bold">{customerName}</strong>
              {customerAreaLabel && (
                <div className="text-[11px] font-bold text-sky-900 bg-sky-50 inline-block px-2 py-0.5 rounded-md border border-sky-200">
                  المنطقة الجغرافية: {customerAreaLabel}
                </div>
              )}
              <p className="text-[11px] text-neutral-600 flex items-center space-x-1 space-x-reverse">
                <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>{customerAddress}</span>
              </p>

              {customerCoords ? (
                <div className="text-[10px] text-neutral-500 font-mono pt-1" dir="ltr">
                  GPS: {customerCoords.latitude.toFixed(6)}, {customerCoords.longitude.toFixed(6)}
                </div>
              ) : (
                <div className="pt-1 text-[11px] text-sky-900 bg-sky-100/70 px-2.5 py-1 rounded-md">
                  ℹ️ إحداثيات الـ GPS لعنوان العميل غير مسجلة في بيانات هذا الطلب.
                </div>
              )}
            </div>
          </div>

          {/* 4. Central Routing & Navigation Settings Info */}
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs text-neutral-700 space-y-1.5">
            <div className="flex items-center space-x-2 space-x-reverse font-bold text-neutral-800">
              <Compass className="w-4 h-4 text-neutral-600" />
              <span>حالة نظام الملاحة والتوجيه المركزي:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>
                <span className="text-neutral-500">حالة الملاحة: </span>
                <strong className={navEval.allowed ? 'text-emerald-700' : 'text-rose-700'}>
                  {systemSettings?.navigation_enabled === true
                    ? 'مفعّلة'
                    : systemSettings?.navigation_enabled === false
                    ? 'متوقفة من الإدارة'
                    : 'غير محددة'}
                </strong>
              </div>
              <div>
                <span className="text-neutral-500">المزود / المحرك: </span>
                <strong className="font-mono">
                  {systemSettings?.routing_provider || '-'} / {systemSettings?.routing_engine || '-'}
                </strong>
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              يتم حساب مسافة الطريق الفعلي عبر الخادم (Edge Function) لحماية المفاتيح السرية وعدم كشفها في الواجهة.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            إغلاق نافذة الخريطة
          </button>
        </div>
      </div>
    </div>
  );
};
