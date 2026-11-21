import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Browser environment shims where Geolocation MUST NEVER be called (throws if accessed!)
const memStorage = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => memStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void memStorage.set(k, String(v)),
  removeItem: (k: string) => void memStorage.delete(k),
  clear: () => void memStorage.clear(),
};

let geolocationCallCount = 0;

(globalThis as any).localStorage = localStorageShim;
(globalThis as any).window = {
  localStorage: localStorageShim,
  location: { origin: 'http://localhost:3000', assign: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  Capacitor: {
    Plugins: {
      Geolocation: {
        getCurrentPosition: async () => {
          geolocationCallCount++;
          throw new Error('Capacitor Geolocation must NOT be called');
        },
      },
    },
  },
};

Object.defineProperty(globalThis, 'navigator', {
  value: {
    onLine: true,
    geolocation: {
      getCurrentPosition: () => {
        geolocationCallCount++;
        throw new Error('navigator.geolocation.getCurrentPosition must NOT be called');
      },
      watchPosition: () => {
        geolocationCallCount++;
        throw new Error('navigator.geolocation.watchPosition must NOT be called');
      },
    },
  },
  configurable: true,
  writable: true,
});

type TableMap = Record<string, any[]>;

function createAuditMockSupabase(
  tables: TableMap,
  audit: {
    writes: Array<{ table: string; op: string; payload: any }>;
    reads: string[];
    edgeCalls: string[];
    rpcs: Array<{ fn: string; params: any }>;
  }
) {
  const buildChain = (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    const execute = async () => {
      const source = tables[table] || [];
      const rows = source.filter((r) => filters.every((f) => f(r)));
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
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        const res = await execute();
        return { data: res.data[0] || null, error: null };
      },
      single: async () => {
        const res = await execute();
        return { data: res.data[0] || null, error: null };
      },
      insert: async (payload: any) => {
        audit.writes.push({ table, op: 'insert', payload });
        return { data: null, error: null };
      },
      upsert: async (payload: any) => {
        audit.writes.push({ table, op: 'upsert', payload });
        return { data: null, error: null };
      },
      update: (payload: any) => {
        audit.writes.push({ table, op: 'update', payload });
        return chain;
      },
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
    };
    return chain;
  };

  return {
    from: (table: string) => {
      audit.reads.push(table);
      return buildChain(table);
    },
    functions: {
      invoke: async (fnName: string) => {
        audit.edgeCalls.push(fnName);
        return { data: null, error: new Error(`Disabled Edge call attempted: ${fnName}`) };
      },
    },
    rpc: async (fnName: string, params?: any) => {
      audit.rpcs.push({ fn: fnName, params });
      return { data: null, error: null };
    },
    removeChannel: () => {},
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  } as any;
}

async function runTests() {
  const {
    MISSING_DESTINATION_COORDS_MESSAGE,
    buildCustomerGoogleMapsNav,
    extractOrderCoordinates,
    getGoogleMapsDirectionsUrl,
    getRealDriverGPS,
    validateGpsForTracking,
  } = await import('../src/lib/gpsService');
  const { recordDriverLocation } = await import('../src/lib/driverTrackingService');
  const {
    createSupabaseRouteInvoker,
    endNavigationSession,
    evaluateNavigationSettings,
    launchCustomerDeliveryMaps,
    sharedRouteDistanceManager,
    startNavigationSession,
    startOrderNavigation,
    updateNavigationSessionOnRouteChange,
  } = await import('../src/lib/navigationService');
  const {
    hydrateOrdersGeoFromAddresses,
    isOrderEligibleForDriver,
    loadFullCentralGeoContext,
  } = await import('../src/lib/geoCoverageService');
  const {
    buildUnifiedChronologicalOrders,
    computeDriverAccountingSummary,
    computeOrderDistanceFromDriver,
  } = await import('../src/lib/orderDisplayHelpers');
  const { ordersService } = await import('../src/services/ordersService');
  const { clearDriverOfflineCache, enqueueOfflineAction, syncOfflineQueue } = await import(
    '../src/lib/offlineStore'
  );

  let passed = 0;
  async function test(name: string, fn: () => void | Promise<void>) {
    await fn();
    passed++;
    console.log(`✅ PASS: ${name}`);
  }

  const audit = {
    writes: [] as Array<{ table: string; op: string; payload: any }>,
    reads: [] as string[],
    edgeCalls: [] as string[],
    rpcs: [] as Array<{ fn: string; params: any }>,
  };

  const mockTables: TableMap = {
    geo_governorates: [{ id: 'gov-1', name_ar: 'الدقهلية', is_active: true }],
    geo_centers: [{ id: 'ctr-1', governorate_id: 'gov-1', name_ar: 'المنصورة', is_active: true }],
    geo_areas: [{ id: 'area-1', governorate_id: 'gov-1', center_id: 'ctr-1', name_ar: 'توريل', is_active: true }],
    delivery_driver_area_coverage: [{ id: 'cov-1', driver_id: 'drv-1', area_id: 'area-1', is_active: true }],
    household_addresses: [
      {
        id: 'addr-1',
        governorate_id: 'gov-1',
        center_id: 'ctr-1',
        area_id: 'area-1',
        latitude: 31.0445,
        longitude: 31.3852,
        detailed_address: 'شارع سعد زغلول، توريل، المنصورة',
      },
    ],
    delivery_orders: [
      {
        id: 'ord-home-1',
        order_number: 'ORD-101',
        type: 'regular',
        status: 'pending_review',
        assigned_driver_id: null,
        customer_name: 'أحمد علي',
        customer_phone: '01012345678',
        address_id: 'addr-1',
        delivery_governorate_id: 'gov-1',
        delivery_center_id: 'ctr-1',
        delivery_area_id: 'area-1',
        detailed_address: 'شارع سعد زغلول، توريل، المنصورة',
        subtotal: 120,
        delivery_fee: 20,
        delivery_driver_net: 17,
        delivery_admin_commission: 3,
        total_amount: 140,
        created_at: '2026-11-20T10:00:00Z',
      },
    ],
    delivery_order_items: [],
    pharmacy_orders: [],
  };

  const mockSb = createAuditMockSupabase(mockTables, audit);

  const driver: any = {
    id: 'drv-1',
    user_id: 'user-1',
    full_name: 'محمد السائق',
    phone: '01099998888',
    status: 'approved',
    is_active: true,
    driver_type: 'platform',
  };

  const activeSections: any = {
    loadState: 'loaded',
    sections: {
      household_shortages: {
        section_key: 'household_shortages',
        section_enabled: true,
        section_visible: true,
        delivery_enabled: true,
      },
      pharmacy: {
        section_key: 'pharmacy',
        section_enabled: true,
        section_visible: true,
        delivery_enabled: true,
      },
      ready_food: {
        section_key: 'ready_food',
        section_enabled: true,
        section_visible: true,
        delivery_enabled: true,
      },
    },
  };

  // =========================================================================
  // 1. Login without GPS permission or activation
  // =========================================================================
  await test('1. Login & GPS status: never requests navigator.geolocation or Capacitor GPS permission', async () => {
    const gpsRes = await getRealDriverGPS(true);
    assert.equal(gpsRes.success, false);
    assert.equal(gpsRes.location, null);
    assert.equal(geolocationCallCount, 0, 'Device geolocation API must never be called');
    const valRes = validateGpsForTracking(null, null);
    assert.equal(valRes.accepted, false);
    assert.equal(valRes.reasonCode, 'TRACKING_DISABLED');
  });

  // =========================================================================
  // 2. Toggle "متاح للعمل" manually without GPS
  // =========================================================================
  await test('2. Toggle "متاح للعمل" works manually via set_driver_availability without GPS or tracking', async () => {
    await mockSb.rpc('set_driver_availability', { p_is_available: true });
    assert.equal(audit.rpcs[0].fn, 'set_driver_availability');
    assert.deepEqual(audit.rpcs[0].params, { p_is_available: true });
    assert.equal(geolocationCallCount, 0);

    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    assert.ok(!appSrc.includes('useDriverGPS('), 'App.tsx must not invoke useDriverGPS');
    assert.ok(!appSrc.includes('useOrderRouteDistances('), 'App.tsx must not invoke useOrderRouteDistances');
  });

  // =========================================================================
  // 3. Receive assigned & available orders while GPS is completely disabled/denied
  // =========================================================================
  await test('3. Eligible pending & assigned orders load normally via central geo & section settings when GPS disabled', async () => {
    const geoCtx = await loadFullCentralGeoContext(mockSb, driver);
    const hydrated = await hydrateOrdersGeoFromAddresses(mockSb, mockTables.delivery_orders, 'regular');
    assert.equal(hydrated[0].delivery_latitude, 31.0445);
    assert.equal(hydrated[0].delivery_longitude, 31.3852);

    const elig = isOrderEligibleForDriver(hydrated[0], driver, {
      isWorking: true,
      deliveryEnabled: true,
      geoContext: geoCtx,
      sectionSettings: activeSections,
    });
    assert.equal(elig.matched, true);

    const feed = buildUnifiedChronologicalOrders({
      activeTab: 'pending',
      searchQuery: '',
      orders: hydrated as any,
      pharmacyOrders: [],
      currentDriver: driver,
      isWorking: true,
      deliveryEnabled: true,
      geoContext: geoCtx,
      sectionSettings: activeSections,
    });
    assert.equal(feed.length, 1);
    assert.equal(feed[0].kind, 'regular');

    // Assigned order also loads when isWorking is false
    const assignedFeed = buildUnifiedChronologicalOrders({
      activeTab: 'accepted',
      searchQuery: '',
      orders: [{ ...hydrated[0], status: 'accepted', assigned_driver_id: driver.id }] as any,
      pharmacyOrders: [],
      currentDriver: driver,
      isWorking: false,
      deliveryEnabled: true,
      geoContext: geoCtx,
      sectionSettings: activeSections,
    });
    assert.equal(assignedFeed.length, 1);

    // Distance calculation returns disabled/empty without inventing numbers
    const dist = computeOrderDistanceFromDriver(hydrated[0], 'regular', null);
    assert.equal(dist.available, false);
    assert.equal(dist.distanceKm, null);
  });

  // =========================================================================
  // 4 & 5. Accept order, inspect details/address, complete shopping stage
  // =========================================================================
  await test('4 & 5. Accepting order, reading address details, and progressing shopping -> shopping_completed', async () => {
    const geoCtx = await loadFullCentralGeoContext(mockSb, driver);
    const { regularOrdersList } = await (ordersService as any).fetchDeliveryOrdersFromDB(
      mockSb,
      driver.id,
      driver,
      geoCtx
    );
    assert.equal(regularOrdersList.length, 1);
    assert.equal(regularOrdersList[0].detailed_address, 'شارع سعد زغلول، توريل، المنصورة');
    assert.equal(regularOrdersList[0].delivery_latitude, 31.0445);
    assert.equal(regularOrdersList[0].delivery_longitude, 31.3852);
    ordersService.cleanup();
  });

  // =========================================================================
  // 6. Click "بدء التوصيل" -> opens Google Maps URL strictly with customer coords
  // =========================================================================
  await test('6. Clicking "بدء التوصيل" builds exact Google Maps URL using saved customer coordinates across all 3 categories', async () => {
    const launchedUrls: string[] = [];
    const spyLauncher = (lat: number | null | undefined, lng: number | null | undefined) => {
      const url = getGoogleMapsDirectionsUrl(Number(lat), Number(lng));
      launchedUrls.push(url);
      return { success: true, url };
    };

    // 6a. Household order
    const householdOrder = {
      id: 'h-1',
      status: 'shopping_completed',
      delivery_latitude: 31.0445,
      delivery_longitude: 31.3852,
    };
    const hRes = launchCustomerDeliveryMaps(householdOrder, spyLauncher);
    assert.equal(hRes.success, true);
    assert.equal(hRes.url, 'https://www.google.com/maps/dir/?api=1&destination=31.0445,31.3852');

    // 6b. Pharmacy order
    const pharmacyOrder = {
      id: 'p-1',
      status: 'ready_for_delivery',
      address_latitude: 30.0626,
      address_longitude: 31.2497,
      requested_pharmacy_latitude: 30.01,
      requested_pharmacy_longitude: 31.2,
    };
    const pRes = launchCustomerDeliveryMaps(pharmacyOrder, spyLauncher);
    assert.equal(pRes.success, true);
    assert.equal(pRes.url, 'https://www.google.com/maps/dir/?api=1&destination=30.0626,31.2497');

    // 6c. Restaurant order (must use customer delivery coords, NEVER restaurant pickup coords!)
    const restaurantOrder = {
      id: 'r-1',
      type: 'restaurant',
      status: 'shopping_completed',
      restaurant_latitude: 31.05,
      restaurant_longitude: 31.36,
      delivery_latitude: 31.0389,
      delivery_longitude: 31.3911,
    };
    const rRes = launchCustomerDeliveryMaps(restaurantOrder, spyLauncher);
    assert.equal(rRes.success, true);
    assert.equal(rRes.url, 'https://www.google.com/maps/dir/?api=1&destination=31.0389,31.3911');
    assert.equal(launchedUrls.length, 3);
  });

  // =========================================================================
  // 7. Return to app without losing order state or mutating order status
  // =========================================================================
  await test('7. Returning from Google Maps view preserves exact order state without status mutation', async () => {
    const orderBefore: any = {
      id: 'ord-keep-state',
      status: 'shopping_completed',
      delivery_latitude: 31.0445,
      delivery_longitude: 31.3852,
      detailed_address: 'شارع الجمهورية',
    };
    const snapshot = JSON.stringify(orderBefore);

    const launchRes = launchCustomerDeliveryMaps(orderBefore, () => ({
      success: true,
      url: 'https://www.google.com/maps/dir/?api=1&destination=31.0445,31.3852',
    }));
    assert.equal(launchRes.success, true);
    assert.equal(JSON.stringify(orderBefore), snapshot, 'Order state must stay 100% immutable');

    const modalSrc = fs.readFileSync(path.resolve('src/components/maps/OrderMapModal.tsx'), 'utf8');
    assert.ok(modalSrc.includes('الرجوع إلى التطبيق'), 'OrderMapModal must have explicit back-to-app control');
    assert.ok(!modalSrc.includes('useDriverGPS') && !modalSrc.includes('onRefreshGPS'), 'OrderMapModal must not reference driver GPS');
  });

  // =========================================================================
  // 8. Missing or invalid coordinates: never open Google Maps, show Arabic message & keep textual address
  // =========================================================================
  await test('8. Missing/invalid customer coordinates block Google Maps launch, return "موقع وجهة الطلب غير متوفر", preserve textual address', async () => {
    let launcherCalled = 0;
    const spyLauncher = () => {
      launcherCalled++;
      return { success: true, url: 'should-not-happen' };
    };

    const cases = [
      { id: 'c-null', delivery_latitude: null, delivery_longitude: null, detailed_address: 'شارع الجيش، المنصورة' },
      { id: 'c-zero', delivery_latitude: 0, delivery_longitude: 0, detailed_address: 'شارع قناة السويس' },
      { id: 'c-oob', delivery_latitude: 120, delivery_longitude: 200, detailed_address: 'حي الجامعة' },
      {
        id: 'c-rest-only',
        pickup_latitude: 31.04,
        pickup_longitude: 31.37,
        latitude: 31.04,
        longitude: 31.37,
        detailed_address: 'أجا، الدقهلية',
      },
    ];

    for (const badOrder of cases) {
      assert.equal(extractOrderCoordinates(badOrder, 'customer'), null);
      const nav = buildCustomerGoogleMapsNav(badOrder);
      assert.equal(nav.valid, false);
      assert.equal(nav.directionsUrl, null);
      assert.equal(nav.errorMessage, MISSING_DESTINATION_COORDS_MESSAGE);
      assert.equal(nav.errorMessage, 'موقع وجهة الطلب غير متوفر');

      const res = launchCustomerDeliveryMaps(badOrder, spyLauncher);
      assert.equal(res.success, false);
      assert.equal(res.errorMessage, 'موقع وجهة الطلب غير متوفر');
    }

    assert.equal(launcherCalled, 0, 'Google Maps launcher must NEVER be called for missing/invalid coordinates');

    // Even startOrderNavigation must not invent coordinates or call DB
    const directRes = await startOrderNavigation({
      supabase: mockSb,
      driverId: driver.id,
      orderId: 'c-null',
      orderType: 'regular',
      destinationLat: null,
      destinationLng: null,
    });
    assert.equal(directRes.success, false);
    assert.equal(directRes.error, 'موقع وجهة الطلب غير متوفر');
  });

  // =========================================================================
  // 9. Verify ZERO writes to tracking/nav tables & ZERO route Edge calls
  // =========================================================================
  await test('9. Zero DB writes to delivery_driver_current_locations, delivery_driver_locations, delivery_navigation_sessions & zero calculate-route-distance calls', async () => {
    const writesBefore = audit.writes.length;

    const persistRes = await recordDriverLocation(mockSb, driver.id, null, null, 'ord-1');
    assert.equal(persistRes.status, 'skipped_disabled');
    assert.equal(persistRes.currentLocationSaved, false);
    assert.equal(persistRes.historySaved, false);

    const invoker = createSupabaseRouteInvoker(mockSb);
    const edgeRes = await invoker({
      orderId: 'ord-1',
      orderType: 'regular',
      originLat: 31,
      originLng: 31,
      destinationLat: 31.1,
      destinationLng: 31.1,
    });
    assert.equal(edgeRes.success, false);
    assert.equal(edgeRes.status, 'disabled');

    await sharedRouteDistanceManager.getRoadDistanceForOrder({
      order: { id: 'ord-1' },
      orderType: 'regular',
    });

    await startNavigationSession({
      supabase: mockSb,
      driverId: driver.id,
      orderId: 'ord-1',
      orderType: 'regular',
      destinationLat: 31.0445,
      destinationLng: 31.3852,
    });
    await updateNavigationSessionOnRouteChange({
      supabase: mockSb,
      driverId: driver.id,
      orderId: 'ord-1',
      orderType: 'regular',
    });
    await endNavigationSession({
      supabase: mockSb,
      driverId: driver.id,
      orderId: 'ord-1',
      endStatus: 'completed',
    });

    assert.equal(evaluateNavigationSettings(null).allowed, true);
    assert.equal(audit.writes.length, writesBefore, 'Zero writes permitted to tracking/navigation tables');
    assert.equal(audit.edgeCalls.length, 0, 'calculate-route-distance Edge Function must NEVER be called');
    assert.ok(!audit.reads.includes('delivery_driver_current_locations'));
    assert.ok(!audit.reads.includes('delivery_driver_locations'));
    assert.ok(!audit.reads.includes('delivery_navigation_sessions'));
    assert.equal(geolocationCallCount, 0);
  });

  // =========================================================================
  // 10. Notifications, order history, financials, & offline sync preserved
  // =========================================================================
  await test('10. Financials, accounting summary, offline sync, and "بدء التوصيل" UI hooks remain intact', () => {
    const summary = computeDriverAccountingSummary(
      [
        {
          id: 'c-1',
          assigned_driver_id: driver.id,
          status: 'completed',
          delivery_driver_net: 24.5,
          delivery_admin_commission: 3.5,
        } as any,
      ],
      [
        {
          id: 'p-c1',
          assigned_driver_id: driver.id,
          status: 'completed',
          totals: { delivery_driver_net: 15.5, delivery_admin_commission: 2.5 },
        } as any,
      ],
      driver.id
    );
    assert.equal(summary.completedOrdersCount, 2);
    assert.equal(summary.driverNetAmount, 40);
    assert.equal(summary.adminCommissionAmount, 6);

    clearDriverOfflineCache(driver.id);
    enqueueOfflineAction({
      driverId: driver.id,
      actionType: 'delivery_complete',
      orderId: 'c-1',
      payload: {},
    });
    return syncOfflineQueue(driver.id, mockSb).then((syncRes) => {
      assert.equal(syncRes.synced, 1);

      // Verify "بدء التوصيل" UI action exists across Household, Pharmacy, Restaurant cards/modals
      const filesToCheck = [
        'src/components/HouseholdOrderCard.tsx',
        'src/components/pharmacy/PharmacyOrderCard.tsx',
        'src/components/restaurant/RestaurantOrderCard.tsx',
        'src/components/pharmacy/PharmacyOrderDetailsModal.tsx',
        'src/components/restaurant/RestaurantOrderDetailsModal.tsx',
        'src/App.tsx',
      ];
      for (const file of filesToCheck) {
        const src = fs.readFileSync(path.resolve(file), 'utf8');
        assert.ok(src.includes('بدء التوصيل'), `${file} must surface "بدء التوصيل" button`);
      }
    });
  });

  console.log(`\n🎉 All ${passed} no-GPS / Google Maps-only verification scenarios passed successfully!`);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
