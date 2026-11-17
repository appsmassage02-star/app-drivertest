import type { CentralGeoContext, DeliveryDriver, DeliveryOrder } from '../types';
import {
  evaluateCentralCoverageMatch,
  type CentralCoverageMatchResult,
} from '../lib/geoCoverageService';

/**
 * Normalizes Arabic text for search filtering & pharmacy directory name lookup.
 * Note: Text matching is NO LONGER used for driver order coverage eligibility.
 */
export function normalizeArabicLocation(text?: string | null): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .replace(/\u0640/g, '') // remove tatweel
    .replace(/[إأآا]/g, 'ا') // normalize alef
    .replace(/[ةه]/g, 'ه') // normalize teh marbuta / heh
    .replace(/[ىي]/g, 'ي') // normalize alef maksura / yeh
    .replace(/\s+/g, ' '); // collapse whitespace
}

/**
 * @deprecated Legacy static governorate helper retained only for pharmacy text directory search compatibility.
 * Must NEVER be used to determine driver coverage or order eligibility.
 */
export function resolveGovernorate(_input?: string | null): { code: string; name: string } | null {
  return null;
}

/**
 * Evaluates whether an order belongs to the driver's central coverage in the database.
 * Uses strictly CentralGeoContext IDs (`delivery_governorate_id`, `delivery_center_id`, `delivery_area_id`)
 * matched against `delivery_driver_area_coverage` (platform) or `restaurant_driver_area_coverage` (restaurant staff).
 *
 * Legacy text comparison (`governorate_name` / `markaz_name`) and `egyptLocations.ts` are completely disabled.
 */
export function getTerritoryMatchReason(
  order: DeliveryOrder | Record<string, any>,
  driver: DeliveryDriver | null,
  geoContext?: CentralGeoContext | null
): CentralCoverageMatchResult {
  return evaluateCentralCoverageMatch(order, driver, geoContext);
}

/**
 * Returns true if order is already assigned to driver or matches driver's central coverage by IDs.
 */
export function isOrderMatchingDriverTerritory(
  order: DeliveryOrder | Record<string, any>,
  driver: DeliveryDriver | null,
  geoContext?: CentralGeoContext | null
): boolean {
  return getTerritoryMatchReason(order, driver, geoContext).matched;
}
