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
  isValidCoordinate,
  openExternalNavigation,
} from './gpsService';
import {
  calculateHaversineDistanceKm,
  getOrderDistanceTargetCoordinates,
} from './orderDisplayHelpers';

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
    return 'مسافة الطريق غير متاحة';
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
 * Evaluates whether navigation & route distance calculation are enabled and configured in central settings.
 */
export function evaluateNavigationSettings(settings?: DeliverySystemSettings | null): {
  allowed: boolean;
  status: 'ok' | 'disabled' | 'settings_unavailable' | 'unsupported_config';
  reason: string;
} {
  if (!settings || settings.load_state !== 'loaded') {
    return {
      allowed: false,
      status: 'settings_unavailable',
      reason: 'إعدادات الملاحة والتوجيه المركزية (delivery_system_settings) غير محملة.',
    };
  }

  if (settings.navigation_enabled !== true) {
    return {
      allowed: false,
      status: 'disabled',
      reason: 'الملاحة متوقفة حاليًا من إعدادات النظام المركزية (navigation_enabled = false).',
    };
  }

  const provider = (settings.routing_provider || '').toLowerCase().trim();
  const supportedProviders = new Set(['google', 'google_maps', 'google_routes', 'routes_api', 'gmaps']);
  if (!provider || !supportedProviders.has(provider)) {
    return {
      allowed: false,
      status: 'unsupported_config',
      reason: `مزود التوجيه غير مدعوم أو غير محدد (${settings.routing_provider || 'غير محدد'}).`,
    };
  }

  if (settings.routing_engine) {
    const engine = settings.routing_engine.toLowerCase().trim();
    const supportedEngines = new Set(['routes_api', 'routes', 'google_routes', 'google_maps', 'directions', 'drive']);
    if (!supportedEngines.has(engine)) {
      return {
        allowed: false,
        status: 'unsupported_config',
        reason: `محرك التوجيه غير مدعوم (${settings.routing_engine}).`,
      };
    }
  }

  return {
    allowed: true,
    status: 'ok',
    reason: 'الملاحة والتوجيه الفعلي مفعلان.',
  };
}

export function buildUnavailableRouteResult(
  orderId: string,
  orderType: OrderType,
  reason: string,
  status: 'unavailable' | 'disabled' = 'unavailable'
): RouteDistanceResult {
  return {
    orderId,
    orderType,
    status,
    isRoadDistance: false,
    distanceMeters: null,
    distanceKm: null,
    durationSeconds: null,
    formattedDistance: status === 'disabled' ? 'الملاحة متوقفة' : 'مسافة الطريق غير متاحة',
    formattedDuration: null,
    provider: null,
    engine: null,
    calculatedAt: null,
    errorReason: reason,
  };
}

export function createSupabaseRouteInvoker(supabase: SupabaseClient | null): RouteBackendInvoker {
  return async (payload: RouteBackendPayload): Promise<RouteBackendResponse> => {
    if (!supabase) {
      return {
        success: false,
        status: 'unavailable',
        is_road_distance: false,
        code: 'NO_SUPABASE_CLIENT',
        error: 'اتصال Supabase غير مهيأ لحساب مسافة الطريق.',
      };
    }

    try {
      const { data, error } = await supabase.functions.invoke('calculate-route-distance', {
        body: payload,
      });

      if (error) {
        return {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'EDGE_FUNCTION_ERROR',
          error: error.message || 'تعذر الاتصال بخدمة حساب مسافة الطريق.',
        };
      }

      if (!data || typeof data !== 'object') {
        return {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'EMPTY_RESPONSE',
          error: 'استجابة غير مكتملة من خدمة حساب مسافة الطريق.',
        };
      }

      return data as RouteBackendResponse;
    } catch (err: any) {
      return {
        success: false,
        status: 'unavailable',
        is_road_distance: false,
        code: 'NETWORK_ERROR',
        error: err?.message || 'حدث خطأ شبكي أثناء حساب مسافة الطريق.',
      };
    }
  };
}

interface RouteCacheEntry {
  cacheKey: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  fetchedAtMs: number;
  result: RouteDistanceResult;
}

const DEFAULT_RECALC_THRESHOLD_M = 100;
const MIN_RECALC_MOVEMENT_M = 50;
const DEFAULT_COOLDOWN_MS = 5000;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Coordinates cached, debounced, rate-limited server-side road distance calls.
 * Never returns Haversine distance disguised as road distance when the routing backend is unavailable.
 */
export class RouteDistanceManager {
  private cache = new Map<string, RouteCacheEntry>();
  private inFlight = new Map<string, Promise<RouteDistanceResult>>();
  private lastCallTimeByKey = new Map<string, number>();

  public clear(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.lastCallTimeByKey.clear();
  }

  public getCached(orderId: string, orderType: OrderType): RouteDistanceResult | null {
    const key = `${orderType}:${orderId}`;
    return this.cache.get(key)?.result || null;
  }

  public shouldRecalculate(
    entry: RouteCacheEntry | undefined,
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    deviationThresholdM: number,
    nowMs = Date.now()
  ): boolean {
    if (!entry) return true;

    // Destination changed significantly (> 20m) -> recalculate immediately
    const destMovedMeters =
      calculateHaversineDistanceKm(entry.destLat, entry.destLng, destLat, destLng) * 1000;
    if (destMovedMeters > 20) {
      return true;
    }

    // Expired TTL
    if (nowMs - entry.fetchedAtMs > DEFAULT_TTL_MS) {
      return true;
    }

    // Origin movement threshold (respects route_deviation_threshold_m with 50m floor)
    const originMovedMeters =
      calculateHaversineDistanceKm(entry.originLat, entry.originLng, originLat, originLng) * 1000;
    const effectiveThreshold = Math.max(MIN_RECALC_MOVEMENT_M, deviationThresholdM || DEFAULT_RECALC_THRESHOLD_M);
    if (originMovedMeters >= effectiveThreshold) {
      return true;
    }

    return false;
  }

  public async getRoadDistanceForOrder(params: {
    order: any;
    orderType: OrderType;
    driverLocation: DriverGPSLocation | null | undefined;
    systemSettings?: DeliverySystemSettings | null;
    invoker: RouteBackendInvoker;
    nowMs?: number;
    cooldownMs?: number;
  }): Promise<{ result: RouteDistanceResult; fetchedFromBackend: boolean }> {
    const {
      order,
      orderType,
      driverLocation,
      systemSettings,
      invoker,
      nowMs = Date.now(),
      cooldownMs = DEFAULT_COOLDOWN_MS,
    } = params;

    const orderId = String(order?.id || '');
    if (!orderId) {
      return {
        result: buildUnavailableRouteResult('', orderType, 'معرف الطلب غير متوفر.'),
        fetchedFromBackend: false,
      };
    }

    const navEval = evaluateNavigationSettings(systemSettings);
    if (!navEval.allowed) {
      return {
        result: buildUnavailableRouteResult(
          orderId,
          orderType,
          navEval.reason,
          navEval.status === 'disabled' ? 'disabled' : 'unavailable'
        ),
        fetchedFromBackend: false,
      };
    }

    if (!driverLocation || !isValidCoordinate(driverLocation.latitude, driverLocation.longitude)) {
      return {
        result: buildUnavailableRouteResult(orderId, orderType, 'إحداثيات السائق الحالية غير متوفرة.'),
        fetchedFromBackend: false,
      };
    }

    const targetCoords = getOrderDistanceTargetCoordinates(order, orderType);
    if (!targetCoords || !isValidCoordinate(targetCoords.latitude, targetCoords.longitude)) {
      return {
        result: buildUnavailableRouteResult(orderId, orderType, 'إحداثيات الوجهة غير مسجلة لهذا الطلب.'),
        fetchedFromBackend: false,
      };
    }

    const key = `${orderType}:${orderId}`;
    const existing = this.cache.get(key);
    const deviationThreshold =
      systemSettings?.route_deviation_threshold_m ?? DEFAULT_RECALC_THRESHOLD_M;

    if (
      existing &&
      !this.shouldRecalculate(
        existing,
        driverLocation.latitude,
        driverLocation.longitude,
        targetCoords.latitude,
        targetCoords.longitude,
        deviationThreshold,
        nowMs
      )
    ) {
      return { result: existing.result, fetchedFromBackend: false };
    }

    // Cooldown guard against stationary rapid polling spam
    const lastCallAt = this.lastCallTimeByKey.get(key) || 0;
    if (existing && nowMs - lastCallAt < cooldownMs) {
      return { result: existing.result, fetchedFromBackend: false };
    }

    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      const res = await existingPromise;
      return { result: res, fetchedFromBackend: false };
    }

    this.lastCallTimeByKey.set(key, nowMs);

    const requestPromise = (async (): Promise<RouteDistanceResult> => {
      try {
        const res = await invoker({
          orderId,
          orderType,
          originLat: driverLocation.latitude,
          originLng: driverLocation.longitude,
          destinationLat: targetCoords.latitude,
          destinationLng: targetCoords.longitude,
        });

        if (
          res.success &&
          res.is_road_distance !== false &&
          res.distance_meters !== null &&
          res.distance_meters !== undefined &&
          Number.isFinite(Number(res.distance_meters))
        ) {
          const distanceMeters = Math.round(Number(res.distance_meters));
          const durationSeconds =
            res.duration_seconds !== null &&
            res.duration_seconds !== undefined &&
            Number.isFinite(Number(res.duration_seconds))
              ? Math.round(Number(res.duration_seconds))
              : null;

          const routeResult: RouteDistanceResult = {
            orderId,
            orderType,
            status: 'road_distance',
            isRoadDistance: true,
            distanceMeters,
            distanceKm:
              res.distance_km !== null && res.distance_km !== undefined
                ? Number(res.distance_km)
                : Number((distanceMeters / 1000).toFixed(2)),
            durationSeconds,
            formattedDistance: formatRoadDistanceMeters(distanceMeters),
            formattedDuration: formatRoadDurationSeconds(durationSeconds),
            provider: res.provider || systemSettings?.routing_provider || 'google',
            engine: res.engine || systemSettings?.routing_engine || 'routes_api',
            calculatedAt: res.calculated_at || new Date(nowMs).toISOString(),
            originLat: driverLocation.latitude,
            originLng: driverLocation.longitude,
            destinationLat: targetCoords.latitude,
            destinationLng: targetCoords.longitude,
            errorReason: null,
          };

          this.cache.set(key, {
            cacheKey: key,
            originLat: driverLocation.latitude,
            originLng: driverLocation.longitude,
            destLat: targetCoords.latitude,
            destLng: targetCoords.longitude,
            fetchedAtMs: nowMs,
            result: routeResult,
          });

          return routeResult;
        }

        const unavailable = buildUnavailableRouteResult(
          orderId,
          orderType,
          res.error || 'تعذر حساب مسافة الطريق الفعلي من الخادم.',
          res.status === 'disabled' ? 'disabled' : 'unavailable'
        );

        this.cache.set(key, {
          cacheKey: key,
          originLat: driverLocation.latitude,
          originLng: driverLocation.longitude,
          destLat: targetCoords.latitude,
          destLng: targetCoords.longitude,
          fetchedAtMs: nowMs,
          result: unavailable,
        });

        return unavailable;
      } catch (err: any) {
        return buildUnavailableRouteResult(
          orderId,
          orderType,
          err?.message || 'فشل الاتصال بخدمة حساب مسافة الطريق.'
        );
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, requestPromise);
    const result = await requestPromise;
    return { result, fetchedFromBackend: true };
  }
}

export const sharedRouteDistanceManager = new RouteDistanceManager();

/**
 * Manages the lifecycle of `delivery_navigation_sessions` cleanly:
 * - Creates at most 1 active session per (driver_id, order_id) when navigation starts.
 * - Updates existing session on route recalculation instead of creating duplicate rows per GPS tick.
 * - Marks session ended cleanly on stop, order completion, order cancellation, or logout.
 */
export interface NavigationSessionMutationResult {
  success: boolean;
  session: NavigationSessionRecord | null;
  reusedExisting?: boolean;
  error?: string | null;
}

const activeLocalSessionCache = new Map<string, NavigationSessionRecord>();

function sessionCacheKey(driverId: string, orderId: string): string {
  return `${driverId}:${orderId}`;
}

export function getCachedActiveNavigationSession(
  driverId: string | null | undefined,
  orderId: string | null | undefined
): NavigationSessionRecord | null {
  if (!driverId || !orderId) return null;
  const cached = activeLocalSessionCache.get(sessionCacheKey(driverId, orderId));
  if (!cached) return null;
  if (cached.status === 'completed' || cached.status === 'cancelled' || cached.status === 'stopped') {
    return null;
  }
  return cached;
}

export function clearNavigationSessionCache(): void {
  activeLocalSessionCache.clear();
}

export async function startNavigationSession(params: {
  supabase: SupabaseClient | null;
  driverId: string;
  orderId: string;
  orderType: OrderType;
  originLat?: number | null;
  originLng?: number | null;
  destinationLat: number;
  destinationLng: number;
  routeDistance?: RouteDistanceResult | null;
  systemSettings?: DeliverySystemSettings | null;
}): Promise<NavigationSessionMutationResult> {
  const {
    supabase,
    driverId,
    orderId,
    orderType,
    originLat = null,
    originLng = null,
    destinationLat,
    destinationLng,
    routeDistance = null,
    systemSettings,
  } = params;

  const key = sessionCacheKey(driverId, orderId);
  const nowIso = new Date().toISOString();
  const provider = routeDistance?.provider || systemSettings?.routing_provider || null;
  const engine = routeDistance?.engine || systemSettings?.routing_engine || null;

  const existingLocal = activeLocalSessionCache.get(key);
  if (
    existingLocal &&
    (existingLocal.status === 'active' || existingLocal.status === 'recalculated')
  ) {
    return updateNavigationSessionOnRouteChange({
      supabase,
      driverId,
      orderId,
      orderType,
      originLat,
      originLng,
      destinationLat,
      destinationLng,
      routeDistance,
    });
  }

  const baseRecord: NavigationSessionRecord = {
    driver_id: driverId,
    order_id: orderId,
    order_type: orderType,
    status: 'active',
    provider,
    engine,
    origin_latitude: originLat,
    origin_longitude: originLng,
    destination_latitude: destinationLat,
    destination_longitude: destinationLng,
    route_distance_m: routeDistance?.distanceMeters ?? null,
    route_duration_s: routeDistance?.durationSeconds ?? null,
    started_at: nowIso,
    updated_at: nowIso,
    ended_at: null,
  };

  if (!supabase) {
    activeLocalSessionCache.set(key, baseRecord);
    return {
      success: false,
      session: baseRecord,
      reusedExisting: false,
      error: 'عميل Supabase غير مهيأ لتوثيق جلسة الملاحة في قاعدة البيانات.',
    };
  }

  try {
    // Check DB for any active session for this driver + order first to guarantee zero duplicate rows
    const { data: existingRows } = await supabase
      .from('delivery_navigation_sessions')
      .select('*')
      .eq('driver_id', driverId)
      .eq('order_id', orderId)
      .in('status', ['active', 'recalculated'])
      .limit(1);

    const existingDb = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existingDb?.id) {
      const updatedRecord: NavigationSessionRecord = {
        ...baseRecord,
        id: String(existingDb.id),
        status: 'active',
        started_at: existingDb.started_at || nowIso,
      };
      await supabase
        .from('delivery_navigation_sessions')
        .update({
          origin_latitude: originLat,
          origin_longitude: originLng,
          destination_latitude: destinationLat,
          destination_longitude: destinationLng,
          route_distance_m: routeDistance?.distanceMeters ?? null,
          route_duration_s: routeDistance?.durationSeconds ?? null,
          updated_at: nowIso,
        })
        .eq('id', existingDb.id);

      activeLocalSessionCache.set(key, updatedRecord);
      return { success: true, session: updatedRecord, reusedExisting: true };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('delivery_navigation_sessions')
      .insert(baseRecord)
      .select('*')
      .maybeSingle();

    if (insertErr) {
      return {
        success: false,
        session: null,
        error: insertErr.message || 'تعذر تسجيل جلسة الملاحة في delivery_navigation_sessions.',
      };
    }

    const savedSession: NavigationSessionRecord = {
      ...baseRecord,
      ...(inserted || {}),
      id: inserted?.id ? String(inserted.id) : undefined,
    };
    activeLocalSessionCache.set(key, savedSession);
    return { success: true, session: savedSession, reusedExisting: false };
  } catch (err: any) {
    return {
      success: false,
      session: null,
      error: err?.message || 'خطأ غير متوقع أثناء بدء جلسة الملاحة.',
    };
  }
}

export async function updateNavigationSessionOnRouteChange(params: {
  supabase: SupabaseClient | null;
  driverId: string;
  orderId: string;
  orderType: OrderType;
  originLat?: number | null;
  originLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  routeDistance?: RouteDistanceResult | null;
}): Promise<NavigationSessionMutationResult> {
  const {
    supabase,
    driverId,
    orderId,
    orderType,
    originLat = null,
    originLng = null,
    destinationLat = null,
    destinationLng = null,
    routeDistance = null,
  } = params;

  const key = sessionCacheKey(driverId, orderId);
  const existing = activeLocalSessionCache.get(key);
  if (
    !existing ||
    existing.status === 'completed' ||
    existing.status === 'cancelled' ||
    existing.status === 'stopped'
  ) {
    return { success: false, session: null, error: 'لا توجد جلسة ملاحة نشطة لتحديثها.' };
  }

  const nowIso = new Date().toISOString();
  const updated: NavigationSessionRecord = {
    ...existing,
    order_type: orderType,
    status: 'recalculated',
    origin_latitude: originLat ?? existing.origin_latitude ?? null,
    origin_longitude: originLng ?? existing.origin_longitude ?? null,
    destination_latitude: destinationLat ?? existing.destination_latitude ?? null,
    destination_longitude: destinationLng ?? existing.destination_longitude ?? null,
    route_distance_m: routeDistance?.distanceMeters ?? existing.route_distance_m ?? null,
    route_duration_s: routeDistance?.durationSeconds ?? existing.route_duration_s ?? null,
    updated_at: nowIso,
  };
  activeLocalSessionCache.set(key, updated);

  if (!supabase) {
    return { success: false, session: updated, reusedExisting: true, error: 'Supabase غير مهيأ.' };
  }

  try {
    const query = existing.id
      ? supabase
          .from('delivery_navigation_sessions')
          .update({
            status: 'recalculated',
            origin_latitude: updated.origin_latitude,
            origin_longitude: updated.origin_longitude,
            destination_latitude: updated.destination_latitude,
            destination_longitude: updated.destination_longitude,
            route_distance_m: updated.route_distance_m,
            route_duration_s: updated.route_duration_s,
            updated_at: nowIso,
          })
          .eq('id', existing.id)
      : supabase
          .from('delivery_navigation_sessions')
          .update({
            status: 'recalculated',
            origin_latitude: updated.origin_latitude,
            origin_longitude: updated.origin_longitude,
            destination_latitude: updated.destination_latitude,
            destination_longitude: updated.destination_longitude,
            route_distance_m: updated.route_distance_m,
            route_duration_s: updated.route_duration_s,
            updated_at: nowIso,
          })
          .eq('driver_id', driverId)
          .eq('order_id', orderId)
          .in('status', ['active', 'recalculated']);

    const { error } = await query;
    if (error) {
      return {
        success: false,
        session: updated,
        reusedExisting: true,
        error: error.message || 'تعذر تحديث جلسة الملاحة.',
      };
    }

    return { success: true, session: updated, reusedExisting: true };
  } catch (err: any) {
    return {
      success: false,
      session: updated,
      reusedExisting: true,
      error: err?.message || 'تعذر تحديث جلسة الملاحة.',
    };
  }
}

export async function endNavigationSession(params: {
  supabase: SupabaseClient | null;
  driverId: string | null | undefined;
  orderId?: string | null;
  endStatus: Extract<NavigationSessionStatus, 'completed' | 'cancelled' | 'stopped'>;
}): Promise<{ success: boolean; error?: string | null }> {
  const { supabase, driverId, orderId, endStatus } = params;
  if (!driverId) return { success: true };

  const nowIso = new Date().toISOString();

  if (orderId) {
    const key = sessionCacheKey(driverId, orderId);
    const cached = activeLocalSessionCache.get(key);
    if (cached) {
      activeLocalSessionCache.set(key, {
        ...cached,
        status: endStatus,
        updated_at: nowIso,
        ended_at: nowIso,
      });
    }
  } else {
    for (const [k, s] of activeLocalSessionCache.entries()) {
      if (s.driver_id === driverId && (s.status === 'active' || s.status === 'recalculated')) {
        activeLocalSessionCache.set(k, {
          ...s,
          status: endStatus,
          updated_at: nowIso,
          ended_at: nowIso,
        });
      }
    }
  }

  if (!supabase) {
    return { success: false, error: 'عميل Supabase غير مهيأ.' };
  }

  try {
    let q = supabase
      .from('delivery_navigation_sessions')
      .update({
        status: endStatus,
        ended_at: nowIso,
        updated_at: nowIso,
      })
      .eq('driver_id', driverId)
      .in('status', ['active', 'recalculated']);

    if (orderId) {
      q = q.eq('order_id', orderId);
    }

    const { error } = await q;
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'تعذر إنهاء جلسة الملاحة.' };
  }
}

/**
 * Initiates external Google Maps turn-by-turn navigation ONLY when central `navigation_enabled = true`
 * and destination coordinates are valid. Never mutates order status.
 */
export async function startOrderNavigation(params: {
  supabase: SupabaseClient | null;
  driverId: string | null | undefined;
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
    supabase,
    driverId,
    orderId,
    orderType,
    destinationLat,
    destinationLng,
    destinationLabel,
    driverLocation = null,
    routeDistance = null,
    systemSettings,
    externalLauncher = openExternalNavigation,
  } = params;

  const navEval = evaluateNavigationSettings(systemSettings);
  if (!navEval.allowed) {
    return {
      success: false,
      blockedBySettings: true,
      error: navEval.reason,
    };
  }

  if (!isValidCoordinate(destinationLat, destinationLng)) {
    return {
      success: false,
      error: `الإحداثيات الجغرافية لـ ${destinationLabel || 'الوجهة'} غير متوفرة أو غير صالحة.`,
    };
  }

  const destLatNum = Number(destinationLat);
  const destLngNum = Number(destinationLng);

  const launchRes = externalLauncher(destLatNum, destLngNum, destinationLabel);
  if (!launchRes.success) {
    return {
      success: false,
      error: launchRes.error || 'تعذر فتح تطبيق الملاحة.',
    };
  }

  let sessionResult: NavigationSessionMutationResult | undefined;
  if (driverId) {
    sessionResult = await startNavigationSession({
      supabase,
      driverId,
      orderId,
      orderType,
      originLat: driverLocation?.latitude ?? null,
      originLng: driverLocation?.longitude ?? null,
      destinationLat: destLatNum,
      destinationLng: destLngNum,
      routeDistance,
      systemSettings,
    });
  }

  return {
    success: true,
    url: launchRes.url,
    sessionResult,
    error: null,
  };
}
