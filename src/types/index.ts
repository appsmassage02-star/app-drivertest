export type DriverStatus = 'pending_approval' | 'approved' | 'rejected' | 'pending' | 'suspended';

export type DriverAvailability = 'online' | 'offline' | 'busy';

// --- Supabase Database Row Interfaces matching docs/SUPABASE_OPENAPI_REFERENCE.md ---

export interface SupabaseDeliveryOrderRow {
  id: string; // uuid
  household_id: string; // text
  invoice_id?: string;
  address_id?: string;
  customer_name: string;
  customer_phone: string;
  country: string; // default 'مصر'
  governorate_name: string;
  markaz_name: string;
  detailed_address: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  delivery_notes?: string;
  assigned_driver_id?: string; // uuid
  status: string; // text, default 'pending_review'
  cancellation_reason?: string;
  cancellation_requested_at?: string;
  cancellation_decision_note?: string;
  cancellation_decided_at?: string;
  created_at: string;
  updated_at: string;
  order_number?: string;
  household_name?: string;
  phone_number?: string;
  governorate?: string;
  center?: string;
  items_total?: number;
  notes?: string;
  accepted_at?: string;
  delivered_at?: string;
  cancellation_requested_by?: string;
  user_id?: string;
  source_recurring_request_id?: string;
  actual_items_total: number;
  actual_total_amount: number;
}

export interface SupabaseDeliveryOrderItemRow {
  id: string; // uuid
  order_id: string; // uuid
  product_name: string;
  unit: string;
  notes?: string;
  quantity: string; // text default '١'
  unit_price: number;
  total_price: number;
  created_at: string;
  item_status: string; // text default 'pending'
  actual_unit_price: number;
  actual_total_price: number;
  missing_reason?: string;
  updated_at: string;
}

export interface SupabasePharmacyOrderRow {
  id: string; // uuid
  order_number: string;
  user_id: string; // uuid
  household_id?: string;
  saved_prescription_id?: string; // uuid
  prescription_title: string;
  requested_pharmacy_id?: string; // uuid
  requested_pharmacy_name?: string;
  pharmacy_selection_mode: string; // default 'user_selected'
  status: string; // default 'pending_review'
  source_address_id?: string; // uuid
  address_governorate_name: string;
  address_governorate_code?: string;
  address_center_name: string;
  address_text: string;
  address_latitude?: number;
  address_longitude?: number;
  customer_notes?: string;
  medicines_total?: number;
  delivery_fee: number;
  grand_total?: number;
  accepted_at?: string;
  shopping_started_at?: string;
  ready_for_delivery_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  unable_to_fulfill_at?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabasePharmacyOrderItemRow {
  id: string; // uuid
  order_id: string; // uuid
  item_name: string;
  unit: string;
  requested_quantity: number;
  purchased_quantity: number; // default 0
  shortage_quantity: number; // default 0
  driver_status: string; // default 'pending'
  shortage_reason?: string;
  driver_note?: string;
  sort_order: number; // default 0
  created_at: string;
  updated_at: string;
}

export interface SupabasePharmacyOrderFileRow {
  id: string; // uuid
  order_id: string; // uuid
  file_type: string;
  storage_path: string;
  display_order?: number;
  mime_type?: string;
  driver_note?: string;
  note_updated_at?: string;
  note_updated_by?: string;
  source_saved_file_id?: string;
  created_at: string;
}

export interface SupabasePharmacyOrderPharmacyStopRow {
  id: string; // uuid
  order_id: string; // uuid
  pharmacy_id?: string; // uuid
  pharmacy_name: string;
  pharmacy_phone?: string;
  governorate_name?: string;
  governorate_code?: string;
  center_name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  visit_sequence: number;
  stop_status: string; // default 'visited'
  internal_note?: string;
  visited_at: string;
  created_at: string;
}

export interface SupabasePharmacyDeliveryOrderRow {
  id: string; // uuid
  pharmacy_order_id: string; // uuid
  assigned_driver_id?: string; // uuid
  assignment_status: string; // default 'available'
  accepted_at?: string;
  shopping_started_at?: string;
  delivery_started_at?: string;
  completed_at?: string;
  cancellation_requested_at?: string;
  cancellation_reason?: string;
  cancellation_decision?: string;
  customer_contacted_at?: string;
  customer_contacted_by?: string;
  cancellation_decided_at?: string;
  cancellation_decided_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDeliveryDriverRow {
  id: string; // uuid
  user_id?: string; // uuid
  full_name: string;
  phone: string;
  is_active: boolean; // default true
  vehicle_type?: string; // default 'motorcycle'
  notes?: string;
  role?: string; // default 'delivery_driver'
  status: string; // default 'pending_approval'
  governorate_name?: string;
  governorate_code?: string;
  markaz_name?: string;
  vehicle_plate?: string;
  national_id?: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
  rejection_reason?: string;
  id_card_front_path?: string;
  id_card_back_path?: string;
  driver_license_path?: string;
  vehicle_license_path?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDeliveryOrderStatusHistoryRow {
  id: string;
  order_id: string;
  old_status?: string;
  new_status: string;
  changed_by?: string;
  note?: string;
  created_at: string;
  previous_status?: string;
  changed_by_role?: string;
  notes?: string;
}

export interface SupabasePharmacyOrderStatusHistoryRow {
  id: string;
  order_id: string;
  from_status?: string;
  to_status: string;
  changed_by?: string;
  changed_by_role: string;
  note?: string;
  created_at: string;
}

// --- Application UI Profile & Order Models ---

export interface DriverProfile {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  email: string;
  avatarUrl?: string;
  status: DriverStatus;
  availability: DriverAvailability;
  vehicleType: string;
  vehiclePlate: string;
  vehicleModel: string;
  nationalId?: string;
  rating: number;
  totalTrips: number;
  completionRate: number;
  walletBalance: number;
  todayEarnings: number;
  todayTrips: number;
  workingZone: string;
  governorate?: string;
  center?: string;
  governorate_name?: string;
  governorate_code?: string;
  markaz_name?: string;
  joinedDate: string;
  approvalNotes?: string;
  rejectionReason?: string;
  documentsSubmitted?: {
    nationalId: boolean;
    drivingLicense: boolean;
    vehicleRegistration: boolean;
    cleanRecord: boolean;
  };
}

export type OrderType = 'regular' | 'pharmacy';

export type OrderStatus =
  | 'new'          // جديد في الانتظار
  | 'assigned'     // مسند للمندوب
  | 'accepted'     // تم القبول من المندوب
  | 'picked_up'    // تم الاستلام من المتجر / الصيدلية
  | 'in_transit'   // جاري التوصيل للعميل
  | 'delivered'    // تم التوصيل بنجاح
  | 'cancelled';   // ملغي

export type PaymentMethod = 'cash' | 'card' | 'wallet' | 'online';

export interface OrderLocation {
  name: string;
  address: string;
  area: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  unit?: string;
  image?: string;
  // Regular delivery items schema:
  item_status?: 'pending' | 'purchased' | 'missing' | string;
  actual_unit_price?: number;
  actual_total_price?: number;
  missing_reason?: string;
  isPurchased?: boolean; // UI helper flag derived from item_status === 'purchased'
  // Pharmacy order items schema:
  driver_status?: 'pending' | 'available' | 'shortage' | 'alternative' | string;
  requested_quantity?: number;
  purchased_quantity?: number;
  shortage_quantity?: number;
  shortage_reason?: string;
  driver_note?: string;
  status?: string; // UI helper mapping to driver_status
}

export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  createdAt: string;
  estimatedDeliveryTime?: string;
  store: {
    id: string;
    name: string;
    logo?: string;
    phone: string;
    address: string;
    area: string;
    latitude?: number;
    longitude?: number;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string;
    area: string;
    buildingNumber?: string;
    floorNumber?: string;
    apartmentNumber?: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
  };
  items: OrderItem[];
  itemsCount: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  driverFee: number;
  paymentMethod: PaymentMethod;
  isPaid: boolean;
  distanceKm: number;
  specialInstructions?: string;
  governorate?: string;
  center?: string;
  governorate_name?: string;
  governorate_code?: string;
  markaz_name?: string;
  assigned_driver_id?: string;
  cancellation_reason?: string;
  cancellation_requested_at?: string;
  cancellation_decision_note?: string;
  cancellation_decided_at?: string;
  // Raw table column mirrors for backwards compatibility with legacy UI components
  customer_name?: string;
  customer_phone?: string;
  phone_number?: string;
  detailed_address?: string;
  order_number?: string;
  total_amount?: number;
  delivery_notes?: string;
  household_id?: string;
  created_at?: string;
  updated_at?: string;
  actual_items_total?: number | null;
  actual_total_amount?: number | null;
  raw_status?: string;
}

export interface PharmacyOrder extends DeliveryOrder {
  prescriptionImages?: string[];
  pharmacyNotes?: string;
  needsPrescription: boolean;
  prescriptionVerified: boolean;
  hasColdStorageMedicines: boolean;
  invoiceUrl?: string;
  invoiceStoragePath?: string;
  invoiceAmount?: number;
  urgencyLevel: 'normal' | 'urgent' | 'critical';
  insuranceInfo?: {
    providerName: string;
    approvalNumber?: string;
    patientCoPay: number;
  };
  customerContacted?: boolean;
  pharmacyStops?: Array<{
    id: string;
    pharmacyId: string;
    pharmacyName?: string;
    pharmacyPhone?: string;
    pharmacyAddress?: string;
    status?: string;
    stopOrder?: number;
    notes?: string;
  }>;
}

export interface OrderFilter {
  status?: OrderStatus | 'all';
  type?: OrderType | 'all';
  dateRange?: 'today' | 'week' | 'month' | 'all';
  searchQuery?: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  isCustomConfigured: boolean;
}

export type ConnectionMode = 'demo' | 'supabase';
