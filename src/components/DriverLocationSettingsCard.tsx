import React from 'react';
import { MapPin, ShieldCheck, Navigation } from 'lucide-react';
import type { CentralGeoContext } from '../types';

interface DriverLocationSettingsCardProps {
  centralGeoContext: CentralGeoContext;
}

export const DriverLocationSettingsCard: React.FC<
  DriverLocationSettingsCardProps
> = ({ centralGeoContext }) => {
  const activeCoverageCount = centralGeoContext.coverageRows.filter(
    (c) => c.is_active
  ).length;

  return (
    <section
      aria-label="نطاق التغطية الجغرافية والملاحة"
      className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              نطاق التغطية الجغرافية والملاحة
            </h2>
            <p className="text-xs text-slate-500">
              مناطق العمل المعتمدة وإرشاد التوصيل عبر خرائط Google باستخدام إحداثيات العميل
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Mode Info */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-700">
        <Navigation className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="block font-bold text-slate-900">
            الملاحة المباشرة عبر Google Maps فقط
          </strong>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            لا يتطلب التطبيق تشغيل الـ GPS أو منح أذونات الموقع لاستلام الطلبات أو التوصيل. عند الضغط على «بدء التوصيل»، يتم فتح خرائط Google مباشرة على إحداثيات العميل المحفوظة في الطلب.
          </p>
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
            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 tabular-nums ${
              activeCoverageCount > 0
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
              {activeCoverageCount} نطاق نشط
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
              <span className="text-[11px] font-bold text-blue-700 px-2 py-1 tabular-nums">
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
