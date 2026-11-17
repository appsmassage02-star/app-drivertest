import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverySystemSettings } from '../types';
import {
  type DriverGPSLocation,
  validateGpsForTracking,
} from './gpsService';

export interface TrackingPersistResult {
  status:
    | 'saved'
    | 'skipped_disabled'
    | 'skipped_settings_unavailable'
    | 'rejected_accuracy'
    | 'rejected_mock'
    | 'invalid_location'
    | 'db_error';
  message: string;
  currentLocationSaved: boolean;
  historySaved: boolean;
  errorDetails?: string | null;
}

function classifyDbError(err: any): 'permission_denied' | 'table_missing' | 'error' {
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

function parseBool(val: any): boolean | null {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1' || val === 1) return true;
  if (val === 'false' || val === '0' || val === 0) return false;
  return null;
}

function parsePositiveNum(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Fetches central tracking settings strictly from `delivery_system_settings`.
 * Supports either single-row column layout or key-value row layout.
 * NEVER falls back to hardcoded accuracy thresholds or fake driver_tracking_enabled = true.
 */
export async function fetchDeliverySystemSettings(
  supabase: SupabaseClient | null
): Promise<DeliverySystemSettings> {
  if (!supabase) {
    return {
      driver_tracking_enabled: null,
      max_accepted_gps_accuracy_m: null,
      load_state: 'error',
      error_message: 'عميل Supabase غير مهيأ.',
    };
  }

  try {
    const { data, error } = await supabase
      .from('delivery_system_settings')
      .select('*')
      .limit(25);

    if (error) {
      return {
        driver_tracking_enabled: null,
        max_accepted_gps_accuracy_m: null,
        load_state: classifyDbError(error),
        error_message: error.message || 'تعذر قراءة جدول delivery_system_settings.',
      };
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      return {
        driver_tracking_enabled: null,
        max_accepted_gps_accuracy_m: null,
        load_state: 'empty',
        error_message: 'جدول delivery_system_settings فارغ.',
      };
    }

    // 1. Check direct column layout on first row
    const first = rows[0];
    if (
      first &&
      ('driver_tracking_enabled' in first || 'max_accepted_gps_accuracy_m' in first)
    ) {
      return {
        driver_tracking_enabled: parseBool(first.driver_tracking_enabled),
        max_accepted_gps_accuracy_m: parsePositiveNum(first.max_accepted_gps_accuracy_m),
        load_state: 'loaded',
        raw_record: first,
        error_message: null,
      };
    }

    // 2. Key-value row fallback (e.g., key / setting_key + value / setting_value)
    let trackingEnabled: boolean | null = null;
    let maxAccuracy: number | null = null;
    for (const r of rows) {
      const k = String(r.key || r.setting_key || r.name || '').toLowerCase().trim();
      const v = r.value ?? r.setting_value ?? r.setting_val;
      if (k === 'driver_tracking_enabled') {
        trackingEnabled = parseBool(v);
      } else if (k === 'max_accepted_gps_accuracy_m') {
        maxAccuracy = parsePositiveNum(v);
      }
    }

    return {
      driver_tracking_enabled: trackingEnabled,
      max_accepted_gps_accuracy_m: maxAccuracy,
      load_state: 'loaded',
      raw_record: first,
      error_message: null,
    };
  } catch (err: any) {
    return {
      driver_tracking_enabled: null,
      max_accepted_gps_accuracy_m: null,
      load_state: 'error',
      error_message: err?.message || 'خطأ أثناء قراءة إعدادات التتبع المركزية.',
    };
  }
}

/**
 * Records validated real GPS coordinates into:
 * - delivery_driver_current_locations (upsert on driver_id)
 * - delivery_driver_locations (append history record)
 *
 * Strictly enforces:
 * - driver_tracking_enabled === true
 * - isMock !== true
 * - accuracy <= max_accepted_gps_accuracy_m
 */
export async function recordDriverLocation(
  supabase: SupabaseClient | null,
  driverId: string | null | undefined,
  location: DriverGPSLocation | null,
  settings: DeliverySystemSettings | null,
  activeOrderId?: string | null
): Promise<TrackingPersistResult> {
  if (!supabase || !driverId) {
    return {
      status: 'db_error',
      message: 'تعذر حفظ الموقع: بيانات السائق أو الاتصال بـ Supabase غير متوفرة.',
      currentLocationSaved: false,
      historySaved: false,
      errorDetails: 'Missing supabase client or driverId',
    };
  }

  const validation = validateGpsForTracking(location, settings);
  if (!validation.accepted) {
    if (validation.reasonCode === 'TRACKING_DISABLED') {
      return {
        status: 'skipped_disabled',
        message: validation.reason,
        currentLocationSaved: false,
        historySaved: false,
      };
    }
    if (
      validation.reasonCode === 'TRACKING_SETTINGS_UNAVAILABLE' ||
      validation.reasonCode === 'ACCURACY_LIMIT_MISSING'
    ) {
      return {
        status: 'skipped_settings_unavailable',
        message: validation.reason,
        currentLocationSaved: false,
        historySaved: false,
      };
    }
    if (validation.reasonCode === 'MOCK_LOCATION_REJECTED') {
      return {
        status: 'rejected_mock',
        message: validation.reason,
        currentLocationSaved: false,
        historySaved: false,
      };
    }
    if (validation.reasonCode === 'ACCURACY_TOO_LOW') {
      return {
        status: 'rejected_accuracy',
        message: validation.reason,
        currentLocationSaved: false,
        historySaved: false,
      };
    }
    return {
      status: 'invalid_location',
      message: validation.reason,
      currentLocationSaved: false,
      historySaved: false,
    };
  }

  const safeLoc = location!;
  const currentPayload: Record<string, any> = {
    driver_id: driverId,
    latitude: safeLoc.latitude,
    longitude: safeLoc.longitude,
    accuracy_m: safeLoc.accuracy,
    accuracy: safeLoc.accuracy,
    recorded_at: safeLoc.recordedAt,
    updated_at: safeLoc.recordedAt,
    source: safeLoc.source,
    is_mock: safeLoc.isMock ?? false,
    ...(safeLoc.speed !== null && safeLoc.speed !== undefined ? { speed: safeLoc.speed } : {}),
    ...(safeLoc.heading !== null && safeLoc.heading !== undefined ? { heading: safeLoc.heading } : {}),
  };

  const historyPayload: Record<string, any> = {
    driver_id: driverId,
    latitude: safeLoc.latitude,
    longitude: safeLoc.longitude,
    accuracy_m: safeLoc.accuracy,
    accuracy: safeLoc.accuracy,
    recorded_at: safeLoc.recordedAt,
    source: safeLoc.source,
    is_mock: safeLoc.isMock ?? false,
    ...(activeOrderId ? { order_id: activeOrderId } : {}),
    ...(safeLoc.speed !== null && safeLoc.speed !== undefined ? { speed: safeLoc.speed } : {}),
    ...(safeLoc.heading !== null && safeLoc.heading !== undefined ? { heading: safeLoc.heading } : {}),
  };

  let currentLocationSaved = false;
  let historySaved = false;
  const errors: string[] = [];

  // 1. Upsert into delivery_driver_current_locations (adapt gracefully if table uses accuracy vs accuracy_m)
  try {
    let { error: curErr } = await supabase
      .from('delivery_driver_current_locations')
      .upsert(currentPayload, { onConflict: 'driver_id' });

    if (curErr && String(curErr.message || '').toLowerCase().includes('accuracy_m')) {
      const { accuracy_m: _drop, ...fallbackCurPayload } = currentPayload;
      const retry = await supabase
        .from('delivery_driver_current_locations')
        .upsert(fallbackCurPayload, { onConflict: 'driver_id' });
      curErr = retry.error;
    } else if (curErr && String(curErr.message || '').toLowerCase().includes("'accuracy'")) {
      const { accuracy: _drop, ...fallbackCurPayload } = currentPayload;
      const retry = await supabase
        .from('delivery_driver_current_locations')
        .upsert(fallbackCurPayload, { onConflict: 'driver_id' });
      curErr = retry.error;
    }

    if (curErr) {
      errors.push(`delivery_driver_current_locations: ${curErr.message}`);
    } else {
      currentLocationSaved = true;
    }
  } catch (e: any) {
    errors.push(`delivery_driver_current_locations: ${e?.message || e}`);
  }

  // 2. Insert into delivery_driver_locations
  try {
    let { error: histErr } = await supabase
      .from('delivery_driver_locations')
      .insert(historyPayload);

    if (histErr && String(histErr.message || '').toLowerCase().includes('accuracy_m')) {
      const { accuracy_m: _drop, ...fallbackHistPayload } = historyPayload;
      const retry = await supabase
        .from('delivery_driver_locations')
        .insert(fallbackHistPayload);
      histErr = retry.error;
    } else if (histErr && String(histErr.message || '').toLowerCase().includes("'accuracy'")) {
      const { accuracy: _drop, ...fallbackHistPayload } = historyPayload;
      const retry = await supabase
        .from('delivery_driver_locations')
        .insert(fallbackHistPayload);
      histErr = retry.error;
    }

    if (histErr) {
      errors.push(`delivery_driver_locations: ${histErr.message}`);
    } else {
      historySaved = true;
    }
  } catch (e: any) {
    errors.push(`delivery_driver_locations: ${e?.message || e}`);
  }

  if (currentLocationSaved || historySaved) {
    return {
      status: 'saved',
      message:
        errors.length === 0
          ? 'تم تسجيل موقع السائق الفعلي في جداول التتبع بنجاح.'
          : `تم تسجيل الموقع جزئيًا (${errors.join(' | ')})`,
      currentLocationSaved,
      historySaved,
      errorDetails: errors.length > 0 ? errors.join(' | ') : null,
    };
  }

  return {
    status: 'db_error',
    message: `تعذر حفظ موقع السائق في الخادم: ${errors.join(' | ')}`,
    currentLocationSaved: false,
    historySaved: false,
    errorDetails: errors.join(' | '),
  };
}
