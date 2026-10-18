import React, { useMemo, useState } from 'react';
import { Pill, RefreshCw, Activity } from 'lucide-react';
import { PharmacyOrder, RealtimeConnectionStatus } from '../../types/pharmacy';
import { isPharmacyOrderMatchingDriverTerritory } from '../../lib/pharmacyService';
import { PharmacyOrderCard } from './PharmacyOrderCard';
import { PharmacyOrderDetailsModal } from './PharmacyOrderDetailsModal';
import { PharmacyCancellationModal } from './PharmacyCancellationModal';
import type { DeliveryDriver } from '../../App';

interface PharmacyOrdersSectionProps {
  activeTab: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'profile' | 'settings';
  searchQuery: string;
  currentDriver: DeliveryDriver | null;
  deliveryEnabled: boolean;
  pharmacyOrders: PharmacyOrder[];
  selectedPharmacyOrder: PharmacyOrder | null;
  isPharmacyLoading: boolean;
  isPharmacyActionLoading: boolean;
  isPharmacyRealtimeActive: boolean;
  realtimeStatus?: RealtimeConnectionStatus;
  onOpenDiagnostics?: () => void;
  onSelectPharmacyOrder: (order: PharmacyOrder | null) => void;
  onRefreshPharmacyOrders: () => void;
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
  onRequestCancellation: (
    orderId: string,
    reasonCategory: string,
    reasonText: string
  ) => Promise<boolean>;
  onCallCustomer: (phone: string) => void;
}

export const PharmacyOrdersSection: React.FC<PharmacyOrdersSectionProps> = ({
  activeTab,
  searchQuery,
  currentDriver,
  deliveryEnabled,
  pharmacyOrders,
  selectedPharmacyOrder,
  isPharmacyLoading,
  isPharmacyActionLoading,
  isPharmacyRealtimeActive,
  realtimeStatus,
  onOpenDiagnostics,
  onSelectPharmacyOrder,
  onRefreshPharmacyOrders,
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
  onRequestCancellation,
  onCallCustomer,
}) => {
  const [cancellationTargetOrder, setCancellationTargetOrder] = useState<PharmacyOrder | null>(null);

  const filteredPharmacyOrders = useMemo(() => {
    let list = [...pharmacyOrders];

    if (activeTab === 'pending') {
      list = list.filter(
        (o) =>
          o.status === 'pending_review' &&
          isPharmacyOrderMatchingDriverTerritory(o, currentDriver)
      );
    } else if (activeTab === 'accepted') {
      list = list.filter(
        (o) =>
          (o.status === 'accepted' ||
            o.status === 'shopping' ||
            o.status === 'ready_for_delivery') &&
          o.assigned_driver_id === currentDriver?.id
      );
    } else if (activeTab === 'completed') {
      list = list.filter((o) => o.status === 'completed');
    } else if (activeTab === 'cancelled') {
      list = list.filter(
        (o) =>
          o.status === 'cancelled' ||
          o.status === 'unable_to_fulfill' ||
          Boolean(o.cancellation_request)
      );
    } else {
      return [];
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.includes(q) ||
          o.detailed_address.toLowerCase().includes(q) ||
          (o.requested_pharmacy_name && o.requested_pharmacy_name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [pharmacyOrders, activeTab, currentDriver, searchQuery]);

  if (!['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab)) {
    return null;
  }

  const canAcceptBase =
    Boolean(deliveryEnabled) &&
    currentDriver?.status === 'approved' &&
    Boolean(currentDriver?.is_active);

  return (
    <div className="space-y-4">
      {/* Pharmacy Section Header Banner */}
      <div className="bg-gradient-to-l from-teal-900 via-teal-800 to-emerald-800 text-white rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Pill className="w-5 h-5 text-teal-200" />
          </div>
          <div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <h3 className="font-extrabold text-sm sm:text-base">قسم فواتير الصيدلية</h3>
              <span className="px-2 py-0.5 rounded-full bg-teal-400/20 border border-teal-300/30 text-teal-100 text-[10px] font-bold">
                {filteredPharmacyOrders.length} طلب
              </span>
            </div>
            <p className="text-[11px] text-teal-100/90">
              استقبال وتجهيز طلبات الأدوية والروشتات الطبية وتوصيلها للعملاء
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 space-x-reverse">
          <span
            className={`inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
              realtimeStatus === 'SUBSCRIBED' || (!realtimeStatus && isPharmacyRealtimeActive)
                ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40'
                : realtimeStatus === 'CONNECTING'
                ? 'bg-amber-500/20 text-amber-100 border-amber-400/40'
                : realtimeStatus === 'CHANNEL_ERROR'
                ? 'bg-rose-500/20 text-rose-100 border-rose-400/40'
                : 'bg-white/10 text-white/70 border-white/20'
            }`}
            title={`حالة Realtime: ${realtimeStatus || (isPharmacyRealtimeActive ? 'SUBSCRIBED' : 'DISCONNECTED')}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                realtimeStatus === 'SUBSCRIBED' || (!realtimeStatus && isPharmacyRealtimeActive)
                  ? 'bg-emerald-400 animate-ping'
                  : realtimeStatus === 'CONNECTING'
                  ? 'bg-amber-400 animate-pulse'
                  : realtimeStatus === 'CHANNEL_ERROR'
                  ? 'bg-rose-400'
                  : 'bg-neutral-300'
              }`}
            />
            <span>
              {realtimeStatus === 'SUBSCRIBED'
                ? 'بث فوري (SUBSCRIBED)'
                : realtimeStatus === 'CONNECTING'
                ? 'جاري الاتصال...'
                : realtimeStatus === 'CHANNEL_ERROR'
                ? 'خطأ في القناة'
                : realtimeStatus === 'CLOSED'
                ? 'مغلق (CLOSED)'
                : isPharmacyRealtimeActive
                ? 'تحديث فوري'
                : 'غير متصل'}
            </span>
          </span>

          {onOpenDiagnostics && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer flex items-center justify-center"
              title="سجلات وتشخيص البث اللحظي (Realtime Diagnostics)"
            >
              <Activity className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onRefreshPharmacyOrders()}
            disabled={isPharmacyLoading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="تحديث فواتير الصيدلية"
          >
            <RefreshCw className={`w-4 h-4 ${isPharmacyLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pharmacy Orders Grid */}
      {filteredPharmacyOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-teal-200 shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-3 text-teal-600">
            <Pill className="w-7 h-7" />
          </div>
          <h4 className="text-sm font-extrabold text-neutral-800">
            لا توجد فواتير صيدلية في هذا التبويب حاليًا
          </h4>
          <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto leading-relaxed">
            {activeTab === 'pending'
              ? 'بمجرد وصول طلب روشتة أو فاتورة صيدلية جديدة في نطاقك الجغرافي ستظهر هنا بوضوح.'
              : 'لا توجد فواتير صيدلية مطابقة لهذا القسم.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPharmacyOrders.map((order) => (
            <PharmacyOrderCard
              key={order.id}
              order={order}
              currentDriverId={currentDriver?.id}
              canAccept={canAcceptBase && order.status === 'pending_review'}
              isActionLoading={isPharmacyActionLoading}
              onOpenDetails={(ord) => onSelectPharmacyOrder(ord)}
              onAcceptOrder={onAcceptOrder}
              onStartShopping={onStartShopping}
              onCompleteDelivery={onCompleteDelivery}
              onRequestCancellation={(ord) => setCancellationTargetOrder(ord)}
              onCallCustomer={onCallCustomer}
            />
          ))}
        </div>
      )}

      {/* Pharmacy Order Details & Preparation Modal */}
      <PharmacyOrderDetailsModal
        order={selectedPharmacyOrder}
        currentDriverId={currentDriver?.id}
        isActionLoading={isPharmacyActionLoading}
        onClose={() => onSelectPharmacyOrder(null)}
        onAcceptOrder={onAcceptOrder}
        onStartShopping={onStartShopping}
        onUpdateMedicineItem={onUpdateMedicineItem}
        onSavePrescriptionImageNote={onSavePrescriptionImageNote}
        onAddVisitedPharmacy={onAddVisitedPharmacy}
        onRemoveVisitedPharmacy={onRemoveVisitedPharmacy}
        onSuggestPharmacyChange={onSuggestPharmacyChange}
        onSaveReceiptImage={onSaveReceiptImage}
        onSaveOrderTotals={onSaveOrderTotals}
        onCompletePreparation={onCompletePreparation}
        onMarkUnableToFulfill={onMarkUnableToFulfill}
        onCompleteDelivery={onCompleteDelivery}
        onOpenCancellationModal={(ord) => setCancellationTargetOrder(ord)}
        onCallCustomer={onCallCustomer}
      />

      {/* Pharmacy Request Cancellation Modal */}
      <PharmacyCancellationModal
        order={cancellationTargetOrder}
        isSubmitting={isPharmacyActionLoading}
        onClose={() => setCancellationTargetOrder(null)}
        onSubmit={onRequestCancellation}
      />
    </div>
  );
};
