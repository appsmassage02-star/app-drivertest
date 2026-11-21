import { useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DeliveryOrder,
  DeliverySystemSettings,
  OrderType,
  RouteDistanceResult,
} from '../types';
import type { PharmacyOrder } from '../types/pharmacy';
import type { DriverGPSLocation } from '../lib/gpsService';
import type { RouteBackendInvoker } from '../lib/navigationService';

export function getOrderRouteKey(orderType: OrderType, orderId: string): string {
  return `${orderType}:${orderId}`;
}

export interface UseOrderRouteDistancesOptions {
  supabase: SupabaseClient | null;
  driverId: string | null | undefined;
  driverLocation?: DriverGPSLocation | null;
  systemSettings?: DeliverySystemSettings | null;
  orders: DeliveryOrder[];
  pharmacyOrders: PharmacyOrder[];
  invokerOverride?: RouteBackendInvoker;
}

/**
 * Legacy route calculation hook — permanently disabled.
 * Never invokes `calculate-route-distance` or writes to `delivery_navigation_sessions`.
 */
export function useOrderRouteDistances(_options: UseOrderRouteDistancesOptions) {
  const routeDistances = useMemo<Record<string, RouteDistanceResult>>(() => ({}), []);

  const recalculateOrderRoute = useCallback(
    async (_order: any, _orderType: OrderType): Promise<RouteDistanceResult | null> => {
      return null;
    },
    []
  );

  return {
    routeDistances,
    recalculateOrderRoute,
  };
}
