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
  trackingAccuracyWarning: string | null;
  lastTrackingResult: TrackingPersistResult | null;
  requestGPSLocation: (highAccuracy?: boolean) => Promise<DriverGPSLocation | null>;
  navigateToCoordinates: (lat: number, lng: number, label?: string) => { success: boolean; error?: string };
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
  const trackingOptionsRef = useRef(trackingOptions);
  trackingOptionsRef.current = trackingOptions;

  const isTrackingActive = Boolean(
    autoRequestWhenWorking &&
      trackingOptions?.systemSettings?.driver_tracking_enabled === true &&
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
          if (opts?.supabase && opts?.driverId) {
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
      if (opts?.supabase && opts?.driverId && settings) {
        const persistRes = await recordDriverLocation(
          opts.supabase,
          opts.driverId,
          loc,
          settings,
          opts.activeOrderId
        );
        setLastTrackingResult(persistRes);
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

  // Request GPS when driver availability status switches to working, and refresh periodically while working if tracking enabled
  useEffect(() => {
    if (!autoRequestWhenWorking) return;
    void requestGPSLocation(true);

    const trackingEnabled = trackingOptions?.systemSettings?.driver_tracking_enabled === true;
    if (!trackingEnabled) return;

    const timer = setInterval(() => {
      void requestGPSLocation(true);
    }, 45_000);

    return () => clearInterval(timer);
  }, [
    autoRequestWhenWorking,
    trackingOptions?.systemSettings?.driver_tracking_enabled,
    trackingOptions?.driverId,
    requestGPSLocation,
  ]);

  return {
    driverLocation,
    gpsStatus,
    gpsErrorMessage,
    isLoadingGPS,
    isTrackingActive,
    trackingAccuracyWarning,
    lastTrackingResult,
    requestGPSLocation,
    navigateToCoordinates,
  };
}
