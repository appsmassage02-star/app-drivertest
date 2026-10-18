import React, { useState } from 'react';
import {
  X,
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  Trash2,
  Database,
  Filter,
  Layers,
} from 'lucide-react';
import { RealtimeConnectionStatus, RealtimeDiagnosticLog } from '../../types/pharmacy';

interface PharmacyRealtimeDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacyStatus: RealtimeConnectionStatus;
  pharmacyError: string | null;
  pharmacyLastEventTime: string | null;
  pharmacyLastEventDetails: string | null;
  pharmacyEventsCount: number;
  pharmacyRawEventsCount?: number;
  lastCompensatorySyncTime?: string | null;
  lastCompensatorySyncCount?: number | null;
  lastCompensatorySyncSource?: string | null;
  diagnosticLogs: RealtimeDiagnosticLog[];
  onClearLogs: () => void;
  onReconnect: () => void;
  onCompensatorySync: () => void;
  deliveryStatus?: RealtimeConnectionStatus;
  deliveryError?: string | null;
  deliveryLastEventTime?: string | null;
}

export const PharmacyRealtimeDiagnosticModal: React.FC<PharmacyRealtimeDiagnosticModalProps> = ({
  isOpen,
  onClose,
  pharmacyStatus,
  pharmacyError,
  pharmacyLastEventTime,
  pharmacyLastEventDetails,
  pharmacyEventsCount,
  pharmacyRawEventsCount = 0,
  lastCompensatorySyncTime = null,
  lastCompensatorySyncCount = null,
  lastCompensatorySyncSource = null,
  diagnosticLogs,
  onClearLogs,
  onReconnect,
  onCompensatorySync,
  deliveryStatus = 'SUBSCRIBED',
  deliveryError = null,
  deliveryLastEventTime = null,
}) => {
  const [filterLevel, setFilterLevel] = useState<'all' | 'success' | 'warn' | 'error' | 'info'>('all');

  if (!isOpen) return null;

  const filteredLogs = diagnosticLogs.filter((log) => {
    if (filterLevel === 'all') return true;
    return log.level === filterLevel;
  });

  const getStatusBadge = (status: RealtimeConnectionStatus | string | undefined, _error: string | null) => {
    switch (status) {
      case 'SUBSCRIBED':
        return (
          <span className="inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>متصل (SUBSCRIBED)</span>
          </span>
        );
      case 'CONNECTING':
        return (
          <span className="inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>جاري الاتصال (CONNECTING)</span>
          </span>
        );
      case 'CHANNEL_ERROR':
        return (
          <span className="inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>خطأ بالقناة (CHANNEL_ERROR)</span>
          </span>
        );
      case 'TIMED_OUT':
        return (
          <span className="inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
            <span>انتهت المهلة (TIMED_OUT)</span>
          </span>
        );
      case 'CLOSED':
      default:
        return (
          <span className="inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-800 border border-neutral-300">
            <span className="w-2 h-2 rounded-full bg-neutral-400" />
            <span>مغلق (CLOSED)</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-neutral-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-teal-900 via-teal-800 to-cyan-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-200">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold">تشخيص البث اللحظي المباشر (Realtime)</h3>
              <p className="text-xs text-teal-200/90">
                مراقبة قنوات Supabase Realtime، واستقبال أحداث الفواتير، والتحقق من الفلاتر والمزامنة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-neutral-800">
          {/* Status Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Realtime Channel Status */}
            <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Database className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-bold text-teal-900">1. حالة القناة (WebSocket)</span>
                </div>
                {getStatusBadge(pharmacyStatus, pharmacyError)}
              </div>

              {pharmacyError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2 space-x-reverse">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{typeof pharmacyError === 'string' ? pharmacyError : (pharmacyError ? String(pharmacyError) : '')}</span>
                </div>
              )}

              <div className="text-[11px] pt-1 border-t border-teal-200/60 text-neutral-600 space-y-1">
                <div>الجدول: <span className="font-mono font-bold text-teal-900">pharmacy_orders</span></div>
                <div>النوع: <span className="font-semibold text-neutral-800">Postgres Changes (*)</span></div>
              </div>
            </div>

            {/* 2. Realtime Raw Database Events in Callback */}
            <div className={`p-4 rounded-2xl border space-y-3 ${
              pharmacyRawEventsCount > 0
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-amber-200 bg-amber-50/50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Radio className={`w-4 h-4 ${pharmacyRawEventsCount > 0 ? 'text-emerald-700' : 'text-amber-700'}`} />
                  <span className={`text-xs font-bold ${pharmacyRawEventsCount > 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
                    2. أحداث قاعدة البيانات (Callback)
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  pharmacyRawEventsCount > 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                }`}>
                  {pharmacyRawEventsCount} حدث مستلم
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-neutral-200/60">
                <div>
                  <span className="text-neutral-500 block">وقت آخر حدث:</span>
                  <span className="font-bold text-neutral-800">{pharmacyLastEventTime || 'لا يوجد بعد'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block">الأحداث المقبولة:</span>
                  <span className="font-bold text-neutral-800">{pharmacyEventsCount} حدث</span>
                </div>
              </div>

              {pharmacyLastEventDetails ? (
                <div className="text-[10px] bg-white p-2 rounded-lg border border-neutral-200 text-neutral-600 truncate font-mono">
                  {pharmacyLastEventDetails}
                </div>
              ) : (
                pharmacyStatus === 'SUBSCRIBED' && pharmacyRawEventsCount === 0 && (
                  <div className="text-[10px] p-2 rounded-lg bg-amber-100/70 border border-amber-300 text-amber-900 leading-relaxed font-sans">
                    ⚠️ القناة متصلة ولكن لم يصل أي حدث قاعدة بيانات إلى الـ Callback حتى الآن.
                  </div>
                )
              )}
            </div>

            {/* 3. HTTP Compensatory Server Sync */}
            <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RefreshCw className="w-4 h-4 text-sky-700" />
                  <span className="text-xs font-bold text-sky-900">3. المزامنة التعويضية (HTTP)</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-200 text-sky-900">
                  {lastCompensatorySyncCount !== null ? `${lastCompensatorySyncCount} فاتورة` : 'جاهز'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-sky-200/60">
                <div>
                  <span className="text-neutral-500 block">آخر جلب ناجح:</span>
                  <span className="font-bold text-neutral-800">{lastCompensatorySyncTime || 'لم يُنفذ بعد'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block">سبب الجلب:</span>
                  <span className="font-bold text-neutral-800 truncate block">
                    {typeof lastCompensatorySyncSource === 'string'
                      ? lastCompensatorySyncSource
                      : lastCompensatorySyncSource
                      ? String(lastCompensatorySyncSource)
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="text-[10px] bg-white p-2 rounded-lg border border-sky-200 text-sky-900 leading-relaxed font-sans">
                يعمل عبر استعلام HTTP REST مباشر من جدول pharmacy_orders.
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200">
            <div className="flex items-center space-x-2 space-x-reverse">
              <button
                type="button"
                onClick={() => onReconnect()}
                className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-xs"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>إعادة الاتصال بالقناة (Reconnect)</span>
              </button>

              <button
                type="button"
                onClick={() => onCompensatorySync()}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>مزامنة تعويضية فورية (Compensatory Sync)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onClearLogs()}
              disabled={diagnosticLogs.length === 0}
              className="px-3 py-2 bg-neutral-200 hover:bg-neutral-300 disabled:opacity-40 text-neutral-700 rounded-xl text-xs font-bold transition flex items-center space-x-1 space-x-reverse cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح السجلات</span>
            </button>
          </div>

          {/* Live Diagnostic Logs Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Filter className="w-4 h-4 text-neutral-500" />
                <h4 className="text-sm font-extrabold text-neutral-900">
                  سجل الأحداث والتشخيص اللحظي ({filteredLogs.length})
                </h4>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1 space-x-reverse bg-neutral-100 p-1 rounded-xl text-xs">
                {(['all', 'success', 'warn', 'error', 'info'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setFilterLevel(lvl)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-[11px] ${
                      filterLevel === lvl
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {lvl === 'all'
                      ? 'الكل'
                      : lvl === 'success'
                      ? 'اجتاز'
                      : lvl === 'warn'
                      ? 'مستبعد'
                      : lvl === 'error'
                      ? 'أخطاء'
                      : 'معلومات'}
                  </button>
                ))}
              </div>
            </div>

            {/* Logs List */}
            <div className="bg-neutral-900 text-neutral-100 rounded-2xl p-3 sm:p-4 font-mono text-xs max-h-72 overflow-y-auto space-y-2 border border-neutral-800">
              {filteredLogs.length === 0 ? (
                <div className="py-8 text-center text-neutral-500 text-xs">
                  لا توجد سجلات تشخيصية مسجلة حاليًا
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const badgeColor =
                    log.level === 'success'
                      ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800'
                      : log.level === 'warn'
                      ? 'text-amber-400 bg-amber-950/60 border-amber-800'
                      : log.level === 'error'
                      ? 'text-rose-400 bg-rose-950/60 border-rose-800'
                      : 'text-sky-400 bg-sky-950/60 border-sky-800';

                  return (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-neutral-800/80 border border-neutral-700/60 space-y-1 hover:bg-neutral-800 transition"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}
                          >
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-neutral-400">{log.timestamp}</span>
                          {log.table && (
                            <span className="text-teal-300 font-semibold">{log.table}</span>
                          )}
                          {log.eventType && (
                            <span className="text-amber-300">[{log.eventType}]</span>
                          )}
                        </div>

                        {log.orderId && (
                          <span className="text-neutral-400 text-[10px] bg-neutral-900 px-1.5 py-0.5 rounded">
                            ID: {log.orderId.slice(0, 8)}...
                          </span>
                        )}
                      </div>

                      <p className="text-neutral-200 text-xs leading-relaxed font-sans">
                        {typeof log.message === 'string' ? log.message : String(log.message ?? '')}
                      </p>

                      {log.filterReason && (
                        <div className="text-[11px] text-amber-300 font-sans pt-0.5">
                          سبب الاستبعاد: {typeof log.filterReason === 'string' ? log.filterReason : String(log.filterReason)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-100 border-t border-neutral-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-neutral-500">
            يتم تحديث الفواتير والكاش تلقائيًا فور وصول الحدث دون الحاجة لإعادة تحميل الصفحة.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-neutral-800 hover:bg-neutral-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
