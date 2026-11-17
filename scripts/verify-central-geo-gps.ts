import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Minimal browser environment shims before importing app modules
const memStorage = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => memStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void memStorage.set(k, String(v)),
  removeItem: (k: string) => void memStorage.delete(k),
  clear: () => void memStorage.clear(),
};

(globalThis as any).localStorage = localStorageShim;
(globalThis as any).window = {
  localStorage: localStorageShim,
  location: { origin: 'http://localhost:3000', assign: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
};
if (!('navigator' in globalThis)) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });
}

type TableMap = Record<string, any[]>;

function createMockSupabase(
  tables: TableMap,
  options?: {
    onRpc?: (fnName: string, params: any) => any;
    onUpsert?: (table: string, payload: any, opts?: any) => any;
    onInsert?: (table: string, payload: any) => any;
    queriedTables?: string[];
  }
) {
  const buildChain = (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    let rowLimit: number | null = null;
    let sortCol: string | null = null;
    let sortAsc = true;

    const execute = async () => {
      const source = tables[table] || [];
      let rows = source.filter((r) => filters.every((f) => f(r)));
      if (sortCol) {
        rows = [...rows].sort((a, b) => {
          const av = String(a[sortCol!] || '');
          const bv = String(b[sortCol!] || '');
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (rowLimit !== null) {
        rows = rows.slice(0, rowLimit);
      }
      return { data: rows, error: null };
    };

    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => {
        filters.push((r) => String(r?.[col]) === String(val));
        return chain;
      },
      in: (col: string, vals: any[]) => {
        const set = new Set(vals.map((v) => String(v)));
        filters.push((r) => set.has(String(r?.[col])));
        return chain;
      },
      order: (col: string, cfg?: { ascending?: boolean }) => {
        sortCol = col;
        sortAsc = cfg?.ascending !== false;
        return chain;
      },
      limit: (n: number) => {
        rowLimit = n;
        return chain;
      },
      maybeSingle: async () => {
        const res = await execute();
        return { data: res.data[0] || null, error: null };
      },
      single: async () => {
        const res = await execute();
        return { data: res.data[0] || null, error: res.data[0] ? null : { message: 'not found' } };
      },
      upsert: async (payload: any, opts?: any) => {
        if (options?.onUpsert) {
          return options.onUpsert(table, payload, opts);
        }
        return { error: null };
      },
      insert: async (payload: any) => {
        if (options?.onInsert) {
          return options.onInsert(table, payload);
        }
        return { error: null };
      },
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
    };
    return chain;
  };

  return {
    from: (table: string) => {
      if (options?.queriedTables) options.queriedTables.push(table);
      return buildChain(table);
    },
    rpc: async (fnName: string, params?: any) => {
      if (options?.onRpc) {
        return options.onRpc(fnName, params);
      }
      return { error: null };
    },
    removeChannel: () => {},
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
  } as any;
}

async function runTests() {
  const {
    loadFullCentralGeoContext,
    evaluateCentralCoverageMatch,
    isOrderEligibleForDriver,
    extractOrderFinancialBreakdown,
    resolveDriverAffiliation,
  } = await import('../src/lib/geoCoverageService');
  const { isOrderMatchingDriverTerritory, getTerritoryMatchReason, resolveGovernorate } = await import(
    '../src/data/locationOrderMatcher'
  );
  const {
    fetchDeliverySystemSettings,
    recordDriverLocation,
  } = await import('../src/lib/driverTrackingService');
  const { extractOrderCoordinates, getRealDriverGPS, validateGpsForTracking } = await import(
    '../src/lib/gpsService'
  );
  const { isPharmacyOrderMatchingDriverTerritory } = await import('../src/lib/pharmacyService');
  const { enqueueOfflineAction, getOfflineQueue, syncOfflineQueue, clearDriverOfflineCache } =
    await import('../src/lib/offlineStore');
  const { ordersService } = await import('../src/services/ordersService');

  let passed = 0;
  async function test(name: string, fn: () => void | Promise<void>) {
    await fn();
    passed++;
    console.log(`✅ PASS: ${name}`);
  }

  // Fixture Central Geo Hierarchy
  const baseGeoTables: TableMap = {
    geo_governorates: [
      { id: 'gov-dkh', name_ar: 'الدقهلية', code: 'DKH', is_active: true },
      { id: 'gov-inactive', name_ar: 'محافظة معطلة', code: 'INACT', is_active: false },
    ],
    geo_centers: [
      { id: 'ctr-mans', governorate_id: 'gov-dkh', name_ar: 'المنصورة', is_active: true },
      { id: 'ctr-talkha', governorate_id: 'gov-dkh', name_ar: 'طلخا', is_active: true },
      { id: 'ctr-inactive', governorate_id: 'gov-dkh', name_ar: 'مركز معطل', is_active: false },
    ],
    geo_areas: [
      { id: 'area-toriel', governorate_id: 'gov-dkh', center_id: 'ctr-mans', name_ar: 'توريل', is_active: true },
      { id: 'area-gamaa', governorate_id: 'gov-dkh', center_id: 'ctr-mans', name_ar: 'حي الجامعة', is_active: true },
      { id: 'area-talkha-1', governorate_id: 'gov-dkh', center_id: 'ctr-talkha', name_ar: 'طلخا البلد', is_active: true },
      { id: 'area-inactive', governorate_id: 'gov-dkh', center_id: 'ctr-mans', name_ar: 'منطقة معطلة', is_active: false },
    ],
    delivery_driver_area_coverage: [
      { id: 'cov-p1', driver_id: 'drv-platform', area_id: 'area-toriel', is_active: true },
      { id: 'cov-p2', driver_id: 'drv-platform', area_id: 'area-inactive', is_active: true },
      { id: 'cov-p3-disabled', driver_id: 'drv-platform', area_id: 'area-talkha-1', is_active: false },
    ],
    restaurant_driver_area_coverage: [
      {
        id: 'cov-r1',
        driver_id: 'drv-rest-staff',
        restaurant_id: 'rest-1',
        center_id: 'ctr-mans',
        is_active: true,
      },
    ],
  };

  const platformDriver: any = {
    id: 'drv-platform',
    user_id: 'u-p1',
    full_name: 'سائق منصة معتمد',
    phone: '01000000001',
    governorate_name: 'القاهرة', // Intentionally DIFFERENT text from DKH order to prove text matching is disabled!
    markaz_name: 'المعادي',
    status: 'approved',
    is_active: true,
    driver_type: 'platform',
  };

  const restaurantStaffDriver: any = {
    id: 'drv-rest-staff',
    user_id: 'u-r1',
    full_name: 'سائق مطعم خاص',
    phone: '01000000002',
    status: 'approved',
    is_active: true,
    driver_type: 'restaurant_staff',
    restaurant_id: 'rest-1',
  };

  // =========================================================================
  // SCENARIO 1: Platform Driver Central Coverage vs Text Deprecation
  // =========================================================================
  await test('Scenario 1: Platform driver reads delivery_driver_area_coverage only, matches central IDs, ignores text mismatch & rejects inactive geo/coverage', async () => {
    const queriedTables: string[] = [];
    const mockSb = createMockSupabase(baseGeoTables, { queriedTables });

    assert.equal(resolveDriverAffiliation(platformDriver), 'platform');
    assert.equal(resolveGovernorate('الدقهلية'), null, 'resolveGovernorate legacy helper must return null');

    const ctx = await loadFullCentralGeoContext(mockSb, platformDriver);
    assert.ok(queriedTables.includes('delivery_driver_area_coverage'));
    assert.ok(!queriedTables.includes('restaurant_driver_area_coverage'));

    // Order has different text governorate_name/markaz_name than driver, BUT central delivery_area_id matches active area-toriel!
    const validOrder = {
      id: 'ord-p-match',
      status: 'pending_review',
      governorate_name: 'الدقهلية',
      markaz_name: 'المنصورة',
      delivery_governorate_id: 'gov-dkh',
      delivery_center_id: 'ctr-mans',
      delivery_area_id: 'area-toriel',
    };
    const matchRes = evaluateCentralCoverageMatch(validOrder, platformDriver, ctx);
    assert.equal(matchRes.matched, true);
    assert.equal(matchRes.reasonCode, 'MATCHED_CENTRAL_COVERAGE');
    assert.equal(isOrderMatchingDriverTerritory(validOrder, platformDriver, ctx), true);

    // Order in inactive geo_area -> REJECTED even though coverage row has is_active: true
    const inactiveAreaOrder = {
      id: 'ord-p-inactive-area',
      status: 'pending_review',
      delivery_area_id: 'area-inactive',
    };
    const inactiveAreaRes = evaluateCentralCoverageMatch(inactiveAreaOrder, platformDriver, ctx);
    assert.equal(inactiveAreaRes.matched, false);
    assert.equal(inactiveAreaRes.reasonCode, 'GEO_ENTITY_INACTIVE');

    // Order in area whose coverage row is_active: false -> REJECTED
    const disabledCovOrder = {
      id: 'ord-p-disabled-cov',
      status: 'pending_review',
      delivery_area_id: 'area-talkha-1',
    };
    assert.equal(evaluateCentralCoverageMatch(disabledCovOrder, platformDriver, ctx).matched, false);

    // Order with only text names and NO central IDs -> REJECTED
    const textOnlyOrder = {
      id: 'ord-text-only',
      status: 'pending_review',
      governorate_name: 'القاهرة',
      markaz_name: 'المعادي',
    };
    const textOnlyRes = evaluateCentralCoverageMatch(textOnlyOrder, platformDriver, ctx);
    assert.equal(textOnlyRes.matched, false);
    assert.equal(textOnlyRes.reasonCode, 'ORDER_MISSING_GEO_IDS');
    const reasonObj = getTerritoryMatchReason(textOnlyOrder, platformDriver, ctx);
    assert.equal(reasonObj.matched, false);
    assert.ok(reasonObj.reason.includes('معرفات'));
  });

  // =========================================================================
  // SCENARIO 2: Restaurant Staff Driver Strict Isolation
  // =========================================================================
  await test('Scenario 2: Restaurant staff driver reads restaurant_driver_area_coverage only & is isolated from platform/other-restaurant orders', async () => {
    const queriedTables: string[] = [];
    const mockSb = createMockSupabase(baseGeoTables, { queriedTables });

    assert.equal(resolveDriverAffiliation(restaurantStaffDriver), 'restaurant_staff');
    const ctx = await loadFullCentralGeoContext(mockSb, restaurantStaffDriver);
    assert.ok(queriedTables.includes('restaurant_driver_area_coverage'));
    assert.ok(!queriedTables.includes('delivery_driver_area_coverage'));

    // Same restaurant + covered center -> MATCH
    const myRestOrder = {
      id: 'ord-rest-1',
      type: 'restaurant',
      restaurant_id: 'rest-1',
      status: 'pending_review',
      delivery_center_id: 'ctr-mans',
    };
    assert.equal(evaluateCentralCoverageMatch(myRestOrder, restaurantStaffDriver, ctx).matched, true);

    // Regular home order -> BLOCKED for restaurant staff
    const homeOrder = {
      id: 'ord-home-1',
      type: 'regular',
      status: 'pending_review',
      delivery_center_id: 'ctr-mans',
    };
    const homeRes = evaluateCentralCoverageMatch(homeOrder, restaurantStaffDriver, ctx);
    assert.equal(homeRes.matched, false);
    assert.equal(homeRes.reasonCode, 'AFFILIATION_MISMATCH');

    // Different restaurant order -> BLOCKED for restaurant staff
    const otherRestOrder = {
      id: 'ord-rest-other',
      type: 'restaurant',
      restaurant_id: 'rest-999',
      status: 'pending_review',
      delivery_center_id: 'ctr-mans',
    };
    assert.equal(evaluateCentralCoverageMatch(otherRestOrder, restaurantStaffDriver, ctx).matched, false);
  });

  // =========================================================================
  // SCENARIO 3: Driver With Empty Coverage Sees Zero New Orders
  // =========================================================================
  await test('Scenario 3: Driver with NO active central coverage receives zero pending orders (fail-closed)', async () => {
    const mockSb = createMockSupabase(baseGeoTables);
    const noCovDriver: any = {
      ...platformDriver,
      id: 'drv-empty-cov',
      governorate_name: 'الدقهلية',
      markaz_name: 'المنصورة',
    };

    const ctx = await loadFullCentralGeoContext(mockSb, noCovDriver);
    assert.equal(ctx.coverageLoadState, 'empty');

    const res = evaluateCentralCoverageMatch(
      {
        id: 'ord-1',
        status: 'pending_review',
        governorate_name: 'الدقهلية',
        markaz_name: 'المنصورة',
        delivery_governorate_id: 'gov-dkh',
        delivery_center_id: 'ctr-mans',
        delivery_area_id: 'area-toriel',
      },
      noCovDriver,
      ctx
    );
    assert.equal(res.matched, false);
    assert.equal(res.reasonCode, 'COVERAGE_EMPTY');
  });

  // =========================================================================
  // SCENARIO 4: Stopped/Disabled/Unapproved Gate + Assigned Order Persistence
  // =========================================================================
  await test('Scenario 4: Stopped/disabled/unapproved driver sees ZERO new orders while already assigned orders persist even after coverage change', async () => {
    const mockSb = createMockSupabase(baseGeoTables);
    const ctx = await loadFullCentralGeoContext(mockSb, platformDriver);

    const pendingOrder = {
      id: 'ord-pending-1',
      status: 'pending_review',
      delivery_governorate_id: 'gov-dkh',
      delivery_center_id: 'ctr-mans',
      delivery_area_id: 'area-toriel',
    };

    // Stopped working -> new order rejected
    const stoppedRes = isOrderEligibleForDriver(pendingOrder, platformDriver, {
      isWorking: false,
      deliveryEnabled: true,
      geoContext: ctx,
    });
    assert.equal(stoppedRes.matched, false);
    assert.equal(stoppedRes.reasonCode, 'DRIVER_NOT_WORKING');

    // Service disabled -> new order rejected
    const disabledSvcRes = isOrderEligibleForDriver(pendingOrder, platformDriver, {
      isWorking: true,
      deliveryEnabled: false,
      geoContext: ctx,
    });
    assert.equal(disabledSvcRes.matched, false);
    assert.equal(disabledSvcRes.reasonCode, 'DELIVERY_SERVICE_DISABLED');

    // Unapproved -> rejected
    const unapprovedRes = isOrderEligibleForDriver(
      pendingOrder,
      { ...platformDriver, status: 'pending_approval' },
      { isWorking: true, deliveryEnabled: true, geoContext: ctx }
    );
    assert.equal(unapprovedRes.matched, false);
    assert.equal(unapprovedRes.reasonCode, 'DRIVER_NOT_APPROVED');

    // Already assigned to current driver in a DIFFERENT area + driver stopped working -> STILL VISIBLE!
    const assignedOrderOutsideNewCov = {
      id: 'ord-assigned-mine',
      status: 'accepted',
      assigned_driver_id: 'drv-platform',
      delivery_area_id: 'area-talkha-1', // driver no longer covers this area!
    };
    const assignedRes = isOrderEligibleForDriver(assignedOrderOutsideNewCov, platformDriver, {
      isWorking: false,
      deliveryEnabled: true,
      geoContext: ctx,
    });
    assert.equal(assignedRes.matched, true);
    assert.equal(assignedRes.reasonCode, 'ASSIGNED_TO_DRIVER');
  });

  // =========================================================================
  // SCENARIO 5: Order Assigned to Another Driver Strictly Excluded
  // =========================================================================
  await test('Scenario 5: Order assigned to another driver is ALWAYS excluded', async () => {
    const mockSb = createMockSupabase(baseGeoTables);
    const ctx = await loadFullCentralGeoContext(mockSb, platformDriver);

    const otherOrder = {
      id: 'ord-other-drv',
      status: 'accepted',
      assigned_driver_id: 'drv-someone-else',
      delivery_area_id: 'area-toriel',
    };

    const res1 = evaluateCentralCoverageMatch(otherOrder, platformDriver, ctx);
    assert.equal(res1.matched, false);
    assert.equal(res1.reasonCode, 'ASSIGNED_TO_OTHER_DRIVER');

    const res2 = isOrderEligibleForDriver(otherOrder, platformDriver, {
      isWorking: true,
      deliveryEnabled: true,
      geoContext: ctx,
    });
    assert.equal(res2.matched, false);
    assert.equal(res2.reasonCode, 'ASSIGNED_TO_OTHER_DRIVER');
  });

  // =========================================================================
  // SCENARIO 6: Missing GPS Coords Never Hide Valid Covered Order + Pickup vs Delivery Coords
  // =========================================================================
  await test('Scenario 6: Order with valid central coverage IDs and NO GPS coordinates remains visible & eligible; pickup vs delivery coords never confused', async () => {
    const mockSb = createMockSupabase(baseGeoTables);
    const ctx = await loadFullCentralGeoContext(mockSb, platformDriver);

    const orderWithoutGps = {
      id: 'ord-no-gps',
      status: 'pending_review',
      delivery_governorate_id: 'gov-dkh',
      delivery_center_id: 'ctr-mans',
      delivery_area_id: 'area-toriel',
      delivery_latitude: null,
      delivery_longitude: null,
      address_latitude: null,
      address_longitude: null,
    };

    const eligible = isOrderEligibleForDriver(orderWithoutGps, platformDriver, {
      isWorking: true,
      deliveryEnabled: true,
      geoContext: ctx,
    });
    assert.equal(eligible.matched, true);
    assert.equal(extractOrderCoordinates(orderWithoutGps, 'customer'), null);

    // Ensure restaurant pickup coords are NOT falsely returned as customer delivery coords
    const restaurantCoordsOnlyOrder = {
      id: 'ord-rest-coords-only',
      pickup_latitude: 31.045,
      pickup_longitude: 31.381,
      latitude: 31.045, // generic row latitude must NOT pollute customer coords!
      longitude: 31.381,
    };
    assert.deepEqual(extractOrderCoordinates(restaurantCoordsOnlyOrder, 'restaurant'), {
      latitude: 31.045,
      longitude: 31.381,
    });
    assert.equal(extractOrderCoordinates(restaurantCoordsOnlyOrder, 'customer'), null);
  });

  // =========================================================================
  // SCENARIO 7: Stored Financial Fields (No 90% Math, No Hardcoded 15/16/18/20)
  // =========================================================================
  await test('Scenario 7: Reads stored financial fields verbatim without 90% calculation or 15/16/18/20 defaults; flags incomplete financials', () => {
    const completeFin = extractOrderFinancialBreakdown({
      subtotal: 200,
      delivery_fee: 25,
      delivery_base_fee: 20,
      delivery_admin_commission: 4, // NOT 10% (2.5) - proves no 90% formula!
      delivery_driver_net: 21, // NOT 90% (22.5)!
      customer_delivery_fee: 25,
      total_amount: 225,
    });
    assert.equal(completeFin.deliveryFee, 25);
    assert.equal(completeFin.deliveryBaseFee, 20);
    assert.equal(completeFin.deliveryAdminCommission, 4);
    assert.equal(completeFin.deliveryDriverNet, 21);
    assert.equal(completeFin.customerDeliveryFee, 25);
    assert.equal(completeFin.totalAmount, 225);
    assert.equal(completeFin.hasIncompleteFinancials, false);

    const missingFin = extractOrderFinancialBreakdown({
      id: 'ord-no-fin',
      subtotal: 100,
    });
    assert.equal(missingFin.deliveryFee, null);
    assert.equal(missingFin.deliveryDriverNet, null);
    assert.equal(missingFin.deliveryAdminCommission, null);
    assert.equal(missingFin.hasIncompleteFinancials, true);

    // Ensure App.tsx DEFAULT_DELIVERY_SETTINGS & mockData/services do not use hardcoded 15/16/18/20 or * 0.9
    const ordersSvcSrc = fs.readFileSync(path.resolve('src/services/ordersService.ts'), 'utf8');
    assert.ok(!ordersSvcSrc.includes('* 0.9'), 'ordersService must not compute 90% driver net');
    assert.ok(!ordersSvcSrc.includes('|| 18'), 'ordersService must not hardcode 18 fee');
    assert.ok(!ordersSvcSrc.includes('|| 20'), 'ordersService must not hardcode 20 fee');
  });

  // =========================================================================
  // SCENARIO 8: Real GPS + delivery_system_settings + Accuracy / Mock Rejection
  // =========================================================================
  await test('Scenario 8: delivery_system_settings governs tracking state, rejects low-accuracy & mock locations, and persists valid locations', async () => {
    const upserts: Array<{ table: string; payload: any }> = [];
    const inserts: Array<{ table: string; payload: any }> = [];

    const mockSettingsEnabled = createMockSupabase(
      {
        delivery_system_settings: [
          { driver_tracking_enabled: true, max_accepted_gps_accuracy_m: 80 },
        ],
      },
      {
        onUpsert: async (table, payload) => {
          upserts.push({ table, payload });
          return { error: null };
        },
        onInsert: async (table, payload) => {
          inserts.push({ table, payload });
          return { error: null };
        },
      }
    );

    const sysSettings = await fetchDeliverySystemSettings(mockSettingsEnabled);
    assert.equal(sysSettings.load_state, 'loaded');
    assert.equal(sysSettings.driver_tracking_enabled, true);
    assert.equal(sysSettings.max_accepted_gps_accuracy_m, 80);

    // 8a. Reject accuracy > max_accepted_gps_accuracy_m (150 > 80)
    const poorLoc = {
      latitude: 31.0409,
      longitude: 31.3785,
      accuracy: 150,
      timestamp: Date.now(),
      recordedAt: new Date().toISOString(),
      source: 'browser_geolocation' as const,
      isMock: false,
    };
    const poorRes = await recordDriverLocation(mockSettingsEnabled, 'drv-platform', poorLoc, sysSettings);
    assert.equal(poorRes.status, 'rejected_accuracy');
    assert.equal(upserts.length, 0);
    assert.equal(inserts.length, 0);

    // 8b. Reject mock GPS reading
    const mockLoc = { ...poorLoc, accuracy: 12, isMock: true };
    const mockRes = await recordDriverLocation(mockSettingsEnabled, 'drv-platform', mockLoc, sysSettings);
    assert.equal(mockRes.status, 'rejected_mock');
    assert.equal(upserts.length, 0);

    // 8c. Never save when driver_tracking_enabled === false
    const disabledSettings = { ...sysSettings, driver_tracking_enabled: false };
    const goodLoc = { ...poorLoc, accuracy: 18, isMock: false };
    const disabledRes = await recordDriverLocation(
      mockSettingsEnabled,
      'drv-platform',
      goodLoc,
      disabledSettings
    );
    assert.equal(disabledRes.status, 'skipped_disabled');
    assert.equal(upserts.length, 0);
    assert.equal(inserts.length, 0);

    // 8d. Valid GPS reading when enabled -> saves to BOTH current & history tables using exact column names
    const goodLocWithMotion = { ...goodLoc, speed: 4.5, heading: 180 };
    const savedRes = await recordDriverLocation(
      mockSettingsEnabled,
      'drv-platform',
      goodLocWithMotion,
      sysSettings,
      'ord-active-1'
    );
    assert.equal(savedRes.status, 'saved');
    assert.equal(savedRes.currentLocationSaved, true);
    assert.equal(savedRes.historySaved, true);
    assert.equal(upserts[0].table, 'delivery_driver_current_locations');
    assert.equal(inserts[0].table, 'delivery_driver_locations');
    assert.equal(upserts[0].payload.accuracy_m, 18);
    assert.equal(upserts[0].payload.is_mocked, false);
    assert.equal(upserts[0].payload.speed_mps, 4.5);
    assert.equal(upserts[0].payload.heading_degrees, 180);
    assert.equal('accuracy' in upserts[0].payload, false);
    assert.equal('is_mock' in upserts[0].payload, false);
    assert.equal('speed' in upserts[0].payload, false);
    assert.equal('heading' in upserts[0].payload, false);
    assert.equal(inserts[0].payload.order_id, 'ord-active-1');
    assert.equal(inserts[0].payload.accuracy_m, 18);
    assert.equal(inserts[0].payload.is_mocked, false);
    assert.equal(inserts[0].payload.speed_mps, 4.5);
    assert.equal(inserts[0].payload.heading_degrees, 180);

    // 8e. Verify getRealDriverGPS returns recordedAt, source, and accuracy
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        onLine: true,
        geolocation: {
          getCurrentPosition: (ok: Function) =>
            ok({
              coords: { latitude: 31.0412, longitude: 31.3791, accuracy: 14, speed: 5, heading: 90 },
              timestamp: 1700000001000,
            }),
        },
      },
      configurable: true,
      writable: true,
    });
    const hwGps = await getRealDriverGPS(true);
    assert.equal(hwGps.success, true);
    assert.equal(hwGps.location?.source, 'browser_geolocation');
    assert.ok(hwGps.location?.recordedAt);
    assert.equal(validateGpsForTracking(hwGps.location, sysSettings).accepted, true);
  });

  // =========================================================================
  // SCENARIO 9: Stopping Work / Breakdown Never Auto-Cancels Assigned Orders
  // =========================================================================
  await test('Scenario 9: Stopping work / unavailability never calls cancellation RPC or auto-cancels assigned orders', () => {
    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    // Extract handleStopWork body and verify zero calls to request_order_cancellation or cancelled status updates
    const stopStart = appSrc.indexOf('const handleStopWork');
    const stopEnd = appSrc.indexOf('const handleAuthSubmit');
    assert.ok(stopStart > 0 && stopEnd > stopStart);
    const stopWorkBody = appSrc.slice(stopStart, stopEnd);
    assert.ok(!stopWorkBody.includes('request_order_cancellation'));
    assert.ok(!stopWorkBody.includes("'cancelled'"));
    assert.ok(stopWorkBody.includes('set_driver_availability'));
  });

  // =========================================================================
  // SCENARIO 10: Existing Regular RPCs, Offline RPC Fix, & Pharmacy Compatibility
  // =========================================================================
  await test('Scenario 10: Preserves regular RPCs (fixes offlineStore driver_update_delivery_item), ordersService central filter, and pharmacy geo ID + legacy fallback', async () => {
    const calledRpcs: Array<{ fn: string; params: any }> = [];
    const mockOfflineSb = createMockSupabase(baseGeoTables, {
      onRpc: async (fn, params) => {
        calledRpcs.push({ fn, params });
        return { error: null };
      },
    });

    clearDriverOfflineCache('drv-platform');
    enqueueOfflineAction({
      driverId: 'drv-platform',
      actionType: 'delivery_update_item',
      orderId: 'ord-1',
      payload: { p_item_id: 'it-1', p_item_status: 'purchased', p_actual_unit_price: 50 },
    });
    assert.equal(getOfflineQueue('drv-platform').length, 1);

    const syncRes = await syncOfflineQueue('drv-platform', mockOfflineSb);
    assert.equal(syncRes.synced, 1);
    assert.equal(calledRpcs[0].fn, 'driver_update_delivery_item');

    // Pharmacy order WITH central geo IDs -> uses central matching strictly
    const mockGeoSb = createMockSupabase(baseGeoTables);
    const ctx = await loadFullCentralGeoContext(mockGeoSb, platformDriver);

    const phMatched = {
      id: 'ph-central-ok',
      type: 'pharmacy',
      status: 'pending_review',
      governorate_name: 'الإسكندرية', // deliberately mismatched text!
      markaz_name: 'المنتزه',
      address_area_id: 'area-toriel', // central ID matches!
    } as any;
    assert.equal(isPharmacyOrderMatchingDriverTerritory(phMatched, platformDriver, ctx), true);

    const phRejected = {
      id: 'ph-central-outside',
      type: 'pharmacy',
      status: 'pending_review',
      governorate_name: 'القاهرة',
      markaz_name: 'المعادي',
      address_area_id: 'area-gamaa', // outside driver's coverage (toriel only)!
    } as any;
    assert.equal(isPharmacyOrderMatchingDriverTerritory(phRejected, platformDriver, ctx), false);

    // Pharmacy order WITHOUT central geo IDs -> preserves legacy matching using driver's central coverage area center/gov names (or profile fallback)
    const phLegacyWithoutIds = {
      id: 'ph-legacy-1',
      status: 'pending_review',
      governorate_name: 'الدقهلية',
      markaz_name: 'المنصورة',
    } as any;
    assert.equal(isPharmacyOrderMatchingDriverTerritory(phLegacyWithoutIds, platformDriver, ctx), true);

    // ordersService central geo binding & stored financial mapping
    const mockOrdersSb = createMockSupabase({
      ...baseGeoTables,
      delivery_orders: [
        {
          id: 'ord-svc-1',
          status: 'pending_review',
          governorate_name: 'الدقهلية',
          markaz_name: 'المنصورة',
          delivery_governorate_id: 'gov-dkh',
          delivery_center_id: 'ctr-mans',
          delivery_area_id: 'area-toriel',
          subtotal: 90,
          delivery_fee: 17,
          delivery_driver_net: 14,
          delivery_admin_commission: 3,
          total_amount: 107,
        },
        {
          id: 'ord-svc-outside',
          status: 'pending_review',
          governorate_name: 'القاهرة',
          markaz_name: 'المعادي',
          delivery_governorate_id: 'gov-dkh',
          delivery_center_id: 'ctr-mans',
          delivery_area_id: 'area-gamaa',
          subtotal: 50,
          delivery_fee: 10,
          total_amount: 60,
        },
      ],
      pharmacy_orders: [],
      delivery_order_items: [],
    });

    const { regularOrdersList } = await (ordersService as any).fetchDeliveryOrdersFromDB(
      mockOrdersSb,
      platformDriver.id,
      platformDriver,
      ctx
    );
    assert.equal(regularOrdersList.length, 1);
    assert.equal(regularOrdersList[0].id, 'ord-svc-1');
    assert.equal(regularOrdersList[0].delivery_area_name, 'توريل');
    assert.equal(regularOrdersList[0].deliveryFee, 17);
    assert.equal(regularOrdersList[0].driverFee, 14);
    assert.equal(regularOrdersList[0].delivery_admin_commission, 3);
    ordersService.cleanup();
  });

  console.log(`\n🎉 All ${passed} Central Geo + GPS verification scenarios passed successfully!`);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
