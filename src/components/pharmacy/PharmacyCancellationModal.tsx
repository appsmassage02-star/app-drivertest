import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { PharmacyOrder } from '../../types/pharmacy';

interface PharmacyCancellationModalProps {
  order: PharmacyOrder | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (orderId: string, reasonCategory: string, reasonText: string) => Promise<boolean>;
}

const CANCELLATION_REASONS = [
  'عطل',
  'المكان بعيد',
  'الصيدلية مغلقة',
  'سبب آخر',
];

export const PharmacyCancellationModal: React.FC<PharmacyCancellationModalProps> = ({
  order,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('عطل');
  const [customDetails, setCustomDetails] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalDetails =
      selectedCategory === 'سبب آخر'
        ? customDetails.trim()
        : customDetails.trim()
        ? `${selectedCategory} - ${customDetails.trim()}`
        : selectedCategory;

    if (!finalDetails) {
      setError('يرجى إدخال سبب طلب الإلغاء (السبب إجباري).');
      return;
    }

    const ok = await onSubmit(order.id, selectedCategory, finalDetails);
    if (ok) {
      setCustomDetails('');
      setSelectedCategory('عطل');
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden text-right p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center space-x-2 space-x-reverse">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <h3 className="font-extrabold text-base text-neutral-900">
              طلب إلغاء فاتورة الصيدلية ({order.order_number})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 leading-relaxed">
            بعد قبول فاتورة الصيدلية لا يمكن للسائق إلغاء الطلب مباشرة. يتم إرسال{' '}
            <strong>«طلب إلغاء»</strong> مع سبب إجباري ليذهب إلى المراجعة الإدارية.
          </div>

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="block font-bold text-neutral-800 mb-2">
              اختر سبب طلب الإلغاء (إجباري) <span className="text-rose-600">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CANCELLATION_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedCategory(reason)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs border transition cursor-pointer ${
                    selectedCategory === reason
                      ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                      : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-800 border-neutral-200'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-bold text-neutral-800 mb-1">
              تفاصيل السبب {selectedCategory === 'سبب آخر' && <span className="text-rose-600">*</span>}
            </label>
            <textarea
              required={selectedCategory === 'سبب آخر'}
              rows={3}
              value={customDetails}
              onChange={(e) => setCustomDetails(e.target.value)}
              placeholder={
                selectedCategory === 'سبب آخر'
                  ? 'اكتب سبب طلب الإلغاء بالتفصيل (إجباري)...'
                  : 'توضيح إضافي للإدارة (اختياري)...'
              }
              className="w-full border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-rose-500"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 space-x-reverse pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold transition cursor-pointer"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-neutral-300 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
            >
              {isSubmitting ? 'جاري الإرسال...' : 'إرسال للمراجعة الإدارية'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
