import React from 'react';
import {
  LocateFixed,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import type { DriverGPSLocation, GPSStatus } from '../lib/gpsService';
import type { TrackingPersistResult } from '../lib/driverTrackingService';
import type { CentralGeoContext, DeliverySystemSettings } from '../types';

interface DriverLocationSettingsCardProps {
  driverLocation: DriverGPSLocation | null;
  gpsStatus: GPSStatus;
  gpsErrorMessage: string | null;
  isLoadingGPS: boolean;
  isTrackingActive: boolean;
  trackingAccuracyWarning: string | null;
  lastTrackingResult: TrackingPersistResult | null;
  systemSettings: DeliverySystemSettings;
  centralGeoContext: CentralGeoContext;
  onRefreshGPS: () => void;
}

export const DriverLocationSettingsCard: React.FC<
  DriverLocationSettingsCardProps
> = ({
  driverLocation,
  gpsStatus,
  gpsErrorMessage,
  isLoadingGPS,
  isTrackingActive,
  trackingAccuracyWarning,
  lastTrackingResult,
  systemSettings,
  centralGeoContext,
  onRefreshGPS,
}) => {
  const permissionStateLabel =
    gpsStatus === 'granted'
      ? 'مفعّل ومتصل'
      : gpsStatus === 'requesting'
      ? 'جاري طلب الإذن والقراءة...'
      : gpsStatus === 'denied'
      ? 'إذن الموقع مرفوض من المتصفح/الجهاز'
      : gpsStatus === 'rejected_accuracy'
      ? 'دقة الإشارة أقل من الحد المعتمد'
      : gpsStatus === 'rejected_mock'
      ? 'تم رفض موقع وهمي'
      : gpsStatus === 'unavailable'
      ? 'خدمة GPS غير متوفرة'
      : gpsStatus === 'timeout'
      ? 'انتهت مهلة قراءة الموقع'
      : 'في انتظار تحديد الموقع';

  const statusTone =
    gpsStatus === 'granted' && driverLocation
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : gpsStatus === 'denied' || gpsStatus === 'unavailable'
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';

  return (
    <section
      aria-label="الموقع وGPS والتغطية الجغرافية"
      className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
            <LocateFixed className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              الموقع وGPS والتغطية الجغرافية
            </h2>
            <p className="text-xs text-slate-500">
              حالة إذن الموقع، دقة إحداثيات الجهاز لحساب المسافات، ونطاق التغطية المركزي
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshGPS}
          disabled={isLoadingGPS}
          className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 shadow-xs"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoadingGPS ? 'animate-spin' : ''}`}
          />
          <span>{isLoadingGPS ? 'جاري التحديد...' : 'تحديث الـ GPS'}</span>
        </button>
      </div>

      {/* GPS Status & Coordinates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-semibold">حالة إذن GPS:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusTone}`}
            >
              {permissionStateLabel}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-semibold">حالة التتبع المركزي:</span>
            <span className="font-bold text-slate-800">
              {isTrackingActive
                ? 'نشط ومسجل بالخادم (الواجهة فقط)'
                : systemSettings.driver_tracking_enabled === false
                ? 'متوقف من الإعدادات المركزية'
                : systemSettings.load_state !== 'loaded'
                ? 'تعذر التحقق من الإعدادات'
                : 'قراءة محلية لحساب المسافات'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
            <span>الفاصل الزمني للتتبع:</span>
            <span className="font-mono font-bold">
              {systemSettings.driver_location_update_interval_seconds != null &&
              systemSettings.driver_tracking_enabled === true
                ? `كل ${systemSettings.driver_location_update_interval_seconds} ثانية`
                : 'غير مفعل'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
            <span>الملاحة ومسافة الطريق:</span>
            <span className={`font-bold ${systemSettings.navigation_enabled ? 'text-emerald-700' : 'text-slate-600'}`}>
              {systemSettings.navigation_enabled === true
                ? `مفعّلة (${systemSettings.routing_provider || 'google'})`
                : systemSettings.navigation_enabled === false
                ? 'متوقفة من الإدارة'
                : 'غير محددة'}
            </span>
          </div>

          {systemSettings.max_accepted_gps_accuracy_m != null && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>حد الدقة المعتمد بالنظام:</span>
              <span className="font-mono font-bold">
                ±{systemSettings.max_accepted_gps_accuracy_m}m
              </span>
            </div>
          )}
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
          {driverLocation ? (
            <>
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>إحداثيات GPS الحقيقية متاحة</span>
              </div>
              <div
                className="font-mono text-[11px] text-slate-700 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/80 tabular-nums"
                dir="ltr"
              >
                {driverLocation.latitude.toFixed(5)},{' '}
                {driverLocation.longitude.toFixed(5)} • ±
                {Math.round(driverLocation.accuracy)}m
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong className="block font-bold">
                  إحداثيات السائق غير متاحة حاليًا
                </strong>
                <span>
                  {trackingAccuracyWarning ||
                    gpsErrorMessage ||
                    'اضغط على «تحديث الـ GPS» لتمكين حساب المسافات نحو الطلبات.'}
                </span>
              </div>
            </div>
          )}
          {lastTrackingResult && lastTrackingResult.status === 'db_error' && (
            <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              {lastTrackingResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Central Geographic Coverage Summary */}
      <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 font-extrabold text-blue-950">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>التغطية الجغرافية المركزية المعتمدة</span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 ${
              centralGeoContext.coverageRows.filter((c) => c.is_active).length > 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {centralGeoContext.driverAffiliation === 'restaurant_staff'
                ? 'تغطية سائق مطعم'
                : 'تغطية سائق منصة'}
              {' • '}
              {centralGeoContext.coverageRows.filter((c) => c.is_active).length} نطاق نشط
            </span>
          </span>
        </div>

        {centralGeoContext.coverageRows.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {centralGeoContext.coverageRows.slice(0, 8).map((cov, idx) => {
              const areaLabel = cov.area_id
                ? centralGeoContext.areas.find((a) => a.id === cov.area_id)?.name_ar ||
                  centralGeoContext.areas.find((a) => a.id === cov.area_id)?.name
                : null;
              const centerLabel = cov.center_id
                ? centralGeoContext.centers.find((c) => c.id === cov.center_id)?.name_ar ||
                  centralGeoContext.centers.find((c) => c.id === cov.center_id)?.name
                : null;
              const govLabel = cov.governorate_id
                ? centralGeoContext.governorates.find((g) => g.id === cov.governorate_id)?.name_ar ||
                  centralGeoContext.governorates.find((g) => g.id === cov.governorate_id)?.name
                : null;
              return (
                <span
                  key={cov.id || idx}
                  className="text-[11px] font-semibold bg-white text-slate-700 border border-blue-200/70 px-2.5 py-1 rounded-lg"
                >
                  {areaLabel || centerLabel || govLabel || 'نطاق معتمد'}
                </span>
              );
            })}
            {centralGeoContext.coverageRows.length > 8 && (
              <span className="text-[11px] font-bold text-blue-700 px-2 py-1">
                +{centralGeoContext.coverageRows.length - 8} مناطق أخرى
              </span>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-amber-800">
            {centralGeoContext.coverageError ||
              'لا توجد مناطق تغطية مركزية نشطة مسجلة لهذا السائق حاليًا.'}
          </p>
        )}
      </div>
    </section>
  );
};
