import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DeliveryOrder,
  DeliverySystemSettings,
  OrderType,
  RouteDistanceResult,
} from '../types';
import type { PharmacyOrder } from '../types/pharmacy';
import type { DriverGPSLocation } from '../lib/gpsService';
import { isRestaurantOrder } from '../lib/restaurantService';
import {
  buildUnavailableRouteResult,
  createSupabaseRouteInvoker,
  evaluateNavigationSettings,
  getCachedActiveNavigationSession,
  sharedRouteDistanceManager,
  updateNavigationSessionOnRouteChange,
  type RouteBackendInvoker,
} from '../lib/navigationService';

export function getOrderRouteKey(orderType: OrderType, orderId: string): string {
  return `${orderType}:${orderId}`;
}

export interface UseOrderRouteDistancesOptions {
  supabase: SupabaseClient | null;
  driverId: string | null | undefined;
  driverLocation: DriverGPSLocation | null | undefined;
  systemSettings: DeliverySystemSettings | null | undefined;
  orders: DeliveryOrder[];
  pharmacyOrders: PharmacyOrder[];
  invokerOverride?: RouteBackendInvoker;
}

const TERMINAL_STATUSES = new Set([
  'delivered',
  'completed',
  'cancelled',
  'unable_to_fulfill',
]);

export function useOrderRouteDistances({
  supabase,
  driverId,
  driverLocation,
  systemSettings,
  orders,
  pharmacyOrders,
  invokerOverride,
}: UseOrderRouteDistancesOptions) {
  const [routeDistances, setRouteDistances] = useState<Record<string, RouteDistanceResult>>({});
  const driverIdRef = useRef(driverId);
  driverIdRef.current = driverId;
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  const invoker = useMemo(
    () => invokerOverride || createSupabaseRouteInvoker(supabase),
    [supabase, invokerOverride]
  );

  // Clear route distances and cache on logout or driver switch
  useEffect(() => {
    if (!driverId) {
      sharedRouteDistanceManager.clear();
      setRouteDistances({});
    }
  }, [driverId]);

  const computeForOrder = useCallback(
    async (order: any, orderType: OrderType): Promise<RouteDistanceResult | null> => {
      const orderId = String(order?.id || '');
      if (!orderId) return null;
      const key = getOrderRouteKey(orderType, orderId);

      const { result, fetchedFromBackend } = await sharedRouteDistanceManager.getRoadDistanceForOrder({
        order,
        orderType,
        driverLocation,
        systemSettings,
        invoker,
      });

      setRouteDistances((prev) => {
        const current = prev[key];
        if (
          current &&
          current.status === result.status &&
          current.distanceMeters === result.distanceMeters &&
          current.durationSeconds === result.durationSeconds &&
          current.formattedDistance === result.formattedDistance
        ) {
          return prev;
        }
        return { ...prev, [key]: result };
      });

      const activeDriverId = driverIdRef.current;
      if (
        fetchedFromBackend &&
        activeDriverId &&
        result.status === 'road_distance' &&
        getCachedActiveNavigationSession(activeDriverId, orderId)
      ) {
        void updateNavigationSessionOnRouteChange({
          supabase: supabaseRef.current,
          driverId: activeDriverId,
          orderId,
          orderType,
          originLat: result.originLat ?? driverLocation?.latitude ?? null,
          originLng: result.originLng ?? driverLocation?.longitude ?? null,
          destinationLat: result.destinationLat ?? null,
          destinationLng: result.destinationLng ?? null,
          routeDistance: result,
        });
      }

      return result;
    },
    [driverLocation, systemSettings, invoker]
  );

  // Build stable signature of active/pending order targets to avoid redundant recalculations
  const targetItems = useMemo(() => {
    const list: Array<{ order: any; orderType: OrderType; key: string }> = [];

    for (const o of orders) {
      const rawStatus = String(o.raw_status || o.status || '').toLowerCase().trim();
      if (TERMINAL_STATUSES.has(rawStatus)) continue;
      const orderType: OrderType = isRestaurantOrder(o) ? 'restaurant' : 'regular';
      list.push({
        order: o,
        orderType,
        key: getOrderRouteKey(orderType, o.id),
      });
    }

    for (const p of pharmacyOrders) {
      const rawStatus = String(p.status || '').toLowerCase().trim();
      if (TERMINAL_STATUSES.has(rawStatus)) continue;
      list.push({
        order: p,
        orderType: 'pharmacy',
        key: getOrderRouteKey('pharmacy', p.id),
      });
    }

    return list;
  }, [orders, pharmacyOrders]);

  const targetSig = useMemo(
    () => targetItems.map((t) => `${t.key}`).join('|'),
    [targetItems]
  );

  const navEval = useMemo(
    () => evaluateNavigationSettings(systemSettings),
    [systemSettings]
  );

  useEffect(() => {
    if (!driverId) return;

    // When navigation is disabled or settings unavailable, immediately mark all active orders honestly
    if (!navEval.allowed) {
      const nextMap: Record<string, RouteDistanceResult> = {};
      for (const item of targetItems) {
        nextMap[item.key] = buildUnavailableRouteResult(
          String(item.order.id),
          item.orderType,
          navEval.reason,
          navEval.status === 'disabled' ? 'disabled' : 'unavailable'
        );
      }
      setRouteDistances(nextMap);
      return;
    }

    // Without driver GPS coordinates, do not call backend or invent distance
    if (!driverLocation) {
      const nextMap: Record<string, RouteDistanceResult> = {};
      for (const item of targetItems) {
        nextMap[item.key] = buildUnavailableRouteResult(
          String(item.order.id),
          item.orderType,
          'إحداثيات السائق الحالية غير متوفرة.'
        );
      }
      setRouteDistances(nextMap);
      return;
    }

    let cancelled = false;

    const run = async () => {
      for (const item of targetItems) {
        if (cancelled) break;
        await computeForOrder(item.order, item.orderType);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    driverId,
    targetSig,
    navEval.allowed,
    navEval.status,
    navEval.reason,
    driverLocation?.latitude,
    driverLocation?.longitude,
    driverLocation?.timestamp,
    computeForOrder,
    targetItems,
  ]);

  return {
    routeDistances,
    recalculateOrderRoute: computeForOrder,
  };
}
