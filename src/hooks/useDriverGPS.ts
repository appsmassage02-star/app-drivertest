import { useState, useCallback, useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverySystemSettings } from '../types';
import {
  DriverGPSLocation,
  GPSStatus,
  getRealDriverGPS,
  openExternalNavigation,
  validateGpsForTracking,
} from '../lib/gpsService';
import {
  recordDriverLocation,
  type TrackingPersistResult,
} from '../lib/driverTrackingService';

export interface UseDriverGPSTrackingOptions {
  supabase?: SupabaseClient | null;
  driverId?: string | null;
  systemSettings?: DeliverySystemSettings | null;
  activeOrderId?: string | null;
}

export interface UseDriverGPSResult {
  driverLocation: DriverGPSLocation | null;
  gpsStatus: GPSStatus;
  gpsErrorMessage: string | null;
  isLoadingGPS: boolean;
  isTrackingActive: boolean;
  trackingIntervalSeconds: number | null;
  trackingScope: 'foreground_only';
  backgroundTrackingSupported: false;
  trackingAccuracyWarning: string | null;
  lastTrackingResult: TrackingPersistResult | null;
  requestGPSLocation: (highAccuracy?: boolean) => Promise<DriverGPSLocation | null>;
  navigateToCoordinates: (lat: number, lng: number, label?: string) => { success: boolean; error?: string };
}

/**
 * Computes periodic GPS persistence interval strictly from central delivery_system_settings.
 * Returns null (disabling periodic writes) when tracking is not enabled or interval is missing/invalid.
 * NEVER falls back to a hardcoded default interval such as 45_000 ms.
 */
export function resolveTrackingIntervalMs(
  settings?: DeliverySystemSettings | null
): number | null {
  if (!settings || settings.load_state !== 'loaded') return null;
  if (settings.driver_tracking_enabled !== true) return null;
  const seconds = settings.driver_location_update_interval_seconds;
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return Math.round(seconds * 1000);
}

export function useDriverGPS(
  autoRequestWhenWorking: boolean = false,
  trackingOptions?: UseDriverGPSTrackingOptions
): UseDriverGPSResult {
  const [driverLocation, setDriverLocation] = useState<DriverGPSLocation | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GPSStatus>('idle');
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);
  const [isLoadingGPS, setIsLoadingGPS] = useState(false);
  const [trackingAccuracyWarning, setTrackingAccuracyWarning] = useState<string | null>(null);
  const [lastTrackingResult, setLastTrackingResult] = useState<TrackingPersistResult | null>(null);

  const isRequestingRef = useRef(false);
  const intervalRef = useRef<any>(null);
  const trackingOptionsRef = useRef(trackingOptions);
  trackingOptionsRef.current = trackingOptions;

  const trackingIntervalMs = resolveTrackingIntervalMs(trackingOptions?.systemSettings);
  const trackingIntervalSeconds =
    trackingIntervalMs !== null ? Math.round(trackingIntervalMs / 1000) : null;

  const isTrackingActive = Boolean(
    autoRequestWhenWorking &&
      trackingOptions?.systemSettings?.driver_tracking_enabled === true &&
      trackingIntervalMs !== null &&
      trackingOptions?.driverId &&
      driverLocation &&
      lastTrackingResult?.status === 'saved'
  );

  const requestGPSLocation = useCallback(async (highAccuracy: boolean = false): Promise<DriverGPSLocation | null> => {
    if (isRequestingRef.current) return null;
    isRequestingRef.current = true;
    setIsLoadingGPS(true);
    setGpsStatus('requesting');

    try {
      const result = await getRealDriverGPS(highAccuracy);
      const opts = trackingOptionsRef.current;

      if (!result.success || !result.location) {
        // Strict compliance: NEVER set dummy or static coordinates on failure!
        setGpsStatus(result.status);
        setGpsErrorMessage(result.errorMessage);
        setDriverLocation(null);
        setTrackingAccuracyWarning(null);
        return null;
      }

      const loc = result.location;
      const settings = opts?.systemSettings || null;

      // Validate against delivery_system_settings when loaded
      if (settings && settings.load_state === 'loaded') {
        const validation = validateGpsForTracking(loc, settings);
        if (validation.reasonCode === 'ACCURACY_TOO_LOW' || validation.reasonCode === 'MOCK_LOCATION_REJECTED') {
          setGpsStatus(
            validation.reasonCode === 'MOCK_LOCATION_REJECTED' ? 'rejected_mock' : 'rejected_accuracy'
          );
          setTrackingAccuracyWarning(validation.reason);
          setGpsErrorMessage(validation.reason);
          // Do not persist rejected readings!
          if (opts?.supabase && opts?.driverId && settings.driver_tracking_enabled === true) {
            const rejectedRes = await recordDriverLocation(
              opts.supabase,
              opts.driverId,
              loc,
              settings,
              opts.activeOrderId
            );
            setLastTrackingResult(rejectedRes);
          }
          setDriverLocation(null);
          return null;
        }
      }

      setTrackingAccuracyWarning(null);
      setGpsStatus('granted');
      setGpsErrorMessage(null);
      setDriverLocation(loc);

      // Persist ONLY when tracking is explicitly enabled in delivery_system_settings and driverId is present
      if (opts?.supabase && opts?.driverId && settings?.driver_tracking_enabled === true) {
        const persistRes = await recordDriverLocation(
          opts.supabase,
          opts.driverId,
          loc,
          settings,
          opts.activeOrderId
        );
        setLastTrackingResult(persistRes);
      } else if (settings && settings.driver_tracking_enabled !== true) {
        setLastTrackingResult({
          status:
            settings.load_state === 'loaded' ? 'skipped_disabled' : 'skipped_settings_unavailable',
          message:
            settings.load_state === 'loaded'
              ? 'تتبع موقع السائقين معطل من إعدادات النظام (driver_tracking_enabled = false).'
              : 'إعدادات تتبع السائقين غير متوفرة.',
          currentLocationSaved: false,
          historySaved: false,
        });
      }

      return loc;
    } finally {
      setIsLoadingGPS(false);
      isRequestingRef.current = false;
    }
  }, []);

  const navigateToCoordinates = useCallback((lat: number, lng: number, label?: string) => {
    return openExternalNavigation(lat, lng, label);
  }, []);

  // Request initial GPS when working; run periodic tracking interval ONLY at the central interval when enabled
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!autoRequestWhenWorking || !trackingOptions?.driverId) {
      return;
    }

    void requestGPSLocation(true);

    if (trackingIntervalMs === null) {
      return;
    }

    intervalRef.current = setInterval(() => {
      void requestGPSLocation(true);
    }, trackingIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    autoRequestWhenWorking,
    trackingIntervalMs,
    trackingOptions?.driverId,
    requestGPSLocation,
  ]);

  return {
    driverLocation,
    gpsStatus,
    gpsErrorMessage,
    isLoadingGPS,
    isTrackingActive,
    trackingIntervalSeconds,
    trackingScope: 'foreground_only',
    backgroundTrackingSupported: false,
    trackingAccuracyWarning,
    lastTrackingResult,
    requestGPSLocation,
    navigateToCoordinates,
  };
}
