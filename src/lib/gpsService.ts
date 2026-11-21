import type { DeliverySystemSettings } from '../types';

/**
 * Customer Destination & Google Maps Navigation Utility for Talabaty Driver App.
 *
 * Rules:
 * - Legacy device GPS, geolocation permissions, background tracking, and driver coordinate
 *   collection are permanently disabled in the driver app.
 * - Navigation opens Google Maps strictly using the customer's saved delivery coordinates
 *   via: https://www.google.com/maps/dir/?api=1&destination=LATITUDE,LONGITUDE
 * - NEVER uses static/default coordinates or driver origin GPS.
 * - Strictly validates customer coordinates before launching; returns clear Arabic error
 *   "موقع وجهة الطلب غير متوفر" if missing or invalid.
 */

export interface DriverGPSLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
  recordedAt: string;
  source: 'browser_geolocation' | 'capacitor_geolocation';
  isMock: boolean | null;
}

export type GPSStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'rejected_accuracy'
  | 'rejected_mock';

export interface GPSResult {
  success: boolean;
  location: DriverGPSLocation | null;
  status: GPSStatus;
  errorMessage: string | null;
}

export interface GpsTrackingValidationResult {
  accepted: boolean;
  reasonCode:
    | 'OK'
    | 'INVALID_LOCATION'
    | 'MOCK_LOCATION_REJECTED'
    | 'TRACKING_DISABLED'
    | 'TRACKING_SETTINGS_UNAVAILABLE'
    | 'ACCURACY_LIMIT_MISSING'
    | 'ACCURACY_TOO_LOW';
  reason: string;
}

export interface CustomerGoogleMapsNavTarget {
  valid: boolean;
  latitude: number | null;
  longitude: number | null;
  directionsUrl: string | null;
  embedUrl: string | null;
  errorMessage: string | null;
}

export const MISSING_DESTINATION_COORDS_MESSAGE = 'موقع وجهة الطلب غير متوفر';

/**
 * Validates that latitude and longitude are valid numeric geographic coordinates.
 * Excludes (0, 0) as an uninitialized placeholder (Null Island).
 */
export function isValidCoordinate(lat?: any, lng?: any): boolean {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === '') {
    return false;
  }
  const nLat = Number(lat);
  const nLng = Number(lng);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return false;
  }

  if (nLat < -90 || nLat > 90) {
    return false;
  }

  if (nLng < -180 || nLng > 180) {
    return false;
  }

  if (nLat === 0 && nLng === 0) {
    return false;
  }

  return true;
}

/**
 * Extracts and validates coordinates strictly from verified destination fields.
 * NEVER falls back blindly to ambiguous top-level `source.latitude` / `source.longitude`.
 */
export function extractOrderCoordinates(
  source: any,
  prefix: 'customer' | 'restaurant' | 'pharmacy' = 'customer'
): { latitude: number; longitude: number } | null {
  if (!source) return null;

  let latCandidates: any[] = [];
  let lngCandidates: any[] = [];

  if (prefix === 'restaurant') {
    latCandidates = [
      source.restaurant_latitude,
      source.restaurant_lat,
      source.pickup_latitude,
      source.pickup_lat,
      source.store?.latitude,
      source.store?.lat,
      source.restaurant?.latitude,
    ];
    lngCandidates = [
      source.restaurant_longitude,
      source.restaurant_lng,
      source.pickup_longitude,
      source.pickup_lng,
      source.store?.longitude,
      source.store?.lng,
      source.restaurant?.longitude,
    ];
  } else if (prefix === 'pharmacy') {
    latCandidates = [
      source.requested_pharmacy_latitude,
      source.pharmacy_latitude,
      source.pharmacy?.latitude,
    ];
    lngCandidates = [
      source.requested_pharmacy_longitude,
      source.pharmacy_longitude,
      source.pharmacy?.longitude,
    ];
  } else {
    latCandidates = [
      source.delivery_latitude,
      source.address_latitude,
      source.household_addresses?.latitude,
      source.customer?.delivery_latitude,
      source.customer?.latitude,
      source.customer?.lat,
      source.delivery_address?.latitude,
    ];
    lngCandidates = [
      source.delivery_longitude,
      source.address_longitude,
      source.household_addresses?.longitude,
      source.customer?.delivery_longitude,
      source.customer?.longitude,
      source.customer?.lng,
      source.delivery_address?.longitude,
    ];
  }

  for (let i = 0; i < latCandidates.length; i++) {
    const lat = latCandidates[i];
    const lng = lngCandidates[i];
    if (isValidCoordinate(lat, lng)) {
      return { latitude: Number(lat), longitude: Number(lng) };
    }
  }

  return null;
}

/**
 * Legacy GPS tracking validation — permanently disabled because driver GPS tracking is cancelled.
 */
export function validateGpsForTracking(
  _location: DriverGPSLocation | null,
  _settings?: DeliverySystemSettings | null
): GpsTrackingValidationResult {
  return {
    accepted: false,
    reasonCode: 'TRACKING_DISABLED',
    reason: 'تم إلغاء تتبع GPS في تطبيق السائق والاعتماد على خرائط Google لإحداثيات العميل فقط.',
  };
}

/**
 * Legacy hardware GPS reader — permanently disabled.
 * Never prompts browser/device geolocation permissions.
 */
export async function getRealDriverGPS(_highAccuracy: boolean = false): Promise<GPSResult> {
  return {
    success: false,
    location: null,
    status: 'unavailable',
    errorMessage: 'تم إلغاء تتبع موقع السائق (GPS) والاكتفاء بالملاحة إلى إحداثيات العميل.',
  };
}

/**
 * Builds the official Google Maps directions URL strictly with customer destination coordinates:
 * https://www.google.com/maps/dir/?api=1&destination=LATITUDE,LONGITUDE
 */
export function getGoogleMapsDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/**
 * Builds an embeddable Google Maps preview URL for displaying the saved customer pin
 * inside the app's navigation modal without requiring any Google Maps API keys.
 */
export function getGoogleMapsEmbedUrl(latitude: number, longitude: number): string {
  return `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;
}

/**
 * Validates and constructs the customer destination Google Maps navigation payload for an order.
 * Uses ONLY saved customer coordinates; NEVER uses driver GPS or static fallbacks.
 */
export function buildCustomerGoogleMapsNav(order: any): CustomerGoogleMapsNavTarget {
  const coords = extractOrderCoordinates(order, 'customer');
  if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
    return {
      valid: false,
      latitude: null,
      longitude: null,
      directionsUrl: null,
      embedUrl: null,
      errorMessage: MISSING_DESTINATION_COORDS_MESSAGE,
    };
  }

  return {
    valid: true,
    latitude: coords.latitude,
    longitude: coords.longitude,
    directionsUrl: getGoogleMapsDirectionsUrl(coords.latitude, coords.longitude),
    embedUrl: getGoogleMapsEmbedUrl(coords.latitude, coords.longitude),
    errorMessage: null,
  };
}

/**
 * Opens Google Maps navigation without altering order status or requiring GPS permission.
 * Validates coordinates strictly first.
 */
export function openExternalNavigation(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  _destinationName?: string
): { success: boolean; url?: string; error?: string } {
  if (!isValidCoordinate(latitude, longitude)) {
    return {
      success: false,
      error: MISSING_DESTINATION_COORDS_MESSAGE,
    };
  }

  const latNum = Number(latitude);
  const lngNum = Number(longitude);
  const url = getGoogleMapsDirectionsUrl(latNum, lngNum);

  try {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (typeof window !== 'undefined' && window.location && typeof window.location.assign === 'function') {
      window.location.assign(url);
    }
    return { success: true, url };
  } catch (e: any) {
    return {
      success: false,
      error: `تعذر فتح خرائط Google: ${e?.message || e}`,
    };
  }
}
