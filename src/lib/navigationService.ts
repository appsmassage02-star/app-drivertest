import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DeliverySystemSettings,
  NavigationSessionRecord,
  NavigationSessionStatus,
  OrderType,
  RouteDistanceResult,
} from '../types';
import {
  type DriverGPSLocation,
  MISSING_DESTINATION_COORDS_MESSAGE,
  buildCustomerGoogleMapsNav,
  isValidCoordinate,
  openExternalNavigation,
} from './gpsService';

export interface RouteBackendPayload {
  orderId: string;
  orderType: OrderType;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}

export interface RouteBackendResponse {
  success: boolean;
  status?: 'road_distance' | 'unavailable' | 'disabled';
  is_road_distance?: boolean;
  distance_meters?: number | null;
  distance_km?: number | null;
  duration_seconds?: number | null;
  provider?: string | null;
  engine?: string | null;
  calculated_at?: string | null;
  code?: string | null;
  error?: string | null;
}

export type RouteBackendInvoker = (
  payload: RouteBackendPayload
) => Promise<RouteBackendResponse>;

export function formatRoadDistanceMeters(distanceMeters: number | null | undefined): string {
  if (distanceMeters === null || distanceMeters === undefined || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return 'غير متاح';
  }
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} م`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} كم`;
}

export function formatRoadDurationSeconds(durationSeconds: number | null | undefined): string | null {
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return null;
  }
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} دقيقة`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} س ${mins} د` : `${hours} ساعة`;
}

/**
 * Customer-coordinate Google Maps URL navigation is always permitted without system tracking or Routes API.
 */
export function evaluateNavigationSettings(_settings?: DeliverySystemSettings | null): {
  allowed: boolean;
  status: 'ok' | 'disabled' | 'settings_unavailable' | 'unsupported_config';
  reason: string;
} {
  return {
    allowed: true,
    status: 'ok',
    reason: 'الملاحة عبر خرائط Google متاحة باستخدام إحداثيات العميل.',
  };
}

export function buildUnavailableRouteResult(
  orderId: string,
  orderType: OrderType,
  reason: string = 'تم إلغاء حساب مسافة الطريق داخل التطبيق.',
  status: 'unavailable' | 'disabled' = 'disabled'
): RouteDistanceResult {
  return {
    orderId,
    orderType,
    status,
    isRoadDistance: false,
    distanceMeters: null,
    distanceKm: null,
    durationSeconds: null,
    formattedDistance: '',
    formattedDuration: null,
    provider: null,
    engine: null,
    calculatedAt: null,
    errorReason: reason,
  };
}

/**
 * Disabled route invoker — NEVER calls `calculate-route-distance` Edge Function.
 */
export function createSupabaseRouteInvoker(_supabase: SupabaseClient | null): RouteBackendInvoker {
  return async (_payload: RouteBackendPayload): Promise<RouteBackendResponse> => ({
    success: false,
    status: 'disabled',
    is_road_distance: false,
    code: 'ROUTING_DISABLED',
    error: 'تم إلغاء حساب مسافة الطريق والتتبع في تطبيق السائق.',
  });
}

export class RouteDistanceManager {
  public clear(): void {
    // No cached routes needed
  }

  public getCached(_orderId: string, _orderType: OrderType): RouteDistanceResult | null {
    return null;
  }

  public shouldRecalculate(): boolean {
    return false;
  }

  public async getRoadDistanceForOrder(params: {
    order: any;
    orderType: OrderType;
    driverLocation?: DriverGPSLocation | null;
    systemSettings?: DeliverySystemSettings | null;
    invoker?: RouteBackendInvoker;
    nowMs?: number;
    cooldownMs?: number;
  }): Promise<{ result: RouteDistanceResult; fetchedFromBackend: boolean }> {
    return {
      result: buildUnavailableRouteResult(String(params.order?.id || ''), params.orderType),
      fetchedFromBackend: false,
    };
  }
}

export const sharedRouteDistanceManager = new RouteDistanceManager();

export interface NavigationSessionMutationResult {
  success: boolean;
  session: NavigationSessionRecord | null;
  reusedExisting?: boolean;
  error?: string | null;
}

export function getCachedActiveNavigationSession(
  _driverId: string | null | undefined,
  _orderId: string | null | undefined
): NavigationSessionRecord | null {
  return null;
}

export function clearNavigationSessionCache(): void {
  // No-op
}

/**
 * Disabled no-op: never reads/writes `delivery_navigation_sessions`.
 */
export async function startNavigationSession(_params: {
  supabase?: SupabaseClient | null;
  driverId?: string;
  orderId: string;
  orderType: OrderType;
  originLat?: number | null;
  originLng?: number | null;
  destinationLat: number;
  destinationLng: number;
  routeDistance?: RouteDistanceResult | null;
  systemSettings?: DeliverySystemSettings | null;
}): Promise<NavigationSessionMutationResult> {
  return { success: true, session: null, reusedExisting: false };
}

/**
 * Disabled no-op: never updates `delivery_navigation_sessions`.
 */
export async function updateNavigationSessionOnRouteChange(_params: {
  supabase?: SupabaseClient | null;
  driverId?: string;
  orderId: string;
  orderType: OrderType;
  originLat?: number | null;
  originLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  routeDistance?: RouteDistanceResult | null;
}): Promise<NavigationSessionMutationResult> {
  return { success: true, session: null, reusedExisting: false };
}

/**
 * Disabled no-op: never touches `delivery_navigation_sessions`.
 */
export async function endNavigationSession(_params: {
  supabase?: SupabaseClient | null;
  driverId?: string | null;
  orderId?: string | null;
  endStatus: Extract<NavigationSessionStatus, 'completed' | 'cancelled' | 'stopped'>;
}): Promise<{ success: boolean; error?: string | null }> {
  return { success: true };
}

/**
 * Opens Google Maps turn-by-turn navigation directly to customer's saved delivery coordinates
 * without altering order status, without requiring GPS permission, and without creating DB sessions.
 */
export async function startOrderNavigation(params: {
  supabase?: SupabaseClient | null;
  driverId?: string | null;
  orderId: string;
  orderType: OrderType;
  destinationLat: number | null | undefined;
  destinationLng: number | null | undefined;
  destinationLabel?: string;
  driverLocation?: DriverGPSLocation | null;
  routeDistance?: RouteDistanceResult | null;
  systemSettings?: DeliverySystemSettings | null;
  externalLauncher?: typeof openExternalNavigation;
}): Promise<{
  success: boolean;
  blockedBySettings?: boolean;
  url?: string;
  sessionResult?: NavigationSessionMutationResult;
  error?: string | null;
}> {
  const {
    destinationLat,
    destinationLng,
    destinationLabel,
    externalLauncher = openExternalNavigation,
  } = params;

  if (!isValidCoordinate(destinationLat, destinationLng)) {
    return {
      success: false,
      error: MISSING_DESTINATION_COORDS_MESSAGE,
    };
  }

  const destLatNum = Number(destinationLat);
  const destLngNum = Number(destinationLng);

  const launchRes = externalLauncher(destLatNum, destLngNum, destinationLabel);
  if (!launchRes.success) {
    return {
      success: false,
      error: launchRes.error || 'تعذر فتح خرائط Google.',
    };
  }

  return {
    success: true,
    url: launchRes.url,
    error: null,
  };
}

/**
 * Helper to launch Google Maps navigation directly from an order object using saved customer coordinates only.
 * Never mutates order status and never falls back to default/driver coordinates.
 */
export function launchCustomerDeliveryMaps(
  order: any,
  externalLauncher: typeof openExternalNavigation = openExternalNavigation
): {
  success: boolean;
  url: string | null;
  embedUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  errorMessage: string | null;
} {
  const nav = buildCustomerGoogleMapsNav(order);
  if (!nav.valid || nav.latitude === null || nav.longitude === null) {
    return {
      success: false,
      url: null,
      embedUrl: null,
      latitude: null,
      longitude: null,
      errorMessage: nav.errorMessage || MISSING_DESTINATION_COORDS_MESSAGE,
    };
  }

  const launchRes = externalLauncher(nav.latitude, nav.longitude);
  return {
    success: launchRes.success,
    url: nav.directionsUrl,
    embedUrl: nav.embedUrl,
    latitude: nav.latitude,
    longitude: nav.longitude,
    errorMessage: launchRes.success ? null : launchRes.error || 'تعذر فتح خرائط Google.',
  };
}
