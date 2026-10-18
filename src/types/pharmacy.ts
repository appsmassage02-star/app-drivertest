export type PharmacyOrderStatus =
  | 'pending_review'
  | 'accepted'
  | 'shopping'
  | 'ready_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'unable_to_fulfill';

export type PharmacyItemStatus = 'pending' | 'purchased' | 'unavailable';

export interface RegisteredPharmacy {
  id: string;
  name: string;
  governorate_code?: string | null;
  governorate_name?: string | null;
  center_name?: string | null;
  address?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active: boolean;
}

export type PharmacyDirectoryQueryStatus =
  | 'ok'
  | 'empty'
  | 'permission_denied'
  | 'network_error'
  | 'query_error';

export interface PharmacyDirectoryQueryResult {
  pharmacies: RegisteredPharmacy[];
  allAreaPharmaciesCount: number;
  totalActiveInDbCount: number;
  status: PharmacyDirectoryQueryStatus;
  diagnosticMessage: string | null;
}

export interface PharmacyDriverNote {
  id: string;
  image_id: string;
  order_id: string;
  driver_id: string;
  note_text: string;
  created_at: string;
  updated_at: string;
}

export interface PharmacyPrescriptionImage {
  id: string;
  order_id: string;
  image_url: string;
  storage_path?: string | null;
  mime_type?: string | null;
  label?: string | null;
  customer_note?: string | null;
  driver_note?: PharmacyDriverNote | null;
  created_at: string;
}

export interface PharmacyOrderItem {
  id: string;
  order_id: string;
  medicine_name: string;
  requested_quantity: number;
  purchased_quantity: number;
  unavailable_quantity: number;
  status: PharmacyItemStatus;
  shortage_reason: string | null;
  dosage_notes?: string | null;
  unit?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PharmacyPharmacyVisit {
  id: string;
  order_id: string;
  driver_id: string;
  pharmacy_id?: string | null;
  pharmacy_name: string;
  stop_status?: string | null;
  address_or_note?: string | null;
  visited_at: string;
  is_customer_requested?: boolean;
}

export interface PharmacyChangeSuggestion {
  id: string;
  order_id: string;
  driver_id: string;
  original_pharmacy_name: string;
  suggested_pharmacy_id?: string | null;
  suggested_pharmacy_name: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface PharmacyCancellationRequest {
  id: string;
  order_id: string;
  driver_id: string;
  reason_category: string;
  reason_text: string;
  status: 'pending_admin_review' | 'approved' | 'rejected';
  requested_at: string;
  decided_at?: string | null;
  admin_note?: string | null;
}

export interface PharmacyOrderTotals {
  medicines_total: number | null;
  delivery_fee: number;
  final_total: number | null;
}

export type PharmacyCompensationStatus =
  | 'not_applicable'
  | 'pending_system_decision'
  | 'approved'
  | 'rejected';

export interface PharmacyOrder {
  id: string;
  order_number: string;
  household_id: string;
  customer_name: string;
  customer_phone: string;
  country: string;
  governorate_name: string;
  governorate_code?: string | null;
  markaz_name: string;
  detailed_address: string;
  delivery_notes: string | null;
  raw_customer_notes?: string | null;
  items_diagnostic_message?: string | null;

  // Customer pharmacy preference
  has_customer_specified_pharmacy: boolean;
  requested_pharmacy_id?: string | null;
  requested_pharmacy_name: string | null;
  requested_pharmacy_address?: string | null;
  requested_pharmacy_phone?: string | null;
  pharmacy_selection_mode?: string | null;

  // Pharmacy change suggestion (when customer specified a pharmacy, driver can only suggest change)
  pharmacy_change_suggestion: PharmacyChangeSuggestion | null;

  // Internal driver visited pharmacies log (kept internal if customer did not specify a pharmacy)
  driver_visited_pharmacies: PharmacyPharmacyVisit[];

  // Order items & prescription images (up to 4 images)
  items: PharmacyOrderItem[];
  prescription_images: PharmacyPrescriptionImage[];

  // Totals (Never uses customer-entered medicine price)
  totals: PharmacyOrderTotals;

  // Purchase receipt image (single image, camera only)
  receipt_image_url: string | null;
  receipt_captured_at: string | null;

  // Customer contact tracking (when all items are unavailable)
  customer_contacted_at?: string | null;

  // Assignment & lifecycle status
  assigned_driver_id: string | null;
  status: PharmacyOrderStatus;
  accepted_at: string | null;
  shopping_started_at: string | null;
  ready_for_delivery_at: string | null;
  completed_at: string | null;
  unable_to_fulfill_at: string | null;

  // Cancellation request (driver cannot cancel directly after accepting)
  cancellation_request: PharmacyCancellationRequest | null;

  // Compensation status (received from system later, no automatic calculation)
  compensation_status: PharmacyCompensationStatus;
  compensation_amount: number | null;
  compensation_note: string | null;

  created_at: string;
  updated_at: string;
}

export type PharmacyRealtimeEventType =
  | 'ORDER_STATUS_UPDATED'
  | 'ITEMS_UPDATED'
  | 'PRESCRIPTION_NOTES_UPDATED'
  | 'TOTALS_UPDATED'
  | 'ORDER_DATA_UPDATED'
  | 'ORDER_INSERTED'
  | 'ORDER_DELETED'
  | 'SYNC_REQUESTED';

export type RealtimeConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

export interface PharmacyRealtimePayload {
  type: PharmacyRealtimeEventType;
  orderId: string;
  order?: PharmacyOrder | null;
  table?: string;
  rawPayload?: any;
  timestamp: string;
}

export interface PharmacyRealtimeDiagnostics {
  status: RealtimeConnectionStatus;
  errorMessage: string | null;
  lastEventTime: string | null;
  lastEventDetails: string | null;
  eventsCount: number;
}

export interface RealtimeDiagnosticLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  table?: string;
  eventType?: string;
  orderId?: string;
  passed?: boolean;
  filterReason?: string;
}

