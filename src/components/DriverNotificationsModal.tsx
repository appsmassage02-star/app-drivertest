import React from 'react';
import {
  Bell,
  X,
  Clock,
  Radio,
  Activity,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type {
  RealtimeDiagnosticLog,
  RealtimeConnectionStatus,
} from '../types/pharmacy';

interface DriverNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingTotalCount: number;
  acceptedTotalCount: number;
  isWorking: boolean;
  deliveryRealtimeStatus: RealtimeConnectionStatus;
  pharmacyRealtimeStatus: RealtimeConnectionStatus;
  deliveryLastEventTime: string | null;
  pharmacyLastEventTime: string | null;
  recentLogs: RealtimeDiagnosticLog[];
  isSyncing: boolean;
  onGoToPendingOrders: () => void;
  onOpenDiagnostics: () => void;
  onRefreshAll: () => void;
}

export const DriverNotificationsModal: React.FC<
  DriverNotificationsModalProps
> = ({
  isOpen,
  onClose,
  pendingTotalCount,
  acceptedTotalCount,
  isWorking,
  deliveryRealtimeStatus,
  pharmacyRealtimeStatus,
  deliveryLastEventTime,
  pharmacyLastEventTime,
  recentLogs,
  isSyncing,
  onGoToPendingOrders,
  onOpenDiagnostics,
  onRefreshAll,
}) => {
  if (!isOpen) return null;

  const isRealtimeHealthy =
    deliveryRealtimeStatus === 'SUBSCRIBED' ||
    pharmacyRealtimeStatus === 'SUBSCRIBED';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 sm:p-4 pt-16 sm:pt-4 overflow-y-auto animate-in fade-in duration-150"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">
                الإشعارات وتنبيهات البث اللحظي
              </h3>
              <p className="text-[11px] text-blue-100">
                حالة الطلبات المتاحة وأحداث النظام المباشرة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition cursor-pointer"
            aria-label="إغلاق الإشعارات"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
          {/* Active Operational Alerts */}
          <div className="space-y-2">
            {!isWorking && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold block">
                    أنت متوقف عن العمل حاليًا
                  </strong>
                  <span className="text-[11px] text-amber-800">
                    اضغط على «بدء العمل» في الشاشة الرئيسية لاستقبال الطلبات الجديدة.
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                onGoToPendingOrders();
                onClose();
              }}
              className="w-full p-3.5 rounded-2xl bg-blue-50/80 hover:bg-blue-100/70 border border-blue-200 text-right flex items-center justify-between gap-3 transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 font-mono font-extrabold text-sm tabular-nums">
                  {pendingTotalCount}
                </div>
                <div>
                  <strong className="block text-xs font-extrabold text-slate-900">
                    {pendingTotalCount > 0
                      ? `يوجد ${pendingTotalCount} طلب جديد متاح للقبول`
                      : 'لا توجد طلبات جديدة متاحة حاليًا'}
                  </strong>
                  <span className="text-[11px] text-slate-600">
                    قيد التوصيل حاليًا: {acceptedTotalCount} طلب • اضغط للعرض
                  </span>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-blue-700 shrink-0" />
            </button>
          </div>

          {/* Realtime Channel Status */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Radio
                  className={`w-4 h-4 ${
                    isRealtimeHealthy ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                />
                <span>حالة الاتصال المباشر بالطلبات</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isRealtimeHealthy
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {isRealtimeHealthy ? 'متصل لحظيًا' : 'قيد المزامنة'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div className="bg-white p-2 rounded-xl border border-slate-200/70">
                <span className="block text-slate-400 text-[10px]">
                  آخر حدث توصيل/مطاعم
                </span>
                <strong className="text-slate-800 font-mono">
                  {deliveryLastEventTime || 'لا يوجد'}
                </strong>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200/70">
                <span className="block text-slate-400 text-[10px]">
                  آخر حدث صيدلية
                </span>
                <strong className="text-slate-800 font-mono">
                  {pharmacyLastEventTime || 'لا يوجد'}
                </strong>
              </div>
            </div>
          </div>

          {/* Recent Live Events */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>أحدث التنبيهات والسجلات</span>
              </span>
            </div>

            {recentLogs.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-blue-500" />
                <span>لا توجد تنبيهات إضافية مسجلة حاليًا</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentLogs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] flex items-start justify-between gap-2"
                  >
                    <span className="text-slate-800 font-medium leading-relaxed">
                      {log.message}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {log.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDiagnostics();
            }}
            className="min-h-[40px] px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span>سجل البث الكامل</span>
          </button>

          <button
            type="button"
            disabled={isSyncing}
            onClick={onRefreshAll}
            className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span>تحديث الآن</span>
          </button>
        </div>
      </div>
    </div>
  );
};
