import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Download, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  imageUrl?: string | null;
  documentTypeLabel: string;
  description?: string;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  imageUrl,
  documentTypeLabel,
  description,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  if (!isOpen) return null;

  const isValidImage = imageUrl && (imageUrl.startsWith('data:image/') || imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('blob:'));

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.75));
  const handleResetZoom = () => setZoomLevel(1);

  const handleDownload = () => {
    if (!imageUrl) return;
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${title.replace(/\s+/g, '_')}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.warn('Download failed:', e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/80">
          <div className="flex items-center space-x-2.5 space-x-reverse">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-neutral-900">{title}</h3>
              <span className="text-[11px] text-neutral-500 block">{documentTypeLabel}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            {isValidImage && (
              <>
                <div className="flex items-center bg-white border border-neutral-200 rounded-xl p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    title="تكبير"
                    className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-700 transition"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    title="تصغير"
                    className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-700 transition"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    title="إعادة ضبط الحجم"
                    className="px-2 text-[10px] font-bold text-neutral-600 hover:bg-neutral-100 rounded-lg transition"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownload}
                  title="تحميل الصورة"
                  className="p-2 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 rounded-xl shadow-2xs transition"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-xl transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-auto flex-1 flex flex-col items-center justify-center min-h-[300px] bg-neutral-900/5">
          {isValidImage ? (
            <div className="relative overflow-auto max-w-full max-h-[60vh] flex items-center justify-center p-2">
              <img
                src={imageUrl!}
                alt={title}
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                className="max-h-[55vh] max-w-full rounded-2xl shadow-lg object-contain transition-transform duration-150 border border-neutral-300 bg-white"
              />
            </div>
          ) : (
            <div className="p-8 text-center space-y-3 bg-amber-50 rounded-2xl border border-amber-200 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-amber-950">صورة الوثيقة غير متوفرة في قاعدة البيانات</h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                لم يتم رفع ملف صورة حقيقي لهذه الوثيقة إلى قاعدة البيانات. تم حفظ مسار نصي فقط أو لم تكتمل عملية الرفع.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 space-x-reverse">
            {isValidImage ? (
              <span className="inline-flex items-center space-x-1.5 space-x-reverse text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>الوثيقة مرفوعة ومحفوظة بنجاح في قاعدة البيانات</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 space-x-reverse text-amber-700 font-bold bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>بحاجة لإعادة رفع الصورة</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold transition shadow-xs"
          >
            إغلاق المعاينة
          </button>
        </div>
      </div>
    </div>
  );
};
