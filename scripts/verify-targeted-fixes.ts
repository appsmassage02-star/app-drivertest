import assert from 'node:assert/strict';

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

function createMockSupabase(handlers: {
  onSelect?: (table: string, filters: Array<{ op: string; col: string; val: any }>) => Promise<any>;
  onUpsert?: (table: string, payload: any, opts?: any) => Promise<any>;
  onInsert?: (table: string, payload: any) => Promise<any>;
}) {
  return {
    from: (table: string) => {
      const filters: Array<{ op: string; col: string; val: any }> = [];
      const executeSelect = async () => {
        if (handlers.onSelect) {
          return handlers.onSelect(table, filters);
        }
        return { data: [], error: null };
      };
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: any) => {
          filters.push({ op: 'eq', col, val });
          return chain;
        },
        in: (col: string, val: any) => {
          filters.push({ op: 'in', col, val });
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const res = await executeSelect();
          return { data: res.data?.[0] || null, error: res.error || null };
        },
        upsert: async (payload: any, opts?: any) => {
          if (handlers.onUpsert) return handlers.onUpsert(table, payload, opts);
          return { error: null };
        },
        insert: async (payload: any) => {
          if (handlers.onInsert) return handlers.onInsert(table, payload);
          return { error: null };
        },
        then: (resolve: any, reject: any) => executeSelect().then(resolve, reject),
      };
      return chain;
    },
  } as any;
}

async function runTests() {
  const { recordDriverLocation, fetchDeliverySystemSettings } = await import(
    '../src/lib/driverTrackingService'
  );
  const {
    fetchDriverCentralCoverage,
    evaluateCentralCoverageMatch,
    loadFullCentralGeoContext,
  } = await import('../src/lib/geoCoverageService');
  const { PHARMACY_ORDER_SELECT_QUERY, isPharmacyOrderMatchingDriverTerritory } = await import(
    '../src/lib/pharmacyService'
  );
  const { ordersService } = await import('../src/services/ordersService');

  let passed = 0;
  async function test(name: string, fn: () => void | Promise<void>) {
    await fn();
    passed++;
    console.log(`✅ PASS: ${name}`);
  }

  // =========================================================================
  // TEST 1: GPS Payload Fields (accuracy_m, is_mocked, speed_mps, heading_degrees) & Zero Retries
  // =========================================================================
  await test('Test 1 (Fix #1): Sends exact GPS field names with zero deprecated names and zero stripping retries', async () => {
    let upsertCalls = 0;
    let insertCalls = 0;
    const capturedPayloads: Array<{ op: string; table: string; payload: any }> = [];

    const mockSb = createMockSupabase({
      onUpsert: async (table, payload) => {
        upsertCalls++;
        capturedPayloads.push({ op: 'UPSERT', table, payload });
        return { error: { code: '42703', message: 'column "test" error — should NOT trigger retry' } };
      },
      onInsert: async (table, payload) => {
        insertCalls++;
        capturedPayloads.push({ op: 'INSERT', table, payload });
        return { error: { code: '42703', message: 'column error — should NOT trigger retry' } };
      },
    });

    const settings = {
      driver_tracking_enabled: true,
      max_accepted_gps_accuracy_m: 100,
      load_state: 'loaded' as const,
    };

    const validLoc = {
      latitude: 31.041,
      longitude: 31.379,
      accuracy: 15,
      speed: 6.2,
      heading: 120,
      timestamp: Date.now(),
      recordedAt: '2026-10-20T12:00:00.000Z',
      source: 'browser_geolocation' as const,
      isMock: false,
    };

    const res = await recordDriverLocation(mockSb, 'drv-1', validLoc, settings, 'ord-1');
    assert.equal(res.status, 'db_error');
    assert.equal(upsertCalls, 1, 'Must attempt UPSERT exactly once (no fallback retry)');
    assert.equal(insertCalls, 1, 'Must attempt INSERT exactly once (no fallback retry)');

    for (const entry of capturedPayloads) {
      assert.equal(entry.payload.accuracy_m, 15);
      assert.equal(entry.payload.is_mocked, false);
      assert.equal(entry.payload.speed_mps, 6.2);
      assert.equal(entry.payload.heading_degrees, 120);
      assert.equal('accuracy' in entry.payload, false, 'Must NEVER send accuracy');
      assert.equal('is_mock' in entry.payload, false, 'Must NEVER send is_mock');
      assert.equal('speed' in entry.payload, false, 'Must NEVER send speed');
      assert.equal('heading' in entry.payload, false, 'Must NEVER send heading');
    }
  });

  // =========================================================================
  // TEST 2: restaurant_driver_area_coverage (Strict driver_id filter, no guessed column, explicit RLS logging)
  // =========================================================================
  await test('Test 2 (Fix #2): Queries restaurant_driver_area_coverage by driver_id only and logs RLS failure with table + SELECT', async () => {
    const queriedFilterCols: string[] = [];
    let queryCount = 0;

    const mockRlsSb = createMockSupabase({
      onSelect: async (table, filters) => {
        if (table === 'restaurant_driver_area_coverage') {
          queryCount++;
          filters.forEach((f) => queriedFilterCols.push(`${f.col}=${f.val}`));
          return {
            data: null,
            error: {
              code: '42501',
              status: 403,
              message: 'new row violates row-level security / permission denied for table restaurant_driver_area_coverage',
            },
          };
        }
        return { data: [], error: null };
      },
    });

    const restDriver: any = {
      id: 'drv-rest-1',
      status: 'approved',
      is_active: true,
      driver_type: 'restaurant_staff',
      restaurant_id: 'rest-9',
    };

    const covRes = await fetchDriverCentralCoverage(mockRlsSb, restDriver);
    assert.equal(queryCount, 1, 'Must NOT retry with restaurant_driver_id');
    assert.deepEqual(queriedFilterCols, ['driver_id=drv-rest-1']);
    assert.equal(covRes.coverageLoadState, 'permission_denied');
    assert.equal(covRes.coverageFailedOperation?.table, 'restaurant_driver_area_coverage');
    assert.equal(covRes.coverageFailedOperation?.operation, 'SELECT');
    assert.equal(covRes.coverageFailedOperation?.isRls, true);

    // Ensure regular orders NEVER fall back to text area matching when coverage failed
    const matchRes = evaluateCentralCoverageMatch(
      {
        id: 'ord-reg-1',
        type: 'regular',
        status: 'pending_review',
        governorate_name: 'الدقهلية',
        markaz_name: 'المنصورة',
        delivery_governorate_id: 'gov-1',
        delivery_center_id: 'ctr-1',
        delivery_area_id: 'area-1',
      },
      restDriver,
      {
        governorates: [],
        centers: [],
        areas: [],
        geoLoadState: 'loaded',
        ...covRes,
      }
    );
    assert.equal(matchRes.matched, false);
    assert.equal(matchRes.reasonCode, 'COVERAGE_NOT_LOADED');
  });

  // =========================================================================
  // TEST 3: Driver Location Save Partial/Full RLS Failure Never Masked as Saved
  // =========================================================================
  await test('Test 3 (Fix #3): Explicit table + operation RLS failure recorded when either location table rejects write', async () => {
    const mockPartialRlsSb = createMockSupabase({
      onUpsert: async () => ({ error: null }),
      onInsert: async () => ({
        error: {
          code: '42501',
          status: 403,
          message: 'permission denied for table delivery_driver_locations',
        },
      }),
    });

    const settings = {
      driver_tracking_enabled: true,
      max_accepted_gps_accuracy_m: 100,
      load_state: 'loaded' as const,
    };
    const loc = {
      latitude: 31.041,
      longitude: 31.379,
      accuracy: 10,
      timestamp: Date.now(),
      recordedAt: new Date().toISOString(),
      source: 'browser_geolocation' as const,
      isMock: false,
    };

    const res = await recordDriverLocation(mockPartialRlsSb, 'drv-1', loc, settings);
    assert.equal(res.status, 'db_error', 'Partial write with RLS error must NOT return saved');
    assert.equal(res.currentLocationSaved, true);
    assert.equal(res.historySaved, false);
    assert.equal(res.failedOperations?.length, 1);
    assert.equal(res.failedOperations?.[0].table, 'delivery_driver_locations');
    assert.equal(res.failedOperations?.[0].operation, 'INSERT');
    assert.equal(res.failedOperations?.[0].isRls, true);
  });

  // =========================================================================
  // TEST 4: delivery_system_settings Strict Read & No Tracking Writes When Missing/RLS/Disabled
  // =========================================================================
  await test('Test 4 (Fix #4): Refuses all location writes when delivery_system_settings is empty, RLS-denied, or false', async () => {
    let writeAttempts = 0;
    const loc = {
      latitude: 31.041,
      longitude: 31.379,
      accuracy: 10,
      timestamp: Date.now(),
      recordedAt: new Date().toISOString(),
      source: 'browser_geolocation' as const,
      isMock: false,
    };

    // 4a. Empty table
    const emptySb = createMockSupabase({
      onSelect: async () => ({ data: [], error: null }),
      onUpsert: async () => {
        writeAttempts++;
        return { error: null };
      },
      onInsert: async () => {
        writeAttempts++;
        return { error: null };
      },
    });
    const emptySettings = await fetchDeliverySystemSettings(emptySb);
    assert.equal(emptySettings.load_state, 'empty');
    assert.equal(emptySettings.driver_tracking_enabled, null);
    const emptySave = await recordDriverLocation(emptySb, 'drv-1', loc, emptySettings);
    assert.equal(emptySave.status, 'skipped_settings_unavailable');

    // 4b. RLS denied on delivery_system_settings
    const rlsSb = createMockSupabase({
      onSelect: async () => ({
        data: null,
        error: { code: '42501', status: 403, message: 'permission denied for delivery_system_settings' },
      }),
      onUpsert: async () => {
        writeAttempts++;
        return { error: null };
      },
      onInsert: async () => {
        writeAttempts++;
        return { error: null };
      },
    });
    const rlsSettings = await fetchDeliverySystemSettings(rlsSb);
    assert.equal(rlsSettings.load_state, 'permission_denied');
    assert.equal(rlsSettings.failedOperation?.table, 'delivery_system_settings');
    assert.equal(rlsSettings.failedOperation?.operation, 'SELECT');
    assert.equal(rlsSettings.failedOperation?.isRls, true);
    const rlsSave = await recordDriverLocation(rlsSb, 'drv-1', loc, rlsSettings);
    assert.equal(rlsSave.status, 'skipped_settings_unavailable');

    // 4c. Explicitly disabled (driver_tracking_enabled: false)
    const disabledSb = createMockSupabase({
      onSelect: async () => ({
        data: [{ driver_tracking_enabled: false, max_accepted_gps_accuracy_m: 100 }],
        error: null,
      }),
      onUpsert: async () => {
        writeAttempts++;
        return { error: null };
      },
      onInsert: async () => {
        writeAttempts++;
        return { error: null };
      },
    });
    const disabledSettings = await fetchDeliverySystemSettings(disabledSb);
    assert.equal(disabledSettings.load_state, 'loaded');
    assert.equal(disabledSettings.driver_tracking_enabled, false);
    const disabledSave = await recordDriverLocation(disabledSb, 'drv-1', loc, disabledSettings);
    assert.equal(disabledSave.status, 'skipped_disabled');

    assert.equal(writeAttempts, 0, 'Zero DB writes permitted across empty/RLS/disabled settings');
  });

  // =========================================================================
  // TEST 5: PHARMACY_ORDER_SELECT_QUERY Geo Columns & address_*_id Coverage Match
  // =========================================================================
  await test('Test 5 (Fix #5): PHARMACY_ORDER_SELECT_QUERY selects address_*_id (no delivery_*_id) and preserves pharmacy address fields', async () => {
    for (const requiredCol of [
      'address_governorate_id',
      'address_center_id',
      'address_area_id',
      'address_governorate_name',
      'address_governorate_code',
      'address_center_name',
      'address_text',
      'address_latitude',
      'address_longitude',
    ]) {
      assert.ok(
        PHARMACY_ORDER_SELECT_QUERY.includes(requiredCol),
        `PHARMACY_ORDER_SELECT_QUERY must include ${requiredCol}`
      );
    }

    for (const forbiddenCol of [
      'delivery_governorate_id',
      'delivery_center_id',
      'delivery_area_id',
      'delivery_area_name',
      'delivery_latitude',
      'delivery_longitude',
    ]) {
      assert.ok(
        !PHARMACY_ORDER_SELECT_QUERY.includes(forbiddenCol),
        `PHARMACY_ORDER_SELECT_QUERY must NOT include non-existent ${forbiddenCol}`
      );
    }

    const driver: any = { id: 'drv-p', status: 'approved', is_active: true, driver_type: 'platform' };
    const geoSb = createMockSupabase({
      onSelect: async (table) => {
        if (table === 'geo_governorates') return { data: [{ id: 'g1', name_ar: 'الدقهلية', is_active: true }], error: null };
        if (table === 'geo_centers') return { data: [{ id: 'c1', governorate_id: 'g1', name_ar: 'المنصورة', is_active: true }], error: null };
        if (table === 'geo_areas') return { data: [{ id: 'a1', governorate_id: 'g1', center_id: 'c1', name_ar: 'توريل', is_active: true }, { id: 'a2', governorate_id: 'g1', center_id: 'c1', name_ar: 'المشاية', is_active: true }], error: null };
        if (table === 'delivery_driver_area_coverage') return { data: [{ id: 'cov1', driver_id: 'drv-p', area_id: 'a1', is_active: true }], error: null };
        return { data: [], error: null };
      },
    });
    const ctx = await loadFullCentralGeoContext(geoSb, driver);

    // Must match via address_area_id = a1 even if delivery_area_id were set to something else
    assert.equal(
      isPharmacyOrderMatchingDriverTerritory(
        {
          id: 'ph-1',
          status: 'pending_review',
          governorate_name: 'الدقهلية',
          markaz_name: 'المنصورة',
          address_governorate_id: 'g1',
          address_center_id: 'c1',
          address_area_id: 'a1',
        } as any,
        driver,
        ctx
      ),
      true
    );

    // Must reject via address_area_id = a2 even if bogus delivery_area_id = a1
    assert.equal(
      evaluateCentralCoverageMatch(
        {
          id: 'ph-2',
          type: 'pharmacy',
          status: 'pending_review',
          address_area_id: 'a2',
          delivery_area_id: 'a1', // ignored on pharmacy orders!
        },
        driver,
        ctx
      ).matched,
      false
    );
  });

  // =========================================================================
  // TEST 6: Financial Fields in PHARMACY_ORDER_SELECT_QUERY & Zero Local Math Fallback
  // =========================================================================
  await test('Test 6 (Fix #6): Selects all stored financial columns and never computes grand_total locally when null', async () => {
    for (const finCol of [
      'medicines_total',
      'delivery_fee',
      'delivery_base_fee',
      'delivery_admin_commission',
      'delivery_driver_net',
      'customer_delivery_fee',
      'grand_total',
    ]) {
      assert.ok(
        PHARMACY_ORDER_SELECT_QUERY.includes(finCol),
        `PHARMACY_ORDER_SELECT_QUERY must include ${finCol}`
      );
    }

    const driver: any = { id: 'drv-p', status: 'approved', is_active: true, driver_type: 'platform' };
    const ctx = {
      governorates: [{ id: 'g1', name: 'الدقهلية', is_active: true }],
      centers: [{ id: 'c1', governorate_id: 'g1', name: 'المنصورة', is_active: true }],
      areas: [{ id: 'a1', governorate_id: 'g1', center_id: 'c1', name: 'توريل', is_active: true }],
      geoLoadState: 'loaded' as const,
      driverAffiliation: 'platform' as const,
      coverageRows: [{ id: 'cov1', driver_id: 'drv-p', area_id: 'a1', is_active: true, source_table: 'delivery_driver_area_coverage' as const }],
      coverageLoadState: 'loaded' as const,
    };

    const mockPhOrdersSb = createMockSupabase({
      onSelect: async (table) => {
        if (table === 'pharmacy_orders') {
          return {
            data: [
              {
                id: 'ph-null-total',
                order_number: 'PH-101',
                status: 'pending_review',
                address_governorate_id: 'g1',
                address_center_id: 'c1',
                address_area_id: 'a1',
                address_governorate_name: 'الدقهلية',
                address_center_name: 'المنصورة',
                address_text: 'شارع الجمهورية',
                address_latitude: 31.044,
                address_longitude: 31.382,
                medicines_total: 120,
                delivery_fee: 19,
                delivery_base_fee: 15,
                delivery_admin_commission: 3,
                delivery_driver_net: 16,
                customer_delivery_fee: 19,
                grand_total: null, // MUST stay null (NO 120+19=139 local fallback!)
                pharmacy_order_items: [],
                pharmacy_delivery_orders: [],
                pharmacy_order_files: [],
                pharmacy_order_pharmacy_stops: [],
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
    });

    const { pharmacyOrdersList } = await (ordersService as any).fetchPharmacyOrdersFromDB(
      mockPhOrdersSb,
      driver.id,
      'الدقهلية',
      'المنصورة',
      driver,
      ctx
    );

    assert.equal(pharmacyOrdersList.length, 1);
    const mapped = pharmacyOrdersList[0];
    assert.equal(mapped.subtotal, 120);
    assert.equal(mapped.deliveryFee, 19);
    assert.equal(mapped.delivery_base_fee, 15);
    assert.equal(mapped.delivery_admin_commission, 3);
    assert.equal(mapped.delivery_driver_net, 16);
    assert.equal(mapped.customer_delivery_fee, 19);
    assert.equal(mapped.total, null, 'grand_total null must NOT fallback to medicinesTotal + deliveryFee');
    assert.equal(mapped.address_area_id, 'a1');
    assert.equal(mapped.address_area_name, 'توريل');
    assert.equal(mapped.customer.latitude, 31.044);
    assert.equal(mapped.customer.longitude, 31.382);
    ordersService.cleanup();
  });

  // =========================================================================
  // TEST 7: Regular delivery_orders Regression Check
  // =========================================================================
  await test('Test 7 (Regression): Regular delivery_orders continue using delivery_*_id cleanly without regression', async () => {
    const driver: any = { id: 'drv-p', status: 'approved', is_active: true, driver_type: 'platform' };
    const ctx = {
      governorates: [{ id: 'g1', name: 'الدقهلية', is_active: true }],
      centers: [{ id: 'c1', governorate_id: 'g1', name: 'المنصورة', is_active: true }],
      areas: [{ id: 'a1', governorate_id: 'g1', center_id: 'c1', name: 'توريل', is_active: true }],
      geoLoadState: 'loaded' as const,
      driverAffiliation: 'platform' as const,
      coverageRows: [{ id: 'cov1', driver_id: 'drv-p', area_id: 'a1', is_active: true, source_table: 'delivery_driver_area_coverage' as const }],
      coverageLoadState: 'loaded' as const,
    };

    const mockRegSb = createMockSupabase({
      onSelect: async (table) => {
        if (table === 'delivery_orders') {
          return {
            data: [
              {
                id: 'reg-1',
                status: 'pending_review',
                governorate_name: 'الدقهلية',
                markaz_name: 'المنصورة',
                detailed_address: 'شارع بورسعيد',
                delivery_governorate_id: 'g1',
                delivery_center_id: 'c1',
                delivery_area_id: 'a1',
                subtotal: 250,
                delivery_fee: 22,
                delivery_driver_net: 18,
                delivery_admin_commission: 4,
                total_amount: 272,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
    });

    const { regularOrdersList } = await (ordersService as any).fetchDeliveryOrdersFromDB(
      mockRegSb,
      driver.id,
      driver,
      ctx
    );
    assert.equal(regularOrdersList.length, 1);
    assert.equal(regularOrdersList[0].delivery_area_id, 'a1');
    assert.equal(regularOrdersList[0].delivery_area_name, 'توريل');
    assert.equal(regularOrdersList[0].driverFee, 18);
    ordersService.cleanup();
  });

  console.log(`\n🎉 All ${passed} targeted verification tests passed!`);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
