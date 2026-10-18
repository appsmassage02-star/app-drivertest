import React, { useRef, useState } from 'react';
import { Camera, CheckCircle2, Trash2, Eye, Loader2 } from 'lucide-react';
import { processDocumentImage } from '../DocumentUploader';
import { DocumentViewerModal } from '../DocumentViewerModal';

interface PharmacyReceiptCameraUploaderProps {
  receiptImageUrl: string | null;
  receiptCapturedAt?: string | null;
  disabled?: boolean;
  onSaveReceipt: (dataUrl: string | null) => Promise<void> | void;
}

/**
 * Rule 9:
 * Upload ONLY ONE image for the purchase receipt.
 * Source: CAMERA ONLY (`capture="environment"`).
 * NO Gallery button or file picker option.
 */
export const PharmacyReceiptCameraUploader: React.FC<PharmacyReceiptCameraUploaderProps> = ({
  receiptImageUrl,
  disabled = false,
  onSaveReceipt,
}) => {
  const cameraOnlyInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) {
      e.target.value = '';
    }
    if (!file) return;

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const processed = await processDocumentImage(file, 1200, 0.82);
      await onSaveReceipt(processed.dataUrl);
    } catch (err: any) {
      console.warn('[PharmacyReceiptCameraUploader] Error processing/saving camera receipt:', err);
      setErrorMsg(
        err?.message || 'تعذر حفظ صورة فاتورة الشراء الملتقطة بالكاميرا.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-2 text-right" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-extrabold text-neutral-900">
            مستند فاتورة الشراء من الصيدلية (صورة واحدة - كاميرا فقط)
          </label>
          <span className="text-[11px] text-neutral-500">
            خاص بفاتورة شراء السائق من الصيدلية أثناء مرحلة التجهيز (shopping) فقط — وليس لرفع صور روشتة العميل
          </span>
        </div>
        {receiptImageUrl && (
          <span className="inline-flex items-center space-x-1 space-x-reverse text-[10px] font-bold bg-teal-50 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200">
            <CheckCircle2 className="w-3 h-3 text-teal-600" />
            <span>تم إرفاق الفاتورة</span>
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 font-bold">
          {errorMsg}
        </div>
      )}

      {/* Strictly ONE hidden input configured for Camera capture only */}
      <input
        ref={cameraOnlyInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        disabled={disabled || isProcessing}
        className="hidden"
      />

      {isProcessing ? (
        <div className="border-2 border-dashed border-teal-300 bg-teal-50/50 rounded-2xl p-4 text-center space-y-1.5">
          <Loader2 className="w-5 h-5 text-teal-700 animate-spin mx-auto" />
          <p className="text-xs font-bold text-teal-950">جاري معالجة صورة فاتورة الصيدلية الملتقطة بالكاميرا...</p>
        </div>
      ) : receiptImageUrl ? (
        <div className="border-2 border-teal-300 bg-teal-50/40 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center space-x-3 space-x-reverse cursor-pointer overflow-hidden"
          >
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-teal-200 shrink-0 shadow-2xs">
              <img
                src={receiptImageUrl}
                alt="فاتورة شراء الصيدلية"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-right min-w-0">
              <span className="font-bold text-xs text-neutral-900 block truncate">
                فاتورة شراء الأدوية الملتقطة
              </span>
              <span className="text-[10px] text-teal-700 font-semibold block">
                تم الالتقاط بواسطة الكاميرا بنجاح • اضغط للمعاينة
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 space-x-reverse shrink-0">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="p-2 bg-white hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl transition cursor-pointer"
              title="معاينة صورة الفاتورة"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => cameraOnlyInputRef.current?.click()}
                  className="p-2 bg-white hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl transition cursor-pointer"
                  title="إعادة التقاط بالكاميرا"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onSaveReceipt(null)}
                  className="p-2 bg-white hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition cursor-pointer"
                  title="حذف صورة الفاتورة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-neutral-300 hover:border-teal-500 bg-neutral-50 rounded-2xl p-4 text-center space-y-2.5 transition">
          <p className="text-xs font-bold text-neutral-700">
            التقط صورة فاتورة الشراء الورقية من الصيدلية (صورة واحدة فقط)
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraOnlyInputRef.current?.click()}
            className="mx-auto px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-neutral-300 text-white text-xs font-bold shadow-xs flex items-center justify-center space-x-2 space-x-reverse active:scale-95 transition cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>التقاط صورة الفاتورة بالكاميرا فقط</span>
          </button>
        </div>
      )}

      <DocumentViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="صورة فاتورة شراء الصيدلية"
        imageUrl={receiptImageUrl}
        documentTypeLabel="فاتورة شراء ملتقطة بالكاميرا المباشرة"
      />
    </div>
  );
};
