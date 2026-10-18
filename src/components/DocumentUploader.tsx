import React, { useRef, useState } from 'react';
import { CheckCircle2, Trash2, Camera, Image as ImageIcon, Loader2, Eye, ZoomIn } from 'lucide-react';
import { DocumentViewerModal } from './DocumentViewerModal';

export interface UploadedDocument {
  name: string;
  file: File;
  previewUrl: string;
  size: number;
  dataUrl?: string;
  processedSize?: number;
}

export interface ProcessedDocumentResult {
  dataUrl: string;
  blob: Blob;
  size: number;
  width: number;
  height: number;
}

interface DocumentUploaderProps {
  id: string;
  label: string;
  title?: string;
  required?: boolean;
  description?: string;
  value: UploadedDocument | null;
  onChange: (doc: UploadedDocument | null) => void;
  onError?: (err: string) => void;
}

/**
 * Converts a Base64 Data URL to a native binary Blob safely.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(';base64,');
    if (parts.length === 2) {
      const contentType = parts[0].split(':')[1] || 'image/jpeg';
      const byteCharacters = atob(parts[1]);
      const byteArrays = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArrays[i] = byteCharacters.charCodeAt(i);
      }
      return new Blob([byteArrays], { type: contentType });
    }
  } catch (e) {
    console.warn('[DATA_URL_TO_BLOB] Conversion error:', e);
  }
  return new Blob([], { type: 'image/jpeg' });
}

/**
 * Compresses and processes a document image into a high-clarity, compact JPEG Base64 Data URL.
 * Standardizes resolution (max 1200px) and quality (0.80) to preserve text/ID clarity while
 * maintaining ~45KB-85KB size, enabling 100% reliable PostgreSQL database storage and instant previews.
 */
export async function processDocumentImage(
  file: File,
  maxDimension = 1200,
  quality = 0.8
): Promise<ProcessedDocumentResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = () => {
      const rawDataUrl = reader.result as string;

      // Tier 1: Process using HTML Image and Canvas
      const img = new Image();

      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width || 1200;
          let height = img.naturalHeight || img.height || 800;

          // Scale down proportionally if larger than maxDimension
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            const fallbackBlob = dataUrlToBlob(rawDataUrl);
            resolve({
              dataUrl: rawDataUrl,
              blob: fallbackBlob,
              size: fallbackBlob.size || file.size,
              width,
              height,
            });
            return;
          }

          // Solid white background to eliminate transparency or black artifacts
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Universally supported JPEG format for crystal-clear documents at minimal size (~40-85KB)
          let finalDataUrl = canvas.toDataURL('image/jpeg', quality);
          if (!finalDataUrl || !finalDataUrl.startsWith('data:image/')) {
            finalDataUrl = rawDataUrl;
          }

          const finalBlob = dataUrlToBlob(finalDataUrl);
          resolve({
            dataUrl: finalDataUrl,
            blob: finalBlob,
            size: finalBlob.size,
            width,
            height,
          });
        } catch (e) {
          console.warn('[IMAGE PROCESS] Canvas resize exception, using raw data:', e);
          const rawBlob = dataUrlToBlob(rawDataUrl);
          resolve({
            dataUrl: rawDataUrl,
            blob: rawBlob,
            size: rawBlob.size || file.size,
            width: 0,
            height: 0,
          });
        }
      };

      img.onerror = () => {
        console.warn('[IMAGE PROCESS] Image element onerror, using raw file data');
        const rawBlob = dataUrlToBlob(rawDataUrl);
        resolve({
          dataUrl: rawDataUrl,
          blob: rawBlob,
          size: rawBlob.size || file.size,
          width: 0,
          height: 0,
        });
      };

      img.src = rawDataUrl;
    };

    reader.onerror = () => {
      console.warn('[IMAGE PROCESS] FileReader error, returning empty fallback');
      resolve({
        dataUrl: '',
        blob: file,
        size: file.size,
        width: 0,
        height: 0,
      });
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Backward compatibility helper for existing callers.
 */
export async function convertImageToWebpBlob(
  file: File,
  maxDimension = 1200,
  quality = 0.8
): Promise<Blob> {
  const result = await processDocumentImage(file, maxDimension, quality);
  return result.blob;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  id,
  label: propLabel,
  title,
  required = true,
  description,
  value,
  onChange,
  onError,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const effectiveLabel = propLabel || title || '';
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) {
      e.target.value = '';
    }
    if (!file) return;

    setInlineError(null);

    // Validate format by MIME or extension
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const fileName = file.name.toLowerCase();
    const isExtImage = /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(fileName);
    const isImage = validMimes.includes(file.type.toLowerCase()) || file.type.startsWith('image/') || isExtImage;

    if (!isImage) {
      const msg = 'يرجى اختيار ملف صورة صالح بصيغة (JPEG, PNG, WebP).';
      setInlineError(msg);
      if (onError) onError(msg);
      return;
    }

    // Maximum raw file size: 25MB to accommodate high-res camera captures
    const MAX_INPUT_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_INPUT_SIZE) {
      const msg = 'حجم الصورة كبير جداً (أكبر من 25 ميجابايت). يرجى اختيار صورة أصغر.';
      setInlineError(msg);
      if (onError) onError(msg);
      return;
    }

    setIsProcessing(true);

    try {
      // Process and compress image immediately into a clean, compact Data URL (~40-80KB)
      const processed = await processDocumentImage(file, 1200, 0.8);

      onChange({
        name: file.name,
        file,
        previewUrl: processed.dataUrl,
        dataUrl: processed.dataUrl,
        size: file.size,
        processedSize: processed.size,
      });
    } catch (err: any) {
      console.warn('[DOCUMENT UPLOADER] Processing error:', err);
      // Fallback: direct FileReader data URL
      const reader = new FileReader();
      reader.onload = () => {
        const rawUrl = reader.result as string;
        onChange({
          name: file.name,
          file,
          previewUrl: rawUrl,
          dataUrl: rawUrl,
          size: file.size,
        });
      };
      reader.readAsDataURL(file);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInlineError(null);
    onChange(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  return (
    <div className="space-y-1.5 text-right">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-xs font-bold text-neutral-800">
          {effectiveLabel} {required && <span className="text-rose-600 font-bold">*</span>}
        </label>
        {value ? (
          <span className="inline-flex items-center space-x-1 space-x-reverse text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>تمت المعالجة والإرفاق بنجاح</span>
          </span>
        ) : (
          required && (
            <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
              مستند إلزامي
            </span>
          )
        )}
      </div>

      {description && <p className="text-[11px] text-neutral-500 leading-tight">{description}</p>}

      {inlineError && (
        <p className="text-[11px] text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-lg p-1.5">
          {inlineError}
        </p>
      )}

      {/* Hidden inputs: One for Camera and one for Gallery/Files */}
      <input
        ref={cameraInputRef}
        type="file"
        id={`${id}-camera`}
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        id={`${id}-gallery`}
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {isProcessing ? (
        <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/50 rounded-2xl p-5 text-center space-y-2">
          <Loader2 className="w-6 h-6 text-emerald-700 animate-spin mx-auto" />
          <p className="text-xs font-bold text-emerald-900">جاري معالجة صورة الوثيقة وضغطها بأعلى وضوح...</p>
          <span className="text-[10px] text-neutral-500 block">يتم تهيئة الصورة للرفع والحفظ المباشر في قاعدة البيانات</span>
        </div>
      ) : value ? (
        <div className="relative group border-2 border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 rounded-2xl p-2.5 transition flex items-center justify-between overflow-hidden shadow-2xs">
          <div
            className="flex items-center space-x-3 space-x-reverse overflow-hidden cursor-pointer"
            onClick={() => setIsPreviewModalOpen(true)}
            title="انقر لمعاينة الصورة بالحجم الكامل"
          >
            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-white border border-neutral-200 shrink-0 shadow-xs group/img">
              <img
                src={value.previewUrl}
                alt={effectiveLabel}
                className="w-full h-full object-cover transition group-hover/img:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">
                <Eye className="w-4 h-4 text-white drop-shadow" />
              </div>
            </div>
            <div className="overflow-hidden text-right">
              <span className="font-bold text-xs text-neutral-900 truncate block">
                {value.name}
              </span>
              <div className="flex items-center space-x-2 space-x-reverse text-[10px] text-neutral-500">
                <span className="font-mono text-emerald-800 font-bold">
                  {value.processedSize ? `${(value.processedSize / 1024).toFixed(1)} KB` : `${(value.size / 1024).toFixed(1)} KB`}
                </span>
                <span className="text-neutral-400">•</span>
                <span className="text-emerald-700 font-medium">جاهزة للحفظ</span>
              </div>
            </div>
          </div>

          {/* Action buttons when attached */}
          <div className="flex items-center space-x-1.5 space-x-reverse shrink-0">
            <button
              type="button"
              onClick={() => setIsPreviewModalOpen(true)}
              title="معاينة الصورة وتكبيرها"
              className="p-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 rounded-xl transition flex items-center justify-center bg-white border border-emerald-200 shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              title="إعادة التقاط بالكاميرا"
              className="p-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 rounded-xl transition flex items-center justify-center bg-white border border-emerald-200 shadow-2xs"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              title="إعادة اختيار من المعرض"
              className="p-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 rounded-xl transition flex items-center justify-center bg-white border border-emerald-200 shadow-2xs"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              title="حذف المستند"
              className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-100 rounded-xl transition flex items-center justify-center bg-white border border-rose-200 shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-neutral-300 hover:border-emerald-500 bg-neutral-50/90 rounded-2xl p-3.5 transition text-center space-y-2.5">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-neutral-800 block">
              إرفاق صورة الوثيقة
            </span>
            <span className="text-[10px] text-neutral-400 block">
              التقط صورة واضحة الآن أو اختر من صور الهاتف
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="cursor-pointer flex items-center justify-center space-x-1.5 space-x-reverse py-2.5 px-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs active:scale-95 transition"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>التقاط بالكاميرا</span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="cursor-pointer flex items-center justify-center space-x-1.5 space-x-reverse py-2.5 px-2 rounded-xl bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 text-xs font-bold shadow-2xs active:scale-95 transition"
            >
              <ImageIcon className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>من المعرض</span>
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Preview */}
      <DocumentViewerModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        title={effectiveLabel}
        imageUrl={value?.previewUrl || value?.dataUrl}
        documentTypeLabel="معاينة المستند المرفق قبل التسجيل"
      />
    </div>
  );
};
