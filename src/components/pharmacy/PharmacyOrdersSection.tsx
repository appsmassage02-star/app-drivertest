import React, { useMemo, useState } from 'react';
import { Pill, RefreshCw, Activity } from 'lucide-react';
import { PharmacyOrder, RealtimeConnectionStatus } from '../../types/pharmacy';
import { isPharmacyOrderMatchingDriverTerritory } from '../../lib/pharmacyService';
import { PharmacyOrderCard } from './PharmacyOrderCard';
import { PharmacyOrderDetailsModal } from './PharmacyOrderDetailsModal';
import { PharmacyCancellationModal } from './PharmacyCancellationModal';
import type { DeliveryDriver } from '../../App';
import type { AppSectionSettingsState, CentralGeoContext, RouteDistanceResult } from '../../types';
import type { DriverGPSLocation } from '../../lib/gpsService';
import { evaluateSectionOperationalStatus } from '../../lib/sectionSettingsService';
import { sortOrdersOldestFirst } from '../../lib/orderDisplayHelpers';

interface PharmacyOrdersSectionProps {
  activeTab: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'profile' | 'settings';
  searchQuery: string;
  currentDriver: DeliveryDriver | null;
  driverLocation?: DriverGPSLocation | null;
  routeDistances?: Record<string, RouteDistanceResult>;
  navigationEnabled?: boolean;
  hideCardsList?: boolean;
  isWorking?: boolean;
  deliveryEnabled: boolean;
  geoContext?: CentralGeoContext | null;
  sectionSettings?: AppSectionSettingsState | null;
  pharmacyOrders: PharmacyOrder[];
  selectedPharmacyOrder: PharmacyOrder | null;
  cancellationTargetOrderOverride?: PharmacyOrder | null;
  onChangeCancellationTargetOrder?: (order: PharmacyOrder | null) => void;
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
  onOpenMap?: (order: PharmacyOrder) => void;
}

export const PharmacyOrdersSection: React.FC<PharmacyOrdersSectionProps> = ({
  activeTab,
  searchQuery,
  currentDriver,
  driverLocation = null,
  routeDistances = {},
  navigationEnabled = true,
  hideCardsList = false,
  isWorking = true,
  deliveryEnabled,
  geoContext = null,
  sectionSettings = null,
  pharmacyOrders,
  selectedPharmacyOrder,
  cancellationTargetOrderOverride,
  onChangeCancellationTargetOrder,
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
  onOpenMap,
}) => {
  const [internalCancellationTargetOrder, setInternalCancellationTargetOrder] =
    useState<PharmacyOrder | null>(null);
  const cancellationTargetOrder =
    cancellationTargetOrderOverride !== undefined
      ? cancellationTargetOrderOverride
      : internalCancellationTargetOrder;
  const setCancellationTargetOrder = (ord: PharmacyOrder | null) => {
    if (onChangeCancellationTargetOrder) {
      onChangeCancellationTargetOrder(ord);
    } else {
      setInternalCancellationTargetOrder(ord);
    }
  };

  const pharmacySectionEval = useMemo(
    () =>
      sectionSettings
        ? evaluateSectionOperationalStatus(sectionSettings, 'pharmacy')
        : null,
    [sectionSettings]
  );

  const isPharmacySectionOperational = pharmacySectionEval
    ? pharmacySectionEval.canShowNewOrders
    : true;

  const filteredPharmacyOrders = useMemo(() => {
    let list = [...pharmacyOrders];

    if (activeTab === 'pending') {
      const canSeePending =
        Boolean(isWorking) &&
        Boolean(deliveryEnabled) &&
        isPharmacySectionOperational &&
        currentDriver?.status === 'approved' &&
        Boolean(currentDriver?.is_active);

      list = canSeePending
        ? list.filter(
            (o) =>
              o.status === 'pending_review' &&
              !o.assigned_driver_id &&
              isPharmacyOrderMatchingDriverTerritory(o, currentDriver, geoContext)
          )
        : [];
    } else if (activeTab === 'accepted') {
      list = list.filter(
        (o) =>
          (o.status === 'accepted' ||
            o.status === 'shopping' ||
            o.status === 'ready_for_delivery') &&
          o.assigned_driver_id === currentDriver?.id
      );
    } else if (activeTab === 'completed') {
      list = list.filter(
        (o) => o.status === 'completed' && (!o.assigned_driver_id || o.assigned_driver_id === currentDriver?.id)
      );
    } else if (activeTab === 'cancelled') {
      list = list.filter(
        (o) =>
          (o.status === 'cancelled' ||
            o.status === 'unable_to_fulfill' ||
            Boolean(o.cancellation_request)) &&
          (!o.assigned_driver_id || o.assigned_driver_id === currentDriver?.id)
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

    return sortOrdersOldestFirst(list);
  }, [
    pharmacyOrders,
    activeTab,
    currentDriver,
    isWorking,
    deliveryEnabled,
    isPharmacySectionOperational,
    geoContext,
    searchQuery,
  ]);

  if (!['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab)) {
    return null;
  }

  const canAcceptBase =
    Boolean(isWorking) &&
    Boolean(deliveryEnabled) &&
    isPharmacySectionOperational &&
    currentDriver?.status === 'approved' &&
    Boolean(currentDriver?.is_active);

  return (
    <div className="space-y-4">
      {/* Pharmacy Section Stopped Notice (Only on pending tab; ongoing assigned orders are never blocked) */}
      {activeTab === 'pending' && pharmacySectionEval && !pharmacySectionEval.canShowNewOrders && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center space-x-3 space-x-reverse text-rose-950 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0 text-rose-700">
            <Pill className="w-5 h-5" />
          </div>
          <div className="text-xs leading-relaxed">
            <strong className="block text-rose-950 font-extrabold text-sm mb-0.5">
              استقبال طلبات الصيدلية الجديدة متوقف حاليًا
            </strong>
            <span>
              {pharmacySectionEval.reason} (طلباتك المقبولة مسبقًا لا تتأثر وتستمر عبر تبويب «قيد التنفيذ»).
            </span>
          </div>
        </div>
      )}

      {/* Work Availability Notice for Pharmacy Orders */}
      {activeTab === 'pending' && !isWorking && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center space-x-3 space-x-reverse text-amber-950 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700">
            <Pill className="w-5 h-5" />
          </div>
          <div className="text-xs leading-relaxed">
            <strong className="block text-amber-950 font-extrabold text-sm mb-0.5">
              أنت في وضع «متوقف عن العمل» حاليًا
            </strong>
            <span>
              لقبول طلبات الصيدلية الجديدة واستقبال التكليفات، يجب الضغط أولاً على زر <strong>«بدء العمل»</strong> في الشريط العلوي لتفعيل حالة التوافر.
            </span>
          </div>
        </div>
      )}

      {/* Pharmacy Section Header & Cards Grid (hidden when unified chronological grid renders cards) */}
      {!hideCardsList && (
        <>
          <div className="bg-white border border-emerald-200/80 text-slate-900 rounded-2xl p-3.5 px-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700">
                <Pill className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm text-slate-900">فواتير الصيدلية</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold tabular-nums">
                    {filteredPharmacyOrders.length} طلب
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  مرتبة من الأقدم إلى الأحدث
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenDiagnostics && (
                <button
                  type="button"
                  onClick={onOpenDiagnostics}
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition cursor-pointer flex items-center justify-center"
                  title="سجلات وتشخيص البث اللحظي (Realtime Diagnostics)"
                >
                  <Activity className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onRefreshPharmacyOrders()}
                disabled={isPharmacyLoading}
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition cursor-pointer"
                title="تحديث فواتير الصيدلية"
              >
                <RefreshCw className={`w-4 h-4 ${isPharmacyLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {filteredPharmacyOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3 text-emerald-600">
                <Pill className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-800">
                لا توجد فواتير صيدلية في هذا التبويب حاليًا
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                {activeTab === 'pending'
                  ? 'بمجرد وصول طلب روشتة أو فاتورة صيدلية جديدة في نطاقك الجغرافي ستظهر هنا بوضوح.'
                  : 'لا توجد فواتير صيدلية مطابقة لهذا القسم.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPharmacyOrders.map((order, idx) => (
                <PharmacyOrderCard
                  key={order.id}
                  order={order}
                  currentDriverId={currentDriver?.id}
                  driverLocation={driverLocation}
                  routeDistance={routeDistances[`pharmacy:${order.id}`]}
                  sequenceNumber={idx + 1}
                  navigationEnabled={navigationEnabled}
                  canAccept={canAcceptBase && order.status === 'pending_review'}
                  isWorking={isWorking}
                  isActionLoading={isPharmacyActionLoading}
                  onOpenDetails={(ord) => onSelectPharmacyOrder(ord)}
                  onAcceptOrder={onAcceptOrder}
                  onStartShopping={onStartShopping}
                  onCompleteDelivery={onCompleteDelivery}
                  onRequestCancellation={(ord) => setCancellationTargetOrder(ord)}
                  onCallCustomer={onCallCustomer}
                  onOpenMap={onOpenMap}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Pharmacy Order Details & Preparation Modal */}
      <PharmacyOrderDetailsModal
        order={selectedPharmacyOrder}
        currentDriverId={currentDriver?.id}
        canAccept={canAcceptBase && selectedPharmacyOrder?.status === 'pending_review'}
        isWorking={isWorking}
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
        onOpenMap={onOpenMap}
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
