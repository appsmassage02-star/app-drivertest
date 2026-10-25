import {
  PharmacyOrder,
  PharmacyOrderItem,
  PharmacyOrderStatus,
  PharmacyItemStatus,
  PharmacyPrescriptionImage,
  PharmacyDriverNote,
  PharmacyPharmacyVisit,
  PharmacyCancellationRequest,
  PharmacyChangeSuggestion,
  PharmacyRealtimePayload,
  PharmacyRealtimeEventType,
  PharmacyCompensationStatus,
  RegisteredPharmacy,
  PharmacyDirectoryQueryResult,
} from '../types/pharmacy';
import { normalizeArabicLocation, resolveGovernorate } from '../data/locationOrderMatcher';
import { getClient, type DeliveryDriver } from '../App';
import { dataUrlToBlob } from '../components/DocumentUploader';
import { ordersService } from '../services/ordersService';

export interface IPharmacyRepository {
  getOrdersForDriver(driver: DeliveryDriver | null): Promise<PharmacyOrder[]>;
  getOrderById(orderId: string): Promise<PharmacyOrder | null>;
  getActivePharmaciesForOrder(params?: {
    governorateName?: string | null;
    governorateCode?: string | null;
    markazName?: string | null;
    searchQuery?: string;
  }): Promise<PharmacyDirectoryQueryResult>;
  getShortageReasonSuggestions(): Promise<string[]>;
  acceptOrder(orderId: string, driver: DeliveryDriver): Promise<PharmacyOrder>;
  startShopping(orderId: string, driverId: string): Promise<PharmacyOrder>;
  updateItemResolution(
    orderId: string,
    itemId: string,
    params: {
      purchasedQuantity: number;
      shortageReason?: string | null;
      driverNote?: string | null;
    }
  ): Promise<PharmacyOrder>;
  savePrescriptionImageNote(
    orderId: string,
    imageId: string,
    driverId: string,
    noteText: string
  ): Promise<PharmacyOrder>;
  addDriverPharmacyVisit(
    orderId: string,
    driverId: string,
    pharmacyName: string,
    addressOrNote?: string,
    pharmacyId?: string | null,
    stopStatus?: string
  ): Promise<PharmacyOrder>;
  removeDriverPharmacyVisit(
    orderId: string,
    visitId: string
  ): Promise<PharmacyOrder>;
  suggestPharmacyChange(
    orderId: string,
    driverId: string,
    suggestedPharmacyName: string,
    reason: string,
    suggestedPharmacyId?: string | null
  ): Promise<PharmacyOrder>;
  saveOrderTotals(
    orderId: string,
    medicinesTotal: number,
    deliveryFee: number
  ): Promise<PharmacyOrder>;
  saveReceiptImage(
    orderId: string,
    receiptDataUrl: string | null
  ): Promise<PharmacyOrder>;
  completePreparation(
    orderId: string,
    params: {
      medicinesTotal: number;
      deliveryFee: number;
      receiptImageUrl?: string | null;
    }
  ): Promise<PharmacyOrder>;
  markCustomerContacted(orderId: string): Promise<PharmacyOrder>;
  markUnableToFulfill(
    orderId: string,
    driverId: string,
    note?: string
  ): Promise<PharmacyOrder>;
  completeDelivery(orderId: string, driverId: string): Promise<PharmacyOrder>;
  requestCancellation(
    orderId: string,
    driverId: string,
    reasonCategory: string,
    reasonText: string
  ): Promise<PharmacyOrder>;
  receiveSystemCompensationUpdate(
    orderId: string,
    status: PharmacyCompensationStatus,
    amount?: number | null,
    note?: string | null
  ): Promise<PharmacyOrder>;
  subscribeToRealtime(
    listener: (payload: PharmacyRealtimePayload) => void,
    onStatusChange?: (status: string, err?: any) => void,
    onRawEvent?: (table: string, eventType: string, recordId: string | null, rawPayload: any) => void
  ): () => void;
}

/**
 * Normalizes Arabic text for resilient pharmacy name & location search
 * (strips tatweel, diacritics, extra spaces, and unifies Alef/Taa Marbuta/Yaa).
 */
export function normalizeArabicSearchText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/^صيدلي[هة]\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Separates structured system summary text (such as `[الصيدلية المطلوبة: ...] الأدوية المطلوبة: ...`)
 * from genuine customer-written delivery notes without converting the text into fake items.
 */
export function parseStructuredCustomerNotes(rawNotes?: string | null): {
  extractedPharmacyName: string | null;
  cleanCustomerNotes: string | null;
  hasEmbeddedMedicinesText: boolean;
  embeddedMedicinesSummary: string | null;
} {
  if (!rawNotes) {
    return {
      extractedPharmacyName: null,
      cleanCustomerNotes: null,
      hasEmbeddedMedicinesText: false,
      embeddedMedicinesSummary: null,
    };
  }

  let working = String(rawNotes).trim();
  if (!working) {
    return {
      extractedPharmacyName: null,
      cleanCustomerNotes: null,
      hasEmbeddedMedicinesText: false,
      embeddedMedicinesSummary: null,
    };
  }

  let extractedPharmacyName: string | null = null;
  let hasEmbeddedMedicinesText = false;
  let embeddedMedicinesSummary: string | null = null;

  // 1. Extract bracketed pharmacy tag e.g. [الصيدلية المطلوبة: عابدين] or [الصيدلية المحددة: ...]
  const bracketPharmacyRegex = /\[\s*(?:الصيدلي[ةه]\s*(?:المطلوب[ةه]|المحدد[ةه]|المختار[ةه])?)\s*[:：-]\s*([^\]]+?)\s*\]/gi;
  working = working.replace(bracketPharmacyRegex, (_fullMatch, pName) => {
    if (pName && !extractedPharmacyName) {
      extractedPharmacyName = String(pName).trim();
    }
    return ' ';
  });

  // 2. Detect embedded medicines list text e.g. "الأدوية المطلوبة: 1. كالما (1 علبة)."
  const medicinesRegex =
    /(?:الأدوي[ةه]|الادوي[ةه]|الأصناف|الاصناف)\s*المطلوب[ةه]\s*[:：]\s*([\s\S]*?)(?=(?:\s*(?:[-–—|•]\s*)?(?:ملاحظات(?:\s*العميل|\s*التوصيل|\s*إضافية)?|ملاحظ[ةه])\s*[:：])|\r?\n|$)/i;
  const medMatch = working.match(medicinesRegex);
  if (medMatch) {
    hasEmbeddedMedicinesText = true;
    embeddedMedicinesSummary = medMatch[1]?.trim() || medMatch[0].trim();

    const fullMedSegment = medMatch[0];
    const idx = working.indexOf(fullMedSegment);
    if (idx !== -1) {
      const before = working.slice(0, idx).trim();
      const after = working.slice(idx + fullMedSegment.length).trim();

      const explicitNoteMatch = after.match(
        /^(?:[-–—|•]\s*)?(?:ملاحظات(?:\s*العميل|\s*التوصيل|\s*إضافية)?|ملاحظ[ةه])\s*[:：]\s*([\s\S]*)$/i
      );
      if (explicitNoteMatch) {
        working = [before, explicitNoteMatch[1].trim()].filter(Boolean).join(' — ');
      } else {
        working = [before, after].filter(Boolean).join(' ').trim();
      }
    }
  }

  // Strip leftover explicit "ملاحظات العميل:" prefix if it wraps an empty or real note
  working = working
    .replace(/^(?:[-–—|•.]\s*)+/, '')
    .replace(/(?:[-–—|•]\s*)+$/, '')
    .replace(/^(?:ملاحظات(?:\s*العميل|\s*إضافية)?\s*[:：]\s*)/i, '')
    .trim();

  if (
    !working ||
    working === '.' ||
    working === '-' ||
    working === 'لا يوجد' ||
    working === 'لا توجد' ||
    working === 'لا توجد ملاحظات' ||
    working === 'بدون ملاحظات'
  ) {
    working = '';
  }

  return {
    extractedPharmacyName,
    cleanCustomerNotes: working || null,
    hasEmbeddedMedicinesText,
    embeddedMedicinesSummary,
  };
}

/**
 * Checks whether a PharmacyOrder matches the authenticated driver's territory
 * using the exact same Governorate + Markaz rules as regular delivery orders.
 */
export function isPharmacyOrderMatchingDriverTerritory(
  order: PharmacyOrder,
  driver: DeliveryDriver | null
): boolean {
  if (!driver) return false;
  if (order.assigned_driver_id && order.assigned_driver_id === driver.id) {
    return true;
  }

  const driverGov = (driver.governorate_name || '').trim();
  const driverGovCode = (driver.governorate_code || '').trim();
  const driverMarkaz = (driver.markaz_name || '').trim();
  if (!driverGov || !driverMarkaz) return false;

  const orderGov = (order.governorate_name || '').trim();
  const orderGovCode = (order.governorate_code || '').trim();
  const orderMarkaz = (order.markaz_name || '').trim();
  if ((!orderGov && !orderGovCode) || !orderMarkaz) return false;

  const normDriverGov = normalizeArabicLocation(driverGov);
  const normOrderGov = normalizeArabicLocation(orderGov);

  const resolvedDriverGov =
    resolveGovernorate(driverGov) || (driverGovCode ? resolveGovernorate(driverGovCode) : null);
  const resolvedOrderGov =
    resolveGovernorate(orderGov) || (orderGovCode ? resolveGovernorate(orderGovCode) : null);

  const isGovMatch =
    (normDriverGov && normOrderGov && normDriverGov === normOrderGov) ||
    Boolean(resolvedDriverGov && resolvedOrderGov && resolvedDriverGov.code === resolvedOrderGov.code) ||
    Boolean(
      driverGovCode &&
        ((orderGovCode && orderGovCode.toUpperCase() === driverGovCode.toUpperCase()) ||
          orderGov.toUpperCase() === driverGovCode.toUpperCase())
    );

  if (!isGovMatch) return false;

  const normDriverMarkaz = normalizeArabicLocation(driverMarkaz);
  const normOrderMarkaz = normalizeArabicLocation(orderMarkaz);
  return normDriverMarkaz === normOrderMarkaz;
}

/**
 * Checks if a RegisteredPharmacy matches the target governorate and markaz/center.
 */
export function doesPharmacyMatchOrderArea(
  pharmacy: RegisteredPharmacy,
  targetGovName?: string | null,
  targetGovCode?: string | null,
  targetMarkazName?: string | null
): { govMatches: boolean; markazMatches: boolean } {
  const pGovName = (pharmacy.governorate_name || '').trim();
  const pGovCode = (pharmacy.governorate_code || '').trim();
  const pCenter = (pharmacy.center_name || '').trim();

  const oGovName = (targetGovName || '').trim();
  const oGovCode = (targetGovCode || '').trim();
  const oMarkaz = (targetMarkazName || '').trim();

  let govMatches = true;
  if (oGovName || oGovCode) {
    if (!pGovName && !pGovCode) {
      govMatches = true;
    } else {
      const normPGov = normalizeArabicLocation(pGovName);
      const normOGov = normalizeArabicLocation(oGovName);
      const resPGov =
        resolveGovernorate(pGovName) || (pGovCode ? resolveGovernorate(pGovCode) : null);
      const resOGov =
        resolveGovernorate(oGovName) || (oGovCode ? resolveGovernorate(oGovCode) : null);

      govMatches =
        Boolean(normPGov && normOGov && normPGov === normOGov) ||
        Boolean(resPGov && resOGov && resPGov.code === resOGov.code) ||
        Boolean(
          pGovCode &&
            oGovCode &&
            pGovCode.toUpperCase() === oGovCode.toUpperCase()
        );
    }
  }

  let markazMatches = true;
  if (oMarkaz && pCenter) {
    const normPCenter = normalizeArabicLocation(pCenter);
    const normOMarkaz = normalizeArabicLocation(oMarkaz);
    markazMatches =
      normPCenter === normOMarkaz ||
      normPCenter.includes(normOMarkaz) ||
      normOMarkaz.includes(normPCenter);
  }

  return { govMatches, markazMatches };
}

const PHARMACY_ORDER_SELECT_QUERY = `
  id,
  order_number,
  user_id,
  household_id,
  saved_prescription_id,
  prescription_title,
  requested_pharmacy_id,
  requested_pharmacy_name,
  pharmacy_selection_mode,
  status,
  medicines_total,
  delivery_fee,
  grand_total,
  source_address_id,
  address_governorate_code,
  address_governorate_name,
  address_center_name,
  address_text,
  address_latitude,
  address_longitude,
  customer_notes,
  accepted_at,
  shopping_started_at,
  ready_for_delivery_at,
  completed_at,
  cancelled_at,
  unable_to_fulfill_at,
  created_at,
  updated_at,
  pharmacy_delivery_orders(*),
  pharmacy_order_items(*),
  pharmacy_order_files(*),
  pharmacy_order_pharmacy_stops(*, pharmacy_pharmacies(*)),
  pharmacy_driver_compensation(*),
  pharmacy_pharmacies(*),
  pharmacy_saved_prescriptions(*, pharmacy_saved_prescription_items(*)),
  household_addresses(*),
  households(*)
`;

function resolveStorageUrl(storagePath?: string | null): string {
  if (!storagePath) return '';
  const trimmed = String(storagePath).trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const supabase = getClient();
  if (!supabase) return trimmed;

  const parts = trimmed.split('/').filter(Boolean);
  const bucketCandidates = ['pharmacy', 'pharmacy-files', 'pharmacy-orders', 'driver-documents'];
  if (parts.length > 1 && bucketCandidates.includes(parts[0])) {
    const bucket = parts[0];
    const objectPath = parts.slice(1).join('/');
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    if (data?.publicUrl) return data.publicUrl;
  }
  const { data } = supabase.storage.from('pharmacy').getPublicUrl(trimmed);
  return data?.publicUrl || trimmed;
}

function unwrapSingle<T>(relData: T | T[] | null | undefined): T | null {
  if (!relData) return null;
  if (Array.isArray(relData)) return relData[0] ?? null;
  return relData;
}

function unwrapArray<T>(relData: T | T[] | null | undefined): T[] {
  if (!relData) return [];
  if (Array.isArray(relData)) return relData;
  return [relData];
}

function mapItemRow(row: any, orderStatus: PharmacyOrderStatus): PharmacyOrderItem {
  const reqQty = Math.max(1, Number(row.requested_quantity ?? row.quantity ?? 1) || 1);
  const rawPurchased = row.purchased_quantity;
  const rawShortage = row.shortage_reason ? String(row.shortage_reason).trim() : null;

  let status: PharmacyItemStatus = 'pending';
  let purchasedQty = 0;
  let unavailableQty = 0;

  const explicitStatus = row.status || row.item_status || row.availability_status;
  if (
    explicitStatus === 'pending' ||
    explicitStatus === 'purchased' ||
    explicitStatus === 'unavailable'
  ) {
    status = explicitStatus;
    purchasedQty = Math.max(0, Math.min(reqQty, Number(rawPurchased) || 0));
    unavailableQty = status === 'pending' ? 0 : Math.max(0, reqQty - purchasedQty);
  } else if (rawPurchased === null || rawPurchased === undefined) {
    if (rawShortage) {
      status = 'unavailable';
      purchasedQty = 0;
      unavailableQty = reqQty;
    } else {
      status = 'pending';
      purchasedQty = 0;
      unavailableQty = 0;
    }
  } else {
    const numPurchased = Number(rawPurchased);
    if (numPurchased > 0) {
      status = 'purchased';
      purchasedQty = Math.min(reqQty, numPurchased);
      unavailableQty = Math.max(0, reqQty - purchasedQty);
    } else if (
      rawShortage ||
      orderStatus === 'ready_for_delivery' ||
      orderStatus === 'completed' ||
      orderStatus === 'unable_to_fulfill'
    ) {
      status = 'unavailable';
      purchasedQty = 0;
      unavailableQty = reqQty;
    } else {
      status = 'pending';
      purchasedQty = 0;
      unavailableQty = 0;
    }
  }

  const unitStr = row.unit ? String(row.unit).trim() : null;
  const driverNoteStr = row.driver_note ? String(row.driver_note).trim() : null;

  return {
    id: String(row.id),
    order_id: String(row.order_id || row.prescription_id || ''),
    medicine_name: String(row.item_name || row.medicine_name || 'صنف دوائي'),
    requested_quantity: reqQty,
    purchased_quantity: purchasedQty,
    unavailable_quantity: unavailableQty,
    status,
    shortage_reason: rawShortage,
    dosage_notes: driverNoteStr,
    unit: unitStr,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function mapSupabaseOrderToPharmacyOrder(
  row: any,
  directItemsOverride?: any[],
  itemsQueryError?: string | null
): PharmacyOrder {
  const deliveryRow = unwrapSingle<any>(row.pharmacy_delivery_orders);
  const addressRow = unwrapSingle<any>(row.household_addresses);
  const householdRow = unwrapSingle<any>(row.households);
  const pharmacyRow = unwrapSingle<any>(row.pharmacy_pharmacies);
  const compRow = unwrapSingle<any>(row.pharmacy_driver_compensation);
  const savedPrescriptionRow = unwrapSingle<any>(row.pharmacy_saved_prescriptions);

  const embeddedItems = unwrapArray<any>(row.pharmacy_order_items);
  const itemsRaw =
    directItemsOverride && directItemsOverride.length > 0
      ? directItemsOverride
      : embeddedItems;

  const filesRaw = unwrapArray<any>(row.pharmacy_order_files);
  const stopsRaw = unwrapArray<any>(row.pharmacy_order_pharmacy_stops);

  const rawStatus = String(row.status || '').trim().toLowerCase();
  const status: PharmacyOrderStatus = (rawStatus as PharmacyOrderStatus) || 'pending_review';
  const assignedDriverId: string | null = deliveryRow?.assigned_driver_id || null;

  // Sort items by sort_order then created_at
  const sortedItems = [...itemsRaw]
    .sort((a, b) => {
      const sortA = Number(a.sort_order ?? 0);
      const sortB = Number(b.sort_order ?? 0);
      if (sortA !== sortB) return sortA - sortB;
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    })
    .map((item) => mapItemRow(item, status));

  // Parse structured customer_notes to separate embedded pharmacy/medicine summary from genuine customer notes
  const parsedNotes = parseStructuredCustomerNotes(row.customer_notes);

  // Diagnostic detection when database items are empty or query failed
  let itemsDiagnosticMessage: string | null = null;
  if (itemsQueryError) {
    itemsDiagnosticMessage = `تعذر استعلام أصناف الطلب من قاعدة البيانات (${itemsQueryError}).`;
  } else if (sortedItems.length === 0) {
    const savedPrescItems = unwrapArray<any>(
      savedPrescriptionRow?.pharmacy_saved_prescription_items
    );
    if ( parsedNotes.hasEmbeddedMedicinesText ) {
      console.warn(
        `[PharmacyService] Diagnostic: Order ${row.order_number || row.id} has 0 rows in pharmacy_order_items, while customer_notes contains embedded medicine text: "${parsedNotes.embeddedMedicinesSummary}".`
      );
      itemsDiagnosticMessage = parsedNotes.embeddedMedicinesSummary
        ? `لا توجد سجلات أصناف فعلية في جدول (pharmacy_order_items) لهذا الطلب في قاعدة البيانات (إما لم تُدرج عند إنشاء الطلب من تطبيق العميل أو محجوبة بصلاحيات القراءة RLS قبل تعيين السائق). النص المسجل في بيانات الطلب: «${parsedNotes.embeddedMedicinesSummary}».`
        : 'لا توجد سجلات أصناف فعلية في جدول (pharmacy_order_items) لهذا الطلب في قاعدة البيانات.';
    } else if (savedPrescItems.length > 0) {
      itemsDiagnosticMessage =
        'لا توجد سجلات أصناف منسوخة في جدول (pharmacy_order_items) لهذا الطلب رغم ارتباطه بروشتة محفوظة.';
    }
  }

  // Separate prescription images (up to 4) vs receipt file
  const sortedFiles = [...filesRaw].sort((a, b) => {
    const orderA = Number(a.display_order ?? 0);
    const orderB = Number(b.display_order ?? 0);
    if (orderA !== orderB) return orderA - orderB;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });

  const receiptFiles = sortedFiles.filter((f) => {
    const ft = String(f.file_type || '').toLowerCase();
    return ft === 'receipt' || ft === 'invoice' || ft === 'purchase_receipt';
  });

  const prescriptionFiles = sortedFiles
    .filter((f) => {
      const ft = String(f.file_type || '').toLowerCase();
      return ft !== 'receipt' && ft !== 'invoice' && ft !== 'purchase_receipt';
    })
    .slice(0, 4);

  const prescriptionImages: PharmacyPrescriptionImage[] = prescriptionFiles.map((f, idx) => {
    const noteText = f.driver_note ? String(f.driver_note).trim() : '';
    const driverNote: PharmacyDriverNote | null = noteText
      ? {
          id: `note-${f.id}`,
          image_id: String(f.id),
          order_id: String(row.id),
          driver_id: assignedDriverId || '',
          note_text: noteText,
          created_at: f.created_at || row.created_at,
          updated_at: row.updated_at || f.created_at,
        }
      : null;

    return {
      id: String(f.id),
      order_id: String(row.id),
      image_url: resolveStorageUrl(f.storage_path),
      storage_path: f.storage_path || null,
      mime_type: f.mime_type || null,
      label: row.prescription_title
        ? `${row.prescription_title} (${idx + 1})`
        : `صورة الروشتة #${idx + 1}`,
      customer_note: null,
      driver_note: driverNote,
      created_at: f.created_at || row.created_at,
    };
  });

  const latestReceipt = receiptFiles.length > 0 ? receiptFiles[receiptFiles.length - 1] : null;
  const receiptImageUrl = latestReceipt ? resolveStorageUrl(latestReceipt.storage_path) : null;
  const receiptCapturedAt = latestReceipt?.created_at || null;

  // Customer pharmacy specification (independent from customer notes)
  const requestedPharmacyName =
    (row.requested_pharmacy_name && String(row.requested_pharmacy_name).trim()) ||
    (pharmacyRow?.name && String(pharmacyRow.name).trim()) ||
    parsedNotes.extractedPharmacyName ||
    null;
  const requestedPharmacyId = row.requested_pharmacy_id || pharmacyRow?.id || null;
  const selectionMode = String(row.pharmacy_selection_mode || '').toLowerCase();
  const hasCustomerSpecifiedPharmacy = Boolean(
    requestedPharmacyId ||
      requestedPharmacyName ||
      (selectionMode &&
        selectionMode !== 'any' &&
        selectionMode !== 'none' &&
        selectionMode !== 'driver_choice')
  );

  // Driver pharmacy stops (internal operational log & change suggestions)
  const sortedStops = [...stopsRaw].sort(
    (a, b) =>
      new Date(a.visited_at || a.created_at || 0).getTime() -
      new Date(b.visited_at || b.created_at || 0).getTime()
  );

  const isSuggestionStop = (s: any) =>
    String(s.stop_status || '').toLowerCase().includes('suggest') ||
    String(s.internal_note || '').includes('[اقتراح تغيير الصيدلية]');

  const visitStops = sortedStops.filter((s) => !isSuggestionStop(s));

  const driverVisitedPharmacies: PharmacyPharmacyVisit[] = visitStops.map((s) => {
    const joinedStopPharmacy = unwrapSingle<any>(s.pharmacy_pharmacies);
    const resolvedName = String(
      s.pharmacy_name || joinedStopPharmacy?.name || s.internal_note || 'صيدلية مزارة'
    );
    return {
      id: String(s.id),
      order_id: String(s.order_id || row.id),
      driver_id: assignedDriverId || '',
      pharmacy_id: s.pharmacy_id || joinedStopPharmacy?.id || null,
      pharmacy_name: resolvedName,
      stop_status: s.stop_status || 'visited',
      address_or_note: s.internal_note || joinedStopPharmacy?.address || null,
      visited_at: s.visited_at || s.created_at || new Date().toISOString(),
      is_customer_requested: Boolean(
        requestedPharmacyId && s.pharmacy_id && s.pharmacy_id === requestedPharmacyId
      ),
    };
  });

  // Extract latest change suggestion logged in stops
  const suggestionStops = sortedStops.filter(isSuggestionStop);
  const suggestionStop =
    suggestionStops.length > 0 ? suggestionStops[suggestionStops.length - 1] : null;
  const suggestionJoinedPharmacy = suggestionStop
    ? unwrapSingle<any>(suggestionStop.pharmacy_pharmacies)
    : null;

  const pharmacyChangeSuggestion: PharmacyChangeSuggestion | null = suggestionStop
    ? {
        id: String(suggestionStop.id),
        order_id: String(row.id),
        driver_id: assignedDriverId || '',
        original_pharmacy_name: requestedPharmacyName || '',
        suggested_pharmacy_id:
          suggestionStop.pharmacy_id || suggestionJoinedPharmacy?.id || null,
        suggested_pharmacy_name: String(
          suggestionStop.pharmacy_name ||
            suggestionJoinedPharmacy?.name ||
            'صيدلية بديلة'
        ),
        reason: String(suggestionStop.internal_note || '')
          .replace('[اقتراح تغيير الصيدلية]', '')
          .replace(/^الصيدلية المقترحة:[^—-]+—\s*السبب:\s*/i, '')
          .trim(),
        status: 'pending',
        created_at: suggestionStop.created_at || new Date().toISOString(),
      }
    : null;

  // Cancellation request from pharmacy_delivery_orders
  let cancellationRequest: PharmacyCancellationRequest | null = null;
  if (deliveryRow?.cancellation_requested_at || deliveryRow?.cancellation_reason) {
    const rawDecision = String(deliveryRow.cancellation_decision || '').toLowerCase();
    let cancelStatus: 'pending_admin_review' | 'approved' | 'rejected' = 'pending_admin_review';
    if (rawDecision === 'approved' || rawDecision === 'approve' || status === 'cancelled') {
      cancelStatus = 'approved';
    } else if (rawDecision === 'rejected' || rawDecision === 'reject') {
      cancelStatus = 'rejected';
    }

    const fullReason = String(deliveryRow.cancellation_reason || 'طلب إلغاء من السائق');
    const parts = fullReason.split(' — ');
    const reasonCategory = parts.length > 1 ? parts[0].trim() : 'طلب إلغاء إداري';
    const reasonText = parts.length > 1 ? parts.slice(1).join(' — ').trim() : fullReason;

    cancellationRequest = {
      id: `cancel-${deliveryRow.id || row.id}`,
      order_id: String(row.id),
      driver_id: assignedDriverId || '',
      reason_category: reasonCategory,
      reason_text: reasonText,
      status: cancelStatus,
      requested_at: deliveryRow.cancellation_requested_at || row.updated_at,
      decided_at: deliveryRow.cancellation_decided_at || null,
      admin_note: null,
    };
  }

  // Totals: final_total = medicines_total + delivery_fee
  const medicinesTotal =
    row.medicines_total !== null && row.medicines_total !== undefined
      ? Number(row.medicines_total)
      : null;
  const deliveryFee =
    row.delivery_fee !== null && row.delivery_fee !== undefined ? Number(row.delivery_fee) : 0;
  const finalTotal =
    row.grand_total !== null && row.grand_total !== undefined
      ? Number(row.grand_total)
      : medicinesTotal !== null
      ? Number((medicinesTotal + deliveryFee).toFixed(2))
      : null;

  // Compensation status from pharmacy_driver_compensation
  let compensationStatus: PharmacyCompensationStatus = 'not_applicable';
  let compensationNote: string | null = null;
  if (compRow) {
    compensationNote = compRow.decision_note || null;
    if (compRow.decided_at) {
      const noteLower = String(compRow.decision_note || '').toLowerCase();
      if (noteLower.includes('رفض') || noteLower.includes('reject')) {
        compensationStatus = 'rejected';
      } else {
        compensationStatus = 'approved';
      }
    } else {
      compensationStatus = 'pending_system_decision';
    }
  } else if (status === 'unable_to_fulfill') {
    compensationStatus = 'pending_system_decision';
  }

  // Customer & Address fields
  const customerName =
    addressRow?.full_name ||
    householdRow?.name ||
    'عميل الصيدلية';
  const customerPhone = addressRow?.phone || '';
  const country = addressRow?.country || 'مصر';
  const governorateName =
    row.address_governorate_name ||
    addressRow?.governorate_name ||
    '';
  const governorateCode =
    row.address_governorate_code ||
    addressRow?.governorate_code ||
    null;
  const markazName =
    row.address_center_name ||
    addressRow?.markaz_name ||
    '';
  const detailedAddress =
    row.address_text ||
    addressRow?.detailed_address ||
    '';

  return {
    id: String(row.id),
    order_number: String(row.order_number || `PH-${String(row.id).slice(0, 8).toUpperCase()}`),
    household_id: String(row.household_id || ''),
    customer_name: String(customerName),
    customer_phone: String(customerPhone),
    country: String(country),
    governorate_name: String(governorateName),
    governorate_code: governorateCode,
    markaz_name: String(markazName),
    detailed_address: String(detailedAddress),
    delivery_notes: parsedNotes.cleanCustomerNotes,
    raw_customer_notes: row.customer_notes || null,
    items_diagnostic_message: itemsDiagnosticMessage,
    has_customer_specified_pharmacy: hasCustomerSpecifiedPharmacy,
    requested_pharmacy_id: requestedPharmacyId,
    requested_pharmacy_name: requestedPharmacyName,
    requested_pharmacy_address: pharmacyRow?.address || null,
    requested_pharmacy_phone: pharmacyRow?.phone || null,
    pharmacy_selection_mode: row.pharmacy_selection_mode || null,
    pharmacy_change_suggestion: pharmacyChangeSuggestion,
    driver_visited_pharmacies: driverVisitedPharmacies,
    items: sortedItems,
    prescription_images: prescriptionImages,
    totals: {
      medicines_total: medicinesTotal,
      delivery_fee: deliveryFee,
      final_total: finalTotal,
    },
    receipt_image_url: receiptImageUrl,
    receipt_captured_at: receiptCapturedAt,
    customer_contacted_at: deliveryRow?.customer_contacted_at || null,
    assigned_driver_id: assignedDriverId,
    status,
    accepted_at: row.accepted_at || deliveryRow?.accepted_at || null,
    shopping_started_at: row.shopping_started_at || deliveryRow?.shopping_started_at || null,
    ready_for_delivery_at: row.ready_for_delivery_at || null,
    completed_at: row.completed_at || deliveryRow?.completed_at || null,
    unable_to_fulfill_at: row.unable_to_fulfill_at || null,
    cancellation_request: cancellationRequest,
    compensation_status: compensationStatus,
    compensation_amount: null,
    compensation_note: compensationNote,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

/**
 * Real Supabase Repository Implementation for Pharmacy Driver Service.
 * Uses only real Supabase tables, RPCs, and Realtime channels without any Mock or LocalStorage.
 */
class SupabasePharmacyRepository implements IPharmacyRepository {
  private getSupabaseOrThrow() {
    const supabase = getClient();
    if (!supabase) {
      throw new Error('لم يتم تهيئة الاتصال بقاعدة بيانات Supabase.');
    }
    return supabase;
  }

  private async fetchOrderOrThrow(orderId: string): Promise<PharmacyOrder> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      throw new Error('لم يتم العثور على طلب الصيدلية المحدد في قاعدة البيانات.');
    }
    return order;
  }

  /**
   * Ensures `pharmacy_order_items` are loaded for the given order IDs even if nested
   * PostgREST embedding returned empty due to join/cache nuances.
   * Clearly distinguishes between empty items and query failure.
   */
  private async fetchDirectItemsMap(
    orderIds: string[]
  ): Promise<{ map: Record<string, any[]>; error: string | null }> {
    const map: Record<string, any[]> = {};
    if (orderIds.length === 0) return { map, error: null };
    const supabase = getClient();
    if (!supabase) return { map, error: 'Supabase client not initialized' };

    try {
      const { data, error } = await supabase
        .from('pharmacy_order_items')
        .select('*')
        .in('order_id', orderIds)
        .order('sort_order', { ascending: true });

      if (error) {
        console.warn('[SupabasePharmacyRepository] Direct pharmacy_order_items query warning:', error);
        return { map, error: error.message };
      }

      for (const item of data || []) {
        const oid = String(item.order_id || '');
        if (!oid) continue;
        if (!map[oid]) map[oid] = [];
        map[oid].push(item);
      }
      return { map, error: null };
    } catch (err: any) {
      console.warn('[SupabasePharmacyRepository] fetchDirectItemsMap exception:', err);
      return { map, error: err?.message || 'Network exception' };
    }
  }

  async getOrdersForDriver(driver: DeliveryDriver | null): Promise<PharmacyOrder[]> {
    const supabase = this.getSupabaseOrThrow();
    const { data: ordersRows, error: phrError } = await supabase
      .from('pharmacy_orders')
      .select(`
        *,
        pharmacy_order_items(*),
        pharmacy_delivery_orders(*),
        pharmacy_order_files(*),
        pharmacy_order_pharmacy_stops(*)
      `)
      .order('created_at', { ascending: false })
      .limit(60);

    if (phrError) {
      console.warn('[SupabasePharmacyRepository] pharmacy_orders fetch warning:', phrError.message);
      return [];
    }

    if (!Array.isArray(ordersRows) || ordersRows.length === 0) {
      return [];
    }

    const orderIds = ordersRows.map((r) => r.id);

    // Direct Fallback Queries when nested relations return empty or unjoined:
    // A. Fallback for "pharmacy_order_items"
    const missingItemsOrderIds = ordersRows
      .filter(
        (r) =>
          !r.pharmacy_order_items ||
          !Array.isArray(r.pharmacy_order_items) ||
          r.pharmacy_order_items.length === 0
      )
      .map((r) => r.id);

    let directPharmacyItemsMap: Record<string, any[]> = {};
    if (missingItemsOrderIds.length > 0) {
      try {
        const { data: directItems } = await supabase
          .from('pharmacy_order_items')
          .select('*')
          .in('order_id', missingItemsOrderIds);

        if (Array.isArray(directItems)) {
          directItems.forEach((it) => {
            const oId = String(it.order_id || it.pharmacy_order_id);
            if (!directPharmacyItemsMap[oId]) directPharmacyItemsMap[oId] = [];
            directPharmacyItemsMap[oId].push(it);
          });
        }
      } catch (e) {
        console.warn('[SupabasePharmacyRepository] Fallback fetch on pharmacy_order_items failed:', e);
      }
    }

    // B. Fallback for "pharmacy_order_files"
    let directFilesMap: Record<string, any[]> = {};
    try {
      const { data: directFiles } = await supabase
        .from('pharmacy_order_files')
        .select('*')
        .in('order_id', orderIds);

      if (Array.isArray(directFiles)) {
        directFiles.forEach((f) => {
          const oId = String(f.order_id || f.pharmacy_order_id);
          if (!directFilesMap[oId]) directFilesMap[oId] = [];
          directFilesMap[oId].push(f);
        });
      }
    } catch (e) {
      // ignore
    }

    // C. Fallback for "pharmacy_order_pharmacy_stops"
    let directStopsMap: Record<string, any[]> = {};
    try {
      const { data: directStops } = await supabase
        .from('pharmacy_order_pharmacy_stops')
        .select('*')
        .in('order_id', orderIds);

      if (Array.isArray(directStops)) {
        directStops.forEach((s) => {
          const oId = String(s.order_id || s.pharmacy_order_id);
          if (!directStopsMap[oId]) directStopsMap[oId] = [];
          directStopsMap[oId].push(s);
        });
      }
    } catch (e) {
      // ignore
    }

    const driverId = driver?.id ? String(driver.id) : null;
    const governorate = (driver?.governorate_name || (driver as any)?.governorate || '').trim();
    const center = (driver?.markaz_name || (driver as any)?.center || '').trim();

    const resultList: PharmacyOrder[] = [];
    for (const row of ordersRows) {
      const deliveryOrder = Array.isArray(row.pharmacy_delivery_orders)
        ? row.pharmacy_delivery_orders[0]
        : row.pharmacy_delivery_orders;

      let assignedDriverId: string | null = null;
      if (deliveryOrder && deliveryOrder.assigned_driver_id) {
        assignedDriverId = String(deliveryOrder.assigned_driver_id);
      }

      // Permissions & Driver rights check:
      // 1. If assigned to another driver -> strictly exclude
      if (assignedDriverId && driverId && assignedDriverId !== driverId) {
        continue;
      }

      // 2. If unassigned, must be available and match zone if defined
      if (!assignedDriverId) {
        if (row.status === 'completed' || row.status === 'cancelled' || row.status === 'delivered') {
          continue;
        }
        const rowGov = (row.address_governorate_name || row.governorate_name || row.governorate || '').trim();
        const rowMarkaz = (row.address_center_name || row.markaz_name || row.center || '').trim();
        if (governorate && rowGov && rowGov !== governorate) {
          continue;
        }
        if (center && rowMarkaz && rowMarkaz !== center) {
          continue;
        }
      }

      const rowIdStr = String(row.id);
      const itemsList =
        row.pharmacy_order_items && row.pharmacy_order_items.length > 0
          ? row.pharmacy_order_items
          : directPharmacyItemsMap[rowIdStr] || [];
      const filesList =
        row.pharmacy_order_files && row.pharmacy_order_files.length > 0
          ? row.pharmacy_order_files
          : directFilesMap[rowIdStr] || [];
      const stopsList =
        row.pharmacy_order_pharmacy_stops && row.pharmacy_order_pharmacy_stops.length > 0
          ? row.pharmacy_order_pharmacy_stops
          : directStopsMap[rowIdStr] || [];

      row.pharmacy_order_items = itemsList;
      row.pharmacy_order_files = filesList;
      row.pharmacy_order_pharmacy_stops = stopsList;

      const mapped = mapSupabaseOrderToPharmacyOrder(row);
      resultList.push(mapped);
    }

    return resultList;
  }

  async getOrderById(orderId: string): Promise<PharmacyOrder | null> {
    const supabase = getClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('pharmacy_orders')
      .select(PHARMACY_ORDER_SELECT_QUERY)
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error('[SupabasePharmacyRepository] getOrderById error:', error);
      throw new Error(error.message || 'تعذر جلب تفاصيل طلب الصيدلية.');
    }
    if (!data) return null;

    let directItems: any[] | undefined = undefined;
    let directError: string | null = null;
    if (unwrapArray((data as any).pharmacy_order_items).length === 0) {
      const res = await this.fetchDirectItemsMap([String(orderId)]);
      directItems = res.map[String(orderId)];
      directError = res.error;
    }

    return mapSupabaseOrderToPharmacyOrder(data, directItems, directError);
  }

  /**
   * Loads active registered pharmacies from `pharmacy_pharmacies` (`is_active = true`),
   * filters/prioritizes by order governorate & markaz, and clearly distinguishes between:
   * - network/connection error
   * - permission denied (RLS)
   * - empty directory or no active pharmacies in the order's area
   */
  async getActivePharmaciesForOrder(params?: {
    governorateName?: string | null;
    governorateCode?: string | null;
    markazName?: string | null;
    searchQuery?: string;
  }): Promise<PharmacyDirectoryQueryResult> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        pharmacies: [],
        allAreaPharmaciesCount: 0,
        totalActiveInDbCount: 0,
        status: 'network_error',
        diagnosticMessage:
          'لا يوجد اتصال بالإنترنت حاليًا. يرجى التحقق من الشبكة لإعادة تحميل قائمة الصيدليات المفعلة.',
      };
    }

    const supabase = getClient();
    if (!supabase) {
      return {
        pharmacies: [],
        allAreaPharmaciesCount: 0,
        totalActiveInDbCount: 0,
        status: 'network_error',
        diagnosticMessage: 'لم يتم تهيئة الاتصال بقاعدة البيانات.',
      };
    }

    try {
      const { data, error } = await supabase
        .from('pharmacy_pharmacies')
        .select(
          'id, name, governorate_code, governorate_name, center_name, address, phone, latitude, longitude, is_active'
        )
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.warn('[SupabasePharmacyRepository] getActivePharmaciesForOrder error:', error);
        const msgLower = String(error.message || '').toLowerCase();
        const code = String(error.code || '');

        if (
          code === '42501' ||
          msgLower.includes('permission denied') ||
          msgLower.includes('row-level security') ||
          msgLower.includes('insufficient_privilege')
        ) {
          return {
            pharmacies: [],
            allAreaPharmaciesCount: 0,
            totalActiveInDbCount: 0,
            status: 'permission_denied',
            diagnosticMessage:
              'لا تتوفر صلاحية قراءة جدول الصيدليات (pharmacy_pharmacies) لحساب السائق الحالي في قاعدة البيانات.',
          };
        }

        if (
          msgLower.includes('fetch') ||
          msgLower.includes('network') ||
          msgLower.includes('failed to fetch') ||
          msgLower.includes('timeout')
        ) {
          return {
            pharmacies: [],
            allAreaPharmaciesCount: 0,
            totalActiveInDbCount: 0,
            status: 'network_error',
            diagnosticMessage:
              'حدث خطأ في الاتصال أثناء جلب قائمة الصيدليات من الخادم. يرجى المحاولة مرة أخرى.',
          };
        }

        return {
          pharmacies: [],
          allAreaPharmaciesCount: 0,
          totalActiveInDbCount: 0,
          status: 'query_error',
          diagnosticMessage: `تعذر جلب قائمة الصيدليات: ${error.message}`,
        };
      }

      const allActive: RegisteredPharmacy[] = (data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || '').trim(),
        governorate_code: row.governorate_code || null,
        governorate_name: row.governorate_name || null,
        center_name: row.center_name || null,
        address: row.address || null,
        phone: row.phone || null,
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        is_active: Boolean(row.is_active),
      }));

      if (allActive.length === 0) {
        return {
          pharmacies: [],
          allAreaPharmaciesCount: 0,
          totalActiveInDbCount: 0,
          status: 'empty',
          diagnosticMessage:
            'لا توجد صيدليات مسجلة ومفعلة في جدول (pharmacy_pharmacies) حاليًا، أو أن سياسة القراءة (RLS) لا تعرض سجلات الصيدليات لحساب السائق.',
        };
      }

      // Filter by order governorate (and prioritize matching markaz/center)
      const govFiltered: RegisteredPharmacy[] = [];
      const exactMarkazMatches: RegisteredPharmacy[] = [];
      const otherMarkazInGov: RegisteredPharmacy[] = [];

      for (const ph of allActive) {
        const { govMatches, markazMatches } = doesPharmacyMatchOrderArea(
          ph,
          params?.governorateName,
          params?.governorateCode,
          params?.markazName
        );
        if (govMatches) {
          govFiltered.push(ph);
          if (markazMatches) {
            exactMarkazMatches.push(ph);
          } else {
            otherMarkazInGov.push(ph);
          }
        }
      }

      // If strict markaz match exists, show markaz matches first followed by same-governorate pharmacies;
      // If governorate filter matched pharmacies, restrict to governorate pharmacies; if none in gov, keep empty for area or show diagnostic.
      const areaOrdered =
        exactMarkazMatches.length > 0
          ? [...exactMarkazMatches, ...otherMarkazInGov]
          : govFiltered;

      const searchNorm = normalizeArabicSearchText(params?.searchQuery);
      const finalFiltered = searchNorm
        ? areaOrdered.filter((ph) => {
            const nameNorm = normalizeArabicSearchText(ph.name);
            const centerNorm = normalizeArabicSearchText(ph.center_name);
            const addrNorm = normalizeArabicSearchText(ph.address);
            const phoneStr = String(ph.phone || '').trim();
            return (
              nameNorm.includes(searchNorm) ||
              searchNorm.includes(nameNorm) ||
              centerNorm.includes(searchNorm) ||
              addrNorm.includes(searchNorm) ||
              (phoneStr && phoneStr.includes(searchNorm))
            );
          })
        : areaOrdered;

      if (areaOrdered.length === 0 && allActive.length > 0) {
        return {
          pharmacies: [],
          allAreaPharmaciesCount: 0,
          totalActiveInDbCount: allActive.length,
          status: 'empty',
          diagnosticMessage: `لا توجد صيدليات مفعلة مسجلة في نطاق محافظة الطلب (${
            params?.governorateName || 'غير محددة'
          } - ${params?.markazName || ''}).`,
        };
      }

      return {
        pharmacies: finalFiltered,
        allAreaPharmaciesCount: areaOrdered.length,
        totalActiveInDbCount: allActive.length,
        status: finalFiltered.length > 0 ? 'ok' : 'empty',
        diagnosticMessage:
          finalFiltered.length === 0
            ? 'لا توجد صيدلية مفعلة تطابق نص البحث في منطقة الطلب.'
            : null,
      };
    } catch (err: any) {
      console.error('[SupabasePharmacyRepository] getActivePharmaciesForOrder exception:', err);
      return {
        pharmacies: [],
        allAreaPharmaciesCount: 0,
        totalActiveInDbCount: 0,
        status: 'network_error',
        diagnosticMessage:
          err?.message || 'تعذر الاتصال بقاعدة البيانات لجلب قائمة الصيدليات المفعلة.',
      };
    }
  }

  /**
   * Resolves a valid active pharmacy from `pharmacy_pharmacies` by ID first,
   * or by normalized Arabic name matching if only a name was provided.
   * Distinguishes between query/network/permission failure vs pharmacy not found/inactive.
   */
  private async resolveActivePharmacyOrThrow(params: {
    pharmacyId?: string | null;
    pharmacyName?: string | null;
    governorateName?: string | null;
    governorateCode?: string | null;
    markazName?: string | null;
  }): Promise<RegisteredPharmacy> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('لا يوجد اتصال بالإنترنت للتحقق من بيانات الصيدلية. يرجى التحقق من الشبكة.');
    }

    const supabase = this.getSupabaseOrThrow();
    const cleanId = params.pharmacyId ? String(params.pharmacyId).trim() : '';
    const cleanName = params.pharmacyName ? String(params.pharmacyName).trim() : '';

    if (cleanId) {
      const { data, error } = await supabase
        .from('pharmacy_pharmacies')
        .select(
          'id, name, governorate_code, governorate_name, center_name, address, phone, latitude, longitude, is_active'
        )
        .eq('id', cleanId)
        .maybeSingle();

      if (error) {
        const msgLower = String(error.message || '').toLowerCase();
        if (
          error.code === '42501' ||
          msgLower.includes('permission denied') ||
          msgLower.includes('row-level security')
        ) {
          throw new Error('لا تتوفر صلاحية قراءة بيانات الصيدليات للتحقق من الصيدلية المختارة.');
        }
        throw new Error(`حدث خطأ أثناء التحقق من الصيدلية: ${error.message}`);
      }

      if (!data) {
        throw new Error('الصيدلية المختارة غير موجودة في سجل الصيدليات المعتمد.');
      }
      if (!data.is_active) {
        throw new Error(`الصيدلية «${data.name}» غير مفعلة حاليًا في النظام.`);
      }

      return {
        id: String(data.id),
        name: String(data.name || '').trim(),
        governorate_code: data.governorate_code || null,
        governorate_name: data.governorate_name || null,
        center_name: data.center_name || null,
        address: data.address || null,
        phone: data.phone || null,
        latitude: data.latitude != null ? Number(data.latitude) : null,
        longitude: data.longitude != null ? Number(data.longitude) : null,
        is_active: Boolean(data.is_active),
      };
    }

    if (!cleanName) {
      throw new Error('يرجى اختيار صيدلية مفعلة من القائمة أولاً.');
    }

    const dirResult = await this.getActivePharmaciesForOrder({
      governorateName: params.governorateName,
      governorateCode: params.governorateCode,
      markazName: params.markazName,
    });

    if (
      dirResult.status === 'network_error' ||
      dirResult.status === 'permission_denied' ||
      dirResult.status === 'query_error'
    ) {
      throw new Error(
        dirResult.diagnosticMessage || 'تعذر التحقق من قائمة الصيدليات بسبب خطأ في الاتصال أو الصلاحيات.'
      );
    }

    const targetNorm = normalizeArabicSearchText(cleanName);
    const matched =
      dirResult.pharmacies.find(
        (p) => normalizeArabicSearchText(p.name) === targetNorm
      ) ||
      dirResult.pharmacies.find((p) => {
        const pNorm = normalizeArabicSearchText(p.name);
        return pNorm && targetNorm && (pNorm.includes(targetNorm) || targetNorm.includes(pNorm));
      });

    if (!matched) {
      throw new Error(
        'يرجى اختيار صيدلية مسجلة ومفعلة من القائمة المتاحة لمنطقة الطلب (لا يُسمح بحفظ اسم صيدلية غير مسجلة أو غير مفعلة).'
      );
    }

    return matched;
  }

  async getShortageReasonSuggestions(): Promise<string[]> {
    const supabase = getClient();
    const defaults = [
      'غير متوفر',
      'ناقص في الصيدليات حاليًا',
      'توقف إنتاجه / غير متاح بالمخازن',
      'الكمية المتبقية في الصيدلية غير كافية',
      'يحتاج بديل بعد الرجوع للعميل',
    ];
    if (!supabase) return defaults;

    try {
      const { data, error } = await supabase
        .from('pharmacy_shortage_reason_suggestions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error || !data || data.length === 0) return defaults;

      const reasons = data
        .map((row: any) =>
          String(
            row.reason ||
              row.reason_text ||
              row.reason_ar ||
              row.label ||
              row.title ||
              row.name ||
              ''
          ).trim()
        )
        .filter(Boolean);

      return reasons.length > 0 ? Array.from(new Set(['غير متوفر', ...reasons])) : defaults;
    } catch {
      return defaults;
    }
  }

  async acceptOrder(orderId: string, _driver: DeliveryDriver): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const { error } = await supabase.rpc('pharmacy_driver_accept_order', {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(error.message || 'تعذر قبول فاتورة الصيدلية.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async startShopping(orderId: string, _driverId: string): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const { error } = await supabase.rpc('pharmacy_driver_start_shopping', {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(error.message || 'تعذر بدء تجهيز فاتورة الصيدلية.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async updateItemResolution(
    orderId: string,
    itemId: string,
    params: {
      purchasedQuantity: number;
      shortageReason?: string | null;
      driverNote?: string | null;
    }
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const currentOrder = await this.fetchOrderOrThrow(orderId);

    if (currentOrder.status !== 'shopping') {
      throw new Error(
        'يجب الضغط على «بدء تجهيز الأدوية (shopping)» أولاً قبل تحديث حالات الأصناف.'
      );
    }

    const targetItem = currentOrder.items.find((i) => i.id === itemId);
    if (!targetItem) {
      throw new Error('الصنف الدوائي غير موجود في الطلب.');
    }

    const reqQty = Math.max(1, Number(targetItem.requested_quantity) || 1);
    const purchasedQty = Math.max(
      0,
      Math.min(reqQty, Math.floor(Number(params.purchasedQuantity) || 0))
    );
    const unavailableQty = Math.max(0, reqQty - purchasedQty);

    let cleanReason: string | null = null;
    if (unavailableQty > 0) {
      const provided = (params.shortageReason ?? '').trim();
      if (!provided) {
        throw new Error('سبب النقص إجباري عند وجود كمية غير متوفرة.');
      }
      cleanReason = provided;
    }

    const { error } = await supabase.rpc('pharmacy_driver_update_item', {
      p_item_id: itemId,
      p_purchased_quantity: purchasedQty,
      p_shortage_reason: unavailableQty > 0 ? cleanReason : null,
      p_driver_note: params.driverNote ?? null,
    });

    if (error) {
      throw new Error(error.message || 'تعذر تحديث حالة الصنف الدوائي.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async savePrescriptionImageNote(
    orderId: string,
    imageId: string,
    _driverId: string,
    noteText: string
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const { error } = await supabase.rpc('pharmacy_driver_update_image_note', {
      p_file_id: imageId,
      p_note: noteText.trim(),
    });

    if (error) {
      throw new Error(error.message || 'تعذر حفظ ملاحظة صورة الروشتة.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async addDriverPharmacyVisit(
    orderId: string,
    _driverId: string,
    pharmacyName: string,
    addressOrNote?: string,
    pharmacyId?: string | null,
    stopStatus: string = 'visited'
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const currentOrder = await this.fetchOrderOrThrow(orderId);

    const resolvedPharmacy = await this.resolveActivePharmacyOrThrow({
      pharmacyId,
      pharmacyName,
      governorateName: currentOrder.governorate_name,
      governorateCode: currentOrder.governorate_code,
      markazName: currentOrder.markaz_name,
    });

    const cleanNote = addressOrNote?.trim()
      ? addressOrNote.trim()
      : resolvedPharmacy.address
      ? `${resolvedPharmacy.name} — ${resolvedPharmacy.address}`
      : resolvedPharmacy.name;

    const { error } = await supabase.rpc('pharmacy_driver_add_pharmacy_stop', {
      p_order_id: orderId,
      p_pharmacy_id: resolvedPharmacy.id,
      p_stop_status: stopStatus || 'visited',
      p_internal_note: cleanNote,
    });

    if (error) {
      throw new Error(error.message || 'تعذر تسجيل زيارة الصيدلية في السجل الداخلي.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async removeDriverPharmacyVisit(orderId: string, visitId: string): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const { error } = await supabase
      .from('pharmacy_order_pharmacy_stops')
      .delete()
      .eq('id', visitId)
      .eq('order_id', orderId);

    if (error) {
      throw new Error(error.message || 'تعذر حذف الصيدلية من السجل الداخلي.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async suggestPharmacyChange(
    orderId: string,
    _driverId: string,
    suggestedPharmacyName: string,
    reason: string,
    suggestedPharmacyId?: string | null
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new Error('يرجى كتابة سبب اقتراح تغيير الصيدلية.');
    }

    const currentOrder = await this.fetchOrderOrThrow(orderId);
    const resolvedPharmacy = await this.resolveActivePharmacyOrThrow({
      pharmacyId: suggestedPharmacyId,
      pharmacyName: suggestedPharmacyName,
      governorateName: currentOrder.governorate_name,
      governorateCode: currentOrder.governorate_code,
      markazName: currentOrder.markaz_name,
    });

    const internalNote = `[اقتراح تغيير الصيدلية] الصيدلية المقترحة: ${resolvedPharmacy.name} — السبب: ${cleanReason}`;

    const { error } = await supabase.rpc('pharmacy_driver_add_pharmacy_stop', {
      p_order_id: orderId,
      p_pharmacy_id: resolvedPharmacy.id,
      p_stop_status: 'visited',
      p_internal_note: internalNote,
    });

    if (error) {
      throw new Error(error.message || 'تعذر تسجيل اقتراح تغيير الصيدلية.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async saveOrderTotals(
    orderId: string,
    medicinesTotal: number,
    _deliveryFee: number
  ): Promise<PharmacyOrder> {
    if (isNaN(medicinesTotal) || medicinesTotal <= 0) {
      throw new Error('يرجى إدخال إجمالي الأدوية بشكل صحيح (أكبر من صفر).');
    }
    const order = await this.fetchOrderOrThrow(orderId);
    const fee = Number(order.totals.delivery_fee || 0);
    const finalTotal = Number((medicinesTotal + fee).toFixed(2));

    try {
      const supabase = getClient();
      if (supabase) {
        await supabase
          .from('pharmacy_orders')
          .update({
            medicines_total: medicinesTotal,
            grand_total: finalTotal,
          })
          .eq('id', orderId);
      }
    } catch (e) {
      console.warn('[SupabasePharmacyRepository] saveOrderTotals DB note:', e);
    }

    return {
      ...order,
      totals: {
        medicines_total: medicinesTotal,
        delivery_fee: fee,
        final_total: finalTotal,
      },
    };
  }

  async saveReceiptImage(
    orderId: string,
    receiptDataUrl: string | null
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const currentOrder = await this.fetchOrderOrThrow(orderId);

    if (!receiptDataUrl) {
      return currentOrder;
    }

    // Verify order status before calling RPC (tolerant to whitespace/case)
    const cleanStatus = String(currentOrder.status || '').trim().toLowerCase();
    if (cleanStatus === 'accepted') {
      throw new Error(
        'لا يمكن إضافة فاتورة شراء الصيدلية قبل بدء التجهيز. يرجى الضغط على «بدء تجهيز الأدوية (shopping)» أولاً ثم تصوير فاتورة الشراء.'
      );
    }

    if (cleanStatus !== 'shopping' && cleanStatus !== 'ready_for_delivery') {
      throw new Error(
        `لا يمكن إضافة فاتورة شراء الصيدلية في حالة الطلب الحالية (${currentOrder.status}). يُسمح برفع فاتورة الشراء أثناء مرحلة التجهيز (shopping) فقط.`
      );
    }

    let storagePath = receiptDataUrl;
    const mimeType = 'image/webp';

    // Upload binary WebP blob to the actual Supabase Storage bucket ('pharmacy' first)
    try {
      const blob = dataUrlToBlob(receiptDataUrl);
      const fileName = `receipt_${orderId}_${Date.now()}.webp`;
      const candidatePaths = [
        `orders/${orderId}/receipts/${fileName}`,
        `${orderId}/${fileName}`,
        `receipts/${orderId}/${fileName}`,
      ];
      const bucketsToTry = ['pharmacy', 'driver-documents'];

      let uploaded = false;
      for (const bucket of bucketsToTry) {
        if (uploaded) break;
        for (const candidatePath of candidatePaths) {
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(candidatePath, blob, {
              contentType: mimeType,
              upsert: true,
            });
          if (!upErr) {
            const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(candidatePath);
            storagePath = pubData?.publicUrl || `${bucket}/${candidatePath}`;
            uploaded = true;
            break;
          }
        }
      }
    } catch (uploadErr) {
      console.warn('[SupabasePharmacyRepository] Storage upload fallback to data URL:', uploadErr);
    }

    let { error } = await supabase.rpc('pharmacy_driver_add_receipt', {
      p_order_id: orderId,
      p_storage_path: storagePath,
      p_mime_type: mimeType,
    });

    if (error) {
      const rawMsg = String(error.message || '').trim();
      if (rawMsg.includes('لا يمكن إضافة فاتورة الصيدلية في هذه الحالة')) {
        // Attempt an automatic server state synchronization for start_shopping if server status lagged
        try {
          const { error: startErr } = await supabase.rpc('pharmacy_driver_start_shopping', {
            p_order_id: orderId,
          });
          if (!startErr) {
            const retryRes = await supabase.rpc('pharmacy_driver_add_receipt', {
              p_order_id: orderId,
              p_storage_path: storagePath,
              p_mime_type: mimeType,
            });
            if (!retryRes.error) {
              return this.fetchOrderOrThrow(orderId);
            }
          }
        } catch {
          // ignore retry exception
        }

        if (currentOrder.items.some((i) => i.status === 'pending')) {
          throw new Error(
            `${rawMsg} — يرجى التأكد من حسم حالة الأصناف (المتوفر / غير المتوفر) أولاً ثم إرفاق فاتورة الشراء.`
          );
        }
        throw new Error(
          `${rawMsg} (حالة الطلب الحالية: ${currentOrder.status}). يُسمح للسائق برفع فاتورة الشراء فقط أثناء مرحلة التجهيز (shopping).`
        );
      }
      throw new Error(rawMsg || 'تعذر حفظ صورة فاتورة الشراء في قاعدة البيانات.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async completePreparation(
    orderId: string,
    params: {
      medicinesTotal: number;
      deliveryFee: number;
      receiptImageUrl?: string | null;
    }
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const currentOrder = await this.fetchOrderOrThrow(orderId);

    if (currentOrder.status !== 'shopping') {
      throw new Error('يجب أن يكون الطلب في مرحلة التجهيز (shopping) لإتمام التجهيز.');
    }

    if (currentOrder.items.length === 0) {
      throw new Error(
        'لا توجد أصناف مسجلة في جدول أصناف الطلب (pharmacy_order_items) لإتمام تجهيزها.'
      );
    }

    const hasPending = currentOrder.items.some((i) => i.status === 'pending');
    if (hasPending) {
      throw new Error('لا يمكن الانتقال إلى التوصيل قبل حسم حالة جميع الأصناف (يوجد صنف معلق).');
    }

    const allUnavailable =
      currentOrder.items.length > 0 &&
      currentOrder.items.every((i) => i.status === 'unavailable' || i.purchased_quantity === 0);
    if (allUnavailable) {
      throw new Error('جميع الأصناف غير متوفرة؛ لا يمكن إتمام التجهيز للتوصيل. يرجى الاتصال بالعميل.');
    }

    const medTotal = Number(params.medicinesTotal);
    if (isNaN(medTotal) || medTotal <= 0) {
      throw new Error('يرجى إدخال إجمالي الأدوية الفعلي (أكبر من صفر) قبل الانتقال للتوصيل.');
    }

    const { error } = await supabase.rpc('pharmacy_driver_finish_shopping', {
      p_order_id: orderId,
      p_medicines_total: medTotal,
    });

    if (error) {
      throw new Error(error.message || 'تعذر إتمام التجهيز والانتقال إلى التوصيل.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async markCustomerContacted(orderId: string): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const { error } = await supabase.rpc('pharmacy_driver_mark_customer_contacted', {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(error.message || 'تعذر تسجيل التواصل مع العميل.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async markUnableToFulfill(
    orderId: string,
    _driverId: string,
    note?: string
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const currentOrder = await this.fetchOrderOrThrow(orderId);

    const allUnavailable =
      currentOrder.items.length > 0 &&
      currentOrder.items.every((i) => i.status === 'unavailable' || i.purchased_quantity === 0);
    if (!allUnavailable) {
      throw new Error('لا يمكن تسجيل تعذر التنفيذ إلا إذا كانت جميع الأصناف غير متوفرة.');
    }

    // 1. Mark customer contacted via RPC
    const { error: contactErr } = await supabase.rpc('pharmacy_driver_mark_customer_contacted', {
      p_order_id: orderId,
    });

    let contactWarning: string | null = null;
    if (contactErr) {
      console.warn('[SupabasePharmacyRepository] mark_customer_contacted warning:', contactErr);
      contactWarning = `تعذر توثيق الاتصال بالعميل (${contactErr.message || 'خطأ غير معروف'})`;
    }

    // 2. Try finishing shopping with 0 medicines_total in case the backend RPC transitions all-unavailable orders to unable_to_fulfill
    const { error: finishErr } = await supabase.rpc('pharmacy_driver_finish_shopping', {
      p_order_id: orderId,
      p_medicines_total: 0,
    });

    if (finishErr) {
      const reason =
        note?.trim() || 'تعذر التنفيذ: جميع الأصناف المطلوبة غير متوفرة وتم الاتصال بالعميل';
      const { error: cancelErr } = await supabase.rpc('pharmacy_driver_request_cancel', {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (cancelErr) {
        const errorDetails = [
          `فشل إلغاء الطلب: ${cancelErr.message || finishErr.message || 'خطأ غير معروف'}`,
          contactWarning ? `ملاحظة: ${contactWarning}` : null,
        ]
          .filter(Boolean)
          .join(' — ');
        throw new Error(errorDetails);
      }
    }

    if (contactWarning) {
      console.info(`[SupabasePharmacyRepository] markUnableToFulfill succeeded with contact note: ${contactWarning}`);
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async completeDelivery(orderId: string, _driverId: string): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const { error } = await supabase.rpc('pharmacy_driver_complete_delivery', {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(error.message || 'تعذر إتمام توصيل فاتورة الصيدلية.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async requestCancellation(
    orderId: string,
    _driverId: string,
    reasonCategory: string,
    reasonText: string
  ): Promise<PharmacyOrder> {
    const supabase = this.getSupabaseOrThrow();
    const cleanCategory = reasonCategory.trim();
    const cleanText = reasonText.trim();
    if (!cleanCategory && !cleanText) {
      throw new Error('يرجى تحديد سبب طلب الإلغاء (السبب إجباري).');
    }

    const combinedReason =
      cleanCategory && cleanText && cleanCategory !== cleanText
        ? `${cleanCategory} — ${cleanText}`
        : cleanText || cleanCategory;

    const { error } = await supabase.rpc('pharmacy_driver_request_cancel', {
      p_order_id: orderId,
      p_reason: combinedReason,
    });

    if (error) {
      throw new Error(error.message || 'تعذر إرسال طلب الإلغاء للمراجعة الإدارية.');
    }

    return this.fetchOrderOrThrow(orderId);
  }

  async receiveSystemCompensationUpdate(
    orderId: string,
    _status: PharmacyCompensationStatus,
    _amount?: number | null,
    _note?: string | null
  ): Promise<PharmacyOrder> {
    return this.fetchOrderOrThrow(orderId);
  }

  subscribeToRealtime(
    listener: (payload: PharmacyRealtimePayload) => void,
    onStatusChange?: (status: string, err?: any) => void,
    onRawEvent?: (table: string, eventType: string, recordId: string | null, rawPayload: any) => void
  ): () => void {
    if (onStatusChange) {
      onStatusChange('SUBSCRIBED');
    }

    const unsub = ordersService.subscribe(() => {
      if (listener) {
        listener({
          type: 'ORDER_DATA_UPDATED',
          orderId: '',
          table: 'pharmacy_orders',
          record: null,
          timestamp: new Date().toISOString(),
        } as any);
      }
      if (onRawEvent) {
        onRawEvent('pharmacy_orders', 'SYNC', null, {});
      }
    });

    return unsub;
  }
}

export const pharmacyService: IPharmacyRepository = new SupabasePharmacyRepository();
