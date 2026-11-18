import assert from 'node:assert/strict';

// Minimal browser shims before importing app modules
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
  fetchAppSectionSettings,
  evaluateSectionOperationalStatus,
  getSectionStatusDisplayMeta,
  resolveOrderSectionKey,
} from '../src/lib/sectionSettingsService';
import { isOrderEligibleForDriver } from '../src/lib/geoCoverageService';
import type { CentralGeoContext, DeliveryDriver } from '../src/types';

function createMockSupabaseForSections(
  getRows: () => any[],
  getError: () => any = () => null
) {
  return {
    from: (table: string) => ({
      select: async () => {
        if (table !== 'app_section_settings') {
          return { data: [], error: null };
        }
        const err = getError();
        if (err) {
          return { data: null, error: err };
        }
        return { data: getRows(), error: null };
      },
    }),
  } as any;
}

const mockDriver: DeliveryDriver = {
  id: 'drv-1',
  user_id: 'usr-1',
  full_name: 'أحمد محمد',
  phone: '01000000000',
  is_active: true,
  vehicle_type: 'motorcycle',
  notes: null,
  status: 'approved',
  governorate_name: 'الدقهلية',
  governorate_code: 'DKH',
  markaz_name: 'المنصورة',
  vehicle_plate: 'دق 123',
  national_id: '29901011200001',
  approved_at: '2026-01-01T00:00:00Z',
  approved_by: 'admin-1',
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockGeoCtx: CentralGeoContext = {
  governorates: [{ id: 'gov-1', name: 'الدقهلية', name_ar: 'الدقهلية', is_active: true }],
  centers: [{ id: 'ctr-1', governorate_id: 'gov-1', name: 'المنصورة', name_ar: 'المنصورة', is_active: true }],
  areas: [{ id: 'area-1', governorate_id: 'gov-1', center_id: 'ctr-1', name: 'حي الجامعة', name_ar: 'حي الجامعة', is_active: true }],
  geoLoadState: 'loaded',
  driverAffiliation: 'platform',
  coverageRows: [
    {
      id: 'cov-1',
      driver_id: 'drv-1',
      governorate_id: 'gov-1',
      center_id: 'ctr-1',
      area_id: 'area-1',
      service_type: 'all',
      is_active: true,
      source_table: 'delivery_driver_area_coverage',
    },
  ],
  coverageLoadState: 'loaded',
};

const samplePendingHomeOrder = {
  id: 'ord-home-pending',
  status: 'pending_review',
  assigned_driver_id: null,
  delivery_governorate_id: 'gov-1',
  delivery_center_id: 'ctr-1',
  delivery_area_id: 'area-1',
};

const sampleAssignedHomeOrder = {
  id: 'ord-home-assigned',
  status: 'accepted',
  assigned_driver_id: 'drv-1',
  delivery_governorate_id: 'gov-1',
  delivery_center_id: 'ctr-1',
  delivery_area_id: 'area-1',
};

const samplePendingRestaurantOrder = {
  id: 'ord-rest-pending',
  type: 'restaurant',
  restaurant_id: 'rest-1',
  delivery_by: 'talabaty',
  status: 'pending_review',
  assigned_driver_id: null,
  delivery_governorate_id: 'gov-1',
  delivery_center_id: 'ctr-1',
  delivery_area_id: 'area-1',
};

const sampleAssignedRestaurantOrder = {
  id: 'ord-rest-assigned',
  type: 'restaurant',
  restaurant_id: 'rest-1',
  delivery_by: 'talabaty',
  status: 'shopping',
  assigned_driver_id: 'drv-1',
  delivery_governorate_id: 'gov-1',
  delivery_center_id: 'ctr-1',
  delivery_area_id: 'area-1',
};

const samplePendingPharmacyOrder = {
  id: 'ord-pharm-pending',
  type: 'pharmacy',
  prescription_title: 'روشتة',
  status: 'pending_review',
  assigned_driver_id: null,
  address_governorate_id: 'gov-1',
  address_center_id: 'ctr-1',
  address_area_id: 'area-1',
};

async function runTests() {
  // Scenario 1: Display status of all 3 sections cleanly AND keep section_visible separate from delivery_enabled
  let dbRows: any[] = [
    {
      section_key: 'household_shortages',
      section_enabled: true,
      section_visible: false, // Hidden in client UI, MUST NOT affect delivery_enabled=true
      delivery_enabled: true,
      updated_at: '2026-11-17T10:00:00Z',
    },
    {
      section_key: 'pharmacy',
      section_enabled: true,
      section_visible: true,
      delivery_enabled: true,
      updated_at: '2026-11-17T10:00:00Z',
    },
    {
      section_key: 'ready_food',
      section_enabled: true,
      section_visible: true,
      delivery_enabled: true,
      updated_at: '2026-11-17T10:00:00Z',
    },
  ];
  const sb = createMockSupabaseForSections(() => dbRows);

  const stateAllActive = await fetchAppSectionSettings(sb);
  assert.equal(stateAllActive.load_state, 'loaded');
  assert.equal(getSectionStatusDisplayMeta(stateAllActive.sections.household_shortages).sectionStatusLabel, 'مفعل');
  assert.equal(getSectionStatusDisplayMeta(stateAllActive.sections.household_shortages).deliveryStatusLabel, 'متاح');
  assert.equal(getSectionStatusDisplayMeta(stateAllActive.sections.household_shortages).visibilityLabel, 'مخفي');
  assert.equal(evaluateSectionOperationalStatus(stateAllActive, 'household_shortages').canShowNewOrders, true);
  assert.equal(evaluateSectionOperationalStatus(stateAllActive, 'pharmacy').canShowNewOrders, true);
  assert.equal(evaluateSectionOperationalStatus(stateAllActive, 'ready_food').canShowNewOrders, true);

  // Verify section_visible=false does NOT block household_shortages delivery
  const homeMatchVisibleFalse = isOrderEligibleForDriver(samplePendingHomeOrder, mockDriver, {
    isWorking: true,
    deliveryEnabled: true,
    geoContext: mockGeoCtx,
    sectionSettings: stateAllActive,
  });
  assert.equal(homeMatchVisibleFalse.matched, true);

  // Verify resolveOrderSectionKey accuracy
  assert.equal(resolveOrderSectionKey(samplePendingHomeOrder), 'household_shortages');
  assert.equal(resolveOrderSectionKey(samplePendingRestaurantOrder), 'ready_food');
  assert.equal(resolveOrderSectionKey(samplePendingPharmacyOrder), 'pharmacy');

  // Scenario 2 & 3 & 5: Disabling delivery on ONE section ('ready_food') stops new ready_food orders ONLY; others remain unaffected
  dbRows = [
    { section_key: 'household_shortages', section_enabled: true, section_visible: true, delivery_enabled: true },
    { section_key: 'pharmacy', section_enabled: true, section_visible: true, delivery_enabled: true },
    { section_key: 'ready_food', section_enabled: true, section_visible: true, delivery_enabled: false },
  ];
  const stateReadyFoodStopped = await fetchAppSectionSettings(sb);

  assert.equal(getSectionStatusDisplayMeta(stateReadyFoodStopped.sections.ready_food).sectionStatusLabel, 'مفعل');
  assert.equal(getSectionStatusDisplayMeta(stateReadyFoodStopped.sections.ready_food).deliveryStatusLabel, 'متوقف');

  const readyFoodPendingEval = isOrderEligibleForDriver(samplePendingRestaurantOrder, mockDriver, {
    isWorking: true,
    deliveryEnabled: true,
    geoContext: mockGeoCtx,
    sectionSettings: stateReadyFoodStopped,
  });
  assert.equal(readyFoodPendingEval.matched, false);
  assert.equal(readyFoodPendingEval.reasonCode, 'SECTION_DELIVERY_DISABLED');

  // Other sections unaffected (household_shortages & pharmacy stay operational)
  assert.equal(
    isOrderEligibleForDriver(samplePendingHomeOrder, mockDriver, {
      isWorking: true,
      deliveryEnabled: true,
      geoContext: mockGeoCtx,
      sectionSettings: stateReadyFoodStopped,
    }).matched,
    true
  );
  assert.equal(
    evaluateSectionOperationalStatus(stateReadyFoodStopped, 'pharmacy').canAcceptNewOrders,
    true
  );

  // Scenario 4: Already assigned order in stopped section ('ready_food') remains visible & completable
  const readyFoodAssignedEval = isOrderEligibleForDriver(sampleAssignedRestaurantOrder, mockDriver, {
    isWorking: true,
    deliveryEnabled: true,
    geoContext: mockGeoCtx,
    sectionSettings: stateReadyFoodStopped,
  });
  assert.equal(readyFoodAssignedEval.matched, true);
  assert.equal(readyFoodAssignedEval.reasonCode, 'ASSIGNED_TO_DRIVER');

  // Even if household_shortages itself has section_enabled=false, assigned home order stays untouched while pending home order is blocked
  dbRows = [
    { section_key: 'household_shortages', section_enabled: false, section_visible: true, delivery_enabled: true },
    { section_key: 'pharmacy', section_enabled: true, section_visible: true, delivery_enabled: false },
    { section_key: 'ready_food', section_enabled: true, section_visible: true, delivery_enabled: true },
  ];
  const stateHouseholdDisabled = await fetchAppSectionSettings(sb);
  assert.equal(
    isOrderEligibleForDriver(samplePendingHomeOrder, mockDriver, {
      isWorking: true,
      deliveryEnabled: true,
      geoContext: mockGeoCtx,
      sectionSettings: stateHouseholdDisabled,
    }).reasonCode,
    'SECTION_DISABLED'
  );
  assert.equal(
    isOrderEligibleForDriver(sampleAssignedHomeOrder, mockDriver, {
      isWorking: true,
      deliveryEnabled: true,
      geoContext: mockGeoCtx,
      sectionSettings: stateHouseholdDisabled,
    }).matched,
    true
  );
  assert.equal(evaluateSectionOperationalStatus(stateHouseholdDisabled, 'pharmacy').canAcceptNewOrders, false);
  assert.equal(evaluateSectionOperationalStatus(stateHouseholdDisabled, 'ready_food').canAcceptNewOrders, true);

  // Scenario 5b: Single section missing/invalid row does NOT disable the other 2 sections
  dbRows = [
    { section_key: 'household_shortages', section_enabled: true, section_visible: true, delivery_enabled: true },
    { section_key: 'ready_food', section_enabled: true, section_visible: true, delivery_enabled: true },
    // pharmacy row missing intentionally
  ];
  const statePartial = await fetchAppSectionSettings(sb);
  assert.equal(statePartial.load_state, 'partial');
  assert.equal(evaluateSectionOperationalStatus(statePartial, 'pharmacy').statusCode, 'SETTINGS_MISSING_ROW');
  assert.equal(evaluateSectionOperationalStatus(statePartial, 'pharmacy').canAcceptNewOrders, false);
  assert.equal(evaluateSectionOperationalStatus(statePartial, 'household_shortages').canAcceptNewOrders, true);
  assert.equal(evaluateSectionOperationalStatus(statePartial, 'ready_food').canAcceptNewOrders, true);

  // Scenario 6: Fresh live refresh reflects admin DB edits immediately without localStorage stale cache + RLS/Table error handling
  assert.equal(memStorage.size, 0, 'Section settings must never write into localStorage cache');
  dbRows = [
    { section_key: 'household_shortages', section_enabled: true, section_visible: true, delivery_enabled: true },
    { section_key: 'pharmacy', section_enabled: true, section_visible: true, delivery_enabled: true },
    { section_key: 'ready_food', section_enabled: true, section_visible: true, delivery_enabled: true },
  ];
  const refreshedState = await fetchAppSectionSettings(sb);
  assert.equal(evaluateSectionOperationalStatus(refreshedState, 'pharmacy').canAcceptNewOrders, true);
  assert.equal(memStorage.size, 0, 'Refreshing section settings must never cache in localStorage');

  // RLS 42501 error check
  const sbRls = createMockSupabaseForSections(
    () => [],
    () => ({ code: '42501', message: 'permission denied for table app_section_settings' })
  );
  const stateRls = await fetchAppSectionSettings(sbRls);
  assert.equal(stateRls.load_state, 'permission_denied');
  assert.equal(stateRls.failedOperation?.isRls, true);
  assert.equal(evaluateSectionOperationalStatus(stateRls, 'household_shortages').canAcceptNewOrders, false);

  // Missing table 42P01 check
  const sbMissing = createMockSupabaseForSections(
    () => [],
    () => ({ code: '42P01', message: 'relation "public.app_section_settings" does not exist' })
  );
  const stateMissing = await fetchAppSectionSettings(sbMissing);
  assert.equal(stateMissing.load_state, 'table_missing');
  assert.equal(evaluateSectionOperationalStatus(stateMissing, 'ready_food').statusCode, 'SETTINGS_UNAVAILABLE');

  console.log('All 6 section settings verification scenarios + edge cases passed!');
}

void runTests().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
