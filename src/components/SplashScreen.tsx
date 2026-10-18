import React from 'react';
import { Package, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { getInitialSplashAssetSrc, DEFAULT_FALLBACK_ASSET } from '../lib/centralAssetsService';

interface SplashScreenProps {
  statusMessage?: string;
  step?: number; // 1: Session, 2: Driver Profile, 3: Approval & Active Check, 4: Ready
  splashImageSrc?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusMessage = 'جاري التحقق من هوية السائق وبيانات الحساب...',
  step = 1,
  splashImageSrc,
}) => {
  const effectiveSplashSrc = splashImageSrc || getInitialSplashAssetSrc();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-900 text-white font-['Cairo',sans-serif] px-4 select-none"
      dir="rtl"
    >
      {/* Background Decorative Glow */}
      <div className="absolute w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      {/* Main Logo & Branding Card */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center space-y-6">
        {/* Animated Brand Emblem with Official New Logo */}
        <div className="relative">
          <div className="w-28 h-28 rounded-3xl bg-white p-1 shadow-2xl shadow-emerald-500/30 flex items-center justify-center overflow-hidden border border-emerald-500/40">
            <img
              src={effectiveSplashSrc}
              alt="شعار التطبيق الرسمي"
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== window.location.origin + DEFAULT_FALLBACK_ASSET) {
                  target.src = DEFAULT_FALLBACK_ASSET;
                }
              }}
            />
          </div>
          <span className="absolute -bottom-2 -right-2 bg-emerald-500 text-neutral-950 p-1.5 rounded-xl shadow-lg">
            <Package className="w-4 h-4" />
          </span>
        </div>

        {/* Brand Typography */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-1.5 space-x-reverse px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>بوابة مناديب التوصيل الرسمية</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            دليفري طلباتي
          </h1>
          <p className="text-xs text-neutral-400 font-medium">
            منظومة إدارة وقبول طلبات التوصيل الفورية
          </p>
        </div>

        {/* Dynamic Progress Indicator */}
        <div className="w-full bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-bold">
            <span className="flex items-center space-x-1.5 space-x-reverse text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>{statusMessage}</span>
            </span>
            <span className="font-mono text-neutral-500">{Math.min(step * 25, 100)}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(step * 25, 100)}%` }}
            />
          </div>

          {/* Verification Steps List */}
          <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] text-neutral-400">
            <div className={`flex items-center space-x-1 space-x-reverse ${step >= 1 ? 'text-emerald-400 font-bold' : ''}`}>
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>المصادقة</span>
            </div>
            <div className={`flex items-center space-x-1 space-x-reverse ${step >= 2 ? 'text-emerald-400 font-bold' : ''}`}>
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>ملف السائق</span>
            </div>
            <div className={`flex items-center space-x-1 space-x-reverse ${step >= 3 ? 'text-emerald-400 font-bold' : ''}`}>
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>الاعتماد</span>
            </div>
          </div>
        </div>

        {/* Subtle Footer */}
        <p className="text-[10px] text-neutral-600 font-medium">
          طلبات البيت © 2026 - نظام التوصيل المعتمد
        </p>
      </div>
    </div>
  );
};
