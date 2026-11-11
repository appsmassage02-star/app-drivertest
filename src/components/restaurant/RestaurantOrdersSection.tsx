import React, { useMemo } from 'react';
import { UtensilsCrossed, AlertTriangle, RefreshCw } from 'lucide-react';
import { DeliveryOrder } from '../../types';
import { RestaurantOrderCard } from './RestaurantOrderCard';
import { RestaurantOrderDetailsModal } from './RestaurantOrderDetailsModal';
import type { DeliveryDriver } from '../../App';

interface RestaurantOrdersSectionProps {
  activeTab: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'profile' | 'settings';
  searchQuery: string;
  currentDriver: DeliveryDriver | null;
  isWorking?: boolean;
  deliveryEnabled: boolean;
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
}

export const RestaurantOrdersSection: React.FC<RestaurantOrdersSectionProps> = ({
  activeTab,
  searchQuery,
  currentDriver,
  isWorking = true,
  deliveryEnabled,
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
}) => {
  if (!['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab)) {
    return null;
  }

  const canAcceptBase =
    Boolean(isWorking) &&
    Boolean(deliveryEnabled) &&
    currentDriver?.status === 'approved' &&
    Boolean(currentDriver?.is_active);

  return (
    <div className="space-y-4">
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

      {/* Restaurant Section Header Banner */}
      <div className="bg-gradient-to-l from-amber-700 via-orange-600 to-amber-800 text-white rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/25 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5 text-amber-200" />
          </div>
          <div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <h3 className="font-extrabold text-sm sm:text-base">قسم طلبات المطاعم</h3>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400/25 border border-amber-300/30 text-amber-100 text-[10px] font-bold">
                {restaurantOrders.length} طلب
              </span>
            </div>
            <p className="text-[11px] text-amber-100/90 mt-0.5">
              استلام الوجبات الساخنة من المطاعم وتوصيلها فوراً للعملاء مع تحصيل الكاش (COD)
            </p>
          </div>
        </div>

        {onRefreshOrders && (
          <button
            type="button"
            onClick={onRefreshOrders}
            disabled={isSyncing}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="تحديث طلبات المطاعم"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Orders Grid or Empty State */}
      {restaurantOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-orange-200 shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-3 text-orange-600">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <h4 className="text-sm font-extrabold text-neutral-800">
            لا توجد طلبات مطاعم في هذا التبويب حاليًا
          </h4>
          <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto leading-relaxed">
            {activeTab === 'pending'
              ? 'بمجرد وصول طلب جديد من مطعم يحتاج إلى توصيل في نطاقك الجغرافي سيظهر هنا فوراً.'
              : 'لا توجد طلبات مطاعم مسجلة في هذا القسم.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {restaurantOrders.map((order) => (
            <RestaurantOrderCard
              key={order.id}
              order={order}
              currentDriverId={currentDriver?.id}
              canAccept={canAcceptBase && (order.status === 'pending_review' || order.status === 'new')}
              isWorking={isWorking}
              isActionLoading={isActionLoading}
              onOpenDetails={onSelectOrder}
              onAcceptOrder={onAcceptOrder}
              onStartShopping={onStartShopping}
              onCompleteOrder={onCompleteOrder}
              onRequestCancellation={onOpenCancellationModal}
              onCallPhone={onCallPhone}
            />
          ))}
        </div>
      )}

      {/* Restaurant Order Details Modal */}
      <RestaurantOrderDetailsModal
        order={selectedRestaurantOrder}
        currentDriverId={currentDriver?.id}
        canAccept={
          canAcceptBase &&
          (selectedRestaurantOrder?.status === 'pending_review' ||
            selectedRestaurantOrder?.status === 'new')
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
      />
    </div>
  );
};
