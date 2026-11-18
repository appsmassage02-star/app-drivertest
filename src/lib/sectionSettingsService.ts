import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppSectionKey,
  AppSectionRowLoadState,
  AppSectionSetting,
  AppSectionSettingsState,
  DbFailedOperation,
} from '../types';
import { isRestaurantOrder } from './restaurantService';

export const APP_SECTION_KEYS: readonly AppSectionKey[] = [
  'household_shortages',
  'pharmacy',
  'ready_food',
] as const;

export const APP_SECTION_META: Record<
  AppSectionKey,
  {
    key: AppSectionKey;
    labelAr: string;
    shortLabelAr: string;
    orderTypeLabelAr: string;
  }
> = {
  household_shortages: {
    key: 'household_shortages',
    labelAr: 'نواقص المنزل',
    shortLabelAr: 'المنزل',
    orderTypeLabelAr: 'الطلبات العادية',
  },
  pharmacy: {
    key: 'pharmacy',
    labelAr: 'الصيدلية',
    shortLabelAr: 'الصيدلية',
    orderTypeLabelAr: 'فواتير الصيدلية',
  },
  ready_food: {
    key: 'ready_food',
    labelAr: 'الأكل الجاهز (المطاعم)',
    shortLabelAr: 'المطاعم',
    orderTypeLabelAr: 'طلبات المطاعم',
  },
};

export interface SectionOperationalEvaluation {
  sectionKey: AppSectionKey;
  sectionLabelAr: string;
  canShowNewOrders: boolean;
  canAcceptNewOrders: boolean;
  sectionEnabled: boolean | null;
  sectionVisible: boolean | null;
  deliveryEnabled: boolean | null;
  statusCode:
    | 'OPERATIONAL'
    | 'SECTION_DISABLED'
    | 'DELIVERY_DISABLED'
    | 'SETTINGS_IDLE'
    | 'SETTINGS_UNAVAILABLE'
    | 'SETTINGS_MISSING_ROW'
    | 'SETTINGS_INVALID_ROW';
  reason: string;
}

export interface SectionDisplaySummary {
  sectionKey: AppSectionKey;
  labelAr: string;
  shortLabelAr: string;
  sectionEnabled: boolean | null;
  deliveryEnabled: boolean | null;
  sectionVisible: boolean | null;
  sectionStatusLabel: 'مفعل' | 'متوقف' | 'غير متاح';
  deliveryStatusLabel: 'متاح' | 'متوقف' | 'غير متاح';
  visibilityLabel: 'ظاهر' | 'مخفي' | null;
  loadState: AppSectionRowLoadState;
  errorMessage: string | null;
  isOperationalForNewOrders: boolean;
}

function classifyAppSectionDbError(
  err: any
): 'permission_denied' | 'table_missing' | 'error' {
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

function buildSectionFailedOp(err: any): DbFailedOperation {
  const errorType = classifyAppSectionDbError(err);
  return {
    table: 'app_section_settings',
    operation: 'SELECT',
    errorType,
    isRls: errorType === 'permission_denied',
    code: err?.code ? String(err.code) : null,
    message: String(
      err?.message || err || 'تعذر قراءة جدول إعدادات الأقسام app_section_settings.'
    ),
  };
}

function parseStrictBoolean(val: any): boolean | null {
  if (typeof val === 'boolean') return val;
  if (val === 1 || val === '1' || val === 'true' || val === 'TRUE') return true;
  if (val === 0 || val === '0' || val === 'false' || val === 'FALSE') return false;
  return null;
}

function resolveSectionKeyFromRow(row: Record<string, any> | null | undefined): AppSectionKey | null {
  if (!row || typeof row !== 'object') return null;

  const candidates = [
    row.section_key,
    row.section,
    row.key,
    row.code,
    row.slug,
    row.section_code,
    row.section_name,
    row.name,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (
      normalized === 'household_shortages' ||
      normalized === 'pharmacy' ||
      normalized === 'ready_food'
    ) {
      return normalized;
    }
  }

  return null;
}

function buildSectionEntry(
  key: AppSectionKey,
  rowState: AppSectionRowLoadState,
  errorMessage: string | null = null
): AppSectionSetting {
  return {
    section_key: key,
    label_ar: APP_SECTION_META[key].labelAr,
    short_label_ar: APP_SECTION_META[key].shortLabelAr,
    section_enabled: null,
    section_visible: null,
    delivery_enabled: null,
    load_state: rowState,
    error_message: errorMessage,
    updated_at: null,
    raw_record: null,
  };
}

export function createEmptyAppSectionSettingsState(
  state: AppSectionSettingsState['load_state'] = 'idle',
  rowState: AppSectionRowLoadState = 'idle',
  errorMessage: string | null = null,
  failedOperation: DbFailedOperation | null = null
): AppSectionSettingsState {
  return {
    load_state: state,
    sections: {
      household_shortages: buildSectionEntry('household_shortages', rowState, errorMessage),
      pharmacy: buildSectionEntry('pharmacy', rowState, errorMessage),
      ready_food: buildSectionEntry('ready_food', rowState, errorMessage),
    },
    lastSyncedAt: null,
    errorMessage,
    failedOperation,
  };
}

/**
 * Fetches central operational settings directly from `public.app_section_settings`.
 * - Zero localStorage caching so admin changes apply immediately.
 * - Independent parsing per section: one malformed/missing section never breaks the other two.
 * - Never treats `section_visible` as `delivery_enabled`.
 */
export async function fetchAppSectionSettings(
  supabase: SupabaseClient | null
): Promise<AppSectionSettingsState> {
  if (!supabase) {
    const msg = 'عميل Supabase غير مهيأ لقراءة حالة الأقسام والتوصيل.';
    return createEmptyAppSectionSettingsState('error', 'error', msg, {
      table: 'app_section_settings',
      operation: 'SELECT',
      errorType: 'error',
      isRls: false,
      code: null,
      message: msg,
    });
  }

  try {
    const { data, error } = await supabase.from('app_section_settings').select('*');

    if (error) {
      const failedOp = buildSectionFailedOp(error);
      return createEmptyAppSectionSettingsState(
        failedOp.errorType,
        failedOp.errorType,
        failedOp.message,
        failedOp
      );
    }

    const rows = Array.isArray(data) ? data : [];
    const nowIso = new Date().toISOString();

    if (rows.length === 0) {
      return {
        ...createEmptyAppSectionSettingsState(
          'empty',
          'missing_row',
          'جدول app_section_settings لا يحتوي على أي سجلات للأقسام.'
        ),
        lastSyncedAt: nowIso,
      };
    }

    const sections: Record<AppSectionKey, AppSectionSetting> = {
      household_shortages: buildSectionEntry(
        'household_shortages',
        'missing_row',
        'سجل قسم نواقص المنزل غير موجود في app_section_settings.'
      ),
      pharmacy: buildSectionEntry(
        'pharmacy',
        'missing_row',
        'سجل قسم الصيدلية غير موجود في app_section_settings.'
      ),
      ready_food: buildSectionEntry(
        'ready_food',
        'missing_row',
        'سجل قسم الأكل الجاهز غير موجود في app_section_settings.'
      ),
    };

    for (const row of rows) {
      const key = resolveSectionKeyFromRow(row);
      if (!key) continue;

      const sectionEnabled = parseStrictBoolean(row.section_enabled);
      const sectionVisible = parseStrictBoolean(row.section_visible);
      const deliveryEnabled = parseStrictBoolean(row.delivery_enabled);

      if (sectionEnabled === null || deliveryEnabled === null) {
        sections[key] = {
          section_key: key,
          label_ar: APP_SECTION_META[key].labelAr,
          short_label_ar: APP_SECTION_META[key].shortLabelAr,
          section_enabled: sectionEnabled,
          section_visible: sectionVisible,
          delivery_enabled: deliveryEnabled,
          load_state: 'invalid_row',
          error_message: `قيم section_enabled أو delivery_enabled غير مكتملة لقسم ${APP_SECTION_META[key].labelAr}.`,
          updated_at: row.updated_at ? String(row.updated_at) : null,
          raw_record: row,
        };
        continue;
      }

      sections[key] = {
        section_key: key,
        label_ar: APP_SECTION_META[key].labelAr,
        short_label_ar: APP_SECTION_META[key].shortLabelAr,
        section_enabled: sectionEnabled,
        section_visible: sectionVisible,
        delivery_enabled: deliveryEnabled,
        load_state: 'loaded',
        error_message: null,
        updated_at: row.updated_at ? String(row.updated_at) : null,
        raw_record: row,
      };
    }

    const loadedCount = APP_SECTION_KEYS.filter(
      (k) => sections[k].load_state === 'loaded'
    ).length;

    let aggregateState: AppSectionSettingsState['load_state'] = 'loaded';
    let aggregateMsg: string | null = null;

    if (loadedCount === 0) {
      aggregateState = 'empty';
      aggregateMsg =
        'لم يتم العثور على إعدادات صالحة للأقسام المعتمدة (household_shortages, pharmacy, ready_food).';
    } else if (loadedCount < APP_SECTION_KEYS.length) {
      aggregateState = 'partial';
      const missingLabels = APP_SECTION_KEYS.filter(
        (k) => sections[k].load_state !== 'loaded'
      ).map((k) => APP_SECTION_META[k].labelAr);
      aggregateMsg = `تعذر قراءة أو اكتمال إعدادات: ${missingLabels.join('، ')}.`;
    }

    return {
      load_state: aggregateState,
      sections,
      lastSyncedAt: nowIso,
      errorMessage: aggregateMsg,
      failedOperation: null,
    };
  } catch (err: any) {
    const failedOp = buildSectionFailedOp(err);
    return createEmptyAppSectionSettingsState(
      failedOp.errorType === 'error' ? 'error' : failedOp.errorType,
      failedOp.errorType === 'error' ? 'error' : failedOp.errorType,
      failedOp.message,
      failedOp
    );
  }
}

/**
 * Resolves the canonical `app_section_settings` key for any order object.
 */
export function resolveOrderSectionKey(order: any): AppSectionKey {
  if (!order) return 'household_shortages';

  if (
    order.type === 'pharmacy' ||
    order.prescription_title !== undefined ||
    order.requested_pharmacy_id !== undefined ||
    order.pharmacy_selection_mode !== undefined ||
    order.address_governorate_id !== undefined
  ) {
    return 'pharmacy';
  }

  if (isRestaurantOrder(order)) {
    return 'ready_food';
  }

  return 'household_shortages';
}

/**
 * Evaluates whether NEW unassigned orders for a single section may be shown or accepted.
 * - Independent per section: another section's error or disabled flag never blocks this section.
 * - Never treats `section_visible` as `delivery_enabled`.
 * - Must NEVER be used to hide, cancel, or block already assigned/accepted orders.
 */
export function evaluateSectionOperationalStatus(
  settingsState: AppSectionSettingsState | null | undefined,
  sectionKey: AppSectionKey
): SectionOperationalEvaluation {
  const meta = APP_SECTION_META[sectionKey];

  if (!settingsState || settingsState.load_state === 'idle') {
    return {
      sectionKey,
      sectionLabelAr: meta.labelAr,
      canShowNewOrders: false,
      canAcceptNewOrders: false,
      sectionEnabled: null,
      sectionVisible: null,
      deliveryEnabled: null,
      statusCode: 'SETTINGS_IDLE',
      reason: `لم يتم تحميل حالة قسم «${meta.labelAr}» من قاعدة البيانات بعد.`,
    };
  }

  const entry = settingsState.sections?.[sectionKey];

  if (!entry || entry.load_state === 'idle') {
    return {
      sectionKey,
      sectionLabelAr: meta.labelAr,
      canShowNewOrders: false,
      canAcceptNewOrders: false,
      sectionEnabled: null,
      sectionVisible: null,
      deliveryEnabled: null,
      statusCode: 'SETTINGS_IDLE',
      reason: `حالة قسم «${meta.labelAr}» قيد التحميل من النظام المركزي.`,
    };
  }

  if (entry.load_state === 'missing_row') {
    return {
      sectionKey,
      sectionLabelAr: meta.labelAr,
      canShowNewOrders: false,
      canAcceptNewOrders: false,
      sectionEnabled: entry.section_enabled,
      sectionVisible: entry.section_visible,
      deliveryEnabled: entry.delivery_enabled,
      statusCode: 'SETTINGS_MISSING_ROW',
      reason:
        entry.error_message ||
        `سجل قسم «${meta.labelAr}» غير موجود في app_section_settings؛ تم تعليق استقبال طلباته الجديدة احترازياً.`,
    };
  }

  if (entry.load_state === 'invalid_row') {
    return {
      sectionKey,
      sectionLabelAr: meta.labelAr,
      canShowNewOrders: false,
      canAcceptNewOrders: false,
      sectionEnabled: entry.section_enabled,
      sectionVisible: entry.section_visible,
      deliveryEnabled: entry.delivery_enabled,
      statusCode: 'SETTINGS_INVALID_ROW',
      reason:
        entry.error_message ||
        `بيانات قسم «${meta.labelAr}» غير مكتملة في app_section_settings.`,
    };
  }

  if (
    entry.load_state === 'permission_denied' ||
    entry.load_state === 'table_missing' ||
    entry.load_state === 'error'
  ) {
    return {
      sectionKey,
      sectionLabelAr: meta.labelAr,
      canShowNewOrders: false,
      canAcceptNewOrders: false,
      sectionEnabled: entry.section_enabled,
      sectionVisible: entry.section_visible,
      deliveryEnabled: entry.delivery_enabled,
      statusCode: 'SETTINGS_UNAVAILABLE',
      reason:
        entry.error_message ||
        `تعذر التحقق من حالة قسم «${meta.labelAr}» في قاعدة البيانات.`,
    };
  }

  // Strictly check section_enabled independently of section_visible
  if (entry.section_enabled !== true) {
    return {
      sectionKey,
      sectionLabelAr: meta.labelAr,
      canShowNewOrders: false,
      canAcceptNewOrders: false,
      sectionEnabled: entry.section_enabled,
      sectionVisible: entry.section_visible,
      deliveryEnabled: entry.delivery_enabled,
      statusCode: 'SECTION_DISABLED',
      reason: `قسم «${meta.labelAr}» متوقف حاليًا من الإدارة؛ لا يمكن عرض أو قبول طلبات جديدة لهذا القسم.`,
    };
  }

  // Strictly check delivery_enabled independently of section_visible
  if (entry.delivery_enabled !== true) {
    return {
      sectionKey,
      sectionLabelAr: meta.labelAr,
      canShowNewOrders: false,
      canAcceptNewOrders: false,
      sectionEnabled: entry.section_enabled,
      sectionVisible: entry.section_visible,
      deliveryEnabled: entry.delivery_enabled,
      statusCode: 'DELIVERY_DISABLED',
      reason: `خدمة التوصيل لقسم «${meta.labelAr}» متوقفة حاليًا؛ لا يمكن عرض أو قبول طلبات جديدة لهذا القسم.`,
    };
  }

  return {
    sectionKey,
    sectionLabelAr: meta.labelAr,
    canShowNewOrders: true,
    canAcceptNewOrders: true,
    sectionEnabled: entry.section_enabled,
    sectionVisible: entry.section_visible,
    deliveryEnabled: entry.delivery_enabled,
    statusCode: 'OPERATIONAL',
    reason: `قسم «${meta.labelAr}» مفعل والتوصيل متاح.`,
  };
}

/**
 * Formats UI display labels strictly keeping section_enabled, delivery_enabled, and section_visible separate.
 */
export function getSectionStatusDisplayMeta(
  setting: AppSectionSetting
): SectionDisplaySummary {
  const isLoaded = setting.load_state === 'loaded';

  const sectionStatusLabel: SectionDisplaySummary['sectionStatusLabel'] =
    isLoaded && setting.section_enabled === true
      ? 'مفعل'
      : isLoaded && setting.section_enabled === false
      ? 'متوقف'
      : 'غير متاح';

  const deliveryStatusLabel: SectionDisplaySummary['deliveryStatusLabel'] =
    isLoaded && setting.delivery_enabled === true
      ? 'متاح'
      : isLoaded && setting.delivery_enabled === false
      ? 'متوقف'
      : 'غير متاح';

  const visibilityLabel: SectionDisplaySummary['visibilityLabel'] =
    setting.section_visible === true
      ? 'ظاهر'
      : setting.section_visible === false
      ? 'مخفي'
      : null;

  return {
    sectionKey: setting.section_key,
    labelAr: setting.label_ar,
    shortLabelAr: setting.short_label_ar,
    sectionEnabled: setting.section_enabled,
    deliveryEnabled: setting.delivery_enabled,
    sectionVisible: setting.section_visible,
    sectionStatusLabel,
    deliveryStatusLabel,
    visibilityLabel,
    loadState: setting.load_state,
    errorMessage: setting.error_message || null,
    isOperationalForNewOrders:
      isLoaded &&
      setting.section_enabled === true &&
      setting.delivery_enabled === true,
  };
}
