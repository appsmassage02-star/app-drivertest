import type { DeliveryOrder, DeliveryDriver } from '../App';
import { EGYPT_GOVERNORATES } from './egyptLocations';

/**
 * Normalizes Arabic text for location comparison.
 * Removes diacritics, tatweel, and normalizes common letter variations (alef, teh marbuta, yeh).
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
 * Resolves a governorate name or code to its canonical governorate object.
 */
export function resolveGovernorate(input?: string | null) {
  if (!input) return null;
  const raw = input.trim();
  const upper = raw.toUpperCase();
  const normalized = normalizeArabicLocation(raw);

  return (
    EGYPT_GOVERNORATES.find(
      (g) =>
        g.code.toUpperCase() === upper ||
        normalizeArabicLocation(g.name) === normalized
    ) || null
  );
}

/**
 * Evaluates whether an order belongs to the driver's active territory.
 * Rules strictly compliant with official specifications:
 * 1. Assigned Orders: If the order is already accepted/assigned to this driver -> always match.
 * 2. New Available Orders (status === 'pending_review'):
 *    - Condition 1: Must match driver's Governorate. If different -> Hide.
 *    - Condition 2: Must match driver's Markaz. If different -> Hide.
 *    - Condition 3: Match Governorate AND Markaz -> Show.
 *    - Condition 4: Street does NOT enter into the condition.
 *    - Condition 14: If order lacks structured governorate or markaz -> Hide.
 */
export function getTerritoryMatchReason(
  order: DeliveryOrder,
  driver: DeliveryDriver | null
): { matched: boolean; reason: string } {
  if (!driver) {
    return { matched: false, reason: 'لا يوجد سجل سائق مصادق عليه' };
  }

  // Orders already assigned to this driver remain visible in their active/history list
  if (order.assigned_driver_id && order.assigned_driver_id === driver.id) {
    return { matched: true, reason: 'طلب مخصص للسائق مسبقًا' };
  }

  // Official Driver Territory from DB
  const driverGov = (driver.governorate_name || '').trim();
  const driverGovCode = (driver.governorate_code || '').trim();
  const driverMarkaz = (driver.markaz_name || '').trim();

  // If driver has no registered territory in delivery_drivers, cannot receive new orders
  if (!driverGov || !driverMarkaz) {
    return { matched: false, reason: 'بيانات موقع السائق غير مكتملة في سجل delivery_drivers' };
  }

  // Official Order Location
  const orderCountry = (order.country || '').trim();
  const orderGov = (order.governorate_name || order.governorate || '').trim();
  const orderMarkaz = (order.markaz_name || order.center || '').trim();

  // Condition 14: If order lacks structured governorate or markaz, do not show
  if (!orderGov || !orderMarkaz) {
    return { matched: false, reason: 'طلب يحتاج بيانات عنوان مكتملة (المحافظة أو المركز مفقود)' };
  }

  // Country check if specified
  if (orderCountry) {
    const normOrderCountry = normalizeArabicLocation(orderCountry);
    const normDriverCountry = normalizeArabicLocation('مصر');
    if (normOrderCountry !== normDriverCountry && normOrderCountry !== 'egypt' && normOrderCountry !== 'eg') {
      return { matched: false, reason: 'اختلاف الدولة' };
    }
  }

  // Condition 1: Compare Governorate (Name or Code)
  const normDriverGov = normalizeArabicLocation(driverGov);
  const normOrderGov = normalizeArabicLocation(orderGov);

  const resolvedDriverGov = resolveGovernorate(driverGov) || (driverGovCode ? resolveGovernorate(driverGovCode) : null);
  const resolvedOrderGov = resolveGovernorate(orderGov);

  const isGovMatch =
    normDriverGov === normOrderGov ||
    (resolvedDriverGov && resolvedOrderGov && resolvedDriverGov.code === resolvedOrderGov.code) ||
    (driverGovCode && orderGov.toUpperCase() === driverGovCode.toUpperCase());

  if (!isGovMatch) {
    return { matched: false, reason: 'اختلاف المحافظة' };
  }

  // Condition 2: Compare Markaz (Normalized name)
  const normDriverMarkaz = normalizeArabicLocation(driverMarkaz);
  const normOrderMarkaz = normalizeArabicLocation(orderMarkaz);

  if (normDriverMarkaz !== normOrderMarkaz) {
    return { matched: false, reason: 'اختلاف المركز' };
  }

  // Condition 3: Match!
  return { matched: true, reason: 'تطابق المحافظة والمركز' };
}

/**
 * Returns true if order matches driver territory (or is assigned to driver).
 */
export function isOrderMatchingDriverTerritory(
  order: DeliveryOrder,
  driver: DeliveryDriver | null
): boolean {
  return getTerritoryMatchReason(order, driver).matched;
}
