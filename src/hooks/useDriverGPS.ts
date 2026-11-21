import { useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverySystemSettings } from '../types';
import {
  type DriverGPSLocation,
  type GPSStatus,
  openExternalNavigation,
} from '../lib/gpsService';
import type { TrackingPersistResult } from '../lib/driverTrackingService';

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

export function resolveTrackingIntervalMs(_settings?: DeliverySystemSettings | null): number | null {
  return null;
}

/**
 * Legacy GPS tracking hook — permanently disabled.
 * Never requests device geolocation permissions, never sets tracking intervals,
 * and never writes driver coordinates to Supabase.
 */
export function useDriverGPS(
  _autoRequestWhenWorking: boolean = false,
  _trackingOptions?: UseDriverGPSTrackingOptions
): UseDriverGPSResult {
  const requestGPSLocation = useCallback(async (): Promise<DriverGPSLocation | null> => {
    return null;
  }, []);

  const navigateToCoordinates = useCallback((lat: number, lng: number, label?: string) => {
    return openExternalNavigation(lat, lng, label);
  }, []);

  return {
    driverLocation: null,
    gpsStatus: 'idle',
    gpsErrorMessage: null,
    isLoadingGPS: false,
    isTrackingActive: false,
    trackingIntervalSeconds: null,
    trackingScope: 'foreground_only',
    backgroundTrackingSupported: false,
    trackingAccuracyWarning: null,
    lastTrackingResult: null,
    requestGPSLocation,
    navigateToCoordinates,
  };
}
