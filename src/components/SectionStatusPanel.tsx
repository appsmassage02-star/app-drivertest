import React from 'react';
import {
  Package,
  Pill,
  UtensilsCrossed,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Truck,
} from 'lucide-react';
import type { AppSectionKey, AppSectionSettingsState } from '../types';
import {
  APP_SECTION_KEYS,
  getSectionStatusDisplayMeta,
} from '../lib/sectionSettingsService';

interface SectionStatusPanelProps {
  sectionSettings: AppSectionSettingsState;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  globalDeliveryEnabled?: boolean;
}

const SECTION_ICON: Record<AppSectionKey, React.ComponentType<{ className?: string }>> = {
  household_shortages: Package,
  pharmacy: Pill,
  ready_food: UtensilsCrossed,
};

const SECTION_ACCENT: Record<
  AppSectionKey,
  {
    iconBg: string;
    iconText: string;
    borderActive: string;
  }
> = {
  household_shortages: {
    iconBg: 'bg-emerald-50 border-emerald-200',
    iconText: 'text-emerald-700',
    borderActive: 'border-neutral-200',
  },
  pharmacy: {
    iconBg: 'bg-teal-50 border-teal-200',
    iconText: 'text-teal-700',
    borderActive: 'border-teal-200/80',
  },
  ready_food: {
    iconBg: 'bg-amber-50 border-amber-200',
    iconText: 'text-amber-700',
    borderActive: 'border-amber-200/80',
  },
};

function formatSyncTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

export const SectionStatusPanel: React.FC<SectionStatusPanelProps> = ({
  sectionSettings,
  isRefreshing = false,
  onRefresh,
  globalDeliveryEnabled,
}) => {
  const hasGlobalTableFailure =
    sectionSettings.load_state === 'permission_denied' ||
    sectionSettings.load_state === 'table_missing' ||
    sectionSettings.load_state === 'error' ||
    sectionSettings.load_state === 'empty';

  const lastSyncedFormatted = formatSyncTime(sectionSettings.lastSyncedAt);

  return (
    <section
      aria-label="حالة تشغيل الأقسام وخدمات التوصيل"
      className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-2xs space-y-3"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="w-8 h-8 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-extrabold text-neutral-900">
              حالة تشغيل الأقسام وخدمات التوصيل
            </h2>
            <p className="text-[11px] text-neutral-500">
              قراءة مباشرة من الإعدادات المركزية — أي تعديل إداري يظهر هنا ويمنع استقبال طلبات جديدة من القسم المتوقف دون المساس بطلباتك القائمة
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 space-x-reverse">
          {lastSyncedFormatted && (
            <span className="text-[10px] font-semibold text-neutral-500 bg-neutral-50 border border-neutral-200 px-2 py-1 rounded-lg">
              آخر تحديث: {lastSyncedFormatted}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 active:scale-95 text-neutral-800 rounded-xl text-[11px] font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-700' : ''}`} />
              <span>تحديث الحالة</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Table Failure Alert (Permission / Table Missing / Empty / Network) */}
      {hasGlobalTableFailure && (
        <div
          className={`rounded-xl border p-3 text-xs flex items-start space-x-2.5 space-x-reverse ${
            sectionSettings.load_state === 'permission_denied'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}
        >
          {sectionSettings.load_state === 'permission_denied' ? (
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          )}
          <div className="leading-relaxed">
            <strong className="font-extrabold block mb-0.5">
              {sectionSettings.load_state === 'permission_denied'
                ? 'تعذر قراءة إعدادات الأقسام بسبب صلاحيات قاعدة البيانات (RLS / 42501)'
                : sectionSettings.load_state === 'table_missing'
                ? 'جدول إعدادات الأقسام (app_section_settings) غير متاح في قاعدة البيانات'
                : sectionSettings.load_state === 'empty'
                ? 'جدول إعدادات الأقسام فارغ حاليًا'
                : 'تعذر تحديث حالة الأقسام من الخادم'}
            </strong>
            <span className="text-[11px]">
              {sectionSettings.errorMessage || 'تعذر التحقق من الإعدادات المركزية.'}{' '}
              تم إيقاف استقبال الطلبات الجديدة مؤقتًا كإجراء وقائي، بينما تستمر طلباتك المقبولة والمسندة إليك بشكل طبيعي.
            </span>
          </div>
        </div>
      )}

      {/* Global Master Delivery Disabled Notice */}
      {globalDeliveryEnabled === false && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900 flex items-center space-x-2 space-x-reverse">
          <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
          <span>
            <strong>التوصيل العام متوقف:</strong> تم تعطيل خدمة الدليفري العامة في النظام، ولن تتوفر طلبات جديدة لأي قسم حتى إعادة التفعيل.
          </span>
        </div>
      )}

      {/* 3 Independent Section Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {APP_SECTION_KEYS.map((key) => {
          const entry = sectionSettings.sections[key];
          const display = getSectionStatusDisplayMeta(entry);
          const IconComponent = SECTION_ICON[key];
          const accent = SECTION_ACCENT[key];

          const isRowProblem =
            entry.load_state !== 'loaded' && entry.load_state !== 'idle';

          const isOperational = display.isOperationalForNewOrders;

          return (
            <div
              key={key}
              data-testid={`section-status-card-${key}`}
              className={`rounded-xl border p-3 transition space-y-2 ${
                isRowProblem
                  ? 'bg-neutral-50 border-neutral-300'
                  : isOperational
                  ? `bg-white ${accent.borderActive}`
                  : 'bg-rose-50/40 border-rose-200'
              }`}
            >
              {/* Section Name & Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 space-x-reverse min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${accent.iconBg} ${accent.iconText}`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-neutral-900 truncate">
                      {display.labelAr}
                    </div>
                  </div>
                </div>

                {entry.load_state === 'idle' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600">
                    جاري القراءة...
                  </span>
                ) : isOperational ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
              </div>

              {/* Independent Flags: Section Enabled vs Delivery Enabled */}
              <div className="space-y-1.5 text-[11px] pt-1 border-t border-neutral-100">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600 font-semibold">حالة القسم:</span>
                  <span
                    data-testid={`section-enabled-badge-${key}`}
                    className={`font-extrabold px-2 py-0.5 rounded-md border ${
                      display.sectionEnabled === true
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : display.sectionEnabled === false
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                    }`}
                  >
                    {display.sectionStatusLabel}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-neutral-600 font-semibold">حالة التوصيل:</span>
                  <span
                    data-testid={`delivery-enabled-badge-${key}`}
                    className={`font-extrabold px-2 py-0.5 rounded-md border ${
                      display.deliveryEnabled === true
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : display.deliveryEnabled === false
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                    }`}
                  >
                    {display.deliveryStatusLabel}
                  </span>
                </div>

                {/* Visibility shown ONLY as an explicitly separated informational line, NEVER as delivery */}
                {display.visibilityLabel && (
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-0.5">
                    <span className="flex items-center space-x-1 space-x-reverse">
                      {display.sectionVisible ? (
                        <Eye className="w-3 h-3 text-neutral-400" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-neutral-400" />
                      )}
                      <span>الظهور في واجهة العملاء:</span>
                    </span>
                    <span className="font-bold text-neutral-700">
                      {display.visibilityLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Per-Section Specific Read/Validation Warning */}
              {isRowProblem && !hasGlobalTableFailure && (
                <div className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 leading-relaxed">
                  {display.errorMessage || 'تعذر التحقق من إعداد هذا القسم؛ باقي الأقسام تعمل بصورة مستقلة.'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
