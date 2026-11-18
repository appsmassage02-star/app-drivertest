import React from 'react';
import { UtensilsCrossed, RefreshCw } from 'lucide-react';
import { AppSectionSettingsState, DeliveryOrder } from '../../types';
import { RestaurantOrderCard } from './RestaurantOrderCard';
import { RestaurantOrderDetailsModal } from './RestaurantOrderDetailsModal';
import type { DeliveryDriver } from '../../App';
import type { DriverGPSLocation } from '../../lib/gpsService';
import { evaluateSectionOperationalStatus } from '../../lib/sectionSettingsService';
import { sortOrdersOldestFirst } from '../../lib/orderDisplayHelpers';

interface RestaurantOrdersSectionProps {
  activeTab: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'profile' | 'settings';
  searchQuery: string;
  currentDriver: DeliveryDriver | null;
  driverLocation?: DriverGPSLocation | null;
  hideCardsList?: boolean;
  isWorking?: boolean;
  deliveryEnabled: boolean;
  sectionSettings?: AppSectionSettingsState | null;
  restaurantOrders: DeliveryOrder[];
  selectedRestaurantOrder: DeliveryOrder | null;
  isActionLoading: boolean;
  isSyncing?: boolean;
  onRefreshOrders?: () => void;
  onSelectOrder: (order: DeliveryOrder | null) => void;
  onAcceptOrder: (order: DeliveryOrder) => void;
  onStartShopping: (order: DeliveryOrder) => void;
  onUpdateDeliveryItem: (
    item: any,
    newStatus: 'purchased' | 'missing',
    actualPrice?: number,
    missingReason?: string
  ) => Promise<void>;
  onCompleteShopping: (order: DeliveryOrder) => void;
  onCompleteOrder: (order: DeliveryOrder) => void;
  onOpenCancellationModal: (order: DeliveryOrder) => void;
  onCallPhone: (phone: string) => void;
  onOpenMap?: (order: DeliveryOrder) => void;
}

export const RestaurantOrdersSection: React.FC<RestaurantOrdersSectionProps> = ({
  activeTab,
  currentDriver,
  driverLocation = null,
  hideCardsList = false,
  isWorking = true,
  deliveryEnabled,
  sectionSettings = null,
  restaurantOrders,
  selectedRestaurantOrder,
  isActionLoading,
  isSyncing = false,
  onRefreshOrders,
  onSelectOrder,
  onAcceptOrder,
  onStartShopping,
  onUpdateDeliveryItem,
  onCompleteShopping,
  onCompleteOrder,
  onOpenCancellationModal,
  onCallPhone,
  onOpenMap,
}) => {
  if (!['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab)) {
    return null;
  }

  const readyFoodSectionEval = sectionSettings
    ? evaluateSectionOperationalStatus(sectionSettings, 'ready_food')
    : null;
  const isReadyFoodOperational = readyFoodSectionEval
    ? readyFoodSectionEval.canShowNewOrders
    : true;

  const canAcceptBase =
    Boolean(isWorking) &&
    Boolean(deliveryEnabled) &&
    isReadyFoodOperational &&
    currentDriver?.status === 'approved' &&
    Boolean(currentDriver?.is_active);

  const sortedRestaurantOrders = sortOrdersOldestFirst(restaurantOrders);

  return (
    <div className="space-y-4">
      {/* Restaurant Section Stopped Notice (Only on pending tab; ongoing assigned orders remain active) */}
      {activeTab === 'pending' && readyFoodSectionEval && !readyFoodSectionEval.canShowNewOrders && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center space-x-3 space-x-reverse text-rose-950 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0 text-rose-700">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div className="text-xs leading-relaxed">
            <strong className="block text-rose-950 font-extrabold text-sm mb-0.5">
              استقبال طلبات المطاعم الجديدة متوقف حاليًا
            </strong>
            <span>
              {readyFoodSectionEval.reason} (الطلبات المقبولة مسبقًا لا تتأثر وتستمر عبر تبويب «قيد التنفيذ»).
            </span>
          </div>
        </div>
      )}

      {/* Work Availability Notice for Restaurant Orders */}
      {activeTab === 'pending' && !isWorking && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center space-x-3 space-x-reverse text-amber-950 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div className="text-xs leading-relaxed">
            <strong className="block text-amber-950 font-extrabold text-sm mb-0.5">
              أنت في وضع «متوقف عن العمل» حاليًا
            </strong>
            <span>
              لقبول طلبات المطاعم واستقبال التكليفات الجديدة، يجب الضغط أولاً على زر <strong>«بدء العمل»</strong> في الشريط العلوي لتفعيل حالة التوافر.
            </span>
          </div>
        </div>
      )}

      {/* Restaurant Section Header & Cards Grid (hidden when unified chronological grid renders cards) */}
      {!hideCardsList && (
        <>
          <div className="bg-white border border-orange-200/80 text-slate-900 rounded-2xl p-3.5 px-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0 text-orange-600">
                <UtensilsCrossed className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm text-slate-900">طلبات المطاعم</h3>
                  <span className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-800 text-[11px] font-bold tabular-nums">
                    {sortedRestaurantOrders.length} طلب
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  مرتبة من الأقدم إلى الأحدث
                </p>
              </div>
            </div>

            {onRefreshOrders && (
              <button
                type="button"
                onClick={onRefreshOrders}
                disabled={isSyncing}
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition cursor-pointer"
                title="تحديث طلبات المطاعم"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {sortedRestaurantOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-3 text-orange-500">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-extrabold text-slate-800">
                لا توجد طلبات مطاعم في هذا التبويب حاليًا
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                {activeTab === 'pending'
                  ? 'بمجرد وصول طلب جديد من مطعم يحتاج إلى توصيل في نطاقك الجغرافي سيظهر هنا فوراً.'
                  : 'لا توجد طلبات مطاعم مسجلة في هذا القسم.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedRestaurantOrders.map((order) => (
                <RestaurantOrderCard
                  key={order.id}
                  order={order}
                  currentDriverId={currentDriver?.id}
                  driverLocation={driverLocation}
                  canAccept={canAcceptBase && order.status === 'pending_review'}
                  isWorking={isWorking}
                  isActionLoading={isActionLoading}
                  onOpenDetails={onSelectOrder}
                  onAcceptOrder={onAcceptOrder}
                  onStartShopping={onStartShopping}
                  onCompleteOrder={onCompleteOrder}
                  onRequestCancellation={onOpenCancellationModal}
                  onCallPhone={onCallPhone}
                  onOpenMap={onOpenMap}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Restaurant Order Details Modal */}
      <RestaurantOrderDetailsModal
        order={selectedRestaurantOrder}
        currentDriverId={currentDriver?.id}
        canAccept={
          canAcceptBase && selectedRestaurantOrder?.status === 'pending_review'
        }
        isWorking={isWorking}
        isActionLoading={isActionLoading}
        onClose={() => onSelectOrder(null)}
        onAcceptOrder={onAcceptOrder}
        onStartShopping={onStartShopping}
        onUpdateDeliveryItem={onUpdateDeliveryItem}
        onCompleteShopping={onCompleteShopping}
        onCompleteOrder={onCompleteOrder}
        onOpenCancellationModal={onOpenCancellationModal}
        onCallPhone={onCallPhone}
        onOpenMap={onOpenMap}
      />
    </div>
  );
};
