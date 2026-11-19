import test from 'node:test';
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

import {
  createEmptyCentralGeoContext,
  doesCoverageServiceMatch,
  evaluateCentralCoverageMatch,
  getOrderServiceCategory,
  hydrateOrdersGeoFromAddresses,
  isOrderEligibleForDriver,
  isUsableCentralGeoContext,
  loadFullCentralGeoContext,
} from '../src/lib/geoCoverageService';
import {
  createEmptyAppSectionSettingsState,
  resolveOrderSectionKey,
} from '../src/lib/sectionSettingsService';
import { isPharmacyOrderMatchingDriverTerritory } from '../src/lib/pharmacyService';
import { buildUnifiedChronologicalOrders } from '../src/lib/orderDisplayHelpers';
import { ordersService } from '../src/services/ordersService';
import type { AppSectionSettingsState, CentralGeoContext, DeliveryDriver } from '../src/types';

function createMockSupabase(tables: Record<string, any[]>) {
  const buildChain = (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    let rowLimit: number | null = null;

    const execute = async () => {
      const source = tables[table] || [];
      let rows = source.filter((r) => filters.every((f) => f(r)));
      if (rowLimit !== null) rows = rows.slice(0, rowLimit);
      return { data: rows, error: null };
    };

    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => {
        filters.push((r) => String(r?.[col]) === String(val));
        return chain;
      },
      in: (col: string, vals: any[]) => {
        const set = new Set((vals || []).map((v) => String(v)));
        filters.push((r) => set.has(String(r?.[col])));
        return chain;
      },
      order: () => chain,
      limit: (n: number) => {
        rowLimit = n;
        return chain;
      },
      maybeSingle: async () => {
        const res = await execute();
        return { data: res.data[0] || null, error: null };
      },
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
    };
    return chain;
  };

  return {
    from: (table: string) => buildChain(table),
    removeChannel: () => {},
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
  } as any;
}

const approvedDriver: DeliveryDriver = {
  id: 'drv-vis-1',
  user_id: 'usr-vis-1',
  full_name: 'محمد علي',
  phone: '01012345678',
  is_active: true,
  vehicle_type: 'motorcycle',
  notes: null,
  role: 'delivery_driver',
  status: 'approved',
  governorate_name: 'القاهرة',
  governorate_code: 'CAI',
  markaz_name: 'المعادي',
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

function makeSections(overrides?: Partial<Record<'household_shortages' | 'pharmacy' | 'ready_food', boolean>>): AppSectionSettingsState {
  const state = createEmptyAppSectionSettingsState('loaded');
  (['household_shortages', 'pharmacy', 'ready_food'] as const).forEach((k) => {
    const enabled = overrides?.[k] ?? true;
    state.sections[k] = {
      section_key: k,
      label_ar: k,
      short_label_ar: k,
      section_enabled: enabled,
      section_visible: true,
      delivery_enabled: enabled,
      load_state: 'loaded',
      error_message: null,
      updated_at: '2026-11-18T10:00:00Z',
      raw_record: null,
    };
  });
  return state;
}

test('doesCoverageServiceMatch supports canonical household_shortages / pharmacy / ready_food aliases & comma lists', () => {
  assert.equal(doesCoverageServiceMatch('household_shortages', 'regular'), true);
  assert.equal(doesCoverageServiceMatch('household_orders', 'regular'), true);
  assert.equal(doesCoverageServiceMatch('shortages', 'regular'), true);
  assert.equal(doesCoverageServiceMatch('household_shortages,pharmacy', 'regular'), true);
  assert.equal(doesCoverageServiceMatch('household_shortages,pharmacy', 'pharmacy'), true);
  assert.equal(doesCoverageServiceMatch(['pharmacy_orders'], 'pharmacy'), true);
  assert.equal(doesCoverageServiceMatch('ready_food', 'restaurant'), true);
  assert.equal(doesCoverageServiceMatch('pharmacy', 'regular'), false);
  assert.equal(doesCoverageServiceMatch('household_shortages', 'pharmacy'), false);
});

test('resolveOrderSectionKey & getOrderServiceCategory never misclassify DeliveryOrder with null pharmacy keys as pharmacy', () => {
  const householdOrderWithNullPharmacyKeys = {
    id: 'ord-home-nulls',
    type: undefined,
    status: 'pending_review',
    delivery_governorate_id: 'gov-dkh',
    delivery_center_id: 'ctr-mans',
    delivery_area_id: 'area-toriel',
    prescription_title: null,
    requested_pharmacy_id: null,
    pharmacy_selection_mode: null,
    address_governorate_id: null,
  };

  assert.equal(resolveOrderSectionKey(householdOrderWithNullPharmacyKeys), 'household_shortages');
  assert.equal(getOrderServiceCategory(householdOrderWithNullPharmacyKeys), 'regular');

  const regularTypedWithAddressCols = {
    id: 'ord-home-typed',
    type: 'regular',
    status: 'pending_review',
    delivery_area_id: 'area-toriel',
    address_governorate_id: 'gov-dkh',
    address_governorate_name: 'الدقهلية',
  };
  assert.equal(resolveOrderSectionKey(regularTypedWithAddressCols), 'household_shortages');
  assert.equal(getOrderServiceCategory(regularTypedWithAddressCols), 'regular');

  const geoCtx: CentralGeoContext = {
    governorates: [{ id: 'gov-dkh', name: 'الدقهلية', is_active: true }],
    centers: [{ id: 'ctr-mans', governorate_id: 'gov-dkh', name: 'المنصورة', is_active: true }],
    areas: [{ id: 'area-toriel', governorate_id: 'gov-dkh', center_id: 'ctr-mans', name: 'توريل', is_active: true }],
    geoLoadState: 'loaded',
    driverAffiliation: 'platform',
    coverageRows: [
      {
        id: 'cov-hs',
        driver_id: approvedDriver.id,
        area_id: 'area-toriel',
        service_type: 'household_shortages',
        is_active: true,
        source_table: 'delivery_driver_area_coverage',
      },
    ],
    coverageLoadState: 'loaded',
  };

  // Even if pharmacy section is OFF, household_shortages order stays eligible
  const evalRes = isOrderEligibleForDriver(householdOrderWithNullPharmacyKeys, approvedDriver, {
    isWorking: true,
    deliveryEnabled: true,
    geoContext: geoCtx,
    sectionSettings: makeSections({ household_shortages: true, pharmacy: false }),
  });
  assert.equal(evalRes.matched, true);
  assert.equal(evalRes.reasonCode, 'MATCHED_CENTRAL_COVERAGE');
});

test('hydrateOrdersGeoFromAddresses fills missing central geo IDs from household_addresses while preserving fail-closed for text-only orders', async () => {
  const sb = createMockSupabase({
    household_addresses: [
      {
        id: 'addr-1',
        governorate_id: 'gov-dkh',
        center_id: 'ctr-mans',
        area_id: 'area-toriel',
        latitude: 31.045,
        longitude: 31.381,
      },
    ],
  });

  const hydratedHome = await hydrateOrdersGeoFromAddresses(
    sb,
    [
      { id: 'ord-has-addr', address_id: 'addr-1', status: 'pending_review' },
      { id: 'ord-text-only', governorate_name: 'الدقهلية', markaz_name: 'المنصورة', status: 'pending_review' },
    ],
    'regular'
  );

  assert.equal(hydratedHome[0].delivery_area_id, 'area-toriel');
  assert.equal(hydratedHome[0].delivery_center_id, 'ctr-mans');
  assert.equal(hydratedHome[0].delivery_governorate_id, 'gov-dkh');
  assert.equal(hydratedHome[1].delivery_area_id, undefined);

  const hydratedPharm = await hydrateOrdersGeoFromAddresses(
    sb,
    [{ id: 'ph-has-addr', source_address_id: 'addr-1', status: 'pending_review' }],
    'pharmacy'
  );
  assert.equal(hydratedPharm[0].address_area_id, 'area-toriel');
  assert.equal(hydratedPharm[0].address_center_id, 'ctr-mans');
  assert.equal(hydratedPharm[0].address_governorate_id, 'gov-dkh');
});

test('Idle CentralGeoContext never silently drops pharmacy orders; ordersService loads coverage & normalizes Arabic names', async () => {
  const idleCtx = createEmptyCentralGeoContext();
  assert.equal(isUsableCentralGeoContext(idleCtx), false);

  const mockSb = createMockSupabase({
    geo_governorates: [{ id: 'gov-dkh', name_ar: 'الدقهلية', is_active: true }],
    geo_centers: [{ id: 'ctr-mans', governorate_id: 'gov-dkh', name_ar: 'المنصورة', is_active: true }],
    geo_areas: [{ id: 'area-toriel', governorate_id: 'gov-dkh', center_id: 'ctr-mans', name_ar: 'توريل', is_active: true }],
    delivery_driver_area_coverage: [
      {
        id: 'cov-1',
        driver_id: approvedDriver.id,
        area_id: 'area-toriel',
        service_type: 'all',
        is_active: true,
      },
    ],
    household_addresses: [
      {
        id: 'addr-ph-1',
        governorate_id: 'gov-dkh',
        center_id: 'ctr-mans',
        area_id: 'area-toriel',
      },
    ],
    pharmacy_orders: [
      {
        id: 'ph-ord-source-addr',
        order_number: 'PH-101',
        prescription_title: 'روشتة باطنة',
        status: 'PENDING_REVIEW',
        source_address_id: 'addr-ph-1',
        address_governorate_name: 'الدقهليه',
        address_center_name: 'مركز المنصوره',
        created_at: '2026-11-18T08:00:00Z',
      },
      {
        id: 'ph-ord-legacy-arabic',
        order_number: 'PH-102',
        prescription_title: 'روشتة اطفال',
        status: 'pending_review',
        address_governorate_name: 'الدقهليه', // ه vs ة normalization
        address_center_name: 'مركز المنصورة', // مركز prefix + central coverage match
        created_at: '2026-11-18T08:05:00Z',
      },
    ],
    pharmacy_order_items: [],
    pharmacy_order_files: [],
    pharmacy_order_pharmacy_stops: [],
  });

  // Pass idle context intentionally -> must detect non-usable idle context and load full central coverage
  const { pharmacyOrdersList } = await (ordersService as any).fetchPharmacyOrdersFromDB(
    mockSb,
    approvedDriver.id,
    approvedDriver.governorate_name,
    approvedDriver.markaz_name,
    approvedDriver,
    idleCtx
  );

  assert.equal(pharmacyOrdersList.length, 2);
  assert.deepEqual(
    pharmacyOrdersList.map((p: any) => p.id),
    ['ph-ord-source-addr', 'ph-ord-legacy-arabic']
  );

  // Empty coverage must return false for legacy text fallback as well
  const emptyCtx: CentralGeoContext = {
    ...(await loadFullCentralGeoContext(mockSb, { ...approvedDriver, id: 'drv-no-cov' })),
  };
  assert.equal(emptyCtx.coverageLoadState, 'empty');
  assert.equal(
    isPharmacyOrderMatchingDriverTerritory(
      {
        id: 'ph-empty-cov',
        status: 'pending_review',
        governorate_name: 'القاهرة',
        markaz_name: 'المعادي',
      } as any,
      approvedDriver,
      emptyCtx
    ),
    false
  );

  ordersService.cleanup();
});

test('Unified chronological pending view displays both household_shortages and pharmacy new orders together', () => {
  const geoCtx: CentralGeoContext = {
    governorates: [{ id: 'gov-dkh', name: 'الدقهلية', is_active: true }],
    centers: [{ id: 'ctr-mans', governorate_id: 'gov-dkh', name: 'المنصورة', is_active: true }],
    areas: [{ id: 'area-toriel', governorate_id: 'gov-dkh', center_id: 'ctr-mans', name: 'توريل', is_active: true }],
    geoLoadState: 'loaded',
    driverAffiliation: 'platform',
    coverageRows: [
      {
        id: 'cov-1',
        driver_id: approvedDriver.id,
        area_id: 'area-toriel',
        service_type: 'household_shortages,pharmacy',
        is_active: true,
        source_table: 'delivery_driver_area_coverage',
      },
    ],
    coverageLoadState: 'loaded',
  };

  const homeOrder: any = {
    id: 'h-1',
    type: 'regular',
    status: 'pending_review',
    created_at: '2026-11-18T09:00:00Z',
    delivery_governorate_id: 'gov-dkh',
    delivery_center_id: 'ctr-mans',
    delivery_area_id: 'area-toriel',
  };

  const pharmacyOrder: any = {
    id: 'p-1',
    type: 'pharmacy',
    status: 'pending_review',
    created_at: '2026-11-18T09:05:00Z',
    address_governorate_id: 'gov-dkh',
    address_center_id: 'ctr-mans',
    address_area_id: 'area-toriel',
    governorate_name: 'الدقهلية',
    markaz_name: 'المنصورة',
  };

  const unified = buildUnifiedChronologicalOrders({
    activeTab: 'pending',
    searchQuery: '',
    orders: [homeOrder],
    pharmacyOrders: [pharmacyOrder],
    currentDriver: approvedDriver,
    isWorking: true,
    deliveryEnabled: true,
    geoContext: geoCtx,
    sectionSettings: makeSections(),
  });

  assert.equal(unified.length, 2);
  assert.equal(unified[0].kind, 'regular');
  assert.equal(unified[1].kind, 'pharmacy');
});
