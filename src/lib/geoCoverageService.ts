import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppSectionSettingsState,
  CentralGeoContext,
  DbFailedOperation,
  DeliveryDriver,
  DriverAffiliation,
  DriverAreaCoverageRow,
  GeoArea,
  GeoCenter,
  GeoGovernorate,
  OrderFinancialBreakdown,
} from '../types';
import { isRestaurantOrder, isTalabatyDeliveryResponsibility } from './restaurantService';
import {
  evaluateSectionOperationalStatus,
  resolveOrderSectionKey,
} from './sectionSettingsService';

export type OrderEligibilityReasonCode =
  | 'ASSIGNED_TO_DRIVER'
  | 'ASSIGNED_TO_OTHER_DRIVER'
  | 'NO_DRIVER'
  | 'DRIVER_NOT_APPROVED'
  | 'DRIVER_INACTIVE'
  | 'DRIVER_NOT_WORKING'
  | 'DELIVERY_SERVICE_DISABLED'
  | 'SECTION_DISABLED'
  | 'SECTION_DELIVERY_DISABLED'
  | 'SECTION_SETTINGS_UNAVAILABLE'
  | 'RESTAURANT_NOT_ELIGIBLE'
  | 'AFFILIATION_MISMATCH'
  | 'COVERAGE_NOT_LOADED'
  | 'COVERAGE_EMPTY'
  | 'ORDER_MISSING_GEO_IDS'
  | 'GEO_ENTITY_INACTIVE'
  | 'OUTSIDE_COVERAGE'
  | 'ORDER_STATUS_NOT_ACCEPTABLE'
  | 'MATCHED_CENTRAL_COVERAGE';

export interface CentralCoverageMatchResult {
  matched: boolean;
  reasonCode: OrderEligibilityReasonCode;
  reason: string;
  matchedCoverageId?: string;
  resolvedGovernorateName?: string | null;
  resolvedCenterName?: string | null;
  resolvedAreaName?: string | null;
}

export function createEmptyCentralGeoContext(
  driverAffiliation: DriverAffiliation = 'platform'
): CentralGeoContext {
  return {
    governorates: [],
    centers: [],
    areas: [],
    geoLoadState: 'idle',
    geoError: null,
    driverAffiliation,
    coverageRows: [],
    coverageLoadState: 'idle',
    coverageError: null,
    coverageFailedOperation: null,
  };
}

/**
 * Classifies PostgREST / PostgreSQL error codes accurately without inventing fake success.
 */
function classifySupabaseError(err: any): 'permission_denied' | 'table_missing' | 'error' {
  const code = String(err?.code || '').toUpperCase();
  const status = Number(err?.status || 0);
  const msg = String(err?.message || '').toLowerCase();

  if (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('rls')
  ) {
    return 'permission_denied';
  }

  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    status === 404 ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('relation')
  ) {
    return 'table_missing';
  }

  return 'error';
}

/**
 * Strictly determines whether the authenticated driver belongs to the Talabaty platform fleet
 * or is a dedicated restaurant staff driver. Never mixes the two.
 */
export function resolveDriverAffiliation(driver: DeliveryDriver | Record<string, any> | null | undefined): DriverAffiliation {
  if (!driver) return 'platform';

  const typeMarkers = [
    driver.driver_type,
    driver.driver_category,
    driver.employment_type,
    driver.role,
  ]
    .map((v) => String(v || '').toLowerCase().trim())
    .filter(Boolean);

  const isExplicitPlatform = typeMarkers.some(
    (v) => v === 'platform' || v === 'talabaty' || v === 'delivery_driver' || v === 'platform_driver'
  );
  const isExplicitRestaurant = typeMarkers.some(
    (v) =>
      v === 'restaurant' ||
      v === 'restaurant_driver' ||
      v === 'restaurant_staff' ||
      v === 'store_driver' ||
      v === 'merchant_driver'
  );

  if (isExplicitRestaurant) {
    return 'restaurant_staff';
  }

  if (!isExplicitPlatform && typeof driver.restaurant_id === 'string' && driver.restaurant_id.trim().length > 0) {
    return 'restaurant_staff';
  }

  return 'platform';
}

function normalizeGeoRowName(row: any): string {
  return String(row?.name_ar || row?.name || row?.title_ar || row?.title || '').trim();
}

function parseActiveFlag(row: any): boolean {
  if (row?.is_active === false || row?.active === false) return false;
  const status = String(row?.status || '').toLowerCase().trim();
  if (status === 'inactive' || status === 'disabled' || status === 'archived') return false;
  return true;
}

/**
 * Loads central geographic hierarchy tables:
 * - geo_governorates
 * - geo_centers
 * - geo_areas
 */
export async function fetchCentralGeoHierarchy(supabase: SupabaseClient | null): Promise<{
  governorates: GeoGovernorate[];
  centers: GeoCenter[];
  areas: GeoArea[];
  geoLoadState: CentralGeoContext['geoLoadState'];
  geoError: string | null;
}> {
  if (!supabase) {
    return {
      governorates: [],
      centers: [],
      areas: [],
      geoLoadState: 'error',
      geoError: 'عميل Supabase غير مهيأ.',
    };
  }

  try {
    const [govRes, ctrRes, areaRes] = await Promise.all([
      supabase.from('geo_governorates').select('*'),
      supabase.from('geo_centers').select('*'),
      supabase.from('geo_areas').select('*'),
    ]);

    const firstErr = govRes.error || ctrRes.error || areaRes.error;
    if (firstErr) {
      return {
        governorates: [],
        centers: [],
        areas: [],
        geoLoadState: classifySupabaseError(firstErr),
        geoError: firstErr.message || 'تعذر تحميل الجداول الجغرافية المركزية.',
      };
    }

    const governorates: GeoGovernorate[] = (Array.isArray(govRes.data) ? govRes.data : [])
      .map((r: any) => ({
        id: String(r.id),
        name: normalizeGeoRowName(r),
        name_ar: r.name_ar ?? null,
        code: r.code ?? null,
        is_active: parseActiveFlag(r),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const centers: GeoCenter[] = (Array.isArray(ctrRes.data) ? ctrRes.data : [])
      .map((r: any) => ({
        id: String(r.id),
        governorate_id: r.governorate_id ? String(r.governorate_id) : null,
        name: normalizeGeoRowName(r),
        name_ar: r.name_ar ?? null,
        code: r.code ?? null,
        is_active: parseActiveFlag(r),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const areas: GeoArea[] = (Array.isArray(areaRes.data) ? areaRes.data : [])
      .map((r: any) => ({
        id: String(r.id),
        governorate_id: r.governorate_id ? String(r.governorate_id) : null,
        center_id: r.center_id ? String(r.center_id) : null,
        name: normalizeGeoRowName(r),
        name_ar: r.name_ar ?? null,
        code: r.code ?? null,
        is_active: parseActiveFlag(r),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    return {
      governorates,
      centers,
      areas,
      geoLoadState: 'loaded',
      geoError: null,
    };
  } catch (err: any) {
    return {
      governorates: [],
      centers: [],
      areas: [],
      geoLoadState: 'error',
      geoError: err?.message || 'حدث خطأ أثناء تحميل التغطية الجغرافية المركزية.',
    };
  }
}

/**
 * Loads coverage exclusively from the table matching the driver's verified affiliation:
 * - Platform driver -> delivery_driver_area_coverage
 * - Restaurant staff driver -> restaurant_driver_area_coverage
 */
export async function fetchDriverCentralCoverage(
  supabase: SupabaseClient | null,
  driver: DeliveryDriver | null
): Promise<{
  driverAffiliation: DriverAffiliation;
  coverageRows: DriverAreaCoverageRow[];
  coverageLoadState: CentralGeoContext['coverageLoadState'];
  coverageError: string | null;
  coverageFailedOperation: DbFailedOperation | null;
}> {
  const affiliation = resolveDriverAffiliation(driver);

  if (!supabase || !driver?.id) {
    return {
      driverAffiliation: affiliation,
      coverageRows: [],
      coverageLoadState: 'idle',
      coverageError: null,
      coverageFailedOperation: null,
    };
  }

  const targetTable: 'delivery_driver_area_coverage' | 'restaurant_driver_area_coverage' =
    affiliation === 'restaurant_staff'
      ? 'restaurant_driver_area_coverage'
      : 'delivery_driver_area_coverage';

  try {
    const queryRes = await supabase
      .from(targetTable)
      .select('*')
      .eq('driver_id', driver.id);

    if (queryRes.error) {
      const errorType = classifySupabaseError(queryRes.error);
      const errMsg = queryRes.error.message || `تعذر قراءة جدول ${targetTable}`;
      return {
        driverAffiliation: affiliation,
        coverageRows: [],
        coverageLoadState: errorType,
        coverageError: errMsg,
        coverageFailedOperation: {
          table: targetTable,
          operation: 'SELECT',
          errorType,
          isRls: errorType === 'permission_denied',
          code: queryRes.error.code ? String(queryRes.error.code) : null,
          message: errMsg,
        },
      };
    }

    const rawRows = Array.isArray(queryRes.data) ? queryRes.data : [];
    const coverageRows: DriverAreaCoverageRow[] = rawRows.map((r: any) => ({
      id: String(r.id),
      driver_id: String(r.driver_id || driver.id),
      restaurant_id: r.restaurant_id ? String(r.restaurant_id) : null,
      governorate_id: r.governorate_id ? String(r.governorate_id) : null,
      center_id: r.center_id ? String(r.center_id) : null,
      area_id: r.area_id ? String(r.area_id) : null,
      service_type: r.service_type ? String(r.service_type).toLowerCase().trim() : null,
      is_active: parseActiveFlag(r),
      status: r.status ?? null,
      source_table: targetTable,
    }));

    return {
      driverAffiliation: affiliation,
      coverageRows,
      coverageLoadState: coverageRows.length > 0 ? 'loaded' : 'empty',
      coverageError: null,
      coverageFailedOperation: null,
    };
  } catch (err: any) {
    const errorType = classifySupabaseError(err);
    const errMsg = err?.message || `خطأ في قراءة تغطية السائق من ${targetTable}`;
    return {
      driverAffiliation: affiliation,
      coverageRows: [],
      coverageLoadState: errorType,
      coverageError: errMsg,
      coverageFailedOperation: {
        table: targetTable,
        operation: 'SELECT',
        errorType,
        isRls: errorType === 'permission_denied',
        code: err?.code ? String(err.code) : null,
        message: errMsg,
      },
    };
  }
}

export async function loadFullCentralGeoContext(
  supabase: SupabaseClient | null,
  driver: DeliveryDriver | null
): Promise<CentralGeoContext> {
  const [hierarchy, coverage] = await Promise.all([
    fetchCentralGeoHierarchy(supabase),
    fetchDriverCentralCoverage(supabase, driver),
  ]);

  return {
    ...hierarchy,
    ...coverage,
  };
}

function getOrderServiceCategory(order: any): 'regular' | 'restaurant' | 'pharmacy' {
  if (
    order?.type === 'pharmacy' ||
    order?.prescription_title ||
    order?.address_governorate_name ||
    order?.address_governorate_id ||
    order?.address_center_id ||
    order?.address_area_id
  ) {
    return 'pharmacy';
  }
  if (isRestaurantOrder(order)) {
    return 'restaurant';
  }
  return 'regular';
}

function doesCoverageServiceMatch(
  coverageServiceType: string | null | undefined,
  orderService: 'regular' | 'restaurant' | 'pharmacy'
): boolean {
  if (!coverageServiceType) return true;
  const s = coverageServiceType.toLowerCase().trim();
  if (!s || s === 'all' || s === 'any') return true;
  if (orderService === 'regular') {
    return s === 'regular' || s === 'home' || s === 'delivery' || s === 'household';
  }
  return s === orderService;
}

/**
 * Evaluates order coverage strictly using central geo IDs (delivery_governorate_id, delivery_center_id,
 * delivery_area_id) and active coverage rows in CentralGeoContext.
 * NEVER uses text matching (governorate_name / markaz_name) or egyptLocations.ts.
 * Missing GPS coordinates/boundaries on an order NEVER block matching if central IDs match.
 */
export function evaluateCentralCoverageMatch(
  order: any,
  driver: DeliveryDriver | null,
  context?: CentralGeoContext | null
): CentralCoverageMatchResult {
  if (!driver) {
    return {
      matched: false,
      reasonCode: 'NO_DRIVER',
      reason: 'لا يوجد حساب سائق مصادق عليه.',
    };
  }

  const assignedDriverId = order?.assigned_driver_id
    ? String(order.assigned_driver_id)
    : order?.driver_id
    ? String(order.driver_id)
    : null;

  // 1. Assigned to another driver -> NEVER display
  if (assignedDriverId && assignedDriverId !== String(driver.id)) {
    return {
      matched: false,
      reasonCode: 'ASSIGNED_TO_OTHER_DRIVER',
      reason: 'الطلب مخصص لسائق آخر.',
    };
  }

  // 2. Assigned to current driver -> ALWAYS remain visible regardless of coverage changes
  if (assignedDriverId && assignedDriverId === String(driver.id)) {
    return {
      matched: true,
      reasonCode: 'ASSIGNED_TO_DRIVER',
      reason: 'طلب مسند للسائق الحالي ويظل ظاهرًا له حتى لو تغيرت تغطيته لاحقًا.',
    };
  }

  if (!context || (context.coverageLoadState !== 'loaded' && context.coverageLoadState !== 'empty')) {
    return {
      matched: false,
      reasonCode: 'COVERAGE_NOT_LOADED',
      reason: context?.coverageError
        ? `تعذر تحميل التغطية المركزية: ${context.coverageError}`
        : 'لم يتم تحميل بيانات التغطية الجغرافية المركزية بعد.',
    };
  }

  const activeCoverageRows = (context.coverageRows || []).filter((c) => c.is_active);
  if (activeCoverageRows.length === 0) {
    return {
      matched: false,
      reasonCode: 'COVERAGE_EMPTY',
      reason: 'لا توجد مناطق تغطية نشطة مسجلة لهذا السائق في النظام المركزي.',
    };
  }

  const orderService = getOrderServiceCategory(order);
  const affiliation = context.driverAffiliation || resolveDriverAffiliation(driver);

  // Strict fleet isolation: restaurant-staff drivers only handle their restaurant's orders;
  // platform drivers follow Talabaty rules.
  if (affiliation === 'restaurant_staff') {
    if (orderService !== 'restaurant') {
      return {
        matched: false,
        reasonCode: 'AFFILIATION_MISMATCH',
        reason: 'سائق المطعم يستقبل طلبات مطعمه فقط ولا يخلط مع طلبات المنصة.',
      };
    }
    const driverRestId = driver.restaurant_id ? String(driver.restaurant_id) : null;
    const orderRestId = order?.restaurant_id ? String(order.restaurant_id) : null;
    if (driverRestId && orderRestId && driverRestId !== orderRestId) {
      return {
        matched: false,
        reasonCode: 'AFFILIATION_MISMATCH',
        reason: 'الطلب يخص مطعمًا آخر غير مطعم السائق.',
      };
    }
  } else if (orderService === 'restaurant') {
    if (!isTalabatyDeliveryResponsibility(order, driver.id)) {
      return {
        matched: false,
        reasonCode: 'RESTAURANT_NOT_ELIGIBLE',
        reason: 'طلب المطعم لا يتبع توصيل سائقي منصة طلباتي.',
      };
    }
  }

  // Extract central Geo IDs from the order (pharmacy uses address_*_id strictly, others use delivery_*_id)
  const rawAreaId =
    orderService === 'pharmacy'
      ? order?.address_area_id || null
      : order?.delivery_area_id || order?.area_id || null;
  const rawCenterId =
    orderService === 'pharmacy'
      ? order?.address_center_id || null
      : order?.delivery_center_id || order?.center_id || null;
  const rawGovId =
    orderService === 'pharmacy'
      ? order?.address_governorate_id || null
      : order?.delivery_governorate_id || order?.governorate_id || null;

  const areaEntity = rawAreaId
    ? context.areas.find((a) => a.id === String(rawAreaId)) || null
    : null;
  const effectiveCenterId = rawCenterId
    ? String(rawCenterId)
    : areaEntity?.center_id
    ? String(areaEntity.center_id)
    : null;
  const centerEntity = effectiveCenterId
    ? context.centers.find((c) => c.id === effectiveCenterId) || null
    : null;
  const effectiveGovId = rawGovId
    ? String(rawGovId)
    : centerEntity?.governorate_id
    ? String(centerEntity.governorate_id)
    : areaEntity?.governorate_id
    ? String(areaEntity.governorate_id)
    : null;
  const govEntity = effectiveGovId
    ? context.governorates.find((g) => g.id === effectiveGovId) || null
    : null;

  if (!rawAreaId && !effectiveCenterId && !effectiveGovId) {
    return {
      matched: false,
      reasonCode: 'ORDER_MISSING_GEO_IDS',
      reason: 'الطلب يفتقر إلى معرفات التغطية الجغرافية المركزية (area/center/governorate id).',
    };
  }

  // Enforce active central geo entities
  if (
    (areaEntity && !areaEntity.is_active) ||
    (centerEntity && !centerEntity.is_active) ||
    (govEntity && !govEntity.is_active)
  ) {
    return {
      matched: false,
      reasonCode: 'GEO_ENTITY_INACTIVE',
      reason: 'المنطقة أو المركز الجغرافي للطلب معطل حاليًا في النظام المركزي.',
    };
  }

  // Match against driver's active coverage rows
  for (const cov of activeCoverageRows) {
    if (!doesCoverageServiceMatch(cov.service_type, orderService)) {
      continue;
    }

    if (affiliation === 'restaurant_staff' && cov.restaurant_id && order?.restaurant_id) {
      if (String(cov.restaurant_id) !== String(order.restaurant_id)) {
        continue;
      }
    }

    if (cov.area_id) {
      if (rawAreaId && String(rawAreaId) === String(cov.area_id)) {
        return {
          matched: true,
          reasonCode: 'MATCHED_CENTRAL_COVERAGE',
          reason: 'مطابقة التغطية المركزية عبر معرف المنطقة (area_id).',
          matchedCoverageId: cov.id,
          resolvedGovernorateName:
            govEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_governorate_name : null) ??
            order?.governorate_name ??
            null,
          resolvedCenterName:
            centerEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_center_name : null) ??
            order?.markaz_name ??
            null,
          resolvedAreaName:
            areaEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_area_name : order?.delivery_area_name) ??
            null,
        };
      }
      continue;
    }

    if (cov.center_id) {
      if (effectiveCenterId && effectiveCenterId === String(cov.center_id)) {
        return {
          matched: true,
          reasonCode: 'MATCHED_CENTRAL_COVERAGE',
          reason: 'مطابقة التغطية المركزية عبر معرف المركز (center_id).',
          matchedCoverageId: cov.id,
          resolvedGovernorateName:
            govEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_governorate_name : null) ??
            order?.governorate_name ??
            null,
          resolvedCenterName:
            centerEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_center_name : null) ??
            order?.markaz_name ??
            null,
          resolvedAreaName:
            areaEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_area_name : order?.delivery_area_name) ??
            null,
        };
      }
      continue;
    }

    if (cov.governorate_id) {
      if (effectiveGovId && effectiveGovId === String(cov.governorate_id)) {
        return {
          matched: true,
          reasonCode: 'MATCHED_CENTRAL_COVERAGE',
          reason: 'مطابقة التغطية المركزية عبر معرف المحافظة (governorate_id).',
          matchedCoverageId: cov.id,
          resolvedGovernorateName:
            govEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_governorate_name : null) ??
            order?.governorate_name ??
            null,
          resolvedCenterName:
            centerEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_center_name : null) ??
            order?.markaz_name ??
            null,
          resolvedAreaName:
            areaEntity?.name ??
            (orderService === 'pharmacy' ? order?.address_area_name : order?.delivery_area_name) ??
            null,
        };
      }
    }
  }

  return {
    matched: false,
    reasonCode: 'OUTSIDE_COVERAGE',
    reason: 'موقع الطلب خارج نطاق التغطية الجغرافية النشطة المسجلة للسائق.',
  };
}

export interface OrderEligibilityOptions {
  isWorking: boolean;
  deliveryEnabled: boolean;
  geoContext: CentralGeoContext | null;
  sectionSettings?: AppSectionSettingsState | null;
}

/**
 * Master visibility and acceptance eligibility gate for orders across tabs and actions.
 */
export function isOrderEligibleForDriver(
  order: any,
  driver: DeliveryDriver | null,
  options: OrderEligibilityOptions
): CentralCoverageMatchResult {
  if (!driver) {
    return {
      matched: false,
      reasonCode: 'NO_DRIVER',
      reason: 'لا يوجد حساب سائق مصادق عليه.',
    };
  }

  const assignedDriverId = order?.assigned_driver_id
    ? String(order.assigned_driver_id)
    : order?.driver_id
    ? String(order.driver_id)
    : null;

  // Assigned to another driver -> NEVER visible
  if (assignedDriverId && assignedDriverId !== String(driver.id)) {
    return {
      matched: false,
      reasonCode: 'ASSIGNED_TO_OTHER_DRIVER',
      reason: 'الطلب مخصص لسائق آخر.',
    };
  }

  // Already assigned to current driver -> ALWAYS visible even if section disabled, coverage changed, or isWorking=false
  if (assignedDriverId && assignedDriverId === String(driver.id)) {
    return {
      matched: true,
      reasonCode: 'ASSIGNED_TO_DRIVER',
      reason: 'طلب مخصص للسائق الحالي.',
    };
  }

  if (driver.status !== 'approved') {
    return {
      matched: false,
      reasonCode: 'DRIVER_NOT_APPROVED',
      reason: 'حساب السائق غير معتمد حاليًا.',
    };
  }

  if (!driver.is_active) {
    return {
      matched: false,
      reasonCode: 'DRIVER_INACTIVE',
      reason: 'حساب السائق غير نشط حاليًا.',
    };
  }

  if (!options.deliveryEnabled) {
    return {
      matched: false,
      reasonCode: 'DELIVERY_SERVICE_DISABLED',
      reason: 'خدمة التوصيل معطلة حاليًا من الإدارة.',
    };
  }

  if (!options.isWorking) {
    return {
      matched: false,
      reasonCode: 'DRIVER_NOT_WORKING',
      reason: 'السائق متوقف عن العمل حاليًا (اضغط بدء العمل لإظهار وقبول الطلبات الجديدة).',
    };
  }

  const rawStatus = String(order?.status || '').toLowerCase().trim();
  if (rawStatus !== 'pending_review') {
    return {
      matched: false,
      reasonCode: 'ORDER_STATUS_NOT_ACCEPTABLE',
      reason: `حالة الطلب (${order?.status}) لا تسمح بظهوره كطلب جديد متاح للقبول.`,
    };
  }

  if (options.sectionSettings) {
    const sectionKey = resolveOrderSectionKey(order);
    const secEval = evaluateSectionOperationalStatus(options.sectionSettings, sectionKey);
    if (!secEval.canShowNewOrders) {
      const reasonCode: OrderEligibilityReasonCode =
        secEval.statusCode === 'SECTION_DISABLED'
          ? 'SECTION_DISABLED'
          : secEval.statusCode === 'DELIVERY_DISABLED'
          ? 'SECTION_DELIVERY_DISABLED'
          : 'SECTION_SETTINGS_UNAVAILABLE';
      return {
        matched: false,
        reasonCode,
        reason: secEval.reason,
      };
    }
  }

  return evaluateCentralCoverageMatch(order, driver, options.geoContext);
}

function toFiniteNumberOrNull(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Extracts stored delivery financial fields strictly as saved by the server.
 * NEVER computes 90% commission splits or injects hardcoded default fees (15, 16, 18, 20).
 */
export function extractOrderFinancialBreakdown(order: any): OrderFinancialBreakdown {
  if (!order) {
    return {
      subtotal: null,
      actualItemsTotal: null,
      deliveryFee: null,
      deliveryBaseFee: null,
      deliveryAdminCommission: null,
      deliveryDriverNet: null,
      customerDeliveryFee: null,
      totalAmount: null,
      actualTotalAmount: null,
      hasIncompleteFinancials: true,
    };
  }

  const subtotal = toFiniteNumberOrNull(order.subtotal ?? order.items_total ?? order.medicines_total);
  const actualItemsTotal = toFiniteNumberOrNull(order.actual_items_total);
  const deliveryFee = toFiniteNumberOrNull(order.delivery_fee ?? order.deliveryFee);
  const deliveryBaseFee = toFiniteNumberOrNull(order.delivery_base_fee);
  const deliveryAdminCommission = toFiniteNumberOrNull(order.delivery_admin_commission);
  const deliveryDriverNet = toFiniteNumberOrNull(order.delivery_driver_net);
  const customerDeliveryFee = toFiniteNumberOrNull(order.customer_delivery_fee);
  const totalAmount = toFiniteNumberOrNull(order.total_amount ?? order.grand_total ?? order.total);
  const actualTotalAmount = toFiniteNumberOrNull(order.actual_total_amount);

  const hasAnyDeliveryFee =
    deliveryFee !== null || deliveryBaseFee !== null || customerDeliveryFee !== null;
  const hasIncompleteFinancials =
    !hasAnyDeliveryFee ||
    deliveryDriverNet === null ||
    deliveryAdminCommission === null ||
    (totalAmount === null && actualTotalAmount === null);

  return {
    subtotal,
    actualItemsTotal,
    deliveryFee,
    deliveryBaseFee,
    deliveryAdminCommission,
    deliveryDriverNet,
    customerDeliveryFee,
    totalAmount,
    actualTotalAmount,
    hasIncompleteFinancials,
  };
}
