import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fetchDeliverySystemSettings } from '../src/lib/driverTrackingService';
import { resolveTrackingIntervalMs } from '../src/hooks/useDriverGPS';
import {
  RouteDistanceManager,
  clearNavigationSessionCache,
  endNavigationSession,
  evaluateNavigationSettings,
  getCachedActiveNavigationSession,
  startNavigationSession,
  startOrderNavigation,
  updateNavigationSessionOnRouteChange,
  type RouteBackendPayload,
} from '../src/lib/navigationService';
import {
  buildUnifiedChronologicalOrders,
  sortOrdersOldestFirst,
} from '../src/lib/orderDisplayHelpers';
import {
  OrdersService,
  REALTIME_MONITORED_TABLES,
  ordersService,
} from '../src/services/ordersService';
import { pharmacyService } from '../src/lib/pharmacyService';
import { createEmptyAppSectionSettingsState } from '../src/lib/sectionSettingsService';
import type { CentralGeoContext, DeliveryDriver, DeliverySystemSettings } from '../src/types';
import type { DeliveryOrder } from '../src/App';
import type { PharmacyOrder } from '../src/types/pharmacy';
import type { DriverGPSLocation } from '../src/lib/gpsService';

function makeLoadedSettings(
  overrides: Partial<DeliverySystemSettings> = {}
): DeliverySystemSettings {
  return {
    driver_tracking_enabled: true,
    navigation_enabled: true,
    routing_provider: 'google',
    routing_engine: 'routes_api',
    driver_location_update_interval_seconds: 15,
    max_accepted_gps_accuracy_m: 100,
    route_deviation_threshold_m: 100,
    load_state: 'loaded',
    ...overrides,
  };
}

function makeMockDriver(id = 'drv-1'): DeliveryDriver {
  return {
    id,
    user_id: `usr-${id}`,
    full_name: 'سائق اختبار',
    phone: '01000000000',
    is_active: true,
    vehicle_type: 'motorcycle',
    notes: null,
    role: 'delivery_driver',
    status: 'approved',
    governorate_name: 'الدقهلية',
    governorate_code: 'DKH',
    markaz_name: 'المنصورة',
    vehicle_plate: null,
    national_id: null,
    approved_at: '2026-01-01T00:00:00Z',
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makeGeoContext(driverId = 'drv-1'): CentralGeoContext {
  return {
    driverAffiliation: 'platform',
    governorates: [{ id: 'gov-1', name: 'الدقهلية', is_active: true }],
    centers: [{ id: 'ctr-1', governorate_id: 'gov-1', name: 'المنصورة', is_active: true }],
    areas: [
      { id: 'area-1', governorate_id: 'gov-1', center_id: 'ctr-1', name: 'حي الجامعة', is_active: true },
    ],
    coverageRows: [
      {
        id: 'cov-1',
        driver_id: driverId,
        governorate_id: 'gov-1',
        center_id: 'ctr-1',
        area_id: 'area-1',
        is_active: true,
        source_table: 'delivery_driver_area_coverage',
      },
    ],
    geoLoadState: 'loaded',
    coverageLoadState: 'loaded',
    coverageError: null,
  };
}

function makeOperationalSections() {
  const s = createEmptyAppSectionSettingsState('loaded');
  (['household_shortages', 'pharmacy', 'ready_food'] as const).forEach((k) => {
    s.sections[k] = {
      section_key: k,
      label_ar: k,
      short_label_ar: k,
      section_enabled: true,
      section_visible: true,
      delivery_enabled: true,
      load_state: 'loaded',
      updated_at: '2026-01-01T00:00:00Z',
    };
  });
  return s;
}

const driverGps: DriverGPSLocation = {
  latitude: 31.0409,
  longitude: 31.3785,
  accuracy: 12,
  speed: 4,
  heading: 90,
  timestamp: Date.now(),
  recordedAt: new Date().toISOString(),
  source: 'browser_geolocation',
  isMock: false,
};

// =========================================================================
// 1. Central delivery_system_settings reading
// =========================================================================
test('Scenario 1: fetchDeliverySystemSettings reads direct columns, key-value rows, and fails closed cleanly', async () => {
  const makeSelectLimitSb = (rows: any[]) =>
    ({
      from: () => ({
        select: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    } as any);

  const directSb = makeSelectLimitSb([
    {
      driver_tracking_enabled: true,
      navigation_enabled: true,
      routing_provider: 'google',
      routing_engine: 'routes_api',
      driver_location_update_interval_seconds: 20,
      max_accepted_gps_accuracy_m: 75,
      route_deviation_threshold_m: 120,
    },
  ]);

  const direct = await fetchDeliverySystemSettings(directSb);
  assert.equal(direct.load_state, 'loaded');
  assert.equal(direct.driver_tracking_enabled, true);
  assert.equal(direct.navigation_enabled, true);
  assert.equal(direct.routing_provider, 'google');
  assert.equal(direct.routing_engine, 'routes_api');
  assert.equal(direct.driver_location_update_interval_seconds, 20);
  assert.equal(direct.max_accepted_gps_accuracy_m, 75);
  assert.equal(direct.route_deviation_threshold_m, 120);

  const kvSb = makeSelectLimitSb([
    { setting_key: 'driver_tracking_enabled', setting_value: false },
    { setting_key: 'navigation_enabled', setting_value: 'true' },
    { setting_key: 'routing_provider', setting_value: 'google_maps' },
    { setting_key: 'routing_engine', setting_value: 'routes_api' },
    { setting_key: 'driver_location_update_interval_seconds', setting_value: '30' },
    { setting_key: 'max_accepted_gps_accuracy_m', setting_value: 60 },
    { setting_key: 'route_deviation_threshold_m', setting_value: '150' },
  ]);

  const kv = await fetchDeliverySystemSettings(kvSb);
  assert.equal(kv.load_state, 'loaded');
  assert.equal(kv.driver_tracking_enabled, false);
  assert.equal(kv.navigation_enabled, true);
  assert.equal(kv.routing_provider, 'google_maps');
  assert.equal(kv.driver_location_update_interval_seconds, 30);
  assert.equal(kv.route_deviation_threshold_m, 150);

  const emptySb = makeSelectLimitSb([]);
  const empty = await fetchDeliverySystemSettings(emptySb);
  assert.equal(empty.load_state, 'empty');
  assert.equal(empty.driver_location_update_interval_seconds, null);
  assert.equal(empty.navigation_enabled, null);
});

// =========================================================================
// 2. Dynamic GPS interval (never falls back to hardcoded 45_000)
// =========================================================================
test('Scenario 2: resolveTrackingIntervalMs strictly obeys delivery_system_settings and never defaults to 45s', () => {
  assert.equal(
    resolveTrackingIntervalMs(
      makeLoadedSettings({ driver_tracking_enabled: true, driver_location_update_interval_seconds: 10 })
    ),
    10_000
  );
  assert.equal(
    resolveTrackingIntervalMs(
      makeLoadedSettings({ driver_tracking_enabled: true, driver_location_update_interval_seconds: 30 })
    ),
    30_000
  );
  assert.equal(
    resolveTrackingIntervalMs(
      makeLoadedSettings({ driver_tracking_enabled: false, driver_location_update_interval_seconds: 15 })
    ),
    null
  );
  assert.equal(
    resolveTrackingIntervalMs(
      makeLoadedSettings({ driver_tracking_enabled: true, driver_location_update_interval_seconds: null })
    ),
    null
  );
  assert.equal(
    resolveTrackingIntervalMs({
      ...makeLoadedSettings(),
      load_state: 'idle',
    }),
    null
  );
});

// =========================================================================
// 3. Server-side road distance & zero client secret exposure
// =========================================================================
test('Scenario 3: No VITE_GOOGLE_MAPS_API_KEY in client source and Edge Function uses server secret + Routes API v2', async () => {
  const srcRoot = path.resolve(process.cwd(), 'src');
  const stack = [srcRoot];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        assert.equal(
          content.includes('VITE_GOOGLE_MAPS_API_KEY'),
          false,
          `Client file must NOT reference VITE_GOOGLE_MAPS_API_KEY: ${full}`
        );
      }
    }
  }

  const edgePath = path.resolve(
    process.cwd(),
    'supabase/functions/calculate-route-distance/index.ts'
  );
  const edgeCode = fs.readFileSync(edgePath, 'utf8');
  assert.ok(edgeCode.includes("Deno.env.get('GOOGLE_MAPS_API_KEY')"));
  assert.ok(edgeCode.includes('routes.googleapis.com/directions/v2:computeRoutes'));

  const manager = new RouteDistanceManager();
  const { result } = await manager.getRoadDistanceForOrder({
    order: { id: 'ord-1', delivery_latitude: 31.055, delivery_longitude: 31.39 },
    orderType: 'regular',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings(),
    invoker: async () => ({
      success: true,
      status: 'road_distance',
      is_road_distance: true,
      distance_meters: 2450,
      distance_km: 2.45,
      duration_seconds: 420,
      provider: 'google',
      engine: 'routes_api',
    }),
  });

  assert.equal(result.status, 'road_distance');
  assert.equal(result.isRoadDistance, true);
  assert.equal(result.distanceMeters, 2450);
  assert.equal(result.durationSeconds, 420);
  assert.equal(result.formattedDistance, '2.5 كم');
  assert.equal(result.formattedDuration, '7 دقيقة');
});

// =========================================================================
// 4. Strict coordinate selection per order type
// =========================================================================
test('Scenario 4: Enforces exact coordinate source per category (household->customer, pharmacy->customer only, restaurant->restaurant only)', async () => {
  const manager = new RouteDistanceManager();
  const captured: RouteBackendPayload[] = [];
  const invoker = async (payload: RouteBackendPayload) => {
    captured.push(payload);
    return {
      success: true,
      status: 'road_distance' as const,
      is_road_distance: true,
      distance_meters: 1200,
      duration_seconds: 180,
    };
  };

  await manager.getRoadDistanceForOrder({
    order: {
      id: 'home-1',
      delivery_latitude: 31.061,
      delivery_longitude: 31.391,
      restaurant_latitude: 30.0,
      restaurant_longitude: 31.0,
    },
    orderType: 'regular',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings(),
    invoker,
  });

  await manager.getRoadDistanceForOrder({
    order: {
      id: 'pharm-1',
      address_latitude: 31.071,
      address_longitude: 31.395,
      requested_pharmacy_latitude: 29.99,
      requested_pharmacy_longitude: 30.99,
    },
    orderType: 'pharmacy',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings(),
    invoker,
  });

  await manager.getRoadDistanceForOrder({
    order: {
      id: 'rest-1',
      restaurant_latitude: 31.051,
      restaurant_longitude: 31.382,
      delivery_latitude: 30.044,
      delivery_longitude: 31.235,
    },
    orderType: 'restaurant',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings(),
    invoker,
  });

  assert.equal(captured.length, 3);
  assert.deepEqual(
    { lat: captured[0].destinationLat, lng: captured[0].destinationLng },
    { lat: 31.061, lng: 31.391 }
  );
  assert.deepEqual(
    { lat: captured[1].destinationLat, lng: captured[1].destinationLng },
    { lat: 31.071, lng: 31.395 }
  );
  assert.deepEqual(
    { lat: captured[2].destinationLat, lng: captured[2].destinationLng },
    { lat: 31.051, lng: 31.382 }
  );
});

// =========================================================================
// 5 & 6. Oldest-first ordering across all categories + dynamic updates + no 4.2/missing created_at
// =========================================================================
test('Scenarios 5 & 6: Chronological oldest-first ordering and dynamic #1,#2,#3 renumbering across all categories', () => {
  const driver = makeMockDriver('drv-1');
  const geo = makeGeoContext('drv-1');
  const sections = makeOperationalSections();

  const makeReg = (id: string, created_at: string, rest = false): DeliveryOrder =>
    ({
      id,
      order_number: id,
      customer_name: 'عميل',
      customer_phone: '010',
      country: 'مصر',
      governorate_name: 'الدقهلية',
      markaz_name: 'المنصورة',
      detailed_address: 'حي الجامعة',
      delivery_governorate_id: 'gov-1',
      delivery_center_id: 'ctr-1',
      delivery_area_id: 'area-1',
      status: 'pending_review',
      assigned_driver_id: null,
      subtotal: 100,
      delivery_fee: 20,
      total_amount: 120,
      actual_items_total: 100,
      actual_total_amount: 120,
      created_at,
      updated_at: created_at,
      ...(rest
        ? {
            restaurant_id: 'rest-1',
            restaurant_name: 'مطعم الشرق',
            delivery_by: 'platform',
          }
        : {}),
    } as any);

  const makePharm = (id: string, created_at: string): PharmacyOrder =>
    ({
      id,
      order_number: id,
      household_id: 'hh-1',
      customer_name: 'عميل صيدلية',
      customer_phone: '010',
      country: 'مصر',
      governorate_name: 'الدقهلية',
      markaz_name: 'المنصورة',
      detailed_address: 'حي الجامعة',
      address_governorate_id: 'gov-1',
      address_center_id: 'ctr-1',
      address_area_id: 'area-1',
      delivery_notes: null,
      has_customer_specified_pharmacy: false,
      requested_pharmacy_name: null,
      pharmacy_change_suggestion: null,
      driver_visited_pharmacies: [],
      items: [],
      prescription_images: [],
      totals: { medicines_total: null, delivery_fee: 15, final_total: null },
      receipt_image_url: null,
      receipt_captured_at: null,
      assigned_driver_id: null,
      status: 'pending_review',
      accepted_at: null,
      shopping_started_at: null,
      ready_for_delivery_at: null,
      completed_at: null,
      unable_to_fulfill_at: null,
      cancellation_request: null,
      compensation_status: 'not_applicable',
      compensation_amount: null,
      compensation_note: null,
      created_at,
      updated_at: created_at,
    });

  const initialUnified = buildUnifiedChronologicalOrders({
    activeTab: 'pending',
    searchQuery: '',
    orders: [
      makeReg('reg-new', '2026-05-01T10:30:00Z'),
      makeReg('rest-mid', '2026-05-01T10:15:00Z', true),
    ],
    pharmacyOrders: [makePharm('pharm-old', '2026-05-01T10:00:00Z')],
    currentDriver: driver,
    isWorking: true,
    deliveryEnabled: true,
    geoContext: geo,
    sectionSettings: sections,
  });

  assert.deepEqual(
    initialUnified.map((item, idx) => `#${idx + 1}:${item.order.id}`),
    ['#1:pharm-old', '#2:rest-mid', '#3:reg-new']
  );

  // Dynamically add an older eligible order and remove the previous #2
  const updatedUnified = buildUnifiedChronologicalOrders({
    activeTab: 'pending',
    searchQuery: '',
    orders: [
      makeReg('reg-oldest', '2026-05-01T09:45:00Z'),
      makeReg('reg-new', '2026-05-01T10:30:00Z'),
    ],
    pharmacyOrders: [makePharm('pharm-old', '2026-05-01T10:00:00Z')],
    currentDriver: driver,
    isWorking: true,
    deliveryEnabled: true,
    geoContext: geo,
    sectionSettings: sections,
  });

  assert.deepEqual(
    updatedUnified.map((item, idx) => `#${idx + 1}:${item.order.id}`),
    ['#1:reg-oldest', '#2:pharm-old', '#3:reg-new']
  );

  // Verify ordersService preserves created_at and does not inject hardcoded 4.2
  const ordersServiceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/ordersService.ts'),
    'utf8'
  );
  assert.ok(ordersServiceSource.includes('created_at: row.created_at,'));
  assert.equal(ordersServiceSource.includes('distanceKm: 4.2'), false);
  assert.deepEqual(
    sortOrdersOldestFirst([
      { id: 'b', created_at: '2026-05-01T11:00:00Z' },
      { id: 'a', created_at: '2026-05-01T09:00:00Z' },
    ]).map((o) => o.id),
    ['a', 'b']
  );
});

// =========================================================================
// 7. Stationary debouncing & movement/deviation recalculation
// =========================================================================
test('Scenario 7: Stationary polls reuse cached route without spam; movement >= threshold recalculates automatically', async () => {
  const manager = new RouteDistanceManager();
  let backendCalls = 0;

  const invoker = async () => {
    backendCalls++;
    return {
      success: true,
      status: 'road_distance' as const,
      is_road_distance: true,
      distance_meters: 1500 + backendCalls * 100,
      duration_seconds: 240,
    };
  };

  const order = {
    id: 'ord-move-1',
    delivery_latitude: 31.055,
    delivery_longitude: 31.39,
  };

  const settings = makeLoadedSettings({ route_deviation_threshold_m: 100 });

  // 1st call computes road distance
  const r1 = await manager.getRoadDistanceForOrder({
    order,
    orderType: 'regular',
    driverLocation: driverGps,
    systemSettings: settings,
    invoker,
    nowMs: 1000,
    cooldownMs: 5000,
  });
  assert.equal(r1.fetchedFromBackend, true);
  assert.equal(backendCalls, 1);

  // Stationary second call (moved ~0m) -> reuses cache, 0 extra backend calls
  const r2 = await manager.getRoadDistanceForOrder({
    order,
    orderType: 'regular',
    driverLocation: driverGps,
    systemSettings: settings,
    invoker,
    nowMs: 10_000,
    cooldownMs: 5000,
  });
  assert.equal(r2.fetchedFromBackend, false);
  assert.equal(backendCalls, 1);

  // Moved ~220m (> 100m threshold) after cooldown -> automatic recalculation
  const r3 = await manager.getRoadDistanceForOrder({
    order,
    orderType: 'regular',
    driverLocation: { ...driverGps, latitude: driverGps.latitude + 0.002 },
    systemSettings: settings,
    invoker,
    nowMs: 20_000,
    cooldownMs: 5000,
  });
  assert.equal(r3.fetchedFromBackend, true);
  assert.equal(backendCalls, 2);
});

// =========================================================================
// 8. Honest fallback (never Haversine or 4.2 on failure)
// =========================================================================
test('Scenario 8: Returns unavailable without Haversine fallback when routing fails or coordinates missing', async () => {
  const manager = new RouteDistanceManager();

  const failedBackend = await manager.getRoadDistanceForOrder({
    order: { id: 'ord-fail', delivery_latitude: 31.055, delivery_longitude: 31.39 },
    orderType: 'regular',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings(),
    invoker: async () => ({
      success: false,
      status: 'unavailable',
      is_road_distance: false,
      error: 'GOOGLE_MAPS_API_KEY not configured',
    }),
  });
  assert.equal(failedBackend.result.status, 'unavailable');
  assert.equal(failedBackend.result.isRoadDistance, false);
  assert.equal(failedBackend.result.distanceMeters, null);
  assert.equal(failedBackend.result.formattedDistance, 'مسافة الطريق غير متاحة');

  const noCoords = await manager.getRoadDistanceForOrder({
    order: { id: 'ord-nocoords' },
    orderType: 'restaurant',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings(),
    invoker: async () => {
      throw new Error('Should not invoke backend without destination coordinates');
    },
  });
  assert.equal(noCoords.result.status, 'unavailable');
  assert.equal(noCoords.result.formattedDistance, 'مسافة الطريق غير متاحة');
});

// =========================================================================
// 9. Navigation gating on central navigation_enabled
// =========================================================================
test('Scenario 9: startOrderNavigation blocks when navigation_enabled = false and never mutates order status when launched', async () => {
  const blocked = await startOrderNavigation({
    supabase: null,
    driverId: 'drv-1',
    orderId: 'ord-1',
    orderType: 'regular',
    destinationLat: 31.055,
    destinationLng: 31.39,
    systemSettings: makeLoadedSettings({ navigation_enabled: false }),
    externalLauncher: () => {
      throw new Error('Must NOT launch external navigation when disabled');
    },
  });
  assert.equal(blocked.success, false);
  assert.equal(blocked.blockedBySettings, true);
  assert.equal(evaluateNavigationSettings(makeLoadedSettings({ navigation_enabled: false })).allowed, false);

  let launchedUrl = '';
  const dbTablesTouched: string[] = [];
  const mockSb: any = {
    from: (table: string) => {
      dbTablesTouched.push(table);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
        insert: (row: any) => ({
          select: () => ({
            maybeSingle: async () => ({ data: { id: 'nav-1', ...row }, error: null }),
          }),
        }),
      };
    },
  };

  clearNavigationSessionCache();
  const launched = await startOrderNavigation({
    supabase: mockSb,
    driverId: 'drv-1',
    orderId: 'ord-1',
    orderType: 'regular',
    destinationLat: 31.055,
    destinationLng: 31.39,
    destinationLabel: 'عميل',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings({ navigation_enabled: true }),
    externalLauncher: (lat, lng) => {
      launchedUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      return { success: true, url: launchedUrl };
    },
  });

  assert.equal(launched.success, true);
  assert.ok(launchedUrl.includes('31.055,31.39'));
  // Only touches delivery_navigation_sessions — never mutates delivery_orders / pharmacy_orders
  assert.ok(dbTablesTouched.every((t) => t === 'delivery_navigation_sessions'));
});

// =========================================================================
// 10. delivery_navigation_sessions single-row lifecycle
// =========================================================================
test('Scenario 10: delivery_navigation_sessions maintains 1 row per (driver,order), updates on route change, ends on stop/complete/cancel', async () => {
  clearNavigationSessionCache();
  const rows: any[] = [];
  let nextId = 1;

  const sessionSb: any = {
    from: (table: string) => {
      assert.equal(table, 'delivery_navigation_sessions');
      return {
        select: () => {
          const filters: Record<string, any> = {};
          const chain: any = {
            eq: (col: string, val: any) => {
              filters[col] = val;
              return chain;
            },
            in: (col: string, vals: any[]) => {
              filters[`in:${col}`] = vals;
              return chain;
            },
            limit: async () => {
              const matched = rows.filter(
                (r) =>
                  r.driver_id === filters.driver_id &&
                  r.order_id === filters.order_id &&
                  (!filters['in:status'] || filters['in:status'].includes(r.status))
              );
              return { data: matched, error: null };
            },
          };
          return chain;
        },
        insert: (payload: any) => ({
          select: () => ({
            maybeSingle: async () => {
              const created = { id: `sess-${nextId++}`, ...payload };
              rows.push(created);
              return { data: created, error: null };
            },
          }),
        }),
        update: (patch: any) => {
          const eqFilters: Record<string, any> = {};
          const inFilters: Record<string, any[]> = {};
          const chain: any = {
            eq: (col: string, val: any) => {
              eqFilters[col] = val;
              return chain;
            },
            in: (col: string, vals: any[]) => {
              inFilters[col] = vals;
              return chain;
            },
            then: (resolve: any) => {
              rows.forEach((r, idx) => {
                const eqOk = Object.entries(eqFilters).every(([c, v]) => r[c] === v);
                const inOk = Object.entries(inFilters).every(([c, vals]) =>
                  vals.includes(r[c])
                );
                if (eqOk && inOk) {
                  rows[idx] = { ...r, ...patch };
                }
              });
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };

  const startRes = await startNavigationSession({
    supabase: sessionSb,
    driverId: 'drv-1',
    orderId: 'ord-99',
    orderType: 'pharmacy',
    originLat: 31.04,
    originLng: 31.37,
    destinationLat: 31.06,
    destinationLng: 31.39,
    systemSettings: makeLoadedSettings(),
  });
  assert.equal(startRes.success, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'active');

  // Update multiple times on route recalculation -> still 1 row!
  const updRes = await updateNavigationSessionOnRouteChange({
    supabase: sessionSb,
    driverId: 'drv-1',
    orderId: 'ord-99',
    orderType: 'pharmacy',
    originLat: 31.045,
    originLng: 31.375,
    routeDistance: {
      orderId: 'ord-99',
      orderType: 'pharmacy',
      status: 'road_distance',
      isRoadDistance: true,
      distanceMeters: 1850,
      distanceKm: 1.85,
      durationSeconds: 300,
      formattedDistance: '1.9 كم',
      formattedDuration: '5 دقيقة',
      provider: 'google',
      engine: 'routes_api',
      calculatedAt: new Date().toISOString(),
    },
  });
  assert.equal(updRes.success, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'recalculated');
  assert.equal(rows[0].route_distance_m, 1850);

  const endRes = await endNavigationSession({
    supabase: sessionSb,
    driverId: 'drv-1',
    orderId: 'ord-99',
    endStatus: 'completed',
  });
  assert.equal(endRes.success, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'completed');
  assert.ok(rows[0].ended_at);
  assert.equal(getCachedActiveNavigationSession('drv-1', 'ord-99'), null);
});

// =========================================================================
// 11 & 12. Honest multi-table Realtime status + item deduplication
// =========================================================================
test('Scenarios 11 & 12: Multi-table Realtime status honest propagation across 7 tables (excl. restaurant_orders) & burst item deduplication', async () => {
  assert.equal(REALTIME_MONITORED_TABLES.includes('restaurant_orders' as any), false);
  assert.equal(REALTIME_MONITORED_TABLES.length, 7);

  const svc = new OrdersService(false);
  const channelHandlers = new Map<
    string,
    {
      onPayload: (p: any) => void;
      onStatusChange?: (s: string, err?: any) => void;
      unsubscribed: boolean;
    }
  >();

  let refreshCount = 0;
  svc.refreshOrders = async () => {
    refreshCount++;
  };

  svc.setRealtimeSubscriber((table, onPayload, onStatusChange) => {
    const entry = { onPayload, onStatusChange, unsubscribed: false };
    channelHandlers.set(table, entry);
    return () => {
      entry.unsubscribed = true;
    };
  });

  const observedStatuses: string[] = [];
  const unsubStatus = svc.subscribeToStatus((s) => observedStatuses.push(s));

  svc.setDriverSession('drv-rt');
  // Immediately upon setDriverSession before channels report SUBSCRIBED, status must be CONNECTING (NOT SUBSCRIBED)
  assert.equal(svc.getRealtimeStatus().status, 'CONNECTING');
  assert.equal(channelHandlers.size, 7);

  // Only partial tables subscribed -> still CONNECTING
  channelHandlers.get('delivery_orders')!.onStatusChange?.('SUBSCRIBED');
  assert.equal(svc.getRealtimeStatus().status, 'CONNECTING');

  // All 7 tables subscribed -> SUBSCRIBED
  for (const tbl of REALTIME_MONITORED_TABLES) {
    channelHandlers.get(tbl)!.onStatusChange?.('SUBSCRIBED');
  }
  assert.equal(svc.getRealtimeStatus().status, 'SUBSCRIBED');

  // One table errors -> aggregate status becomes CHANNEL_ERROR honestly
  channelHandlers
    .get('pharmacy_order_items')!
    .onStatusChange?.('CHANNEL_ERROR', new Error('Socket drop'));
  assert.equal(svc.getRealtimeStatus().status, 'CHANNEL_ERROR');

  // Also verify pharmacyService.subscribeToRealtime does NOT synchronously lie with 'SUBSCRIBED'
  const pharmacySvcStatuses: string[] = [];
  const prevDriverStatus = ordersService.getRealtimeStatus().status;
  const unsubPharmRt = pharmacyService.subscribeToRealtime(
    () => {},
    (s) => pharmacySvcStatuses.push(s)
  );
  assert.deepEqual(pharmacySvcStatuses, [prevDriverStatus]);
  unsubPharmRt();

  // Burst item triggers deduplicate and coalesce into 1 debounced refresh
  const beforeBurst = refreshCount;
  channelHandlers.get('delivery_order_items')!.onPayload({
    eventType: 'INSERT',
    new: { id: 'it-1', order_id: 'ord-55' },
  });
  channelHandlers.get('delivery_order_items')!.onPayload({
    eventType: 'INSERT',
    new: { id: 'it-1', order_id: 'ord-55' },
  });
  channelHandlers.get('pharmacy_order_items')!.onPayload({
    eventType: 'UPDATE',
    new: { id: 'pit-2', order_id: 'ph-77' },
  });

  await new Promise((r) => setTimeout(r, 450));
  assert.equal(refreshCount - beforeBurst, 1, 'Burst item events must coalesce cleanly');

  unsubStatus();
  svc.cleanup();
  assert.equal(
    Array.from(channelHandlers.values()).every((c) => c.unsubscribed),
    true
  );
});

// =========================================================================
// 13. Complete cleanup on logout & driver switch
// =========================================================================
test('Scenario 13: Logout & driver switch cleanly reset OrdersService, route cache, and navigation session cache', async () => {
  const svc = new OrdersService(false);
  let unsubCount = 0;
  svc.refreshOrders = async () => {};
  svc.setRealtimeSubscriber((_t, _p, onStatusChange) => {
    onStatusChange?.('SUBSCRIBED');
    return () => {
      unsubCount++;
    };
  });

  svc.setDriverSession('drv-A');
  assert.equal(svc.getRealtimeStatus().status, 'SUBSCRIBED');

  // Logout via setDriverSession(null)
  svc.setDriverSession(null);
  assert.equal(svc.getRealtimeStatus().status, 'DISCONNECTED');
  assert.equal(Object.keys(svc.getRealtimeStatus().channelStatuses).length, 0);
  assert.equal(unsubCount, 7);

  // Start local navigation session + route cache, then verify clear resets both
  const manager = new RouteDistanceManager();
  await manager.getRoadDistanceForOrder({
    order: { id: 'o-clear', delivery_latitude: 31.055, delivery_longitude: 31.39 },
    orderType: 'regular',
    driverLocation: driverGps,
    systemSettings: makeLoadedSettings(),
    invoker: async () => ({
      success: true,
      status: 'road_distance',
      is_road_distance: true,
      distance_meters: 900,
      duration_seconds: 120,
    }),
  });
  assert.ok(manager.getCached('o-clear', 'regular'));
  manager.clear();
  assert.equal(manager.getCached('o-clear', 'regular'), null);

  await startNavigationSession({
    supabase: null,
    driverId: 'drv-A',
    orderId: 'o-clear',
    orderType: 'regular',
    destinationLat: 31.055,
    destinationLng: 31.39,
    systemSettings: makeLoadedSettings(),
  });
  assert.ok(getCachedActiveNavigationSession('drv-A', 'o-clear'));
  clearNavigationSessionCache();
  assert.equal(getCachedActiveNavigationSession('drv-A', 'o-clear'), null);
});
