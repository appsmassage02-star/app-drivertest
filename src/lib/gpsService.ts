import type { DeliverySystemSettings } from '../types';

/**
 * GPS and Navigation Service for Talabaty Driver App.
 *
 * Rules:
 * - Uses genuine device Geolocation API (navigator.geolocation or runtime Capacitor plugin if present).
 * - NEVER uses mock, static, or Cairo default coordinates.
 * - Tracks accuracy, recordedAt, source, and mock-location status when available.
 * - Enforces max_accepted_gps_accuracy_m and driver_tracking_enabled from delivery_system_settings.
 * - Completely independent of map rendering (GPS functions even if map fails).
 * - Strictly validates coordinates before navigation; opening navigation does NOT alter order status.
 */

export interface DriverGPSLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
  recordedAt: string; // ISO-8601
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

/**
 * Validates that latitude and longitude are valid numeric geographic coordinates.
 * Excludes (0, 0) as it is usually an uninitialized placeholder (Null Island).
 */
export function isValidCoordinate(lat?: any, lng?: any): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  const nLat = Number(lat);
  const nLng = Number(lng);

  if (isNaN(nLat) || isNaN(nLng)) {
    return false;
  }

  // Latitudes must be between -90 and 90
  if (nLat < -90 || nLat > 90) {
    return false;
  }

  // Longitudes must be between -180 and 180
  if (nLng < -180 || nLng > 180) {
    return false;
  }

  // Reject exact 0,0 placeholder
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
    // Customer / Delivery coordinates (explicit delivery fields first, no blind top-level latitude fallback)
    latCandidates = [
      source.delivery_latitude,
      source.address_latitude,
      source.customer?.delivery_latitude,
      source.customer?.latitude,
      source.customer?.lat,
      source.delivery_address?.latitude,
    ];
    lngCandidates = [
      source.delivery_longitude,
      source.address_longitude,
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
 * Validates a GPS reading against central delivery_system_settings rules:
 * - Coordinates must be valid.
 * - Mock/simulated positions (isMock === true) are rejected.
 * - driver_tracking_enabled must explicitly be true.
 * - accuracy must be <= max_accepted_gps_accuracy_m from DB settings (no hardcoded threshold fallback).
 */
export function validateGpsForTracking(
  location: DriverGPSLocation | null,
  settings?: DeliverySystemSettings | null
): GpsTrackingValidationResult {
  if (!location || !isValidCoordinate(location.latitude, location.longitude)) {
    return {
      accepted: false,
      reasonCode: 'INVALID_LOCATION',
      reason: 'إحداثيات الموقع الجغرافي غير صالحة أو غير متوفرة.',
    };
  }

  if (location.isMock === true) {
    return {
      accepted: false,
      reasonCode: 'MOCK_LOCATION_REJECTED',
      reason: 'تم رفض قراءة الموقع لأنها صادرة من مصدر وهمي (Mock Location).',
    };
  }

  if (!settings || settings.load_state !== 'loaded' || settings.driver_tracking_enabled === null) {
    return {
      accepted: false,
      reasonCode: 'TRACKING_SETTINGS_UNAVAILABLE',
      reason: 'إعدادات تتبع السائقين (delivery_system_settings) غير محملة أو غير مكتملة.',
    };
  }

  if (settings.driver_tracking_enabled !== true) {
    return {
      accepted: false,
      reasonCode: 'TRACKING_DISABLED',
      reason: 'تتبع موقع السائقين معطل حاليًا من إعدادات النظام (driver_tracking_enabled = false).',
    };
  }

  const maxAcc = settings.max_accepted_gps_accuracy_m;
  if (maxAcc === null || maxAcc === undefined || !Number.isFinite(maxAcc) || maxAcc <= 0) {
    return {
      accepted: false,
      reasonCode: 'ACCURACY_LIMIT_MISSING',
      reason: 'الحد الأقصى المقبول لدقة الـ GPS (max_accepted_gps_accuracy_m) غير محدد في إعدادات النظام.',
    };
  }

  if (!Number.isFinite(location.accuracy) || location.accuracy <= 0 || location.accuracy > maxAcc) {
    return {
      accepted: false,
      reasonCode: 'ACCURACY_TOO_LOW',
      reason: `دقة قراءة الـ GPS الحالية (${Math.round(location.accuracy)}م) تتجاوز الحد الأقصى المقبول في النظام (${maxAcc}م) — تم رفض القراءة.`,
    };
  }

  return {
    accepted: true,
    reasonCode: 'OK',
    reason: `قراءة GPS صالحة ضمن الحد المسموح (±${Math.round(location.accuracy)}م ≤ ${maxAcc}م).`,
  };
}

/**
 * Reads mock indicator when exposed by Android/Capacitor or browser coordinate metadata.
 */
function extractIsMockFlag(rawPos: any): boolean | null {
  if (typeof rawPos?.isMock === 'boolean') return rawPos.isMock;
  if (typeof rawPos?.mocked === 'boolean') return rawPos.mocked;
  if (typeof rawPos?.coords?.isMock === 'boolean') return rawPos.coords.isMock;
  if (typeof rawPos?.coords?.mocked === 'boolean') return rawPos.coords.mocked;
  return null;
}

/**
 * Requests the driver's real GPS position from device hardware.
 * Checks runtime Capacitor Geolocation bridge first if present, otherwise standard Geolocation API.
 * Battery-friendly: Uses reasonable timeout and cached max-age.
 */
export async function getRealDriverGPS(
  highAccuracy: boolean = false
): Promise<GPSResult> {
  // Check runtime Capacitor Geolocation plugin if embedded inside native wrapper
  const capGeo =
    typeof window !== 'undefined'
      ? (window as any)?.Capacitor?.Plugins?.Geolocation
      : null;

  if (capGeo && typeof capGeo.getCurrentPosition === 'function') {
    try {
      const pos = await capGeo.getCurrentPosition({
        enableHighAccuracy: highAccuracy,
        timeout: 15000,
        maximumAge: 30000,
      });
      const ts = Number(pos?.timestamp || Date.now());
      const isMock = extractIsMockFlag(pos);
      const location: DriverGPSLocation = {
        latitude: Number(pos.coords.latitude),
        longitude: Number(pos.coords.longitude),
        accuracy: Number(pos.coords.accuracy ?? 0),
        altitude: pos.coords.altitude ?? null,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        timestamp: ts,
        recordedAt: new Date(ts).toISOString(),
        source: 'capacitor_geolocation',
        isMock,
      };

      if (isMock === true) {
        return {
          success: false,
          location: null,
          status: 'rejected_mock',
          errorMessage: 'تم اكتشاف موقع وهمي (Mock Location) على الجهاز ورفضه تلقائيًا.',
        };
      }

      return {
        success: true,
        location,
        status: 'granted',
        errorMessage: null,
      };
    } catch {
      // Fall through to standard navigator.geolocation if Capacitor call fails or lacks permission
    }
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return {
      success: false,
      location: null,
      status: 'unsupported',
      errorMessage: 'خدمة تحديد الموقع (Geolocation) غير مدعومة على هذا الجهاز أو المتصفح.',
    };
  }

  return new Promise((resolve) => {
    const options: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      timeout: 15000, // 15 seconds
      maximumAge: 30000, // 30 seconds cache to save battery
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ts = Number(pos.timestamp || Date.now());
        const isMock = extractIsMockFlag(pos);
        if (isMock === true) {
          resolve({
            success: false,
            location: null,
            status: 'rejected_mock',
            errorMessage: 'تم اكتشاف موقع وهمي (Mock Location) ورفض القراءة.',
          });
          return;
        }

        const coords: DriverGPSLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: ts,
          recordedAt: new Date(ts).toISOString(),
          source: 'browser_geolocation',
          isMock,
        };

        resolve({
          success: true,
          location: coords,
          status: 'granted',
          errorMessage: null,
        });
      },
      (err) => {
        let status: GPSStatus = 'unavailable';
        let errorMessage = 'تعذر الحصول على الموقع الجغرافي من الجهاز.';

        if (err.code === 1) {
          status = 'denied';
          errorMessage =
            'تم رفض إذن الوصول إلى موقع الجهاز (GPS). يرجى السماح بالوصول للموقع من إعدادات المتصفح أو الجهاز للاستفادة من الملاحة.';
        } else if (err.code === 2) {
          status = 'unavailable';
          errorMessage =
            'خدمة الـ GPS معطلة أو غير متوفرة حالياً على هذا الجهاز. يرجى تفعيل الموقع (Location) في جهازك.';
        } else if (err.code === 3) {
          status = 'timeout';
          errorMessage =
            'انتهت مهلة استجابة الـ GPS دون استقبال إشارة دقيقة. يرجى التأكد من التواجد في مكان ذي تغطية جيدة والمحاولة مجدداً.';
        }

        resolve({
          success: false,
          location: null,
          status,
          errorMessage,
        });
      },
      options
    );
  });
}

/**
 * Builds the official Google Maps turn-by-turn directions URL for validated coordinates.
 */
export function getGoogleMapsDirectionsUrl(latitude: number, longitude: number): string {
  const destination = `${latitude},${longitude}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * Opens external Google Maps turn-by-turn navigation without altering order status.
 * Validates coordinates first.
 */
export function openExternalNavigation(
  latitude: number,
  longitude: number,
  _destinationName?: string
): { success: boolean; url?: string; error?: string } {
  if (!isValidCoordinate(latitude, longitude)) {
    return {
      success: false,
      error: 'الإحداثيات الجغرافية لهذه الوجهة غير متوفرة أو غير صالحة.',
    };
  }

  const url = getGoogleMapsDirectionsUrl(latitude, longitude);

  try {
    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
    return { success: true, url };
  } catch (e: any) {
    return {
      success: false,
      error: `تعذر فتح تطبيق الخرائط: ${e?.message || e}`,
    };
  }
}
