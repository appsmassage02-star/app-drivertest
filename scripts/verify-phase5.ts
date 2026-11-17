import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Minimal global shims BEFORE importing browser-targeting modules
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

// 1x1 transparent WebP data URL (valid Base64)
const VALID_SAMPLE_DATA_URL =
  'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

async function runTests() {
  const {
    isRestaurantOrder,
    isOrderDeliveredByRestaurant,
    isTalabatyDeliveryResponsibility,
    isRestaurantOrderForDriver,
    computeRestaurantFinancials,
    checkRestaurantRpcCompatibility,
  } = await import('../src/lib/restaurantService');

  const {
    isValidCoordinate,
    extractOrderCoordinates,
    getRealDriverGPS,
    getGoogleMapsDirectionsUrl,
    openExternalNavigation,
  } = await import('../src/lib/gpsService');

  const { pharmacyService } = await import('../src/lib/pharmacyService');

  let passed = 0;
  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        console.log(`✅ PASS: ${name}`);
      });
  }

  // =========================================================================
  // SECTION A: Fix #1 — Pharmacy Receipt Upload Guardrails
  // =========================================================================
  await test('Pharmacy Fix #1a: upload failure stops immediately, never calls RPC, never updates table directly', async () => {
    const rpcCalls: string[] = [];
    const directUpdates: string[] = [];

    const mockSupabase: any = {
      storage: {
        from: () => ({
          upload: async () => ({ error: { message: 'Storage quota or RLS denied' } }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
      rpc: async (fnName: string) => {
        rpcCalls.push(fnName);
        return { error: null };
      },
      from: (table: string) => ({
        update: () => {
          directUpdates.push(table);
          return { eq: async () => ({ error: null }) };
        },
      }),
    };

    const repo = Object.create(Object.getPrototypeOf(pharmacyService)) as typeof pharmacyService & {
      getSupabaseOrThrow: () => any;
      fetchOrderOrThrow: (orderId: string) => Promise<any>;
    };
    repo.getSupabaseOrThrow = () => mockSupabase;
    repo.fetchOrderOrThrow = async (orderId: string) => ({
      id: orderId,
      status: 'shopping',
      totals: { delivery_fee: 10 },
      items: [],
    });

    await assert.rejects(
      () => repo.saveReceiptImage('ord-ph-1', VALID_SAMPLE_DATA_URL),
      /فشل رفع صورة الفاتورة إلى مساحة التخزين/
    );

    assert.equal(rpcCalls.length, 0, 'Must NEVER call pharmacy_driver_add_receipt when Storage upload fails');
    assert.equal(directUpdates.length, 0, 'Must NEVER fall back to direct table update');
  });

  await test('Pharmacy Fix #1b: never passes Data URL or Base64 to pharmacy_driver_add_receipt', async () => {
    const rpcPayloads: any[] = [];

    const mockSupabase: any = {
      storage: {
        from: (bucket: string) => ({
          upload: async () => {
            if (bucket === 'pharmacy') return { error: null };
            return { error: { message: 'not needed' } };
          },
          getPublicUrl: (pathStr: string) => ({
            data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/pharmacy/${pathStr}` },
          }),
        }),
      },
      rpc: async (fnName: string, params: any) => {
        rpcPayloads.push({ fnName, params });
        return { error: null };
      },
    };

    const repo = Object.create(Object.getPrototypeOf(pharmacyService)) as typeof pharmacyService & {
      getSupabaseOrThrow: () => any;
      fetchOrderOrThrow: (orderId: string) => Promise<any>;
    };
    repo.getSupabaseOrThrow = () => mockSupabase;
    repo.fetchOrderOrThrow = async (orderId: string) => ({
      id: orderId,
      status: 'shopping',
      totals: { delivery_fee: 10 },
      items: [],
    });

    await repo.saveReceiptImage('ord-ph-2', VALID_SAMPLE_DATA_URL);

    assert.equal(rpcPayloads.length, 1);
    assert.equal(rpcPayloads[0].fnName, 'pharmacy_driver_add_receipt');
    assert.ok(rpcPayloads[0].params.p_storage_path.startsWith('https://'));
    assert.ok(!rpcPayloads[0].params.p_storage_path.startsWith('data:'));
    assert.ok(!rpcPayloads[0].params.p_storage_path.includes(';base64,'));
  });

  // =========================================================================
  // SECTION B: Fix #2 — Unify Restaurant Acceptance Statuses
  // =========================================================================
  await test('Restaurant Fix #2: status "new" is rejected by compatibility/acceptance and absent in UI acceptance triggers', () => {
    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const cardSrc = fs.readFileSync(path.resolve('src/components/restaurant/RestaurantOrderCard.tsx'), 'utf8');
    const modalSrc = fs.readFileSync(
      path.resolve('src/components/restaurant/RestaurantOrderDetailsModal.tsx'),
      'utf8'
    );

    assert.ok(!appSrc.includes("o.status === 'new'"), 'App.tsx must not match status === new');
    assert.ok(!cardSrc.includes("status === 'new'"), 'RestaurantOrderCard must not match status === new');
    assert.ok(!modalSrc.includes("status === 'new'"), 'RestaurantOrderDetailsModal must not match status === new');

    const resNew = checkRestaurantRpcCompatibility(
      {
        id: 'r-new',
        type: 'restaurant',
        delivery_by: 'talabaty',
        status: 'new',
        restaurant_rpc_verified: true,
      },
      'accept_delivery_order'
    );
    assert.equal(resNew.compatible, false);
    assert.equal(resNew.blockerCode, 'INVALID_ORDER_STATUS');
  });

  // =========================================================================
  // SECTION C: Fix #3 — Strict Restaurant Classification (No Name Guessing)
  // =========================================================================
  await test('Restaurant Fix #3: store names / keywords alone NEVER classify an order as restaurant', () => {
    assert.equal(
      isRestaurantOrder({
        id: 'home-1',
        household_name: 'مطعم ومشويات البركة',
        store_name: 'Pizza Cafe Restaurant',
        customer_notes: 'طلب من مطعم السعادة',
      }),
      false
    );
    assert.equal(
      isRestaurantOrder({
        id: 'home-2',
        store: { name: 'Burger Food Corner' },
        type: 'regular',
      }),
      false
    );
    assert.equal(isRestaurantOrder({ id: 'rest-1', type: 'restaurant' }), true);
    assert.equal(isRestaurantOrder({ id: 'rest-2', order_type: 'restaurant' }), true);
    assert.equal(isRestaurantOrder({ id: 'rest-3', category: 'restaurant' }), true);
    assert.equal(isRestaurantOrder({ id: 'rest-4', restaurant_id: 'uuid-r1' }), true);
    assert.equal(isRestaurantOrder({ id: 'rest-5', restaurant: { id: 'uuid-r2' } }), true);
  });

  // =========================================================================
  // SECTION D: Fix #4 — Fail-Closed Talabaty Delivery Responsibility
  // =========================================================================
  await test('Restaurant Fix #4: missing, self-delivery, or conflicting routing fails closed', () => {
    // Missing routing data MUST return false
    assert.equal(
      isTalabatyDeliveryResponsibility({ id: 'r-missing', type: 'restaurant' }),
      false
    );
    // Self-delivery returns false
    assert.equal(isOrderDeliveredByRestaurant({ delivery_by: 'restaurant' }), true);
    assert.equal(
      isTalabatyDeliveryResponsibility({ id: 'r-self', type: 'restaurant', delivery_by: 'restaurant' }),
      false
    );
    // Conflicting routing returns false
    assert.equal(
      isTalabatyDeliveryResponsibility({
        id: 'r-conflict-1',
        type: 'restaurant',
        delivery_by: 'talabaty',
        store: { delivery_by: 'restaurant' },
      }),
      false
    );
    assert.equal(
      isTalabatyDeliveryResponsibility({
        id: 'r-conflict-2',
        type: 'restaurant',
        delivery_by: 'talabaty',
        delivery_provider: 'unknown_courier',
      }),
      false
    );
    // Explicit Talabaty routing returns true
    assert.equal(
      isRestaurantOrderForDriver({ id: 'r-ok', type: 'restaurant', delivery_by: 'talabaty' }, 'drv-1'),
      true
    );
    // Already assigned to this driver without conflicting/self-delivery markers returns true
    assert.equal(
      isRestaurantOrderForDriver(
        { id: 'r-assigned', type: 'restaurant', assigned_driver_id: 'drv-1' },
        'drv-1'
      ),
      true
    );
  });

  // =========================================================================
  // SECTION E: Fix #5 — Authentic Restaurant Financials (No Hardcoded 15)
  // =========================================================================
  await test('Restaurant Fix #5: never uses hardcoded 15 fallback or subtraction for delivery fee/subtotal', () => {
    const emptyFin = computeRestaurantFinancials({ id: 'f-1' });
    assert.equal(emptyFin.deliveryFee, null);
    assert.equal(emptyFin.subtotal, null);
    assert.equal(emptyFin.totalAmount, null);
    assert.equal(emptyFin.hasIncompletePricing, true);

    const noFeeFin = computeRestaurantFinancials({ id: 'f-2', total_amount: 100 });
    assert.equal(noFeeFin.deliveryFee, null, 'Must never default delivery_fee to 15');
    assert.equal(noFeeFin.subtotal, null, 'Must never compute totalAmount - 15');
    assert.equal(noFeeFin.totalAmount, 100);
    assert.equal(noFeeFin.hasIncompletePricing, true);

    const realFin = computeRestaurantFinancials({
      id: 'f-3',
      subtotal: 120,
      delivery_fee: 22.5,
      total_amount: 142.5,
    });
    assert.equal(realFin.subtotal, 120);
    assert.equal(realFin.deliveryFee, 22.5);
    assert.equal(realFin.totalAmount, 142.5);
    assert.equal(realFin.hasIncompletePricing, false);
  });

  // =========================================================================
  // SECTION F: Fix #6 — RPC Compatibility Guardrails for Restaurant Orders
  // =========================================================================
  await test('Restaurant Fix #6: blocks all 6 Home RPCs unless server-side restaurant compatibility is verified', () => {
    const allSixRpcs = [
      { rpc: 'accept_delivery_order', status: 'pending_review' },
      { rpc: 'driver_start_shopping', status: 'accepted' },
      { rpc: 'driver_update_delivery_item', status: 'shopping' },
      { rpc: 'driver_complete_shopping', status: 'shopping' },
      { rpc: 'complete_delivery_order', status: 'shopping_completed' },
      { rpc: 'request_order_cancellation', status: 'accepted' },
    ] as const;

    for (const entry of allSixRpcs) {
      const blocked = checkRestaurantRpcCompatibility(
        {
          id: 'r-unverified',
          type: 'restaurant',
          delivery_by: 'talabaty',
          status: entry.status,
          assigned_driver_id: 'drv-1',
        },
        entry.rpc,
        'drv-1'
      );
      assert.equal(blocked.compatible, false);
      assert.equal(blocked.blockerCode, 'RPC_COMPATIBILITY_UNPROVEN');

      const allowedWhenVerified = checkRestaurantRpcCompatibility(
        {
          id: 'r-verified',
          type: 'restaurant',
          delivery_by: 'talabaty',
          status: entry.status,
          assigned_driver_id: 'drv-1',
          restaurant_rpc_verified: true,
        },
        entry.rpc,
        'drv-1'
      );
      assert.equal(allowedWhenVerified.compatible, true);
    }
  });

  // =========================================================================
  // SECTION G: Phase 5 — Real GPS, Coordinates & Navigation Without Mutating Status
  // =========================================================================
  await test('Phase 5 GPS: handles success, permission denied, unavailable, timeout with ZERO fake/Cairo coords', async () => {
    const setNav = (val: any) =>
      Object.defineProperty(globalThis, 'navigator', {
        value: val,
        configurable: true,
        writable: true,
      });

    // 1. Success
    setNav({
      onLine: true,
      geolocation: {
        getCurrentPosition: (ok: Function) =>
          ok({
            coords: { latitude: 31.0409, longitude: 31.3785, accuracy: 12, altitude: null, speed: null, heading: null },
            timestamp: 1700000000000,
          }),
      },
    });
    const okRes = await getRealDriverGPS();
    assert.equal(okRes.success, true);
    assert.equal(okRes.status, 'granted');
    assert.equal(okRes.location?.latitude, 31.0409);
    assert.equal(okRes.location?.longitude, 31.3785);

    // 2. Denied (code 1)
    setNav({
      onLine: true,
      geolocation: {
        getCurrentPosition: (_ok: Function, err: Function) => err({ code: 1 }),
      },
    });
    const deniedRes = await getRealDriverGPS();
    assert.equal(deniedRes.success, false);
    assert.equal(deniedRes.status, 'denied');
    assert.equal(deniedRes.location, null);

    // 3. Unavailable (code 2)
    setNav({
      onLine: true,
      geolocation: {
        getCurrentPosition: (_ok: Function, err: Function) => err({ code: 2 }),
      },
    });
    const unavailRes = await getRealDriverGPS();
    assert.equal(unavailRes.success, false);
    assert.equal(unavailRes.status, 'unavailable');
    assert.equal(unavailRes.location, null);

    // 4. Timeout (code 3)
    setNav({
      onLine: true,
      geolocation: {
        getCurrentPosition: (_ok: Function, err: Function) => err({ code: 3 }),
      },
    });
    const timeoutRes = await getRealDriverGPS();
    assert.equal(timeoutRes.success, false);
    assert.equal(timeoutRes.status, 'timeout');
    assert.equal(timeoutRes.location, null);

    // 5. Unsupported (no geolocation)
    setNav({ onLine: true });
    const unsuppRes = await getRealDriverGPS();
    assert.equal(unsuppRes.success, false);
    assert.equal(unsuppRes.status, 'unsupported');
    assert.equal(unsuppRes.location, null);
  });

  await test('Phase 5 Coordinates & Navigation: validates coords, builds Google Maps URL, never alters order status', () => {
    assert.equal(isValidCoordinate(0, 0), false);
    assert.equal(isValidCoordinate(null, null), false);
    assert.equal(isValidCoordinate(95, 31), false);
    assert.equal(isValidCoordinate(31.0409, 31.3785), true);

    const restOrder = {
      id: 'ord-geo-1',
      status: 'accepted',
      restaurant_latitude: 31.041,
      restaurant_longitude: 31.379,
      address_latitude: 31.052,
      address_longitude: 31.391,
    };
    assert.deepEqual(extractOrderCoordinates(restOrder, 'restaurant'), {
      latitude: 31.041,
      longitude: 31.379,
    });
    assert.deepEqual(extractOrderCoordinates(restOrder, 'customer'), {
      latitude: 31.052,
      longitude: 31.391,
    });

    const phOrder = {
      id: 'ord-geo-2',
      requested_pharmacy_latitude: 31.035,
      requested_pharmacy_longitude: 31.365,
      address_latitude: 0,
      address_longitude: 0,
    };
    assert.deepEqual(extractOrderCoordinates(phOrder, 'pharmacy'), {
      latitude: 31.035,
      longitude: 31.365,
    });
    assert.equal(extractOrderCoordinates(phOrder, 'customer'), null);

    const badNav = openExternalNavigation(0, 0);
    assert.equal(badNav.success, false);

    const navRes = openExternalNavigation(31.041, 31.379, 'مطعم الاختبار');
    assert.equal(navRes.success, true);
    assert.equal(navRes.url, getGoogleMapsDirectionsUrl(31.041, 31.379));
    assert.equal(restOrder.status, 'accepted', 'Opening navigation must NEVER modify order status');
  });

  console.log(`\n🎉 All ${passed} verification tests passed successfully.`);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Verification test failed:', err);
  process.exit(1);
});
