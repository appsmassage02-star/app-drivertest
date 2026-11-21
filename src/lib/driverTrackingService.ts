import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbFailedOperation, DeliverySystemSettings } from '../types';
import type { DriverGPSLocation } from './gpsService';

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
  failedOperations?: DbFailedOperation[];
}

function buildEmptySettings(
  load_state: DeliverySystemSettings['load_state'],
  error_message: string | null,
  failedOperation: DbFailedOperation | null = null
): DeliverySystemSettings {
  return {
    driver_tracking_enabled: false,
    navigation_enabled: true,
    routing_provider: 'google',
    routing_engine: 'google_maps',
    driver_location_update_interval_seconds: null,
    max_accepted_gps_accuracy_m: null,
    route_deviation_threshold_m: null,
    load_state,
    error_message,
    failedOperation,
  };
}

/**
 * Legacy delivery_system_settings reader retained as a safe non-blocking stub.
 * Tracking is disabled; Google Maps navigation depends only on saved customer coordinates.
 */
export async function fetchDeliverySystemSettings(
  _supabase: SupabaseClient | null
): Promise<DeliverySystemSettings> {
  return buildEmptySettings('loaded', null, null);
}

/**
 * Permanently disabled no-op: driver app no longer records or sends GPS positions to
 * `delivery_driver_current_locations` or `delivery_driver_locations`.
 */
export async function recordDriverLocation(
  _supabase: SupabaseClient | null,
  _driverId: string | null | undefined,
  _location: DriverGPSLocation | null,
  _settings: DeliverySystemSettings | null,
  _activeOrderId?: string | null
): Promise<TrackingPersistResult> {
  return {
    status: 'skipped_disabled',
    message: 'تم إلغاء إرسال وتتبع موقع السائق في التطبيق.',
    currentLocationSaved: false,
    historySaved: false,
    errorDetails: null,
    failedOperations: [],
  };
}
