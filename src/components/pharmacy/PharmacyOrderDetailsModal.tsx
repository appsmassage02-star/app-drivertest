import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Phone,
  MapPin,
  User,
  Building,
  FileText,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  Eye,
  PlusCircle,
  Trash2,
  Edit3,
  DollarSign,
  Pill,
  CheckSquare,
  ShieldCheck,
  Search,
  RefreshCw,
  WifiOff,
  Lock,
} from 'lucide-react';
import {
  PharmacyOrder,
  PharmacyOrderItem,
  RegisteredPharmacy,
  PharmacyDirectoryQueryStatus,
} from '../../types/pharmacy';
import {
  pharmacyService,
  normalizeArabicSearchText,
} from '../../lib/pharmacyService';
import { getPharmacyStatusBadge } from './PharmacyOrderCard';
import { PharmacyReceiptCameraUploader } from './PharmacyReceiptCameraUploader';
import { DocumentViewerModal } from '../DocumentViewerModal';
import { formatSafeDateTime } from '../../App';

interface PharmacyOrderDetailsModalProps {
  order: PharmacyOrder | null;
  currentDriverId?: string | null;
  isActionLoading: boolean;
  onClose: () => void;
  onAcceptOrder: (order: PharmacyOrder) => void;
  onStartShopping: (order: PharmacyOrder) => void;
  onUpdateMedicineItem: (
    orderId: string,
    itemId: string,
    purchasedQuantity: number,
    shortageReason?: string | null
  ) => Promise<void>;
  onSavePrescriptionImageNote: (
    orderId: string,
    imageId: string,
    noteText: string
  ) => Promise<void>;
  onAddVisitedPharmacy: (
    orderId: string,
    pharmacyName: string,
    addressOrNote?: string,
    pharmacyId?: string | null,
    stopStatus?: string
  ) => Promise<void>;
  onRemoveVisitedPharmacy: (orderId: string, visitId: string) => Promise<void>;
  onSuggestPharmacyChange: (
    orderId: string,
    suggestedPharmacyName: string,
    reason: string,
    suggestedPharmacyId?: string | null
  ) => Promise<void>;
  onSaveReceiptImage: (orderId: string, dataUrl: string | null) => Promise<void>;
  onSaveOrderTotals: (orderId: string, medicinesTotal: number, deliveryFee: number) => Promise<void>;
  onCompletePreparation: (
    orderId: string,
    medicinesTotal: number,
    deliveryFee: number,
    receiptImageUrl?: string | null
  ) => Promise<void>;
  onMarkUnableToFulfill: (orderId: string, note?: string) => Promise<void>;
  onCompleteDelivery: (orderId: string) => Promise<void>;
  onOpenCancellationModal: (order: PharmacyOrder) => void;
  onCallCustomer: (phone: string) => void;
}

const PRESET_SHORTAGE_REASONS = [
  'غير متوفر',
  'ناقص في الصيدليات حاليًا',
  'توقف إنتاجه / غير متاح بالمخازن',
  'الكمية المتبقية في الصيدلية غير كافية',
  'يحتاج بديل بعد الرجوع للعميل',
];

const VISIT_STOP_STATUS_OPTIONS = [
  { value: 'visited', label: 'تمت الزيارة والتعامل (visited)' },
  { value: 'purchased_full', label: 'تم توفير الأصناف بالكامل' },
  { value: 'purchased_partial', label: 'تم توفير جزء من الأصناف' },
  { value: 'unavailable', label: 'الأصناف غير متوفرة بهذه الصيدلية' },
];

export const PharmacyOrderDetailsModal: React.FC<PharmacyOrderDetailsModalProps> = ({
  order,
  currentDriverId,
  isActionLoading,
  onClose,
  onAcceptOrder,
  onStartShopping,
  onUpdateMedicineItem,
  onSavePrescriptionImageNote,
  onAddVisitedPharmacy,
  onRemoveVisitedPharmacy,
  onSuggestPharmacyChange,
  onSaveReceiptImage,
  onSaveOrderTotals,
  onCompletePreparation,
  onMarkUnableToFulfill,
  onCompleteDelivery,
  onOpenCancellationModal,
  onCallCustomer,
}) => {
  // Active item resolution form state
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [resolutionMode, setResolutionMode] = useState<'full' | 'partial' | 'unavailable'>('full');
  const [partialPurchasedQty, setPartialPurchasedQty] = useState<number>(1);
  const [shortageReasonInput, setShortageReasonInput] = useState<string>('غير متوفر');

  // Prescription image note editing state
  const [editingNoteImageId, setEditingNoteImageId] = useState<string | null>(null);
  const [imageNoteInput, setImageNoteInput] = useState<string>('');
  const [previewPrescriptionModal, setPreviewPrescriptionModal] = useState<{
    isOpen: boolean;
    title: string;
    imageUrl: string | null;
    label: string;
  }>({
    isOpen: false,
    title: '',
    imageUrl: null,
    label: '',
  });

  // Registered Active Pharmacies Directory state (for both Suggest Change & Internal Visited Pharmacies Log)
  const [directoryPharmacies, setDirectoryPharmacies] = useState<RegisteredPharmacy[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<PharmacyDirectoryQueryStatus>('ok');
  const [directoryDiagnosticMsg, setDirectoryDiagnosticMsg] = useState<string | null>(null);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState<boolean>(false);

  // Suggest Pharmacy Change state (Problem 2)
  const [showSuggestionForm, setShowSuggestionForm] = useState<boolean>(false);
  const [suggestionSearchQuery, setSuggestionSearchQuery] = useState<string>('');
  const [selectedSuggestedPharmacy, setSelectedSuggestedPharmacy] =
    useState<RegisteredPharmacy | null>(null);
  const [suggestedPharmacyReason, setSuggestedPharmacyReason] = useState<string>('');
  const [suggestionErrorMsg, setSuggestionErrorMsg] = useState<string | null>(null);

  // Internal Visited Pharmacies Log state (Problem 4)
  const [visitSearchQuery, setVisitSearchQuery] = useState<string>('');
  const [selectedVisitPharmacy, setSelectedVisitPharmacy] =
    useState<RegisteredPharmacy | null>(null);
  const [visitStopStatus, setVisitStopStatus] = useState<string>('visited');
  const [newPharmacyNote, setNewPharmacyNote] = useState<string>('');
  const [visitErrorMsg, setVisitErrorMsg] = useState<string | null>(null);

  // Totals input state (Rule 8: medicines_total + delivery_fee)
  const [medicinesTotalInput, setMedicinesTotalInput] = useState<string>('');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState<string>('');
  const [shortageReasonsList, setShortageReasonsList] = useState<string[]>(PRESET_SHORTAGE_REASONS);

  useEffect(() => {
    let mounted = true;
    pharmacyService.getShortageReasonSuggestions().then((reasons) => {
      if (mounted && reasons.length > 0) {
        setShortageReasonsList(reasons);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadActivePharmaciesForOrderArea = useCallback(async () => {
    if (!order) return;
    setIsLoadingDirectory(true);
    try {
      const res = await pharmacyService.getActivePharmaciesForOrder({
        governorateName: order.governorate_name,
        governorateCode: order.governorate_code,
        markazName: order.markaz_name,
      });
      setDirectoryPharmacies(res.pharmacies);
      setDirectoryStatus(res.status);
      setDirectoryDiagnosticMsg(res.diagnosticMessage);
    } catch (err: any) {
      setDirectoryPharmacies([]);
      setDirectoryStatus('network_error');
      setDirectoryDiagnosticMsg(
        err?.message || 'حدث خطأ أثناء تحميل قائمة الصيدليات المفعلة.'
      );
    } finally {
      setIsLoadingDirectory(false);
    }
  }, [order?.id, order?.governorate_name, order?.governorate_code, order?.markaz_name]);

  useEffect(() => {
    if (order) {
      setMedicinesTotalInput(
        order.totals.medicines_total != null ? String(order.totals.medicines_total) : ''
      );
      setDeliveryFeeInput(String(order.totals.delivery_fee ?? 0));
      setActiveItemId(null);
      setEditingNoteImageId(null);
      setShowSuggestionForm(false);
      setSelectedSuggestedPharmacy(null);
      setSuggestionSearchQuery('');
      setSuggestedPharmacyReason('');
      setSuggestionErrorMsg(null);
      setSelectedVisitPharmacy(null);
      setVisitSearchQuery('');
      setNewPharmacyNote('');
      setVisitErrorMsg(null);
      loadActivePharmaciesForOrderArea();
    }
  }, [
    order?.id,
    order?.totals.medicines_total,
    order?.totals.delivery_fee,
    loadActivePharmaciesForOrderArea,
  ]);

  // Filtered pharmacies for "Suggest Pharmacy Change" (excludes customer's original pharmacy if ID matches)
  const filteredSuggestionPharmacies = useMemo(() => {
    const base = directoryPharmacies.filter(
      (ph) => !order?.requested_pharmacy_id || ph.id !== order.requested_pharmacy_id
    );
    const qNorm = normalizeArabicSearchText(suggestionSearchQuery);
    if (!qNorm) return base;
    return base.filter((ph) => {
      const nameNorm = normalizeArabicSearchText(ph.name);
      const centerNorm = normalizeArabicSearchText(ph.center_name);
      const addrNorm = normalizeArabicSearchText(ph.address);
      const phoneStr = String(ph.phone || '').trim();
      return (
        nameNorm.includes(qNorm) ||
        qNorm.includes(nameNorm) ||
        centerNorm.includes(qNorm) ||
        addrNorm.includes(qNorm) ||
        (phoneStr && phoneStr.includes(qNorm))
      );
    });
  }, [directoryPharmacies, order?.requested_pharmacy_id, suggestionSearchQuery]);

  // Filtered pharmacies for "Internal Driver Visited Pharmacies Log"
  const filteredVisitPharmacies = useMemo(() => {
    const qNorm = normalizeArabicSearchText(visitSearchQuery);
    if (!qNorm) return directoryPharmacies;
    return directoryPharmacies.filter((ph) => {
      const nameNorm = normalizeArabicSearchText(ph.name);
      const centerNorm = normalizeArabicSearchText(ph.center_name);
      const addrNorm = normalizeArabicSearchText(ph.address);
      const phoneStr = String(ph.phone || '').trim();
      return (
        nameNorm.includes(qNorm) ||
        qNorm.includes(nameNorm) ||
        centerNorm.includes(qNorm) ||
        addrNorm.includes(qNorm) ||
        (phoneStr && phoneStr.includes(qNorm))
      );
    });
  }, [directoryPharmacies, visitSearchQuery]);

  if (!order) return null;

  const isAssignedToMe = order.assigned_driver_id === currentDriverId;
  const isShopping = order.status === 'shopping' && isAssignedToMe;
  const statusBadge = getPharmacyStatusBadge(order.status);

  // Item counts strictly computed from actual database items
  const totalItems = order.items.length;
  const pendingItemsCount = order.items.filter((i) => i.status === 'pending').length;
  const purchasedItemsCount = order.items.filter(
    (i) => i.status === 'purchased' && i.purchased_quantity > 0
  ).length;
  const unavailableItemsCount = order.items.filter(
    (i) => i.status === 'unavailable'
  ).length;

  const allItemsResolved = totalItems > 0 && pendingItemsCount === 0;
  const allItemsUnavailable =
    allItemsResolved &&
    order.items.every((i) => i.status === 'unavailable' || i.purchased_quantity === 0);

  const parsedMedTotal = parseFloat(medicinesTotalInput);
  const parsedDelFee = parseFloat(deliveryFeeInput);
  const validMedTotal = !isNaN(parsedMedTotal) && parsedMedTotal > 0 ? parsedMedTotal : 0;
  const validDelFee = !isNaN(parsedDelFee) && parsedDelFee >= 0 ? parsedDelFee : 0;
  const computedFinalTotal = Number((validMedTotal + validDelFee).toFixed(2));

  const canCompletePreparation =
    isShopping &&
    allItemsResolved &&
    !allItemsUnavailable &&
    !isNaN(parsedMedTotal) &&
    parsedMedTotal > 0 &&
    !isNaN(parsedDelFee) &&
    parsedDelFee >= 0;

  // Open item resolution editor
  const openItemEditor = (
    item: PharmacyOrderItem,
    mode: 'full' | 'partial' | 'unavailable'
  ) => {
    setActiveItemId(item.id);
    setResolutionMode(mode);

    if (mode === 'full') {
      setPartialPurchasedQty(item.requested_quantity);
      setShortageReasonInput('');
    } else if (mode === 'unavailable') {
      setPartialPurchasedQty(0);
      setShortageReasonInput(item.shortage_reason || 'غير متوفر');
    } else {
      const defaultPartial =
        item.purchased_quantity > 0 && item.purchased_quantity < item.requested_quantity
          ? item.purchased_quantity
          : Math.max(1, item.requested_quantity - 1);
      setPartialPurchasedQty(defaultPartial);
      setShortageReasonInput(item.shortage_reason || 'غير متوفر');
    }
  };

  const handleConfirmItemResolution = async (item: PharmacyOrderItem) => {
    if (resolutionMode === 'full') {
      await onUpdateMedicineItem(order.id, item.id, item.requested_quantity, null);
      setActiveItemId(null);
      return;
    }

    if (resolutionMode === 'unavailable') {
      const reason = shortageReasonInput.trim() || 'غير متوفر';
      await onUpdateMedicineItem(order.id, item.id, 0, reason);
      setActiveItemId(null);
      return;
    }

    const purchasedQty = Math.max(
      1,
      Math.min(item.requested_quantity - 1, Number(partialPurchasedQty) || 1)
    );
    const reason = shortageReasonInput.trim();
    if (!reason) return;
    await onUpdateMedicineItem(order.id, item.id, purchasedQty, reason);
    setActiveItemId(null);
  };

  // Render helper for Pharmacy Directory Status Banner (distinguishes network, permission, and empty states)
  const renderDirectoryStatusNotice = () => {
    if (isLoadingDirectory) {
      return (
        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-600 flex items-center space-x-2 space-x-reverse text-[11px]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-700 shrink-0" />
          <span>جاري تحميل قائمة الصيدليات المسجلة والمفعلة لمنطقة الطلب...</span>
        </div>
      );
    }

    if (directoryStatus === 'network_error') {
      return (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center space-x-2 space-x-reverse">
            <WifiOff className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>خطأ في الاتصال:</strong>{' '}
              {directoryDiagnosticMsg ||
                'تعذر الاتصال بقاعدة البيانات لجلب قائمة الصيدليات المفعلة.'}
            </span>
          </div>
          <button
            type="button"
            onClick={loadActivePharmaciesForOrderArea}
            className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold shrink-0 cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }

    if (directoryStatus === 'permission_denied') {
      return (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center space-x-2 space-x-reverse">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>تنبيه صلاحيات القراءة:</strong>{' '}
              {directoryDiagnosticMsg ||
                'لا تتوفر صلاحية قراءة جدول الصيدليات (pharmacy_pharmacies) لحساب السائق الحالي.'}
            </span>
          </div>
          <button
            type="button"
            onClick={loadActivePharmaciesForOrderArea}
            className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold shrink-0 cursor-pointer"
          >
            تحديث
          </button>
        </div>
      );
    }

    if (directoryStatus === 'query_error') {
      return (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center space-x-2 space-x-reverse">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{directoryDiagnosticMsg || 'تعذر جلب قائمة الصيدليات من قاعدة البيانات.'}</span>
          </div>
          <button
            type="button"
            onClick={loadActivePharmaciesForOrderArea}
            className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold shrink-0 cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }

    if (directoryPharmacies.length === 0) {
      return (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center space-x-2 space-x-reverse">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {directoryDiagnosticMsg ||
                `لا توجد صيدليات مفعلة مسجلة حاليًا في نطاق الطلب (${order.governorate_name} - ${order.markaz_name}).`}
            </span>
          </div>
          <button
            type="button"
            onClick={loadActivePharmaciesForOrderArea}
            className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold shrink-0 cursor-pointer"
          >
            تحديث القائمة
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden text-right flex flex-col max-h-[92vh] border-2 border-teal-200">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between bg-gradient-to-l from-teal-800 to-emerald-800 text-white">
          <div className="flex items-center space-x-2.5 space-x-reverse flex-wrap gap-1.5">
            <span className="inline-flex items-center space-x-1.5 space-x-reverse bg-white/15 px-3 py-1 rounded-xl text-xs font-extrabold border border-white/20">
              <Pill className="w-4 h-4 text-teal-200" />
              <span>فاتورة صيدلية</span>
            </span>
            <span className="font-mono text-xs font-bold bg-white text-teal-950 px-2.5 py-1 rounded-lg">
              {order.order_number}
            </span>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs">
          {/* Top Lifecycle Banner */}
          {order.status === 'accepted' && isAssignedToMe && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-purple-950">
              <div className="space-y-0.5">
                <div className="font-bold text-sm flex items-center space-x-1.5 space-x-reverse text-purple-900">
                  <ShoppingCart className="w-4 h-4 text-purple-700" />
                  <span>تم قبول فاتورة الصيدلية - جاهزة لبدء التجهيز</span>
                </div>
                <p className="text-purple-800 text-[11px] leading-relaxed">
                  اضغط على «بدء تجهيز الأدوية» لتفعيل فحص الأصناف وتحديد المتوفر والناقص وتسجيل الفاتورة وملاحظات الروشتة.
                </p>
              </div>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onStartShopping(order)}
                className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer shadow-xs flex items-center justify-center space-x-1.5 space-x-reverse"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>بدء تجهيز الأدوية الآن (shopping)</span>
              </button>
            </div>
          )}

          {order.status === 'ready_for_delivery' && (
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-teal-950">
              <div className="space-y-0.5">
                <div className="font-bold text-sm flex items-center space-x-1.5 space-x-reverse text-teal-900">
                  <CheckSquare className="w-4 h-4 text-teal-700" />
                  <span>فاتورة الصيدلية جاهزة للتوصيل للعميل (ready_for_delivery)</span>
                </div>
                <p className="text-teal-800 text-[11px] leading-relaxed">
                  الإجمالي المطلوب تحصيله من العميل:{' '}
                  <strong className="font-mono">
                    {Number(order.totals.final_total || 0).toFixed(2)} ج.م
                  </strong>{' '}
                  (إجمالي الأدوية {Number(order.totals.medicines_total || 0).toFixed(2)} ج.م + التوصيل{' '}
                  {Number(order.totals.delivery_fee || 0).toFixed(2)} ج.م).
                </p>
              </div>
              {isAssignedToMe && (
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={() => onCompleteDelivery(order.id)}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer shadow-xs flex items-center justify-center space-x-1.5 space-x-reverse"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>إتمام التوصيل (completed)</span>
                </button>
              )}
            </div>
          )}

          {/* Rule 12: Compensation Status Placeholder when unable_to_fulfill */}
          {order.status === 'unable_to_fulfill' && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-2 text-orange-950">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm flex items-center space-x-1.5 space-x-reverse text-orange-900">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <span>تعذر تنفيذ الطلب لعدم توفر جميع الأصناف (unable_to_fulfill)</span>
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white border border-orange-200 text-orange-900">
                  {order.compensation_status === 'pending_system_decision' &&
                    'التعويض: بانتظار قرار النظام'}
                  {order.compensation_status === 'approved' && 'التعويض: معتمد من النظام'}
                  {order.compensation_status === 'rejected' && 'التعويض: مرفوض من النظام'}
                  {order.compensation_status === 'not_applicable' && 'التعويض: لم يُحسم بعد'}
                </span>
              </div>
              <p className="text-[11px] text-orange-800 leading-relaxed">
                يتم استقبال حالة وقيمة تعويض السائق من النظام المركزي/الإدارة فقط دون أي احتساب أو قرار تلقائي داخل تطبيق الدليفري.
              </p>
              {order.compensation_note && (
                <div className="text-[11px] bg-white/80 p-2 rounded-lg border border-orange-200">
                  <strong>حالة النظام:</strong> {order.compensation_note}
                </div>
              )}
            </div>
          )}

          {/* 1. Customer & Delivery Address Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500 font-bold flex items-center space-x-1.5 space-x-reverse">
                  <User className="w-3.5 h-3.5 text-teal-700" />
                  <span>بيانات العميل:</span>
                </span>
                {order.customer_phone && (
                  <button
                    type="button"
                    onClick={() => onCallCustomer(order.customer_phone)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1 space-x-reverse cursor-pointer shadow-2xs"
                  >
                    <Phone className="w-3 h-3" />
                    <span>اتصال بالعميل</span>
                  </button>
                )}
              </div>
              <div className="font-extrabold text-neutral-900 text-sm">{order.customer_name}</div>
              <div className="text-neutral-600 font-mono font-bold" dir="ltr">
                {order.customer_phone}
              </div>
              <div className="text-[11px] text-neutral-400">
                تاريخ الطلب: {formatSafeDateTime(order.created_at)}
              </div>
            </div>

            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-1.5">
              <span className="text-neutral-500 font-bold flex items-center space-x-1.5 space-x-reverse">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>عنوان التوصيل وملاحظات العميل:</span>
              </span>
              <div className="font-extrabold text-neutral-900">
                {order.governorate_name} - {order.markaz_name}
              </div>
              <div className="text-neutral-700 leading-relaxed">{order.detailed_address}</div>
              {order.delivery_notes ? (
                <div className="text-amber-900 bg-amber-50 p-2 rounded-lg mt-1 border border-amber-200 text-[11px]">
                  <strong>ملاحظات العميل:</strong> {order.delivery_notes}
                </div>
              ) : (
                <div className="text-neutral-500 bg-white p-2 rounded-lg mt-1 border border-neutral-200/80 text-[11px]">
                  <strong>ملاحظات العميل:</strong> لا توجد ملاحظات من العميل.
                </div>
              )}
            </div>
          </div>

          {/* 2. Pharmacies Section (Problem 2 & Problem 4) */}
          <div className="bg-teal-50/50 rounded-2xl border border-teal-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-teal-200/70 pb-2">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Building className="w-4 h-4 text-teal-700" />
                <h4 className="font-extrabold text-sm text-teal-950">
                  إدارة الصيدلية ونقطة التجهيز
                </h4>
              </div>
              {order.has_customer_specified_pharmacy ? (
                <span className="text-[10px] font-bold bg-teal-100 text-teal-900 px-2.5 py-0.5 rounded-full border border-teal-300">
                  صيدلية محددة من العميل
                </span>
              ) : (
                <span className="text-[10px] font-bold bg-neutral-200 text-neutral-800 px-2.5 py-0.5 rounded-full">
                  بدون صيدلية محددة من العميل (سجل داخلي للدليفري)
                </span>
              )}
            </div>

            {order.has_customer_specified_pharmacy ? (
              <div className="space-y-3">
                <div className="bg-white p-3.5 rounded-xl border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[11px] text-neutral-500 block">
                      الصيدلية المطلوبة من العميل (يبدأ الدليفري منها):
                    </span>
                    <div className="font-extrabold text-sm text-teal-950">
                      {order.requested_pharmacy_name}
                    </div>
                    {order.requested_pharmacy_address && (
                      <div className="text-[11px] text-neutral-600">
                        {order.requested_pharmacy_address}
                      </div>
                    )}
                    {order.requested_pharmacy_phone && (
                      <div className="text-[11px] text-neutral-500 font-mono" dir="ltr">
                        {order.requested_pharmacy_phone}
                      </div>
                    )}
                  </div>

                  {isAssignedToMe &&
                    (order.status === 'accepted' || order.status === 'shopping') && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggestionForm(!showSuggestionForm);
                          setSuggestionErrorMsg(null);
                        }}
                        className="px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                      >
                        {showSuggestionForm ? 'إغلاق نموذج الاقتراح' : 'اقتراح تغيير الصيدلية'}
                      </button>
                    )}
                </div>

                {/* Existing Pharmacy Change Suggestion Banner */}
                {order.pharmacy_change_suggestion && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-950">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">
                        اقتراح تغيير الصيدلية المسجل (لا يغيّر الصيدلية تلقائيًا):
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                        بانتظار الموافقة ({order.pharmacy_change_suggestion.status})
                      </span>
                    </div>
                    <p className="text-[11px]">
                      <strong>الصيدلية المقترحة:</strong>{' '}
                      {order.pharmacy_change_suggestion.suggested_pharmacy_name}
                    </p>
                    <p className="text-[11px]">
                      <strong>السبب:</strong> {order.pharmacy_change_suggestion.reason}
                    </p>
                  </div>
                )}

                {/* Suggest Pharmacy Change Form (Problem 2 Fix: Select from actual active pharmacies in DB) */}
                {showSuggestionForm && (
                  <div className="p-4 bg-white rounded-xl border-2 border-amber-300 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-amber-950 text-xs">
                          إرسال اقتراح تغيير الصيدلية المحددة من العميل (دون تغيير تلقائي)
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          اختر صيدلية بديلة مسجلة ومفعلة في منطقة الطلب ({order.governorate_name} -{' '}
                          {order.markaz_name})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadActivePharmaciesForOrderArea}
                        disabled={isLoadingDirectory}
                        className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 cursor-pointer"
                        title="تحديث قائمة الصيدليات المفعلة"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isLoadingDirectory ? 'animate-spin' : ''}`}
                        />
                      </button>
                    </div>

                    {renderDirectoryStatusNotice()}

                    {suggestionErrorMsg && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 font-bold">
                        {suggestionErrorMsg}
                      </div>
                    )}

                    {directoryPharmacies.length > 0 && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
                          <input
                            type="text"
                            value={suggestionSearchQuery}
                            onChange={(e) => setSuggestionSearchQuery(e.target.value)}
                            placeholder="ابحث في الصيدليات المفعلة بالاسم أو المركز أو العنوان..."
                            className="w-full pr-8 pl-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs"
                          />
                        </div>

                        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-0.5">
                          {filteredSuggestionPharmacies.length === 0 ? (
                            <div className="p-3 text-center text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200 text-[11px]">
                              لا توجد صيدلية مفعلة أخرى تطابق البحث في هذه المنطقة.
                            </div>
                          ) : (
                            filteredSuggestionPharmacies.map((ph) => {
                              const isSelected = selectedSuggestedPharmacy?.id === ph.id;
                              return (
                                <button
                                  key={ph.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedSuggestedPharmacy(ph);
                                    setSuggestionErrorMsg(null);
                                  }}
                                  className={`w-full text-right p-2.5 rounded-xl border transition flex items-start justify-between gap-2 cursor-pointer ${
                                    isSelected
                                      ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-400'
                                      : 'bg-white hover:bg-neutral-50 border-neutral-200'
                                  }`}
                                >
                                  <div className="space-y-0.5">
                                    <div className="font-extrabold text-neutral-900 text-xs flex items-center space-x-1.5 space-x-reverse">
                                      <span>{ph.name}</span>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        مفعلة
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-neutral-600">
                                      {[ph.governorate_name, ph.center_name, ph.address]
                                        .filter(Boolean)
                                        .join(' • ')}
                                    </div>
                                    {ph.phone && (
                                      <div
                                        className="text-[10px] text-neutral-500 font-mono"
                                        dir="ltr"
                                      >
                                        {ph.phone}
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                                      isSelected
                                        ? 'border-amber-600 bg-amber-600 text-white'
                                        : 'border-neutral-300'
                                    }`}
                                  >
                                    {isSelected && <CheckCircle2 className="w-3 h-3" />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {selectedSuggestedPharmacy && (
                      <div className="p-2.5 bg-amber-50/80 border border-amber-300 rounded-xl flex items-center justify-between text-[11px]">
                        <div>
                          <span className="text-amber-900 font-bold">الصيدلية المختارة: </span>
                          <span className="font-extrabold text-neutral-900">
                            {selectedSuggestedPharmacy.name}
                          </span>
                          {selectedSuggestedPharmacy.center_name && (
                            <span className="text-neutral-600 mr-1">
                              ({selectedSuggestedPharmacy.center_name})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedSuggestedPharmacy(null)}
                          className="text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          تغيير الاختيار
                        </button>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        سبب اقتراح تغيير الصيدلية *
                      </label>
                      <input
                        type="text"
                        value={suggestedPharmacyReason}
                        onChange={(e) => setSuggestedPharmacyReason(e.target.value)}
                        placeholder="مثال: الصيدلية المحددة مغلقة حاليًا أو الدواء المطلوب غير متوفر بها"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-end space-x-2 space-x-reverse">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggestionForm(false);
                          setSuggestionErrorMsg(null);
                        }}
                        className="px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        disabled={
                          isActionLoading ||
                          !selectedSuggestedPharmacy ||
                          !suggestedPharmacyReason.trim()
                        }
                        onClick={async () => {
                          if (!selectedSuggestedPharmacy) {
                            setSuggestionErrorMsg(
                              'يرجى اختيار صيدلية مفعلة من القائمة أولاً.'
                            );
                            return;
                          }
                          setSuggestionErrorMsg(null);
                          try {
                            await onSuggestPharmacyChange(
                              order.id,
                              selectedSuggestedPharmacy.name,
                              suggestedPharmacyReason,
                              selectedSuggestedPharmacy.id
                            );
                            setShowSuggestionForm(false);
                            setSelectedSuggestedPharmacy(null);
                            setSuggestedPharmacyReason('');
                          } catch (err: any) {
                            setSuggestionErrorMsg(
                              err?.message || 'تعذر حفظ اقتراح تغيير الصيدلية.'
                            );
                          }
                        }}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-neutral-300 text-white rounded-lg font-bold cursor-pointer"
                      >
                        حفظ اقتراح التغيير
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-3 rounded-xl border border-neutral-200 text-[11px] text-neutral-700 leading-relaxed">
                العميل لم يحدد صيدلية معينة. يستطيع الدليفري التعامل مع صيدلية واحدة أو أكثر لتوفير الأدوية. يتم تسجيل الصيدليات أدناه كسجل تشغيلي داخلي للدليفري فقط ولا يُعرض للعميل.
              </div>
            )}

            {/* Internal Driver Visited Pharmacies Log (Problem 4 Fix: Select from actual active pharmacies with ID, order, status & internal notes) */}
            {isAssignedToMe && (
              <div className="pt-3 border-t border-teal-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-neutral-800 text-xs block">
                      سجل الصيدليات التي تعامل معها الدليفري (سجل داخلي لتنفيذ الطلب فقط):
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      خاص بعمليات التجهيز الداخلية للسائق والإدارة ولا يتحول إلى صيدليات محفوظة للعميل
                    </span>
                  </div>
                  <span className="text-[11px] font-bold bg-white px-2.5 py-0.5 rounded-full border border-teal-200 text-teal-900">
                    {order.driver_visited_pharmacies.length} زيارة مسجلة
                  </span>
                </div>

                {order.driver_visited_pharmacies.length > 0 && (
                  <div className="space-y-1.5">
                    {order.driver_visited_pharmacies.map((visit, vIdx) => (
                      <div
                        key={visit.id}
                        className="bg-white px-3 py-2.5 rounded-xl border border-neutral-200 flex items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-1.5 space-x-reverse flex-wrap gap-1">
                            <span className="text-[10px] font-mono font-bold bg-teal-50 text-teal-900 px-1.5 py-0.5 rounded-md border border-teal-200">
                              #{vIdx + 1}
                            </span>
                            <span className="font-extrabold text-neutral-900 text-xs">
                              {visit.pharmacy_name}
                            </span>
                            {visit.stop_status && (
                              <span className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-md font-bold">
                                {visit.stop_status}
                              </span>
                            )}
                            {visit.is_customer_requested && (
                              <span className="text-[10px] bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md border border-teal-200 font-bold">
                                صيدلية العميل الأساسية
                              </span>
                            )}
                          </div>
                          {visit.address_or_note && (
                            <div className="text-neutral-600 text-[11px]">
                              ملاحظة السجل الداخلي: {visit.address_or_note}
                            </div>
                          )}
                        </div>
                        {!visit.is_customer_requested &&
                          (order.status === 'accepted' || order.status === 'shopping') && (
                            <button
                              type="button"
                              onClick={() => onRemoveVisitedPharmacy(order.id, visit.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0"
                              title="حذف من السجل الداخلي"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                )}

                {(order.status === 'accepted' || order.status === 'shopping') && (
                  <div className="bg-white p-3.5 rounded-xl border border-teal-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-teal-950 text-[11px]">
                        إضافة صيدلية مفعلة إلى السجل الداخلي لزيارات السائق:
                      </span>
                      <button
                        type="button"
                        onClick={loadActivePharmaciesForOrderArea}
                        disabled={isLoadingDirectory}
                        className="text-[11px] font-bold text-teal-700 hover:text-teal-900 flex items-center space-x-1 space-x-reverse cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isLoadingDirectory ? 'animate-spin' : ''}`}
                        />
                        <span>تحديث القائمة</span>
                      </button>
                    </div>

                    {renderDirectoryStatusNotice()}

                    {visitErrorMsg && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 font-bold">
                        {visitErrorMsg}
                      </div>
                    )}

                    {directoryPharmacies.length > 0 && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
                          <input
                            type="text"
                            value={visitSearchQuery}
                            onChange={(e) => setVisitSearchQuery(e.target.value)}
                            placeholder="ابحث عن الصيدلية بالاسم أو المركز أو العنوان أو الهاتف..."
                            className="w-full pr-8 pl-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs"
                          />
                        </div>

                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
                          {filteredVisitPharmacies.length === 0 ? (
                            <div className="p-2.5 text-center text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200 text-[11px]">
                              لا توجد صيدلية مفعلة مطابقة للبحث في نطاق الطلب.
                            </div>
                          ) : (
                            filteredVisitPharmacies.map((ph) => {
                              const isSelected = selectedVisitPharmacy?.id === ph.id;
                              return (
                                <button
                                  key={ph.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedVisitPharmacy(ph);
                                    setVisitErrorMsg(null);
                                  }}
                                  className={`w-full text-right p-2.5 rounded-xl border transition flex items-start justify-between gap-2 cursor-pointer ${
                                    isSelected
                                      ? 'bg-teal-50 border-teal-600 ring-1 ring-teal-500'
                                      : 'bg-neutral-50/70 hover:bg-neutral-100 border-neutral-200'
                                  }`}
                                >
                                  <div className="space-y-0.5">
                                    <div className="font-extrabold text-neutral-900 text-xs flex items-center space-x-1.5 space-x-reverse">
                                      <span>{ph.name}</span>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        مفعلة
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-neutral-600">
                                      {[ph.governorate_name, ph.center_name, ph.address]
                                        .filter(Boolean)
                                        .join(' • ')}
                                    </div>
                                    {ph.phone && (
                                      <div
                                        className="text-[10px] text-neutral-500 font-mono"
                                        dir="ltr"
                                      >
                                        {ph.phone}
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                                      isSelected
                                        ? 'border-teal-700 bg-teal-700 text-white'
                                        : 'border-neutral-300'
                                    }`}
                                  >
                                    {isSelected && <CheckCircle2 className="w-3 h-3" />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {selectedVisitPharmacy && (
                      <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between text-[11px]">
                        <div>
                          <span className="text-teal-900 font-bold">الصيدلية المختارة للزيارة: </span>
                          <span className="font-extrabold text-neutral-900">
                            {selectedVisitPharmacy.name}
                          </span>
                          {selectedVisitPharmacy.center_name && (
                            <span className="text-neutral-600 mr-1">
                              ({selectedVisitPharmacy.center_name})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedVisitPharmacy(null)}
                          className="text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          إلغاء الاختيار
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                          حالة الزيارة
                        </label>
                        <select
                          value={visitStopStatus}
                          onChange={(e) => setVisitStopStatus(e.target.value)}
                          className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-800"
                        >
                          {VISIT_STOP_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                          ملاحظة داخلية عن الزيارة (اختياري)
                        </label>
                        <input
                          type="text"
                          value={newPharmacyNote}
                          onChange={(e) => setNewPharmacyNote(e.target.value)}
                          placeholder="مثال: تم توفير الصنف الأول هنا..."
                          className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={isActionLoading || !selectedVisitPharmacy}
                        onClick={async () => {
                          if (!selectedVisitPharmacy) {
                            setVisitErrorMsg('يرجى اختيار صيدلية مفعلة من القائمة أولاً.');
                            return;
                          }
                          setVisitErrorMsg(null);
                          try {
                            await onAddVisitedPharmacy(
                              order.id,
                              selectedVisitPharmacy.name,
                              newPharmacyNote,
                              selectedVisitPharmacy.id,
                              visitStopStatus
                            );
                            setSelectedVisitPharmacy(null);
                            setNewPharmacyNote('');
                            setVisitStopStatus('visited');
                          } catch (err: any) {
                            setVisitErrorMsg(
                              err?.message || 'تعذر تسجيل زيارة الصيدلية في السجل الداخلي.'
                            );
                          }
                        }}
                        className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shrink-0 flex items-center justify-center space-x-1.5 space-x-reverse cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>تسجيل الصيدلية في السجل الداخلي</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Prescription Images (Customer's Prescription - Read-only images + Driver Note per image) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <div className="flex items-center space-x-2 space-x-reverse">
                <FileText className="w-4 h-4 text-teal-700" />
                <h4 className="font-extrabold text-sm text-neutral-900">
                  صور روشتة العميل المرفقة ({order.prescription_images.slice(0, 4).length} / 4 صور)
                </h4>
              </div>
              <span className="text-[11px] text-neutral-500">
                صور الروشتة يرفعها العميل عند الطلب • يستطيع السائق معاينتها وكتابة ملاحظة مستقلة لكل صورة
              </span>
            </div>

            {order.prescription_images.length === 0 ? (
              <div className="p-4 bg-neutral-50 rounded-2xl text-center text-neutral-500 border border-neutral-200">
                لا توجد صور روشتة مرفقة من العميل في هذا الطلب.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {order.prescription_images.slice(0, 4).map((img, idx) => {
                  const isEditingNote = editingNoteImageId === img.id;
                  return (
                    <div
                      key={img.id}
                      className="bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden flex flex-col justify-between p-3 space-y-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-900">
                            {img.label || `صورة الروشتة #${idx + 1}`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewPrescriptionModal({
                                isOpen: true,
                                title: img.label || `صورة الروشتة #${idx + 1}`,
                                imageUrl: img.image_url,
                                label: 'معاينة وتكبير صورة الروشتة الطبية الخاصة بالعميل',
                              })
                            }
                            className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 rounded-lg text-[11px] font-bold flex items-center space-x-1 space-x-reverse cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>تكبير الروشتة</span>
                          </button>
                        </div>

                        <div
                          onClick={() =>
                            setPreviewPrescriptionModal({
                              isOpen: true,
                              title: img.label || `صورة الروشتة #${idx + 1}`,
                              imageUrl: img.image_url,
                              label: 'معاينة وتكبير صورة الروشتة الطبية الخاصة بالعميل',
                            })
                          }
                          className="h-36 w-full rounded-xl overflow-hidden bg-white border border-neutral-200 cursor-pointer relative group"
                        >
                          <img
                            src={img.image_url}
                            alt={img.label || 'روشتة'}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        </div>

                        {img.customer_note && (
                          <div className="p-2 bg-white rounded-lg border border-neutral-200 text-[11px] text-neutral-700">
                            <strong>توضيح العميل على الصورة:</strong> {img.customer_note}
                          </div>
                        )}
                      </div>

                      {/* Driver Independent Note for this Prescription Image (Rule 7) */}
                      <div className="pt-2 border-t border-neutral-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-teal-900 text-[11px]">
                            ملاحظة الدليفري المستقلة لهذه الصورة:
                          </span>
                          {isAssignedToMe &&
                            (order.status === 'accepted' || order.status === 'shopping') &&
                            !isEditingNote && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteImageId(img.id);
                                  setImageNoteInput(img.driver_note?.note_text || '');
                                }}
                                className="text-[11px] font-bold text-teal-700 hover:text-teal-900 flex items-center space-x-1 space-x-reverse cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{img.driver_note ? 'تعديل الملاحظة' : 'إضافة ملاحظة'}</span>
                              </button>
                            )}
                        </div>

                        {isEditingNote ? (
                          <div className="space-y-2 bg-white p-2.5 rounded-xl border border-teal-300">
                            <textarea
                              rows={2}
                              value={imageNoteInput}
                              onChange={(e) => setImageNoteInput(e.target.value)}
                              placeholder="مثال: الدواء غير متوفر، يوجد بديل كذا أو كذا وسعره 150 جنيه."
                              className="w-full border border-neutral-300 rounded-lg p-2 text-xs focus:outline-hidden focus:border-teal-600"
                            />
                            <div className="flex items-center justify-end space-x-1.5 space-x-reverse">
                              <button
                                type="button"
                                onClick={() => setEditingNoteImageId(null)}
                                className="px-2.5 py-1 text-neutral-600 hover:bg-neutral-100 rounded-lg font-bold cursor-pointer"
                              >
                                إلغاء
                              </button>
                              <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={async () => {
                                  await onSavePrescriptionImageNote(
                                    order.id,
                                    img.id,
                                    imageNoteInput
                                  );
                                  setEditingNoteImageId(null);
                                }}
                                className="px-3 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold cursor-pointer"
                              >
                                حفظ الملاحظة
                              </button>
                            </div>
                          </div>
                        ) : img.driver_note ? (
                          <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-xl text-teal-950 text-[11px] leading-relaxed">
                            {img.driver_note.note_text}
                          </div>
                        ) : (
                          <div className="text-[11px] text-neutral-400 italic">
                            لا توجد ملاحظة مسجلة على هذه الصورة حتى الآن.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Medicines & Item Resolution Section (Problem 1 Fix) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2 flex-wrap gap-2">
              <div className="flex items-center space-x-2 space-x-reverse">
                <Pill className="w-4 h-4 text-purple-700" />
                <h4 className="font-extrabold text-sm text-neutral-900">
                  الأدوية المطلوبة وتجهيز الأصناف ({totalItems})
                </h4>
              </div>
              <div className="flex items-center space-x-1.5 space-x-reverse text-[11px] font-bold">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  تم توفيره: {purchasedItemsCount}
                </span>
                <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                  غير متوفر: {unavailableItemsCount}
                </span>
                <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                  معلق (pending): {pendingItemsCount}
                </span>
              </div>
            </div>

            {/* Strict Notice: No Per-Item Price Entry (Rule 8) */}
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-[11px] text-sky-950 flex items-center space-x-2 space-x-reverse">
              <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0" />
              <span>
                <strong>قاعدة التسعير المعتمدة:</strong> لا يتم إدخال سعر لكل دواء منفردًا، ولا يُستخدم أي سعر تقديري من العميل. يتم إدخال <strong>«إجمالي الأدوية»</strong> مرة واحدة فقط في نهاية التجهيز.
              </span>
            </div>

            {order.items.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-amber-950">
                <div className="font-extrabold text-xs flex items-center space-x-1.5 space-x-reverse text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>حالة تشخيصية لأصناف الطلب (جدول pharmacy_order_items):</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {order.items_diagnostic_message ||
                    'لا توجد أصناف مسجلة في جدول أصناف الطلب (pharmacy_order_items) لهذا الطلب في قاعدة البيانات.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {order.items.map((item) => {
                  const isPending = item.status === 'pending';
                  const isPurchasedFull =
                    item.status === 'purchased' && item.unavailable_quantity === 0;
                  const isPartial =
                    item.status === 'purchased' &&
                    item.purchased_quantity > 0 &&
                    item.unavailable_quantity > 0;
                  const isUnavailable = item.status === 'unavailable';
                  const isEditingThis = activeItemId === item.id;
                  const unitLabel = item.unit ? ` ${item.unit}` : '';

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition ${
                        isPurchasedFull
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isPartial
                          ? 'bg-sky-50/60 border-sky-200'
                          : isUnavailable
                          ? 'bg-rose-50/50 border-rose-200'
                          : 'bg-white border-neutral-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center space-x-2 space-x-reverse flex-wrap gap-1">
                            <span className="font-extrabold text-sm text-neutral-900">
                              {item.medicine_name}
                            </span>
                            {item.unit && (
                              <span className="bg-neutral-100 text-neutral-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-neutral-200">
                                الوحدة: {item.unit}
                              </span>
                            )}
                            {isPending && (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                بانتظار التجهيز (pending)
                              </span>
                            )}
                            {isPurchasedFull && (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                تم الشراء بالكامل (purchased)
                              </span>
                            )}
                            {isPartial && (
                              <span className="bg-sky-100 text-sky-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                شراء جزئي (purchased)
                              </span>
                            )}
                            {isUnavailable && (
                              <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                غير متوفر (unavailable)
                              </span>
                            )}
                          </div>

                          {item.dosage_notes && (
                            <div className="text-[11px] text-neutral-500">
                              ملاحظة الصنف: {item.dosage_notes}
                            </div>
                          )}

                          {/* Quantities Breakdown (with Unit) */}
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                            <span className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-800 font-bold">
                              الكمية المطلوبة: {item.requested_quantity}
                              {unitLabel}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100/80 text-emerald-900 font-bold">
                              تم شراء: {item.purchased_quantity}
                              {unitLabel}
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-lg font-bold ${
                                item.unavailable_quantity > 0
                                  ? 'bg-rose-100 text-rose-900'
                                  : 'bg-neutral-100 text-neutral-600'
                              }`}
                            >
                              الكمية غير المتوفرة (المفقود): {item.unavailable_quantity}
                              {unitLabel}
                            </span>
                          </div>

                          {/* Shortage Reason Display */}
                          {item.unavailable_quantity > 0 && item.shortage_reason && (
                            <div className="text-[11px] text-rose-900 bg-rose-100/70 px-3 py-1.5 rounded-xl font-semibold mt-1">
                              <strong>سبب النقص:</strong> {item.shortage_reason}
                            </div>
                          )}
                        </div>

                        {/* Resolution Action Buttons during `shopping` */}
                        {isShopping && !isEditingThis && (
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() =>
                                onUpdateMedicineItem(order.id, item.id, item.requested_quantity, null)
                              }
                              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                            >
                              تم الشراء ({item.requested_quantity}
                              {unitLabel})
                            </button>

                            {item.requested_quantity > 1 && (
                              <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={() => openItemEditor(item, 'partial')}
                                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                              >
                                شراء جزئي
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => openItemEditor(item, 'unavailable')}
                              className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                            >
                              غير متوفر
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inline Form for Partial Purchase or Unavailable with Mandatory Shortage Reason */}
                      {isEditingThis && (
                        <div className="mt-3 p-3.5 bg-white rounded-xl border-2 border-purple-300 space-y-3 animate-in fade-in duration-100">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-xs text-purple-950">
                              {resolutionMode === 'partial'
                                ? `تحديد شراء جزئي للصنف «${item.medicine_name}»`
                                : `تأكيد عدم توفر الصنف «${item.medicine_name}»`}
                            </span>
                            <span className="text-[11px] font-bold text-neutral-500">
                              المطلوب: {item.requested_quantity}
                              {unitLabel}
                            </span>
                          </div>

                          {resolutionMode === 'partial' && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-sky-50 p-3 rounded-xl border border-sky-200">
                              <div>
                                <label className="block text-[11px] font-bold text-sky-950 mb-1">
                                  المطلوب
                                </label>
                                <div className="px-3 py-1.5 bg-white border border-sky-200 rounded-lg font-mono font-bold text-neutral-800">
                                  {item.requested_quantity}
                                  {unitLabel}
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-sky-950 mb-1">
                                  الكمية التي تم شراؤها *
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, item.requested_quantity - 1)}
                                  value={partialPurchasedQty}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val)) {
                                      setPartialPurchasedQty(
                                        Math.max(1, Math.min(item.requested_quantity - 1, val))
                                      );
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 bg-white border border-sky-400 rounded-lg font-mono font-bold text-neutral-900"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-rose-900 mb-1">
                                  المفقود (غير المتوفر)
                                </label>
                                <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg font-mono font-bold text-rose-800">
                                  {Math.max(0, item.requested_quantity - partialPurchasedQty)}
                                  {unitLabel}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Mandatory Shortage Reason with Default "غير متوفر" + Ready Reasons + Text Input */}
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold text-rose-900">
                              سبب النقص (إجباري - القيمة الافتراضية: غير متوفر) *
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {shortageReasonsList.map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setShortageReasonInput(preset)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                                    shortageReasonInput === preset
                                      ? 'bg-rose-600 text-white border-rose-600'
                                      : 'bg-neutral-50 hover:bg-rose-50 text-neutral-700 border-neutral-200'
                                  }`}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              required
                              value={shortageReasonInput}
                              onChange={(e) => setShortageReasonInput(e.target.value)}
                              placeholder="اكتب سبب النقص..."
                              className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-semibold text-neutral-900 focus:outline-hidden focus:border-rose-600"
                            />
                          </div>

                          <div className="flex items-center justify-end space-x-2 space-x-reverse pt-1">
                            <button
                              type="button"
                              onClick={() => setActiveItemId(null)}
                              className="px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              disabled={isActionLoading || !shortageReasonInput.trim()}
                              onClick={() => handleConfirmItemResolution(item)}
                              className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:bg-neutral-300 text-white rounded-lg font-bold cursor-pointer shadow-xs"
                            >
                              حفظ حالة الصنف
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5. Rule 5: All Items Unavailable -> Hide "Complete Preparation", Show "Call Customer" ONLY */}
          {allItemsUnavailable ? (
            <div className="p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="font-extrabold text-base text-rose-950">
                جميع الأصناف المطلوبة غير متوفرة
              </h4>
              <p className="text-xs text-rose-800 max-w-md mx-auto leading-relaxed">
                بما أن جميع الأصناف أصبحت غير متوفرة، لا يمكن إتمام التجهيز أو الانتقال للتوصيل. يرجى الاتصال بالعميل مباشرة من خلال زر الاتصال أدناه.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onCallCustomer(order.customer_phone)}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-extrabold shadow-md flex items-center justify-center space-x-2 space-x-reverse cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                  <span>اتصال بالعميل</span>
                </button>

                {order.status === 'shopping' && isAssignedToMe && (
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={() =>
                      onMarkUnableToFulfill(
                        order.id,
                        'تعذر توفير جميع الأصناف الدوائية المطلوبة وتم التواصل مع العميل'
                      )
                    }
                    className="w-full sm:w-auto px-4 py-3 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    تسجيل تعذر التنفيذ (unable_to_fulfill)
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* 6. Totals, Camera-Only Receipt & Complete Preparation Section (Problem 3 Fix) */
            <div className="space-y-4">
              {/* If order is still `accepted`, show explicit guidance why receipt upload is locked until `shopping` starts */}
              {order.status === 'accepted' && isAssignedToMe && (
                <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between gap-3 text-purple-950">
                  <div className="text-[11px] leading-relaxed">
                    <strong>تصوير فاتورة شراء الصيدلية:</strong> متاح فور الضغط على زر{' '}
                    <strong>«بدء تجهيز الأدوية الآن (shopping)»</strong> بالأعلى (تمنع قواعد قاعدة البيانات رفع فاتورة الشراء قبل بدء مرحلة التجهيز الفعلي).
                  </div>
                </div>
              )}

              {/* Camera-Only Purchase Receipt Uploader (Rule 9) */}
              {(order.status === 'shopping' ||
                order.status === 'ready_for_delivery' ||
                order.status === 'completed') && (
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
                  <PharmacyReceiptCameraUploader
                    receiptImageUrl={order.receipt_image_url}
                    receiptCapturedAt={order.receipt_captured_at}
                    disabled={!isShopping || isActionLoading}
                    onSaveReceipt={(dataUrl) => onSaveReceiptImage(order.id, dataUrl)}
                  />
                </div>
              )}

              {/* End-of-Preparation Pricing Summary (Rule 8) */}
              <div className="bg-teal-50/60 p-4 sm:p-5 rounded-2xl border-2 border-teal-200 space-y-4">
                <div className="flex items-center justify-between border-b border-teal-200 pb-2">
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <DollarSign className="w-4 h-4 text-teal-700" />
                    <h4 className="font-extrabold text-sm text-teal-950">
                      حساب الفاتورة النهائية للصيدلية (نهاية التجهيز)
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-teal-800">
                    الإجمالي = إجمالي الأدوية + رسوم التوصيل
                  </span>
                </div>

                {isShopping ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-teal-950 mb-1">
                        إجمالي الأدوية (ج.م) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={medicinesTotalInput}
                        onChange={(e) => setMedicinesTotalInput(e.target.value)}
                        placeholder="أدخل إجمالي الأدوية..."
                        className="w-full px-3 py-2.5 bg-white border border-teal-300 rounded-xl text-xs font-mono font-bold text-neutral-900 focus:outline-hidden focus:border-teal-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-teal-950 mb-1">
                        رسوم التوصيل المعتمدة بالنظام (ج.م)
                      </label>
                      <input
                        type="number"
                        readOnly
                        value={deliveryFeeInput}
                        className="w-full px-3 py-2.5 bg-neutral-100 border border-teal-200 rounded-xl text-xs font-mono font-bold text-neutral-700 cursor-not-allowed"
                      />
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-teal-300 flex flex-col justify-center">
                      <span className="text-[11px] text-neutral-500 font-bold">
                        الإجمالي النهائي المطلوب:
                      </span>
                      <span className="text-base font-extrabold font-mono text-teal-800">
                        {validMedTotal > 0 ? `${computedFinalTotal.toFixed(2)} ج.م` : '---'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-neutral-700">
                      <span>إجمالي الأدوية:</span>
                      <span className="font-mono font-bold">
                        {order.totals.medicines_total != null
                          ? `${Number(order.totals.medicines_total).toFixed(2)} ج.م`
                          : 'لم يُحدد بعد'}
                      </span>
                    </div>
                    <div className="flex justify-between text-neutral-700">
                      <span>رسوم التوصيل:</span>
                      <span className="font-mono font-bold">
                        {Number(order.totals.delivery_fee).toFixed(2)} ج.م
                      </span>
                    </div>
                    <div className="flex justify-between text-teal-950 pt-2 border-t border-teal-200 text-sm font-extrabold">
                      <span>الإجمالي النهائي (إجمالي الأدوية + رسوم التوصيل):</span>
                      <span className="font-mono text-base text-teal-800">
                        {order.totals.final_total != null
                          ? `${Number(order.totals.final_total).toFixed(2)} ج.م`
                          : '---'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Complete Preparation Button -> Transitions to ready_for_delivery (Rule 10) */}
                {isShopping && (
                  <div className="pt-2 border-t border-teal-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-[11px] text-teal-900">
                      {totalItems === 0 ? (
                        <span className="text-rose-800 font-bold">
                          ⚠️ لا توجد أصناف مسجلة في جدول أصناف الطلب (pharmacy_order_items).
                        </span>
                      ) : !allItemsResolved ? (
                        <span className="text-amber-800 font-bold">
                          ⚠️ لا يُسمح بالانتقال إلى التوصيل إذا بقي أي صنف معلق (يتبقى {pendingItemsCount} صنف).
                        </span>
                      ) : validMedTotal <= 0 ? (
                        <span className="text-amber-800 font-bold">
                          ⚠️ يرجى إدخال «إجمالي الأدوية» أولاً لتفعيل زر إتمام التجهيز.
                        </span>
                      ) : (
                        <span className="text-emerald-800 font-bold">
                          ✅ تم حسم جميع الأصناف وإدخال إجمالي الأدوية. يمكنك الآن الانتقال إلى التوصيل.
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 space-x-reverse w-full sm:w-auto">
                      {validMedTotal > 0 && (
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => onSaveOrderTotals(order.id, validMedTotal, validDelFee)}
                          className="px-3.5 py-2.5 bg-white hover:bg-teal-100 text-teal-900 border border-teal-300 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          حفظ الإجمالي
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canCompletePreparation || isActionLoading}
                        onClick={() =>
                          onCompletePreparation(
                            order.id,
                            validMedTotal,
                            validDelFee,
                            order.receipt_image_url
                          )
                        }
                        className="flex-1 sm:flex-initial px-5 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:bg-neutral-300 text-white rounded-xl text-xs font-extrabold shadow-xs transition flex items-center justify-center space-x-1.5 space-x-reverse cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>إتمام التجهيز والانتقال إلى التوصيل (ready_for_delivery)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 space-x-reverse">
            {order.customer_phone && (
              <button
                type="button"
                onClick={() => onCallCustomer(order.customer_phone)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-xs"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>اتصال بالعميل</span>
              </button>
            )}

            {isAssignedToMe &&
              (order.status === 'accepted' ||
                order.status === 'shopping' ||
                order.status === 'ready_for_delivery') &&
              !order.cancellation_request && (
                <button
                  type="button"
                  onClick={() => onOpenCancellationModal(order)}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  طلب إلغاء
                </button>
              )}
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            {order.status === 'pending_review' && (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onAcceptOrder(order)}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              >
                قبول فاتورة الصيدلية
              </button>
            )}

            {order.status === 'ready_for_delivery' && isAssignedToMe && (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => onCompleteDelivery(order.id)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>إتمام التوصيل</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox Viewer for Prescription Images */}
      <DocumentViewerModal
        isOpen={previewPrescriptionModal.isOpen}
        onClose={() => setPreviewPrescriptionModal((prev) => ({ ...prev, isOpen: false }))}
        title={previewPrescriptionModal.title}
        imageUrl={previewPrescriptionModal.imageUrl}
        documentTypeLabel={previewPrescriptionModal.label}
      />
    </div>
  );
};
