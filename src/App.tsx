import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  Phone,
  User,
  Power,
  Play,
  RefreshCw,
  Eye,
  X,
  Check,
  PowerOff,
  PlusCircle,
  ShieldCheck,
  AlertTriangle,
  PackageCheck,
  XCircle,
  Package,
  Layers,
  Database,
  Search,
  ChevronLeft,
  ChevronRight,
  Sliders,
  LogOut,
  SlidersHorizontal,
  FileText,
  CreditCard,
  Building,
  Navigation,
  Edit3,
  Lock,
  Mail,
  KeyRound,
  FileCheck,
  Radio,
  Wifi,
  WifiOff,
  ShoppingCart,
  CheckSquare,
  DollarSign,
  Store,
  Pill,
  Activity,
  UtensilsCrossed,
  LocateFixed,
  Bell,
  Wallet,
  Landmark,
  Settings,
} from 'lucide-react';
import {
  saveCachedDeliveryOrders,
  getCachedDeliveryOrders,
  enqueueOfflineAction,
  getOfflineQueue,
  clearDriverOfflineCache,
  syncOfflineQueue,
} from './lib/offlineStore';
import { SplashScreen } from './components/SplashScreen';
import {
  DocumentUploader,
  UploadedDocument,
  convertImageToWebpBlob,
  processDocumentImage,
  dataUrlToBlob
} from './components/DocumentUploader';
import { DocumentViewerModal } from './components/DocumentViewerModal';
import { EGYPT_GOVERNORATES } from './data/egyptLocations';
import {
  createEmptyCentralGeoContext,
  loadFullCentralGeoContext,
  fetchCentralGeoHierarchy,
  evaluateCentralCoverageMatch,
  hydrateOrdersGeoFromAddresses,
  isOrderEligibleForDriver,
  extractOrderFinancialBreakdown,
} from './lib/geoCoverageService';
import { fetchDeliverySystemSettings } from './lib/driverTrackingService';
import {
  createEmptyAppSectionSettingsState,
  evaluateSectionOperationalStatus,
  fetchAppSectionSettings,
  resolveOrderSectionKey,
} from './lib/sectionSettingsService';
import { SectionStatusPanel } from './components/SectionStatusPanel';
import { usePharmacy } from './hooks/usePharmacy';
import { useDriverAuth } from './hooks/useDriverAuth';
import { useDriverGPS } from './hooks/useDriverGPS';
import { useOrderRouteDistances, getOrderRouteKey } from './hooks/useOrderRouteDistances';
import {
  clearNavigationSessionCache,
  endNavigationSession,
  sharedRouteDistanceManager,
} from './lib/navigationService';
import type {
  AppSectionSettingsState,
  CentralGeoContext,
  DeliveryDriver,
  DeliverySystemSettings,
  DriverStatus,
  GeoCenter,
  GeoGovernorate,
} from './types';
import { ordersService } from './services/ordersService';
import {
  getSupabaseClient,
  getSupabaseCredentials,
  saveSupabaseCredentials,
  isSupabaseConfigured,
} from './services/supabaseClient';
import { PharmacyOrdersSection } from './components/pharmacy/PharmacyOrdersSection';
import { PharmacyOrderCard } from './components/pharmacy/PharmacyOrderCard';
import { PharmacyRealtimeDiagnosticModal } from './components/pharmacy/PharmacyRealtimeDiagnosticModal';
import { PharmacyOrder, RealtimeConnectionStatus } from './types/pharmacy';
import { RestaurantOrdersSection } from './components/restaurant/RestaurantOrdersSection';
import { RestaurantOrderCard } from './components/restaurant/RestaurantOrderCard';
import { OrderMapModal } from './components/maps/OrderMapModal';
import {
  isRestaurantOrder,
  isRestaurantOrderForDriver,
  checkRestaurantRpcCompatibility,
} from './lib/restaurantService';
import {
  getInitialHeaderAssetSrc,
  getInitialSplashAssetSrc,
  syncAllDriverCentralAssets,
  DEFAULT_FALLBACK_ASSET,
} from './lib/centralAssetsService';
import { HouseholdOrderCard } from './components/HouseholdOrderCard';
import { DriverLocationSettingsCard } from './components/DriverLocationSettingsCard';
import { DriverNotificationsModal } from './components/DriverNotificationsModal';
import {
  buildUnifiedChronologicalOrders,
  computeDriverAccountingSummary,
  sortOrdersOldestFirst,
} from './lib/orderDisplayHelpers';

// Safe date and time formatters to prevent runtime errors or freezes
export const formatSafeTime = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const formatSafeDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const getSafeNumericQty = (qty: string | number | undefined | null): number => {
  if (qty === null || qty === undefined) return 1;
  if (typeof qty === 'number') return isNaN(qty) || qty <= 0 ? 1 : qty;
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let str = String(qty).trim();
  arabicNums.forEach((ar, idx) => {
    str = str.replaceAll(ar, String(idx));
  });
  const parsed = parseFloat(str);
  return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
};

// ============================================================================
// 1. Types strictly mapped to Database Schema JSON
// ============================================================================

export type { DriverStatus, DeliveryDriver } from './types';

export interface DeliverySettings {
  id: string;
  delivery_enabled: boolean;
  default_delivery_fee: number | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  id: 'default',
  delivery_enabled: true,
  default_delivery_fee: null,
  created_at: '',
  updated_at: '',
};

export interface DeliveryGovernorateSetting {
  id: string;
  governorate_code: string;
  governorate_name: string;
  is_active: boolean;
  delivery_fee: number | null;
  estimated_delivery_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'pending_review'
  | 'accepted'
  | 'shopping'
  | 'shopping_completed'
  | 'cancellation_pending'
  | 'cancelled'
  | 'completed';

export interface DeliveryOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  category_id: string | null;
  category_name: string | null;
  quantity: string | number; // Stored as text in database ('١'::text) or number
  unit_price: number;
  total_price: number;
  created_at: string;
  item_status?: 'pending' | 'purchased' | 'missing';
  actual_unit_price?: number | null;
  actual_total_price?: number | null;
  missing_reason?: string | null;
  updated_at?: string | null;
}

export interface DeliveryOrder {
  id: string;
  household_id: string;
  invoice_id: string | null;
  address_id: string | null;
  customer_name: string;
  customer_phone: string;
  country: string;
  governorate_name: string;
  markaz_name: string;
  detailed_address: string;
  subtotal: number | null;
  delivery_fee: number | null;
  total_amount: number | null;
  delivery_base_fee?: number | null;
  delivery_admin_commission?: number | null;
  delivery_driver_net?: number | null;
  customer_delivery_fee?: number | null;
  delivery_governorate_id?: string | null;
  delivery_center_id?: string | null;
  delivery_area_id?: string | null;
  delivery_area_name?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  address_latitude?: number | null;
  address_longitude?: number | null;
  delivery_notes: string | null;
  assigned_driver_id: string | null;
  status: OrderStatus;
  cancellation_reason: string | null;
  cancellation_requested_at: string | null;
  cancellation_decision_note: string | null;
  cancellation_decided_at: string | null;
  created_at: string;
  updated_at: string;
  order_number: string | null;
  household_name: string | null;
  phone_number: string | null;
  governorate: string | null;
  center: string | null;
  items_total: number | null;
  actual_items_total?: number | null;
  actual_total_amount?: number | null;
  notes: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  cancellation_requested_by: string | null;
  user_id: string | null;
  items?: DeliveryOrderItem[];
  type?: 'regular' | 'pharmacy' | 'restaurant';
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  restaurant_phone?: string | null;
  restaurant_address?: string | null;
  delivery_by?: string | null;
  is_restaurant_delivery?: boolean | null;
  floor_number?: string | null;
  apartment_number?: string | null;
  building_name?: string | null;
}

export interface DeliveryOrderStatusHistory {
  id: string;
  order_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
  previous_status: OrderStatus | null;
  changed_by_role: string | null;
  notes: string | null;
}

// ============================================================================
// 2. Supabase Configuration & Real Authentication / Data State
// Unified Single Client Instance (Delegated to services/supabaseClient.ts)
// ============================================================================

export const getClient = getSupabaseClient;

/**
 * Initiates a phone call to the customer using native Android / Capacitor / Web standard 'tel:' URI.
 * Only initiates when the driver explicitly clicks the call button.
 */
function callCustomer(phoneNumber?: string | null): void {
  if (!phoneNumber) return;
  // Clean phone number from whitespace and non-dialable characters except leading +
  const cleaned = phoneNumber.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return;
  window.location.href = `tel:${cleaned}`;
}

// ============================================================================
// 3. Application Main Component (Stage 1: Delivery Only Auth & Zero Mock Data)
// ============================================================================

export default function App() {
  // Authoritative Driver Authentication and Profile Hook
  const {
    supabaseUser,
    currentDriver,
    authStatus,
    authError: driverAuthError,
    isAuthSubmitting,
    isSyncingDriver,
    splashMessage,
    splashStep,
    loginWithEmail,
    logout: driverLogout,
    checkDriverStatus,
    saveDriverProfile,
    setDriverAfterRegistration,
    clearAuthError,
    retryFetchDriver,
    updateDriverAvailabilityFields,
  } = useDriverAuth();

  const [splashImageSrc] = useState<string>(() => getInitialSplashAssetSrc());
  const [headerImageSrc, setHeaderImageSrc] = useState<string>(() => getInitialHeaderAssetSrc());

  // Authentication & Registration Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showSupabaseSettings, setShowSupabaseSettings] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Delivery Driver Registration Specific Fields
  const [regFullName, setRegFullName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCountry] = useState('مصر');
  const [regGovernorateName, setRegGovernorateName] = useState('الدقهلية');
  const [regMarkazName, setRegMarkazName] = useState('المنصورة');
  const [regDetailedAddress, setRegDetailedAddress] = useState('');
  const [regVehicleType, setRegVehicleType] = useState('دراجة نارية (موتوسيكل)');
  const [regNotes, setRegNotes] = useState('');

  // Mandatory Document Uploads (Images)
  const [idCardFront, setIdCardFront] = useState<UploadedDocument | null>(null);
  const [idCardBack, setIdCardBack] = useState<UploadedDocument | null>(null);
  const [vehicleLicense, setVehicleLicense] = useState<UploadedDocument | null>(null);
  const [driverLicense, setDriverLicense] = useState<UploadedDocument | null>(null);
  // Track documents verified as uploaded to Storage to avoid redundant uploads during retry
  const successfullyUploadedDocsRef = useRef<Set<string>>(new Set());
  const acceptingOrderIdsRef = useRef<Set<string>>(new Set());

  // Central geographic hierarchy for registration selector UI (loaded from geo_governorates / geo_centers)
  const [regGeoHierarchy, setRegGeoHierarchy] = useState<{
    governorates: GeoGovernorate[];
    centers: GeoCenter[];
    loaded: boolean;
  }>({ governorates: [], centers: [], loaded: false });

  // Central Geographic Coverage & Tracking Settings State
  const [centralGeoContext, setCentralGeoContext] = useState<CentralGeoContext>(() =>
    createEmptyCentralGeoContext()
  );
  const centralGeoContextRef = useRef<CentralGeoContext>(centralGeoContext);
  centralGeoContextRef.current = centralGeoContext;

  const [systemSettings, setSystemSettings] = useState<DeliverySystemSettings>({
    driver_tracking_enabled: null,
    navigation_enabled: null,
    routing_provider: null,
    routing_engine: null,
    driver_location_update_interval_seconds: null,
    max_accepted_gps_accuracy_m: null,
    route_deviation_threshold_m: null,
    load_state: 'idle',
  });

  // Central Sections & Delivery Operational Settings State (read directly from public.app_section_settings, no localStorage cache)
  const [sectionSettings, setSectionSettings] = useState<AppSectionSettingsState>(() =>
    createEmptyAppSectionSettingsState('idle')
  );
  const sectionSettingsRef = useRef<AppSectionSettingsState>(sectionSettings);
  sectionSettingsRef.current = sectionSettings;
  const [isRefreshingSections, setIsRefreshingSections] = useState(false);

  // Memoized available governorates and centers for registration form (prefer central DB geo tables)
  const registrationGovernorates = useMemo(() => {
    const activeCentralGovs = regGeoHierarchy.governorates.filter((g) => g.is_active !== false);
    if (regGeoHierarchy.loaded && activeCentralGovs.length > 0) {
      return activeCentralGovs.map((g) => ({
        id: g.id,
        name: g.name_ar || g.name || '',
        code: g.code || null,
      })).filter((g) => Boolean(g.name));
    }
    return EGYPT_GOVERNORATES.map((g) => ({ id: g.code, name: g.name, code: g.code }));
  }, [regGeoHierarchy]);

  const availableCenters = useMemo(() => {
    const activeCentralGovs = regGeoHierarchy.governorates.filter((g) => g.is_active !== false);
    if (regGeoHierarchy.loaded && activeCentralGovs.length > 0) {
      const matchedGov = activeCentralGovs.find(
        (g) => (g.name_ar || g.name) === regGovernorateName
      );
      if (matchedGov) {
        const centralCenters = regGeoHierarchy.centers
          .filter((c) => c.governorate_id === matchedGov.id && c.is_active !== false)
          .map((c) => c.name_ar || c.name || '')
          .filter(Boolean);
        if (centralCenters.length > 0) return centralCenters;
      }
    }
    const matched = EGYPT_GOVERNORATES.find((g) => g.name === regGovernorateName);
    return matched ? matched.centers : [];
  }, [regGeoHierarchy, regGovernorateName]);

  // Primary Live States - Strictly Real Database Data
  const currentDriverRef = useRef<DeliveryDriver | null>(null);
  currentDriverRef.current = currentDriver;
  const [settings, setSettings] = useState<DeliverySettings>(DEFAULT_DELIVERY_SETTINGS);
  const [governorates, setGovernorates] = useState<DeliveryGovernorateSetting[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<DeliveryOrderStatusHistory[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [deliveryRealtimeStatus, setDeliveryRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING');
  const [deliveryRealtimeError, setDeliveryRealtimeError] = useState<string | null>(null);
  const [deliveryLastEventTime, setDeliveryLastEventTime] = useState<string | null>(null);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);

  // UI States
  const [activeTab, setActiveTab] = useState<
    'pending' | 'accepted' | 'completed' | 'cancelled' | 'profile' | 'settings'
  >('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<DeliveryOrder | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Offline & Synchronization States
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);
  const [isSyncingOfflineQueue, setIsSyncingOfflineQueue] = useState<boolean>(false);

  // Driver Work Availability & Heartbeat States (is_available_for_work & availability_last_seen_at)
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState<string | null>(null);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState<boolean>(false);
  const [heartbeatConsecutiveFailures, setHeartbeatConsecutiveFailures] = useState<number>(0);

  const isWorkingRef = useRef<boolean>(false);
  isWorkingRef.current = isWorking;
  const heartbeatIntervalRef = useRef<any>(null);
  const isHeartbeatInFlightRef = useRef<boolean>(false);

  // Shopping Flow States
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemPriceInput, setItemPriceInput] = useState<string>('');
  const [missingItemId, setMissingItemId] = useState<string | null>(null);
  const [missingReasonInput, setMissingReasonInput] = useState<string>('');

  // Profile Edit State (with immutable national_id, full_name protection)
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editGovernorateName, setEditGovernorateName] = useState('الدقهلية');
  const [editGovernorateCode, setEditGovernorateCode] = useState('DKH');
  const [editMarkazName, setEditMarkazName] = useState('المنصورة');
  const [editVehicleType, setEditVehicleType] = useState('');
  const [editVehiclePlate, setEditVehiclePlate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Supabase Config Form
  const [supabaseUrl, setSupabaseUrl] = useState(getSupabaseCredentials().url);
  const [supabaseKey, setSupabaseKey] = useState(getSupabaseCredentials().anonKey);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Active assigned order ID (if any) for GPS tracking telemetry context
  const activeAssignedOrderId = useMemo(() => {
    if (!currentDriver?.id) return null;
    const activeOrder = orders.find(
      (o) =>
        o.assigned_driver_id === currentDriver.id &&
        (o.status === 'accepted' || o.status === 'shopping' || o.status === 'shopping_completed')
    );
    return activeOrder ? activeOrder.id : null;
  }, [orders, currentDriver?.id]);

  // Driver Real Hardware GPS Hook (independent of maps, validates & persists via delivery_system_settings)
  const {
    driverLocation,
    gpsStatus,
    gpsErrorMessage,
    isLoadingGPS,
    isTrackingActive,
    trackingAccuracyWarning,
    lastTrackingResult,
    requestGPSLocation,
  } = useDriverGPS(isWorking, {
    supabase: getClient(),
    driverId: currentDriver?.id || null,
    systemSettings,
    activeOrderId: activeAssignedOrderId,
  });

  // Order Category Filter ('all' | 'regular' | 'restaurant' | 'pharmacy')
  const [orderCategoryView, setOrderCategoryView] = useState<'all' | 'regular' | 'restaurant' | 'pharmacy'>('all');
  const [selectedRestaurantOrder, setSelectedRestaurantOrder] = useState<DeliveryOrder | null>(null);
  const [pharmacyCancelTarget, setPharmacyCancelTarget] = useState<PharmacyOrder | null>(null);
  const [mapModalTarget, setMapModalTarget] = useState<{
    order: any;
    orderType: 'restaurant' | 'pharmacy' | 'regular';
  } | null>(null);

  // Isolated Pharmacy Driver Hook
  const {
    pharmacyOrders,
    selectedPharmacyOrder,
    setSelectedPharmacyOrder,
    isPharmacyLoading,
    isPharmacyActionLoading,
    isPharmacyRealtimeActive,
    pharmacyCounts,
    loadPharmacyOrders,
    acceptPharmacyOrder,
    startPharmacyShopping,
    updateMedicineItem,
    saveImageDriverNote,
    addVisitedPharmacy,
    removeVisitedPharmacy,
    suggestPharmacyChange,
    saveReceiptCameraImage,
    saveOrderTotals,
    completePreparation,
    markUnableToFulfill,
    completePharmacyDelivery,
    requestPharmacyCancellation,
    pharmacyRealtimeStatus,
    pharmacyRealtimeError,
    pharmacyLastEventTime,
    pharmacyLastEventDetails,
    pharmacyEventsCount,
    pharmacyRawEventsCount,
    lastCompensatorySyncTime,
    lastCompensatorySyncCount,
    lastCompensatorySyncSource,
    pharmacyDiagnosticLogs,
    clearDiagnosticLogs,
    reconnectPharmacyRealtime,
  } = usePharmacy({
    currentDriver,
    isWorking,
    deliveryEnabled: Boolean(settings?.delivery_enabled),
    geoContext: centralGeoContext,
    sectionSettings,
    onSectionSettingsRefreshed: (fresh) => {
      sectionSettingsRef.current = fresh;
      setSectionSettings(fresh);
    },
    onToast: showToast,
  });

  // Server-side Road Distance Manager for all visible/active orders across categories
  const { routeDistances, recalculateOrderRoute } = useOrderRouteDistances({
    supabase: getClient(),
    driverId: currentDriver?.id || null,
    driverLocation,
    systemSettings,
    orders,
    pharmacyOrders,
  });

  // Lightbox Document Viewer Modal State
  const [viewingDocModal, setViewingDocModal] = useState<{
    isOpen: boolean;
    title: string;
    imageUrl: string | null;
    label: string;
  }>({
    isOpen: false,
    title: '',
    imageUrl: null,
    label: '',
  });

  const openDocumentViewer = (title: string, imageUrl: string | null, label: string) => {
    setViewingDocModal({
      isOpen: true,
      title,
      imageUrl,
      label,
    });
  };

  // Helper to resolve real document image: from Storage public URL, direct URL, or device preview cache
  const resolveDocImage = (
    dbPath?: string | null,
    docType?: 'idCardFront' | 'idCardBack' | 'driverLicense' | 'vehicleLicense',
    userId?: string
  ): string | null => {
    // 1. Direct web URL or legacy data URL
    if (dbPath && (dbPath.startsWith('http://') || dbPath.startsWith('https://') || dbPath.startsWith('data:image/'))) {
      return dbPath;
    }

    // 2. Storage path in driver-documents bucket
    if (dbPath && typeof dbPath === 'string') {
      const supabase = getClient();
      if (supabase) {
        try {
          const cleanPath = dbPath.replace(/^driver-documents\//, '');
          const { data } = supabase.storage.from('driver-documents').getPublicUrl(cleanPath);
          if (data?.publicUrl) return data.publicUrl;
        } catch {
          // ignore
        }
      }
    }

    // 3. Fallback to local device preview cache
    if (userId) {
      try {
        const cached = localStorage.getItem(`driver_docs_${userId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (docType && parsed[docType] && (parsed[docType].startsWith('data:image/') || parsed[docType].startsWith('http'))) {
            return parsed[docType];
          }
        }
      } catch {
        // Ignore cache read errors
      }
    }
    return null;
  };

  // Direct fresh read of app_section_settings (zero stale cache)
  const refreshSectionSettings = useCallback(async () => {
    const supabase = getClient();
    if (!supabase || !navigator.onLine) return;
    setIsRefreshingSections(true);
    try {
      const fresh = await fetchAppSectionSettings(supabase);
      sectionSettingsRef.current = fresh;
      setSectionSettings(fresh);
    } finally {
      setIsRefreshingSections(false);
    }
  }, []);

  // Sync App Settings and Driver Profile from Supabase (Delivery order fetching removed in Phase 1 pending Phase 2 replacement)
  const syncWithSupabase = useCallback(async (userId?: string) => {
    const supabase = getClient();
    if (!supabase) return;
    setIsSyncing(true);

    try {
      if (!navigator.onLine) {
        return;
      }

      // Trigger non-blocking background check for central driver assets (driver/header & driver/splash)
      void syncAllDriverCentralAssets(supabase, (newHeaderSrc) => {
        setHeaderImageSrc(newHeaderSrc);
      });

      // 1. Fetch delivery_settings + delivery_system_settings + app_section_settings + central geo coverage
      const activeDriver = currentDriverRef.current;

      const [settingsRes, govSettingsRes, sysSettings, loadedSectionSettings, loadedGeoContext] = await Promise.all([
        supabase.from('delivery_settings').select('*').limit(1).maybeSingle(),
        supabase
          .from('delivery_governorate_settings')
          .select('*')
          .order('governorate_name', { ascending: true }),
        fetchDeliverySystemSettings(supabase),
        fetchAppSectionSettings(supabase),
        activeDriver
          ? loadFullCentralGeoContext(supabase, activeDriver)
          : Promise.resolve(createEmptyCentralGeoContext()),
      ]);

      if (!settingsRes.error && settingsRes.data) {
        setSettings(settingsRes.data as DeliverySettings);
      }

      if (!govSettingsRes.error && govSettingsRes.data) {
        setGovernorates(govSettingsRes.data as DeliveryGovernorateSetting[]);
      }

      setSystemSettings(sysSettings);
      sectionSettingsRef.current = loadedSectionSettings;
      setSectionSettings(loadedSectionSettings);
      centralGeoContextRef.current = loadedGeoContext;
      setCentralGeoContext(loadedGeoContext);

      // 2. Fetch delivery_orders only if authenticated driver is approved and active
      if (!activeDriver || activeDriver.status !== 'approved' || !activeDriver.is_active) {
        setOrders([]);
        return;
      }

      const driverId = activeDriver.id ? String(activeDriver.id) : null;

      const { data: rows, error: ordersErr } = await supabase
        .from('delivery_orders')
        .select(`
          *,
          items:delivery_order_items(*)
        `)
        .order('created_at', { ascending: false })
        .limit(60);

      if (!ordersErr && Array.isArray(rows)) {
        const missingItemOrderIds: string[] = [];
        rows.forEach((r) => {
          const rowItems = r.items || r.delivery_order_items;
          if (!rowItems || !Array.isArray(rowItems) || rowItems.length === 0) {
            missingItemOrderIds.push(r.id);
          }
        });

        let directItemsMap: Record<string, any[]> = {};
        if (missingItemOrderIds.length > 0) {
          try {
            const { data: directItems, error: itemsErr } = await supabase
              .from('delivery_order_items')
              .select('*')
              .in('order_id', missingItemOrderIds);

            if (!itemsErr && Array.isArray(directItems)) {
              directItems.forEach((it) => {
                const oId = String(it.order_id);
                if (!directItemsMap[oId]) directItemsMap[oId] = [];
                directItemsMap[oId].push(it);
              });
            }
          } catch (e) {
            console.warn('[Orders] Fallback direct fetch of delivery_order_items failed:', e);
          }
        }

        const areaNameById = new Map<string, string>();
        loadedGeoContext.areas.forEach((a) => {
          const label = a.name_ar || a.name;
          if (a.id && label) areaNameById.set(String(a.id), label);
        });

        const hydratedRows = await hydrateOrdersGeoFromAddresses(supabase, rows, 'regular');

        // Deduplicate orders by id to avoid duplicate cards during Realtime bursts
        const orderMap = new Map<string, DeliveryOrder>();
        for (const row of hydratedRows) {
          const assignedDriverId = row.assigned_driver_id
            ? String(row.assigned_driver_id)
            : (row.driver_id ? String(row.driver_id) : null);

          // 1. If assigned to another driver -> strictly exclude
          if (assignedDriverId && driverId && assignedDriverId !== driverId) {
            continue;
          }

          // Strict isolation between platform drivers and restaurant staff drivers
          if (isRestaurantOrder(row) && !isRestaurantOrderForDriver(row, driverId, activeDriver)) {
            continue;
          }

          const rowStatus = String(row.status || 'pending_review').trim().toLowerCase() || 'pending_review';

          // 2. If unassigned -> evaluate STRICTLY via central geographic coverage IDs
          // Never reject assigned orders of the current driver even if coverage changed later
          if (!assignedDriverId) {
            if (rowStatus === 'completed' || rowStatus === 'delivered' || rowStatus === 'cancelled') {
              continue;
            }
            const centralMatch = evaluateCentralCoverageMatch(row, activeDriver, loadedGeoContext);
            if (!centralMatch.matched) {
              continue;
            }
          }

          const rawItems = (row.items && row.items.length > 0)
            ? row.items
            : ((row.delivery_order_items && row.delivery_order_items.length > 0)
              ? row.delivery_order_items
              : (directItemsMap[String(row.id)] || []));

          const resolvedAreaId = row.delivery_area_id ? String(row.delivery_area_id) : null;
          const resolvedAreaName =
            row.delivery_area_name ||
            row.area_name ||
            (resolvedAreaId ? areaNameById.get(resolvedAreaId) || null : null);

          const normalizedOrder: DeliveryOrder = {
            ...(row as any),
            status: rowStatus as any,
            raw_status: row.status,
            items: rawItems,
            assigned_driver_id: assignedDriverId,
            type: isRestaurantOrder(row) ? 'restaurant' : 'regular',
            delivery_governorate_id: row.delivery_governorate_id ? String(row.delivery_governorate_id) : null,
            delivery_center_id: row.delivery_center_id ? String(row.delivery_center_id) : null,
            delivery_area_id: resolvedAreaId,
            delivery_area_name: resolvedAreaName,
            subtotal: row.subtotal !== null && row.subtotal !== undefined ? Number(row.subtotal) : null,
            delivery_fee: row.delivery_fee !== null && row.delivery_fee !== undefined ? Number(row.delivery_fee) : null,
            total_amount: row.total_amount !== null && row.total_amount !== undefined ? Number(row.total_amount) : null,
            delivery_base_fee:
              row.delivery_base_fee !== null && row.delivery_base_fee !== undefined
                ? Number(row.delivery_base_fee)
                : null,
            delivery_admin_commission:
              row.delivery_admin_commission !== null && row.delivery_admin_commission !== undefined
                ? Number(row.delivery_admin_commission)
                : null,
            delivery_driver_net:
              row.delivery_driver_net !== null && row.delivery_driver_net !== undefined
                ? Number(row.delivery_driver_net)
                : null,
            customer_delivery_fee:
              row.customer_delivery_fee !== null && row.customer_delivery_fee !== undefined
                ? Number(row.customer_delivery_fee)
                : null,
          };

          const orderIdStr = String(row.id);
          if (!orderMap.has(orderIdStr)) {
            orderMap.set(orderIdStr, normalizedOrder);
          }
        }

        const regularOrdersList = Array.from(orderMap.values());
        setOrders(regularOrdersList);
        setSelectedOrder((prev) => {
          if (!prev) return null;
          const fresh = regularOrdersList.find((o) => o.id === prev.id);
          return fresh || prev;
        });
        setSelectedRestaurantOrder((prev) => {
          if (!prev) return null;
          const fresh = regularOrdersList.find((o) => o.id === prev.id);
          return fresh || prev;
        });
        if (driverId) {
          saveCachedDeliveryOrders(driverId, regularOrdersList);
        }
      }
    } catch (err: any) {
      console.warn('Supabase sync warning:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Load central geo hierarchy for registration dropdowns when Supabase is configured
  useEffect(() => {
    const supabase = getClient();
    if (!supabase) return;
    let active = true;
    void fetchCentralGeoHierarchy(supabase).then((res) => {
      if (!active) return;
      if (res.geoLoadState === 'loaded' && res.governorates.length > 0) {
        setRegGeoHierarchy({
          governorates: res.governorates,
          centers: res.centers,
          loaded: true,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [supabaseUser?.id]);

  // Synchronize orders and section statuses when driver becomes approved and active
  useEffect(() => {
    if (authStatus === 'approved_active') {
      void syncWithSupabase();
    } else {
      setOrders([]);
      const emptyCtx = createEmptyCentralGeoContext();
      centralGeoContextRef.current = emptyCtx;
      setCentralGeoContext(emptyCtx);
      setSystemSettings({
        driver_tracking_enabled: null,
        navigation_enabled: null,
        routing_provider: null,
        routing_engine: null,
        driver_location_update_interval_seconds: null,
        max_accepted_gps_accuracy_m: null,
        route_deviation_threshold_m: null,
        load_state: 'idle',
      });
      if (supabaseUser?.id) {
        void refreshSectionSettings();
      } else {
        const idleSections = createEmptyAppSectionSettingsState('idle');
        sectionSettingsRef.current = idleSections;
        setSectionSettings(idleSections);
      }
    }
  }, [authStatus, supabaseUser?.id, syncWithSupabase, refreshSectionSettings]);

  // Setup Realtime and central assets + central app_section_settings sync
  useEffect(() => {
    const supabase = getClient();
    if (!supabase) return;

    let isMounted = true;

    // Non-blocking background check for central assets on startup
    void syncAllDriverCentralAssets(supabase, (newHeaderSrc) => {
      if (isMounted) setHeaderImageSrc(newHeaderSrc);
    });

    // Honest Realtime channel status tracking from OrdersService (all 7 active tables)
    const unsubStatus = ordersService.subscribeToStatus((status, err) => {
      if (!isMounted) return;
      const mappedStatus = (status as RealtimeConnectionStatus) || 'DISCONNECTED';
      setDeliveryRealtimeStatus(mappedStatus);
      setIsRealtimeConnected(status === 'SUBSCRIBED');
      if (err) {
        setDeliveryRealtimeError(typeof err === 'string' ? err : err?.message || 'خطأ في قناة البث اللحظي');
      } else if (status === 'SUBSCRIBED') {
        setDeliveryRealtimeError(null);
      }
    });

    const unsubOrders = ordersService.subscribe(() => {
      if (!isMounted) return;
      if (authStatus === 'approved_active') {
        void syncWithSupabase();
      }
      setDeliveryLastEventTime(
        new Date().toLocaleTimeString('ar-EG', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    });

    // Realtime subscription for central driver assets (driver/header & driver/splash)
    const assetsChannel = supabase
      .channel('driver_central_assets_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_assets', filter: 'app_key=eq.driver' },
        () => {
          if (!isMounted) return;
          void syncAllDriverCentralAssets(supabase, (newHeaderSrc) => {
            if (isMounted) setHeaderImageSrc(newHeaderSrc);
          });
        }
      )
      .subscribe();

    // Realtime subscription for central section operational settings (app_section_settings)
    const sectionSettingsChannel = supabase
      .channel('driver_app_section_settings_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_section_settings' },
        () => {
          if (!isMounted) return;
          void refreshSectionSettings();
          if (authStatus === 'approved_active') {
            void syncWithSupabase();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(assetsChannel);
      supabase.removeChannel(sectionSettingsChannel);
      unsubStatus();
      unsubOrders();
    };
  }, [authStatus, syncWithSupabase, refreshSectionSettings]);

  // Sync driver session with ordersService (clears cleanly when driver signs out)
  useEffect(() => {
    if (currentDriver?.id) {
      ordersService.setDriverSession(currentDriver.id, {
        governorate: currentDriver.governorate_name || (currentDriver as any).governorate,
        center: currentDriver.markaz_name || (currentDriver as any).center,
      });
    } else {
      ordersService.setDriverSession(null);
    }
  }, [currentDriver]);

  // Online / Offline & Offline Action Queue Synchronization
  const triggerOfflineQueueSync = useCallback(async () => {
    if (!currentDriver?.id || !navigator.onLine) return;
    const supabase = getClient();
    if (!supabase) return;

    const queue = getOfflineQueue(currentDriver.id);
    if (queue.length === 0) {
      setPendingOfflineCount(0);
      return;
    }

    setIsSyncingOfflineQueue(true);
    try {
      const result = await syncOfflineQueue(currentDriver.id, supabase, (remaining) => {
        setPendingOfflineCount(remaining);
      });
      if (result.synced > 0) {
        showToast(`تمت مزامنة (${result.synced}) عملية معلقة مع الخادم بنجاح.`, 'success');
        await syncWithSupabase();
      }
    } catch (e) {
      console.warn('Error during offline queue sync:', e);
    } finally {
      setIsSyncingOfflineQueue(false);
      if (currentDriver?.id) {
        setPendingOfflineCount(getOfflineQueue(currentDriver.id).length);
      }
    }
  }, [currentDriver, showToast, syncWithSupabase]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('⚡ تم استعادة الاتصال بالإنترنت! جاري مزامنة العمليات المعلقة...', 'info');
      void refreshSectionSettings();
      void triggerOfflineQueueSync();
      void syncWithSupabase();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('⚠️ انقطع الاتصال بالإنترنت. تم تفعيل وضع العمل دون إنترنت (Offline Mode).', 'info');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (currentDriver?.id) {
      setPendingOfflineCount(getOfflineQueue(currentDriver.id).length);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentDriver, refreshSectionSettings, triggerOfflineQueueSync, syncWithSupabase, showToast]);

  // -------------------------------------------------------------
  // Driver Work Availability & Heartbeat Management
  // -------------------------------------------------------------

  // Rule 4: Evaluate initial or restored availability on startup / driver load
  // Driver is only considered available if is_available_for_work is true,
  // last heartbeat is within 2 minutes (120,000 ms), and driver is approved & active.
  useEffect(() => {
    if (!currentDriver) {
      setIsWorking(false);
      setLastHeartbeatTime(null);
      return;
    }

    // Must be approved and administratively active
    if (currentDriver.status !== 'approved' || !currentDriver.is_active) {
      setIsWorking(false);
      return;
    }

    if (currentDriver.is_available_for_work && currentDriver.availability_last_seen_at) {
      const lastSeenTime = new Date(currentDriver.availability_last_seen_at).getTime();
      if (!isNaN(lastSeenTime)) {
        const diffMs = Date.now() - lastSeenTime;
        const TWO_MINUTES_MS = 2 * 60 * 1000; // 120,000 ms
        // Active only if within 2 minutes threshold
        if (diffMs >= 0 && diffMs <= TWO_MINUTES_MS) {
          setIsWorking(true);
          setLastHeartbeatTime(currentDriver.availability_last_seen_at);
          return;
        }
      }
    }

    // If older than 2 minutes, false, or missing -> display as unavailable and do NOT auto-enable
    setIsWorking(false);
    if (currentDriver.availability_last_seen_at) {
      setLastHeartbeatTime(currentDriver.availability_last_seen_at);
    }
  }, [
    currentDriver?.id,
    currentDriver?.status,
    currentDriver?.is_active,
    currentDriver?.is_available_for_work,
    currentDriver?.availability_last_seen_at,
  ]);

  // Rule 3: Send Heartbeat to set_driver_availability(p_is_available: true)
  const sendHeartbeat = useCallback(async () => {
    if (!isWorkingRef.current || !navigator.onLine) return;
    if (isHeartbeatInFlightRef.current) return;

    const supabase = getClient();
    if (!supabase) return;

    const driver = currentDriverRef.current;
    if (!driver || driver.status !== 'approved' || !driver.is_active) return;

    isHeartbeatInFlightRef.current = true;
    try {
      const { error } = await supabase.rpc('set_driver_availability', {
        p_is_available: true,
      });

      if (error) {
        console.warn('[Heartbeat] set_driver_availability error:', error.message);
        setHeartbeatConsecutiveFailures((prev) => {
          const next = prev + 1;
          if (next === 2) {
            showToast('تنبيه: ضعف في إرسال نبضات الاتصال (Heartbeat) بالخادم.', 'info');
          }
          return next;
        });
      } else {
        const nowIso = new Date().toISOString();
        setLastHeartbeatTime(nowIso);
        setHeartbeatConsecutiveFailures(0);
        updateDriverAvailabilityFields(true, nowIso);
      }
    } catch (err) {
      console.warn('[Heartbeat] exception:', err);
      setHeartbeatConsecutiveFailures((prev) => prev + 1);
    } finally {
      isHeartbeatInFlightRef.current = false;
    }
  }, [showToast, updateDriverAvailabilityFields]);

  // Single Heartbeat Timer (60 seconds) while working
  useEffect(() => {
    isWorkingRef.current = isWorking;

    if (!isWorking) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    // Clean up any existing timer to guarantee only one timer runs
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    heartbeatIntervalRef.current = setInterval(() => {
      void sendHeartbeat();
    }, 60_000); // 60 seconds

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [isWorking, sendHeartbeat]);

  // Immediate Heartbeat + Fresh Section Settings/Sync when returning to foreground or focus (prevents stale cache)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshSectionSettings();
        if (currentDriverRef.current?.status === 'approved' && currentDriverRef.current?.is_active) {
          void syncWithSupabase();
        }
        if (isWorkingRef.current) {
          console.log('[Heartbeat] App resumed to foreground, triggering immediate heartbeat');
          void sendHeartbeat();
        }
      }
    };

    const handleFocus = () => {
      void refreshSectionSettings();
      if (currentDriverRef.current?.status === 'approved' && currentDriverRef.current?.is_active) {
        void syncWithSupabase();
      }
      if (isWorkingRef.current) {
        void sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [sendHeartbeat, refreshSectionSettings, syncWithSupabase]);

  // Start Work: set_driver_availability(p_is_available: true)
  const handleStartWork = async () => {
    if (isUpdatingAvailability) return;
    if (!currentDriver) {
      showToast('يرجى تسجيل الدخول أولاً.', 'error');
      return;
    }
    if (currentDriver.status !== 'approved') {
      showToast('لا يمكن بدء العمل لأن حسابك غير معتمد (status != approved).', 'error');
      return;
    }
    if (!currentDriver.is_active) {
      showToast('لا يمكن بدء العمل لأن حسابك معطل إدارياً (is_active = false).', 'error');
      return;
    }
    if (!navigator.onLine) {
      showToast('لا يمكن بدء العمل أثناء انقطاع الاتصال بالإنترنت.', 'error');
      return;
    }

    const supabase = getClient();
    if (!supabase) {
      showToast('الاتصال بـ Supabase غير مهيأ.', 'error');
      return;
    }

    setIsUpdatingAvailability(true);
    try {
      const { error } = await supabase.rpc('set_driver_availability', {
        p_is_available: true,
      });

      if (error) {
        showToast(`فشل بدء العمل: ${error.message}`, 'error');
        return;
      }

      const nowIso = new Date().toISOString();
      setIsWorking(true);
      setLastHeartbeatTime(nowIso);
      setHeartbeatConsecutiveFailures(0);
      updateDriverAvailabilityFields(true, nowIso);
      showToast('تم بدء العمل بنجاح! أنت الآن متاح لاستقبال وتوصيل الطلبات.', 'success');
      void syncWithSupabase();
      void loadPharmacyOrders('بدء العمل');
    } catch (err: any) {
      showToast(`حدث خطأ أثناء محاولة بدء العمل: ${err?.message || err}`, 'error');
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  // Stop Work: set_driver_availability(p_is_available: false)
  const handleStopWork = async () => {
    if (isUpdatingAvailability) return;
    if (!navigator.onLine) {
      showToast('لا يمكن إيقاف العمل في الخادم أثناء انقطاع الاتصال بالإنترنت.', 'error');
      return;
    }

    const supabase = getClient();
    if (!supabase) {
      showToast('الاتصال بـ Supabase غير مهيأ.', 'error');
      return;
    }

    setIsUpdatingAvailability(true);
    try {
      const { error } = await supabase.rpc('set_driver_availability', {
        p_is_available: false,
      });

      if (error) {
        showToast(`فشل إيقاف العمل: ${error.message}`, 'error');
        return;
      }

      const nowIso = new Date().toISOString();
      setIsWorking(false);
      setLastHeartbeatTime(nowIso);
      setHeartbeatConsecutiveFailures(0);

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      updateDriverAvailabilityFields(false, nowIso);
      showToast('تم إيقاف العمل بنجاح. أنت الآن غير متاح لاستقبال طلبات جديدة.', 'info');
    } catch (err: any) {
      showToast(`حدث خطأ أثناء محاولة إيقاف العمل: ${err?.message || err}`, 'error');
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  // Handle Driver Authentication (Login / Register)
  // Handle Driver Authentication (Login / Register)
  // CRITICAL RULE: Stage 1 creates delivery_driver record only. No Household, no profiles.
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalAuthError(null);
    clearAuthError();

    if (authMode === 'login') {
      const res = await loginWithEmail(authEmail, authPassword);
      if (!res.success) {
        setLocalAuthError(res.error || 'فشل تسجيل الدخول. يرجى التحقق من صحة البريد وكلمة المرور.');
        return;
      }
      showToast('تم تسجيل الدخول بنجاح.', 'success');
      return;
    }

    // Register Mode Validations
    setRegistrationSubmitting(true);
    const supabase = getClient();
    if (!supabase) {
      setLocalAuthError('يرجى ضبط رابط ومشروع Supabase أولاً من تبويب الإعدادات.');
      setRegistrationSubmitting(false);
      return;
    }

    try {
      if (!regFullName.trim()) {
        throw new Error('الاسم الرباعي الكامل للسائق مطلوب وإلزامي.');
      }
      if (!regPhone.trim()) {
        throw new Error('رقم هاتف السائق مطلوب وإلزامي.');
      }
      if (!regGovernorateName.trim()) {
        throw new Error('يرجى اختيار المحافظة التابع لها.');
      }
      if (!regMarkazName.trim()) {
        throw new Error('يرجى اختيار المركز أو المدينة.');
      }
      if (!regDetailedAddress.trim()) {
        throw new Error('العنوان التفصيلي (الشارع / القرية) مطلوب وإلزامي.');
      }
      if (!idCardFront || !idCardFront.file) {
        throw new Error('يرجى التقاط أو رفع صورة بطاقة الهوية الشخصية (الوجه الأمامي).');
      }
      if (!idCardBack || !idCardBack.file) {
        throw new Error('يرجى التقاط أو رفع صورة بطاقة الهوية الشخصية (الظهر).');
      }
      if (!driverLicense || !driverLicense.file) {
        throw new Error('يرجى التقاط أو رفع صورة رخصة القيادة الشخصية.');
      }
      if (!vehicleLicense || !vehicleLicense.file) {
        throw new Error('يرجى التقاط أو رفع صورة رخصة تسيير المركبة.');
      }

      // Validate raw image size (up to 25MB to accept high-res camera photos before canvas WebP compression)
      const MAX_DOC_BYTES = 25 * 1024 * 1024;
      if (idCardFront.file.size > MAX_DOC_BYTES) {
        throw new Error('حجم صورة بطاقة الهوية (الوجه الأمامي) كبير جداً (يتجاوز 25 ميجابايت).');
      }
      if (idCardBack.file.size > MAX_DOC_BYTES) {
        throw new Error('حجم صورة بطاقة الهوية (الظهر) كبير جداً (يتجاوز 25 ميجابايت).');
      }
      if (driverLicense.file.size > MAX_DOC_BYTES) {
        throw new Error('حجم صورة رخصة القيادة كبير جداً (يتجاوز 25 ميجابايت).');
      }
      if (vehicleLicense.file.size > MAX_DOC_BYTES) {
        throw new Error('حجم صورة رخصة تسيير المركبة كبير جداً (يتجاوز 25 ميجابايت).');
      }

      // Process & compress all 4 documents into high-clarity, compact binary WebP blobs
      const frontProcessed = idCardFront.dataUrl
        ? { dataUrl: idCardFront.dataUrl, blob: dataUrlToBlob(idCardFront.dataUrl) }
        : await processDocumentImage(idCardFront.file, 1200, 0.8);

      const backProcessed = idCardBack.dataUrl
        ? { dataUrl: idCardBack.dataUrl, blob: dataUrlToBlob(idCardBack.dataUrl) }
        : await processDocumentImage(idCardBack.file, 1200, 0.8);

      const driverLicenseProcessed = driverLicense.dataUrl
        ? { dataUrl: driverLicense.dataUrl, blob: dataUrlToBlob(driverLicense.dataUrl) }
        : await processDocumentImage(driverLicense.file, 1200, 0.8);

      const vehicleLicenseProcessed = vehicleLicense.dataUrl
        ? { dataUrl: vehicleLicense.dataUrl, blob: dataUrlToBlob(vehicleLicense.dataUrl) }
        : await processDocumentImage(vehicleLicense.file, 1200, 0.8);

      // 1. Create Supabase Auth User with metadata indicating delivery_driver role
      const { data: authData, error: signUpErr } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
        options: {
          data: {
            role: 'delivery_driver',
            user_type: 'delivery_driver',
            full_name: regFullName.trim(),
            phone: regPhone.trim(),
          },
        },
      });

      if (signUpErr) {
        throw new Error(`تعذر إنشاء حساب السائق: ${signUpErr.message}`);
      }

      const newUser = authData.user;
      if (!newUser) {
        throw new Error('تعذر إنشاء حساب السائق. يرجى التحقق من صحة البريد الإلكتروني وكلمة المرور.');
      }

      // Determine authenticated session & user ID
      let activeUserId: string;
      let finalUser: any = newUser;

      if (authData.session && authData.session.user?.id) {
        activeUserId = authData.session.user.id;
        finalUser = authData.session.user;
      } else {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });

        if (signInErr) {
          throw new Error(
            `تم إنشاء حساب المستخدم في auth.users ولكن تعذر تفعيل جلسة المصادقة تلقائيًا: ${signInErr.message}. ` +
            `إذا كان خيار تأكيد البريد مفعّلاً في Supabase، يرجى تأكيد البريد ثم تسجيل الدخول.`
          );
        }

        if (!signInData.session || !signInData.session.user?.id) {
          throw new Error(
            'تم إنشاء الحساب ولكن تعذر إنشاء جلسة مصادقة صالحة. يرجى المحاولة مرة أخرى عبر تسجيل الدخول.'
          );
        }

        activeUserId = signInData.session.user.id;
        finalUser = signInData.session.user;
      }

      // Storage paths for the 4 documents in driver-documents bucket
      const bucketName = 'driver-documents';
      const docBasePath = `drivers/${activeUserId}/documents`;
      const frontDocPath = `${docBasePath}/id_card_front.webp`;
      const backDocPath = `${docBasePath}/id_card_back.webp`;
      const driverLicenseDocPath = `${docBasePath}/driver_license.webp`;
      const vehicleLicenseDocPath = `${docBasePath}/vehicle_license.webp`;

      const frontBlob = frontProcessed.blob;
      const backBlob = backProcessed.blob;
      const driverLicenseBlob = driverLicenseProcessed.blob;
      const vehicleLicenseBlob = vehicleLicenseProcessed.blob;

      const frontFile = new File([frontBlob], 'id_card_front.webp', { type: 'image/webp' });
      const backFile = new File([backBlob], 'id_card_back.webp', { type: 'image/webp' });
      const driverLicenseFile = new File([driverLicenseBlob], 'driver_license.webp', { type: 'image/webp' });
      const vehicleLicenseFile = new File([vehicleLicenseBlob], 'vehicle_license.webp', { type: 'image/webp' });

      const uploadedPaths: string[] = [];

      const rollbackUploadedFiles = async () => {
        if (uploadedPaths.length > 0) {
          try {
            await supabase.storage.from(bucketName).remove(uploadedPaths);
          } catch (cleanupErr) {
            console.warn('[DRIVER REGISTER] Rollback cleanup error:', cleanupErr);
          }
        }
      };

      const uploadDocSafely = async (
        docPath: string,
        file: File,
        labelAr: string
      ): Promise<{ success: boolean; path: string; label: string; error?: string }> => {
        // If already successfully uploaded in this registration session, avoid re-uploading
        if (successfullyUploadedDocsRef.current.has(docPath)) {
          return { success: true, path: docPath, label: labelAr };
        }

        try {
          const { error: upErr } = await supabase.storage
            .from(bucketName)
            .upload(docPath, file, {
              contentType: 'image/webp',
              upsert: true,
            });

          if (upErr) {
            console.warn(`[DRIVER REGISTER] ${labelAr} storage upload error:`, upErr.message);
            return { success: false, path: docPath, label: labelAr, error: upErr.message };
          }

          successfullyUploadedDocsRef.current.add(docPath);
          uploadedPaths.push(docPath);
          return { success: true, path: docPath, label: labelAr };
        } catch (storageErr: any) {
          console.warn(`[DRIVER REGISTER] ${labelAr} storage service exception:`, storageErr?.message);
          return {
            success: false,
            path: docPath,
            label: labelAr,
            error: storageErr?.message || 'تعذر الاتصال بوحدة التخزين',
          };
        }
      };

      // 2. Upload all 4 required documents concurrently and verify each result
      const uploadResults = await Promise.all([
        uploadDocSafely(frontDocPath, frontFile, 'بطاقة الهوية (الوجه الأمامي)'),
        uploadDocSafely(backDocPath, backFile, 'بطاقة الهوية (الظهر)'),
        uploadDocSafely(driverLicenseDocPath, driverLicenseFile, 'رخصة القيادة الشخصية'),
        uploadDocSafely(vehicleLicenseDocPath, vehicleLicenseFile, 'رخصة تسيير المركبة'),
      ]);

      const failedDocs = uploadResults.filter((r) => !r.success);
      if (failedDocs.length > 0) {
        const failedNames = failedDocs.map((d) => d.label).join('، ');
        throw new Error(
          `فشل رفع الوثائق المطلوبة التالية إلى مساحة التخزين: [${failedNames}]. تم إيقاف التسجيل ولن يُنشأ سجل السائق حتى اكتمال رفع كافة الوثائق بنجاح. يرجى التحقق من اتصالك بالإنترنت وإعادة المحاولة.`
        );
      }

      // Cache document previews locally for fast preview on this client device
      try {
        const docPreviews = {
          idCardFront: frontProcessed.dataUrl || idCardFront.previewUrl,
          idCardBack: backProcessed.dataUrl || idCardBack.previewUrl,
          driverLicense: driverLicenseProcessed.dataUrl || driverLicense.previewUrl,
          vehicleLicense: vehicleLicenseProcessed.dataUrl || vehicleLicense.previewUrl,
          timestamp: Date.now(),
        };
        localStorage.setItem(`driver_docs_${activeUserId}`, JSON.stringify(docPreviews));
      } catch {
        // Ignore local storage quota limits
      }

      // Lookup governorate code from central geo_governorates first, fallback for static code lookup if anon RLS restricts table
      const centralGovMatch = regGeoHierarchy.governorates.find(
        (g) => (g.name_ar || g.name) === regGovernorateName.trim()
      );
      const matchedGov = EGYPT_GOVERNORATES.find((g) => g.name === regGovernorateName.trim());
      const matchedGovCode = centralGovMatch?.code || (matchedGov ? matchedGov.code : null);

      // Note: Store only clean storage path strings in the Postgres text columns, NOT Base64!
      const driverRecord = {
        user_id: activeUserId,
        full_name: regFullName.trim(),
        phone: regPhone.trim(),
        national_id: 'مرفق بالوثائق',
        governorate_name: regGovernorateName.trim() || null,
        governorate_code: matchedGovCode,
        markaz_name: regMarkazName.trim() || null,
        vehicle_type: regVehicleType.trim() || null,
        vehicle_plate: 'مرفق بالرخصة',
        notes: `[الدولة: مصر] [العنوان التفصيلي: ${regDetailedAddress.trim()}] ${regNotes.trim() ? `[ملاحظات: ${regNotes.trim()}]` : ''}`.trim(),
        status: 'pending_approval' as DriverStatus,
        is_active: false,
        id_card_front_path: frontDocPath,
        id_card_back_path: backDocPath,
        driver_license_path: driverLicenseDocPath,
        vehicle_license_path: vehicleLicenseDocPath,
      };

      const { data: inserted, error: tableErr } = await supabase
        .from('delivery_drivers')
        .insert(driverRecord)
        .select()
        .single();

      if (tableErr) {
        await rollbackUploadedFiles();
        if (tableErr.code === '42501' && tableErr.message?.includes('permission denied')) {
          throw new Error(
            'تعذر حفظ بيانات السائق بسبب الصلاحيات (42501): ينقص دور authenticated تصريح الإدراج في جدول delivery_drivers.'
          );
        }
        throw new Error(`تعذر حفظ بيانات السائق في قاعدة البيانات: ${tableErr.message}`);
      }

      if (inserted) {
        setDriverAfterRegistration(inserted as DeliveryDriver, finalUser);
      }

      showToast('تم تقديم طلب تسجيل السائق ورفع الوثائق بنجاح! بياناتك قيد مراجعة الإدارة.', 'success');
      void syncWithSupabase(activeUserId);
    } catch (err: any) {
      setLocalAuthError(err.message || 'حدث خطأ أثناء المصادقة والتسجيل.');
    } finally {
      setRegistrationSubmitting(false);
    }
  };

  const checkApprovalStatus = async () => {
    setIsSyncing(true);
    try {
      await checkDriverStatus();
      if (currentDriver) {
        if (currentDriver.status === 'approved' && currentDriver.is_active) {
          showToast('تهانينا! تمت الموافقة على حسابك وتفعيله بنجاح من قبل الإدارة.', 'success');
        } else if (currentDriver.status === 'rejected') {
          showToast(`تم رفض الحساب من قبل الإدارة: ${currentDriver.rejection_reason || 'بيانات غير مستوفاة'}`, 'error');
        } else if (!currentDriver.is_active) {
          showToast('حسابك معطل حالياً بقرار إداري.', 'info');
        } else {
          showToast('حسابك لا يزال قيد المراجعة لدى لوحة الإدارة (pending_approval).', 'info');
        }
      }
    } catch {
      showToast('حدث خطأ أثناء فحص حالة الحساب.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    // Attempt to set availability to false on server before signing out (never auto-cancels assigned orders)
    if (isWorkingRef.current) {
      try {
        const supabase = getClient();
        if (supabase) {
          await supabase.rpc('set_driver_availability', { p_is_available: false });
        }
      } catch (err) {
        console.warn('[Logout] Could not clear availability on server, will expire via heartbeat timeout:', err);
      }
    }

    setIsWorking(false);
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    successfullyUploadedDocsRef.current.clear();
    acceptingOrderIdsRef.current.clear();
    await endNavigationSession({
      supabase: getClient(),
      driverId: currentDriverRef.current?.id || null,
      endStatus: 'stopped',
    });
    clearNavigationSessionCache();
    sharedRouteDistanceManager.clear();
    await driverLogout();
    ordersService.cleanup();
    setOrders([]);
    setSelectedOrder(null);
    setOrderHistory([]);
    setPendingOfflineCount(0);
    const emptyCtx = createEmptyCentralGeoContext();
    centralGeoContextRef.current = emptyCtx;
    setCentralGeoContext(emptyCtx);
    setSystemSettings({
      driver_tracking_enabled: null,
      navigation_enabled: null,
      routing_provider: null,
      routing_engine: null,
      driver_location_update_interval_seconds: null,
      max_accepted_gps_accuracy_m: null,
      route_deviation_threshold_m: null,
      load_state: 'idle',
    });
    const idleSections = createEmptyAppSectionSettingsState('idle');
    sectionSettingsRef.current = idleSections;
    setSectionSettings(idleSections);
    showToast('تم تسجيل الخروج ومسح بيانات الجلسة المحلية بأمان.');
  };

  // Initialize edit profile form
  const openEditProfile = () => {
    if (!currentDriver) return;
    setEditPhone(currentDriver.phone || '');
    setEditGovernorateName(currentDriver.governorate_name || '');
    setEditGovernorateCode(currentDriver.governorate_code || '');
    setEditMarkazName(currentDriver.markaz_name || '');
    setEditVehicleType(currentDriver.vehicle_type || '');
    setEditVehiclePlate(currentDriver.vehicle_plate || '');
    setEditNotes(currentDriver.notes || '');
    setEditProfileOpen(true);
  };

  // Rule: Updating driver profile resets status to pending_approval and disables is_active
  const handleSaveDriverProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDriver || isSavingProfile) return;

    if (!editPhone.trim()) {
      showToast('رقم الهاتف مطلوب وإلزامي.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await saveDriverProfile({
        phone: editPhone.trim(),
        governorate_name: editGovernorateName.trim() || null,
        governorate_code: editGovernorateCode.trim() || null,
        markaz_name: editMarkazName.trim() || null,
        vehicle_type: editVehicleType.trim() || null,
        vehicle_plate: editVehiclePlate.trim() || null,
        notes: editNotes.trim() || null,
      });

      if (!res.success) {
        showToast(res.error || 'فشل تحديث بيانات السائق', 'error');
        return;
      }

      setEditProfileOpen(false);
      showToast('تم حفظ التعديلات بنجاح. تم تحويل حسابك إلى (قيد مراجعة الإدارة pending_approval) وتعطيله مؤقتًا حتى إعادة الاعتماد.', 'info');
      void syncWithSupabase(currentDriver.user_id || undefined);
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء حفظ التعديلات', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Rule: Accept Order (Only if service enabled, driver approved, and driver is_active)
  const handleAcceptOrder = async (order: DeliveryOrder) => {
    if (!settings?.delivery_enabled) {
      showToast('خدمة الدليفري معطلة حاليًا بقرار الإدارة العامة.', 'error');
      return;
    }
    if (!currentDriver) {
      showToast('يرجى اختيار سائق أولاً.', 'error');
      return;
    }
    if (currentDriver.status !== 'approved') {
      showToast('حسابك غير معتمد (status != approved). لا يمكنك قبول الطلبات قبل موافقة الإدارة.', 'error');
      return;
    }
    if (!currentDriver.is_active) {
      showToast('حسابك معطل حاليًا (is_active = false). يرجى تفعيل حسابك أولاً.', 'error');
      return;
    }
    if (!isWorking) {
      showToast('يجب الضغط على «بدء العمل» أولاً لتتمكن من استقبال وقبول الطلبات.', 'error');
      return;
    }
    if (!navigator.onLine) {
      showToast('لا يمكن قبول طلب توصيل جديد أثناء انقطاع الاتصال بالإنترنت. يرجى الانتظار حتى عودة الاتصال.', 'error');
      return;
    }
    if (order.status !== 'pending_review') {
      showToast(`لا يمكن قبول الطلب وهو في حالة: ${order.status}`, 'error');
      return;
    }
    if (isRestaurantOrder(order)) {
      const compat = checkRestaurantRpcCompatibility(order, 'accept_delivery_order', currentDriver.id);
      if (!compat.compatible) {
        showToast(compat.reason, 'error');
        return;
      }
    }

    const centralEligibility = isOrderEligibleForDriver(order, currentDriver, {
      isWorking,
      deliveryEnabled: Boolean(settings?.delivery_enabled),
      geoContext: centralGeoContextRef.current,
      sectionSettings: sectionSettingsRef.current,
    });
    if (!centralEligibility.matched) {
      showToast(
        centralEligibility.reason || 'هذا الطلب خارج نطاق التغطية الجغرافية المركزية المفعلة لك.',
        'error'
      );
      return;
    }

    // Concurrency Lock: Prevent multiple rapid clicks from accepting the same order twice
    if (acceptingOrderIdsRef.current.has(order.id) || isActionLoading) {
      return;
    }
    acceptingOrderIdsRef.current.add(order.id);
    setIsActionLoading(true);

    try {
      const supabase = getClient();
      if (!supabase) {
        showToast('الاتصال بـ Supabase غير مهيأ.', 'error');
        return;
      }

      // Live pre-RPC verification directly from app_section_settings (zero stale cache bypass)
      const freshSectionSettings = await fetchAppSectionSettings(supabase);
      sectionSettingsRef.current = freshSectionSettings;
      setSectionSettings(freshSectionSettings);

      const targetSectionKey = resolveOrderSectionKey(order);
      const freshSecEval = evaluateSectionOperationalStatus(
        freshSectionSettings,
        targetSectionKey
      );
      if (!freshSecEval.canAcceptNewOrders) {
        showToast(freshSecEval.reason, 'error');
        return;
      }

      const now = new Date().toISOString();

      const { error } = await supabase.rpc('accept_delivery_order', {
        p_order_id: order.id,
      });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (
          msg.includes('already') ||
          msg.includes('assigned') ||
          msg.includes('تم إسناد') ||
          msg.includes('not pending') ||
          msg.includes('حالة أخرى') ||
          msg.includes('مقبول') ||
          msg.includes('taken')
        ) {
          showToast('عذرًا، تم قبول هذا الطلب بالفعل من قبل سائق آخر.', 'error');
          setOrders((prev) => prev.filter((o) => o.id !== order.id));
          if (selectedOrder?.id === order.id) setSelectedOrder(null);
        } else {
          showToast(`فشل قبول الطلب: ${error.message}`, 'error');
        }
        return;
      }

      // Local State & History Update - only executed after confirmed server success
      const updatedOrder: DeliveryOrder = {
        ...order,
        status: 'accepted',
        assigned_driver_id: currentDriver.id,
        accepted_at: now,
        updated_at: now,
      };

      setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
      if (selectedOrder?.id === order.id) setSelectedOrder(updatedOrder);

      const newHist: DeliveryOrderStatusHistory = {
        id: crypto.randomUUID ? crypto.randomUUID() : `hist-${Date.now()}`,
        order_id: order.id,
        old_status: 'pending_review',
        new_status: 'accepted',
        changed_by: currentDriver.id,
        note: `تم قبول الطلب بواسطة السائق: ${currentDriver.full_name}`,
        created_at: now,
        previous_status: 'pending_review',
        changed_by_role: 'delivery_driver',
        notes: `تم قبول الطلب بواسطة السائق: ${currentDriver.full_name}`,
      };

      setOrderHistory((prev) => [newHist, ...prev]);
      showToast('تم قبول الطلب بنجاح وهو الآن قيد التوصيل.', 'success');
      await refreshOrderData(order.id);
    } catch (err: any) {
      showToast(`حدث خطأ أثناء قبول الطلب: ${err?.message || err}`, 'error');
    } finally {
      acceptingOrderIdsRef.current.delete(order.id);
      setIsActionLoading(false);
    }
  };

  // Helper: Refresh single order with items from Supabase
  const refreshOrderData = async (orderId: string) => {
    const supabase = getClient();
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('delivery_orders')
        .select(`*, items:delivery_order_items(*)`)
        .eq('id', orderId)
        .single();

      if (!error && data) {
        const refreshed = data as DeliveryOrder;
        refreshed.type = isRestaurantOrder(refreshed) ? 'restaurant' : 'regular';
        setOrders((prev) => prev.map((o) => (o.id === orderId ? refreshed : o)));
        setSelectedOrder((prev) => (prev?.id === orderId ? refreshed : prev));
        setSelectedRestaurantOrder((prev) => (prev?.id === orderId ? refreshed : prev));
        return refreshed;
      }
    } catch (e) {
      console.warn('refreshOrderData error:', e);
    }
    return null;
  };

  // Rule: Start Shopping (Only if accepted and assigned to current driver)
  const handleStartShopping = async (order: DeliveryOrder) => {
    if (!currentDriver || isActionLoading) return;
    if (order.status !== 'accepted') {
      showToast(`لا يمكن بدء التسوق إلا عندما تكون حالة الطلب مقبولة (accepted). الحالة الحالية: ${order.status}`, 'error');
      return;
    }
    if (order.assigned_driver_id !== currentDriver.id) {
      showToast('غير مصرح لك ببدء التسوق لطلب مخصص لسائق آخر.', 'error');
      return;
    }
    if (isRestaurantOrder(order)) {
      const compat = checkRestaurantRpcCompatibility(order, 'driver_start_shopping', currentDriver.id);
      if (!compat.compatible) {
        showToast(compat.reason, 'error');
        return;
      }
    }

    setIsActionLoading(true);
    try {
      const supabase = getClient();
      const now = new Date().toISOString();

      if (!navigator.onLine && currentDriver) {
        enqueueOfflineAction({
          driverId: currentDriver.id,
          actionType: 'delivery_start_shopping',
          orderId: order.id,
          payload: {},
        });
        setPendingOfflineCount(getOfflineQueue(currentDriver.id).length);
        const updatedOrder: DeliveryOrder = {
          ...order,
          status: 'shopping',
          updated_at: now,
        };
        setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
        setSelectedOrder(updatedOrder);
        showToast('بدأت مرحلة التسوق محليًا (أوفلاين) وسيتم المزامنة تلقائيًا فور عودة الإنترنت.', 'info');
        return;
      }

      if (supabase) {
        const { error } = await supabase.rpc('driver_start_shopping', {
          p_order_id: order.id,
        });
        if (error) {
          showToast(`فشل بدء التسوق: ${error.message}`, 'error');
          return;
        }
      }

      const updatedOrder: DeliveryOrder = {
        ...order,
        status: 'shopping',
        updated_at: now,
      };

      setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
      setSelectedOrder(updatedOrder);

      const newHist: DeliveryOrderStatusHistory = {
        id: crypto.randomUUID ? crypto.randomUUID() : `hist-${Date.now()}`,
        order_id: order.id,
        old_status: 'accepted',
        new_status: 'shopping',
        changed_by: currentDriver.id,
        note: `بدأ السائق ${currentDriver.full_name} مرحلة التسوق الميداني وشراء المنتجات`,
        created_at: now,
        previous_status: 'accepted',
        changed_by_role: 'delivery_driver',
        notes: `بدأ السائق ${currentDriver.full_name} مرحلة التسوق الميداني وشراء المنتجات`,
      };

      setOrderHistory((prev) => [newHist, ...prev]);
      showToast('بدأت مرحلة التسوق بنجاح! تم فتح شاشة التسوق لمراجعة المنتجات.', 'success');
      await refreshOrderData(order.id);
    } catch (err: any) {
      showToast(`حدث خطأ أثناء بدء التسوق: ${err.message || err}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Rule: Update Delivery Order Item (Purchased with actual unit price or Missing with mandatory reason)
  const handleUpdateDeliveryItem = async (
    item: DeliveryOrderItem,
    newStatus: 'purchased' | 'missing',
    actualPrice?: number,
    missingReason?: string
  ) => {
    if (!currentDriver || isActionLoading) return;

    const targetOrderForItem =
      orders.find((o) => o.id === item.order_id) ||
      (selectedRestaurantOrder?.id === item.order_id
        ? selectedRestaurantOrder
        : selectedOrder?.id === item.order_id
        ? selectedOrder
        : null);

    if (targetOrderForItem && isRestaurantOrder(targetOrderForItem)) {
      const compat = checkRestaurantRpcCompatibility(
        targetOrderForItem,
        'driver_update_delivery_item',
        currentDriver.id
      );
      if (!compat.compatible) {
        showToast(compat.reason, 'error');
        return;
      }
    }

    if (newStatus === 'purchased') {
      if (actualPrice === undefined || actualPrice === null || isNaN(actualPrice) || actualPrice < 0) {
        showToast('يرجى إدخال سعر شراء صحيح (رقم موجب أو صفر).', 'error');
        return;
      }
    } else if (newStatus === 'missing') {
      if (!missingReason || !missingReason.trim()) {
        showToast('سبب نقص المنتج إلزامي ولا يمكن حفظه فارغًا.', 'error');
        return;
      }
    }

    setIsActionLoading(true);
    try {
      if (!navigator.onLine && currentDriver) {
        enqueueOfflineAction({
          driverId: currentDriver.id,
          actionType: 'delivery_update_item',
          orderId: item.order_id,
          payload: {
            p_item_id: item.id,
            p_item_status: newStatus,
            p_actual_unit_price: newStatus === 'purchased' ? actualPrice : null,
            p_missing_reason: newStatus === 'missing' ? missingReason.trim() : null,
          },
        });
        setPendingOfflineCount(getOfflineQueue(currentDriver.id).length);
        setOrders((prev) =>
          prev.map((ord) => {
            if (ord.id !== item.order_id) return ord;
            const items = (ord.items || []).map((it) => {
              if (it.id !== item.id) return it;
              return {
                ...it,
                item_status: newStatus,
                actual_unit_price: newStatus === 'purchased' ? actualPrice : it.actual_unit_price,
                missing_reason: newStatus === 'missing' ? missingReason.trim() : null,
              };
            });
            return { ...ord, items };
          })
        );
        if (selectedOrder?.id === item.order_id) {
          setSelectedOrder((prev) => {
            if (!prev) return null;
            const items = (prev.items || []).map((it) => {
              if (it.id !== item.id) return it;
              return {
                ...it,
                item_status: newStatus,
                actual_unit_price: newStatus === 'purchased' ? actualPrice : it.actual_unit_price,
                missing_reason: newStatus === 'missing' ? missingReason.trim() : null,
              };
            });
            return { ...prev, items };
          });
        }
        if (selectedRestaurantOrder?.id === item.order_id) {
          setSelectedRestaurantOrder((prev) => {
            if (!prev) return null;
            const items = (prev.items || []).map((it) => {
              if (it.id !== item.id) return it;
              return {
                ...it,
                item_status: newStatus,
                actual_unit_price: newStatus === 'purchased' ? actualPrice : it.actual_unit_price,
                missing_reason: newStatus === 'missing' ? missingReason.trim() : null,
              };
            });
            return { ...prev, items };
          });
        }
        setEditingItemId(null);
        setItemPriceInput('');
        setMissingItemId(null);
        setMissingReasonInput('');
        showToast(
          newStatus === 'purchased'
            ? `تم حفظ شراء "${item.product_name}" محليًا (أوفلاين).`
            : `تم حفظ نقص "${item.product_name}" محليًا (أوفلاين).`,
          'info'
        );
        return;
      }

      const supabase = getClient();
      if (supabase) {
        const { error } = await supabase.rpc('driver_update_delivery_item', {
          p_item_id: item.id,
          p_item_status: newStatus,
          p_actual_unit_price: newStatus === 'purchased' ? actualPrice : null,
          p_missing_reason: newStatus === 'missing' ? missingReason.trim() : null,
        });

        if (error) {
          showToast(`فشل تحديث حالة المنتج: ${error.message}`, 'error');
          return;
        }
      }

      setEditingItemId(null);
      setItemPriceInput('');
      setMissingItemId(null);
      setMissingReasonInput('');

      showToast(
        newStatus === 'purchased'
          ? `تم تأكيد شراء "${item.product_name}" بسعر ${Number(actualPrice).toFixed(2)} ج.م للوحدة.`
          : `تم تسجيل "${item.product_name}" كمنتج ناقص.`,
        'success'
      );

      await refreshOrderData(item.order_id);
    } catch (err: any) {
      showToast(`حدث خطأ أثناء تحديث المنتج: ${err.message || err}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Rule: Complete Shopping (Requires all items to be either purchased or missing)
  const handleCompleteShopping = async (order: DeliveryOrder) => {
    if (!currentDriver || isActionLoading) return;
    if (order.status !== 'shopping') {
      showToast(`لا يمكن إنهاء التسوق إلا عندما تكون حالة الطلب "shopping". الحالة الحالية: ${order.status}`, 'error');
      return;
    }
    if (isRestaurantOrder(order)) {
      const compat = checkRestaurantRpcCompatibility(order, 'driver_complete_shopping', currentDriver.id);
      if (!compat.compatible) {
        showToast(compat.reason, 'error');
        return;
      }
    }

    const items = order.items || [];
    const pendingItems = items.filter((it) => !it.item_status || it.item_status === 'pending');
    if (pendingItems.length > 0) {
      showToast(`لا يمكن إنهاء التسوق قبل معالجة جميع المنتجات. يتبقى (${pendingItems.length}) منتج معلق.`, 'error');
      return;
    }

    setIsActionLoading(true);
    try {
      const supabase = getClient();
      const now = new Date().toISOString();

      if (supabase) {
        const { error } = await supabase.rpc('driver_complete_shopping', {
          p_order_id: order.id,
        });

        if (error) {
          showToast(`فشل إكمال التسوق: ${error.message}`, 'error');
          return;
        }
      }

      await refreshOrderData(order.id);
      const newHist: DeliveryOrderStatusHistory = {
        id: crypto.randomUUID ? crypto.randomUUID() : `hist-${Date.now()}`,
        order_id: order.id,
        old_status: 'shopping',
        new_status: 'shopping_completed',
        changed_by: currentDriver.id,
        note: `أنهى السائق ${currentDriver.full_name} مرحلة التسوق بنجاح واعتمد الإجمالي الفعلي`,
        created_at: now,
        previous_status: 'shopping',
        changed_by_role: 'delivery_driver',
        notes: `أنهى السائق ${currentDriver.full_name} مرحلة التسوق بنجاح واعتمد الإجمالي الفعلي`,
      };

      setOrderHistory((prev) => [newHist, ...prev]);
      showToast('تم إكمال التسوق بنجاح! تم احتساب الإجمالي الفعلي وأصبح الطلب جاهزًا للتوصيل للعميل.', 'success');
    } catch (err: any) {
      showToast(`حدث خطأ أثناء إكمال التسوق: ${err.message || err}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Rule: Complete Order (Only if shopping_completed and assigned to current driver)
  const handleCompleteOrder = async (order: DeliveryOrder) => {
    if (!currentDriver || isActionLoading) return;
    if (order.status !== 'shopping_completed') {
      showToast('لا يمكن إتمام التوصيل إلا بعد إنهاء مرحلة التسوق واحتساب الفاتورة الفعلية (shopping_completed).', 'error');
      return;
    }
    if (order.assigned_driver_id !== currentDriver.id) {
      showToast('غير مصرح لك بإتمام طلب مخصص لسائق آخر.', 'error');
      return;
    }
    if (isRestaurantOrder(order)) {
      const compat = checkRestaurantRpcCompatibility(order, 'complete_delivery_order', currentDriver.id);
      if (!compat.compatible) {
        showToast(compat.reason, 'error');
        return;
      }
    }

    setIsActionLoading(true);
    try {
      const supabase = getClient();
      const now = new Date().toISOString();

      if (!navigator.onLine && currentDriver) {
        enqueueOfflineAction({
          driverId: currentDriver.id,
          actionType: 'delivery_complete',
          orderId: order.id,
          payload: {},
        });
        setPendingOfflineCount(getOfflineQueue(currentDriver.id).length);
        const updatedOrder: DeliveryOrder = {
          ...order,
          status: 'completed',
          delivered_at: now,
          updated_at: now,
        };
        setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
        if (selectedOrder?.id === order.id) setSelectedOrder(updatedOrder);
        showToast('تم تأكيد إتمام التوصيل محليًا (أوفلاين) وسيتم المزامنة تلقائيًا فور عودة الإنترنت.', 'info');
        return;
      }

      if (supabase) {
        const { error } = await supabase.rpc('complete_delivery_order', {
          p_order_id: order.id,
        });
        if (error) {
          showToast(`فشل إكمال الطلب: ${error.message}`, 'error');
          return;
        }
      }

      const updatedOrder: DeliveryOrder = {
        ...order,
        status: 'completed',
        delivered_at: now,
        updated_at: now,
      };

      setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
      if (selectedOrder?.id === order.id) setSelectedOrder(updatedOrder);

      const newHist: DeliveryOrderStatusHistory = {
        id: crypto.randomUUID ? crypto.randomUUID() : `hist-${Date.now()}`,
        order_id: order.id,
        old_status: 'shopping_completed',
        new_status: 'completed',
        changed_by: currentDriver.id,
        note: 'تم توصيل وتسليم الطلب للعميل بنجاح بعد استلام القيمة الفعلية',
        created_at: now,
        previous_status: 'shopping_completed',
        changed_by_role: 'delivery_driver',
        notes: 'تم توصيل وتسليم الطلب للعميل بنجاح بعد استلام القيمة الفعلية',
      };

      setOrderHistory((prev) => [newHist, ...prev]);
      void endNavigationSession({
        supabase,
        driverId: currentDriver.id,
        orderId: order.id,
        endStatus: 'completed',
      });
      showToast('تم إتمام التوصيل وتأكيد التسليم بنجاح.', 'success');
      await refreshOrderData(order.id);
    } catch (err: any) {
      showToast(`حدث خطأ أثناء إكمال التوصيل: ${err.message || err}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Rule: Request Order Cancellation (Mandatory Reason, sets to cancellation_pending)
  const handleRequestCancellationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalOrder || !currentDriver) return;
    const cleanReason = cancelReasonText.trim();
    if (!cleanReason) {
      showToast('سبب الإلغاء إلزامي ولا يمكن تركه فارغًا.', 'error');
      return;
    }
    if (isRestaurantOrder(cancelModalOrder)) {
      const compat = checkRestaurantRpcCompatibility(
        cancelModalOrder,
        'request_order_cancellation',
        currentDriver.id
      );
      if (!compat.compatible) {
        showToast(compat.reason, 'error');
        return;
      }
    }

    const supabase = getClient();
    const now = new Date().toISOString();

    if (!navigator.onLine && currentDriver) {
      enqueueOfflineAction({
        driverId: currentDriver.id,
        actionType: 'delivery_cancel_request',
        orderId: cancelModalOrder.id,
        payload: { reason: cleanReason },
      });
      setPendingOfflineCount(getOfflineQueue(currentDriver.id).length);
      const updatedOrder: DeliveryOrder = {
        ...cancelModalOrder,
        status: 'cancellation_pending',
        cancellation_reason: cleanReason,
        cancellation_requested_at: now,
        cancellation_requested_by: currentDriver.id,
        updated_at: now,
      };
      setOrders((prev) => prev.map((o) => (o.id === cancelModalOrder.id ? updatedOrder : o)));
      if (selectedOrder?.id === cancelModalOrder.id) setSelectedOrder(updatedOrder);
      setCancelModalOrder(null);
      setCancelReasonText('');
      showToast('تم إرسال طلب الإلغاء محليًا (أوفلاين) وسيتم المزامنة فور عودة الاتصال.', 'info');
      return;
    }

    if (supabase) {
      const { error } = await supabase.rpc('request_order_cancellation', {
        p_order_id: cancelModalOrder.id,
        p_reason: cleanReason,
      });
      if (error) {
        showToast(`فشل إرسال طلب الإلغاء: ${error.message}`, 'error');
        return;
      }
    }

    const updatedOrder: DeliveryOrder = {
      ...cancelModalOrder,
      status: 'cancellation_pending',
      cancellation_reason: cleanReason,
      cancellation_requested_at: now,
      cancellation_requested_by: currentDriver.id,
      updated_at: now,
    };

    setOrders((prev) => prev.map((o) => (o.id === cancelModalOrder.id ? updatedOrder : o)));
    if (selectedOrder?.id === cancelModalOrder.id) setSelectedOrder(updatedOrder);

    const newHist: DeliveryOrderStatusHistory = {
      id: crypto.randomUUID ? crypto.randomUUID() : `hist-${Date.now()}`,
      order_id: cancelModalOrder.id,
      old_status: 'accepted',
      new_status: 'cancellation_pending',
      changed_by: currentDriver.id,
      note: `طلب السائق إلغاء الطلب: ${cleanReason}`,
      created_at: now,
      previous_status: 'accepted',
      changed_by_role: 'delivery_driver',
      notes: `طلب السائق إلغاء الطلب: ${cleanReason}`,
    };

    setOrderHistory((prev) => [newHist, ...prev]);
    void endNavigationSession({
      supabase,
      driverId: currentDriver.id,
      orderId: cancelModalOrder.id,
      endStatus: 'cancelled',
    });
    setCancelModalOrder(null);
    setCancelReasonText('');
    showToast('تم إرسال طلب الإلغاء بنجاح وهو الآن في انتظار قرار الإدارة (cancellation_pending).', 'info');
  };

  // Save Supabase Configuration via Unified Client Service
  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseCredentials(supabaseUrl, supabaseKey);
    showToast('تم حفظ إعدادات Supabase وجارٍ مزامنة البيانات...', 'info');
    syncWithSupabase();
  };

  // Filtered Orders for the active view tab (pending orders strictly gated by central coverage, active work & section operational status)
  const filteredOrders = useMemo(() => {
    let list = [...orders];
    const eligibilityCtx = {
      isWorking,
      deliveryEnabled: Boolean(settings?.delivery_enabled),
      geoContext: centralGeoContext,
      sectionSettings,
    };

    if (activeTab === 'pending') {
      list = list.filter(
        (o) =>
          o.status === 'pending_review' &&
          !o.assigned_driver_id &&
          isOrderEligibleForDriver(o, currentDriver, eligibilityCtx).matched
      );
    } else if (activeTab === 'accepted') {
      list = list.filter(
        (o) =>
          (o.status === 'accepted' || o.status === 'shopping' || o.status === 'shopping_completed') &&
          o.assigned_driver_id === currentDriver?.id
      );
    } else if (activeTab === 'completed') {
      list = list.filter(
        (o) =>
          (o.status === 'completed' || o.status === 'delivered') &&
          o.assigned_driver_id === currentDriver?.id
      );
    } else if (activeTab === 'cancelled') {
      list = list.filter(
        (o) =>
          (o.status === 'cancelled' || o.status === 'cancellation_pending') &&
          (o.assigned_driver_id === currentDriver?.id ||
            (!o.assigned_driver_id &&
              evaluateCentralCoverageMatch(o, currentDriver, centralGeoContext).matched))
      );
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number?.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_phone?.includes(q) ||
          o.detailed_address?.toLowerCase().includes(q) ||
          o.delivery_area_name?.toLowerCase().includes(q) ||
          (o as any).restaurant_name?.toLowerCase().includes(q) ||
          (o as any).store?.name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [orders, activeTab, currentDriver, isWorking, settings?.delivery_enabled, centralGeoContext, sectionSettings, searchQuery]);

  // Separate Home (Regular) vs Restaurant orders (strictly sorted oldest first -> newest last)
  const filteredHomeOrders = useMemo(() => {
    return sortOrdersOldestFirst(filteredOrders.filter((o) => !isRestaurantOrder(o)));
  }, [filteredOrders]);

  const filteredRestaurantOrders = useMemo(() => {
    return sortOrdersOldestFirst(
      filteredOrders.filter((o) => isRestaurantOrderForDriver(o, currentDriver?.id, currentDriver))
    );
  }, [filteredOrders, currentDriver]);

  // Home (Regular) Order Counts
  const homeCounts = useMemo(() => {
    const homeList = orders.filter((o) => !isRestaurantOrder(o));
    const eligibilityCtx = {
      isWorking,
      deliveryEnabled: Boolean(settings?.delivery_enabled),
      geoContext: centralGeoContext,
      sectionSettings,
    };
    return {
      pending: homeList.filter(
        (o) =>
          o.status === 'pending_review' &&
          !o.assigned_driver_id &&
          isOrderEligibleForDriver(o, currentDriver, eligibilityCtx).matched
      ).length,
      accepted: homeList.filter(
        (o) =>
          (o.status === 'accepted' || o.status === 'shopping' || o.status === 'shopping_completed') &&
          o.assigned_driver_id === currentDriver?.id
      ).length,
      completed: homeList.filter(
        (o) =>
          (o.status === 'completed' || o.status === 'delivered') &&
          o.assigned_driver_id === currentDriver?.id
      ).length,
      cancelled: homeList.filter(
        (o) =>
          (o.status === 'cancelled' || o.status === 'cancellation_pending') &&
          (o.assigned_driver_id === currentDriver?.id ||
            (!o.assigned_driver_id &&
              evaluateCentralCoverageMatch(o, currentDriver, centralGeoContext).matched))
      ).length,
    };
  }, [orders, currentDriver, isWorking, settings?.delivery_enabled, centralGeoContext, sectionSettings]);

  // Restaurant Order Counts
  const restaurantCounts = useMemo(() => {
    const restList = orders.filter((o) =>
      isRestaurantOrderForDriver(o, currentDriver?.id, currentDriver)
    );
    const eligibilityCtx = {
      isWorking,
      deliveryEnabled: Boolean(settings?.delivery_enabled),
      geoContext: centralGeoContext,
      sectionSettings,
    };
    return {
      pending: restList.filter(
        (o) =>
          o.status === 'pending_review' &&
          !o.assigned_driver_id &&
          isOrderEligibleForDriver(o, currentDriver, eligibilityCtx).matched
      ).length,
      accepted: restList.filter(
        (o) =>
          (o.status === 'accepted' || o.status === 'shopping' || o.status === 'shopping_completed') &&
          o.assigned_driver_id === currentDriver?.id
      ).length,
      completed: restList.filter(
        (o) =>
          (o.status === 'completed' || o.status === 'delivered') &&
          o.assigned_driver_id === currentDriver?.id
      ).length,
      cancelled: restList.filter(
        (o) =>
          (o.status === 'cancelled' || o.status === 'cancellation_pending') &&
          (o.assigned_driver_id === currentDriver?.id ||
            (!o.assigned_driver_id &&
              evaluateCentralCoverageMatch(o, currentDriver, centralGeoContext).matched))
      ).length,
    };
  }, [orders, currentDriver, isWorking, settings?.delivery_enabled, centralGeoContext, sectionSettings]);

  // Evaluated status for household_shortages, ready_food, and pharmacy sections
  const householdSectionEval = useMemo(
    () => evaluateSectionOperationalStatus(sectionSettings, 'household_shortages'),
    [sectionSettings]
  );
  const restaurantSectionEval = useMemo(
    () => evaluateSectionOperationalStatus(sectionSettings, 'ready_food'),
    [sectionSettings]
  );
  const pharmacySectionEval = useMemo(
    () => evaluateSectionOperationalStatus(sectionSettings, 'pharmacy'),
    [sectionSettings]
  );

  // Keep 'counts' as alias to homeCounts for backwards compatibility
  const counts = homeCounts;

  const allCategoryCounts = useMemo(
    () => ({
      pending: homeCounts.pending + restaurantCounts.pending + pharmacyCounts.pending,
      accepted: homeCounts.accepted + restaurantCounts.accepted + pharmacyCounts.accepted,
      completed: homeCounts.completed + restaurantCounts.completed + pharmacyCounts.completed,
      cancelled: homeCounts.cancelled + restaurantCounts.cancelled + pharmacyCounts.cancelled,
    }),
    [homeCounts, restaurantCounts, pharmacyCounts]
  );

  const displayCounts = useMemo(() => {
    if (orderCategoryView === 'regular') {
      return homeCounts;
    }
    if (orderCategoryView === 'restaurant') {
      return restaurantCounts;
    }
    if (orderCategoryView === 'pharmacy') {
      return pharmacyCounts;
    }
    return allCategoryCounts;
  }, [orderCategoryView, homeCounts, restaurantCounts, pharmacyCounts, allCategoryCounts]);

  // Unified chronological orders list when viewing 'all' (oldest created_at at top -> newest at bottom)
  const unifiedChronologicalOrders = useMemo(
    () =>
      buildUnifiedChronologicalOrders({
        activeTab,
        searchQuery,
        orders,
        pharmacyOrders,
        currentDriver,
        isWorking,
        deliveryEnabled: Boolean(settings?.delivery_enabled),
        geoContext: centralGeoContext,
        sectionSettings,
      }),
    [
      activeTab,
      searchQuery,
      orders,
      pharmacyOrders,
      currentDriver,
      isWorking,
      settings?.delivery_enabled,
      centralGeoContext,
      sectionSettings,
    ]
  );

  // Authoritative unified financial summary (reads strictly stored backend fields, zero formulas)
  const driverAccountingSummary = useMemo(
    () =>
      computeDriverAccountingSummary(
        orders,
        pharmacyOrders,
        currentDriver?.id || null
      ),
    [orders, pharmacyOrders, currentDriver?.id]
  );

  // 1. Initial Loading Screen / Splash Screen
  if (authStatus === 'loading') {
    return <SplashScreen statusMessage={splashMessage} step={splashStep} splashImageSrc={splashImageSrc} />;
  }

  // 2. Unauthenticated Start Screen: Login / Register New Delivery Driver
  if (!supabaseUser) {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-['Cairo',sans-serif] text-neutral-900 selection:bg-emerald-200" dir="rtl">
        {toastMessage && (
          <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
            <div
              className={`p-4 rounded-2xl shadow-xl border flex items-start space-x-3 space-x-reverse ${
                toastMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border-rose-200'
                  : toastMessage.type === 'info'
                  ? 'bg-sky-50 text-sky-900 border-sky-200'
                  : 'bg-emerald-50 text-emerald-950 border-emerald-200'
              }`}
            >
              {toastMessage.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : toastMessage.type === 'info' ? (
                <AlertTriangle className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <p className="text-xs font-semibold leading-relaxed">{toastMessage.text}</p>
            </div>
          </div>
        )}

        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-white p-1 flex items-center justify-center shadow-lg border border-neutral-200 mb-3 overflow-hidden">
            <img
              src={headerImageSrc}
              alt="شعار التطبيق الرسمي"
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== window.location.origin + DEFAULT_FALLBACK_ASSET) {
                  target.src = DEFAULT_FALLBACK_ASSET;
                }
              }}
            />
          </div>
          <h1 className="text-2xl font-extrabold text-neutral-900">طلبات البيت</h1>
          <p className="mt-1 text-xs font-bold text-neutral-500">بوابة تسجيل ودخول مناديب وسائقي التوصيل (Driver App)</p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-xl">
          {/* Auth Mode Toggle Tabs */}
          <div className="bg-neutral-200/80 p-1.5 rounded-2xl flex text-xs font-bold mb-6 gap-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setLocalAuthError(null);
                clearAuthError();
              }}
              className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center space-x-1.5 space-x-reverse ${
                authMode === 'login'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <User className="w-4 h-4" />
              <span>تسجيل الدخول</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setLocalAuthError(null);
                clearAuthError();
              }}
              className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center space-x-1.5 space-x-reverse ${
                authMode === 'register'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>تسجيل دليفري جديد</span>
            </button>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-xl">
            {(localAuthError || driverAuthError) && (
              <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2 space-x-reverse">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="font-semibold leading-relaxed space-y-2 flex-1">
                  <p className="whitespace-pre-line">{localAuthError || driverAuthError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <>
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-950 text-xs space-y-1.5 mb-2">
                    <div className="font-bold flex items-center space-x-1.5 space-x-reverse">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>شروط الانضمام والاعتماد:</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900">
                      يتم تسجيل طلب السائق في جدول <code>delivery_drivers</code> بحالة مبدئية <code>pending_approval</code> وحساب غير نشط. لن يتم الدخول إلى التطبيق واستلام الطلبات إلا بعد مراجعة بياناتك واعتماد الحساب من قبل لوحة الإدارة.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        الاسم الرباعي الكامل <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: محمود أحمد حسن علي"
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600 font-semibold"
                      />
                    </div>

                    {/* Phone Number */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        رقم الهاتف المحمول <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="010XXXXXXXX"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600 font-mono font-bold"
                        dir="ltr"
                      />
                    </div>

                    {/* Country Selector (Egypt only) */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        الدولة <span className="text-rose-600">*</span>
                      </label>
                      <div className="w-full text-xs border border-neutral-200 bg-neutral-100/90 rounded-xl p-3 font-bold text-neutral-800 flex items-center justify-between">
                        <span className="flex items-center space-x-2 space-x-reverse">
                          <span className="text-base">🇪🇬</span>
                          <span>مصر (جمهورية مصر العربية)</span>
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-semibold">
                          معتمد
                        </span>
                      </div>
                    </div>

                    {/* Vehicle Type */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        نوع وسيلة النقل
                      </label>
                      <select
                        value={regVehicleType}
                        onChange={(e) => setRegVehicleType(e.target.value)}
                        className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600 font-semibold bg-white"
                      >
                        <option value="دراجة نارية (موتوسيكل)">دراجة نارية (موتوسيكل)</option>
                        <option value="سيارة">سيارة</option>
                        <option value="تروسيكل">تروسيكل</option>
                        <option value="دراجة هوائية">دراجة هوائية</option>
                        <option value="سكوتر كهربائي">سكوتر كهربائي</option>
                      </select>
                    </div>

                    {/* Linked Governorate Selector */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        المحافظة <span className="text-rose-600">*</span>
                      </label>
                      <select
                        required
                        value={regGovernorateName}
                        onChange={(e) => {
                          const newGov = e.target.value;
                          setRegGovernorateName(newGov);
                          const activeCentralGovs = regGeoHierarchy.governorates.filter((g) => g.is_active !== false);
                          if (regGeoHierarchy.loaded && activeCentralGovs.length > 0) {
                            const matchedCentral = activeCentralGovs.find(
                              (g) => (g.name_ar || g.name) === newGov
                            );
                            if (matchedCentral) {
                              const centers = regGeoHierarchy.centers
                                .filter((c) => c.governorate_id === matchedCentral.id && c.is_active !== false)
                                .map((c) => c.name_ar || c.name || '')
                                .filter(Boolean);
                              setRegMarkazName(centers[0] || '');
                              return;
                            }
                          }
                          const matched = EGYPT_GOVERNORATES.find((g) => g.name === newGov);
                          if (matched && matched.centers.length > 0) {
                            setRegMarkazName(matched.centers[0]);
                          } else {
                            setRegMarkazName('');
                          }
                        }}
                        className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600 font-semibold bg-white"
                      >
                        {registrationGovernorates.map((gov) => (
                          <option key={gov.id} value={gov.name}>
                            {gov.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Linked Markaz / City Selector */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1">
                        المركز / المدينة <span className="text-rose-600">*</span>
                      </label>
                      <select
                        required
                        value={regMarkazName}
                        onChange={(e) => setRegMarkazName(e.target.value)}
                        className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600 font-semibold bg-white"
                      >
                        {availableCenters.map((center) => (
                          <option key={center} value={center}>
                            {center}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Detailed Address */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      الشارع / القرية / العنوان التفصيلي <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: شارع الجمهورية، بجوار البنك الأهلي، عمارة 4"
                      value={regDetailedAddress}
                      onChange={(e) => setRegDetailedAddress(e.target.value)}
                      className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600 font-semibold"
                    />
                  </div>

                  {/* Document Uploads Section */}
                  <div className="border-t border-neutral-200 pt-4 space-y-3">
                    <div className="flex items-center space-x-2 space-x-reverse text-neutral-900">
                      <FileCheck className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-extrabold">المستندات والوثائق الرسمية المطلوبة (إلزامية للتفعيل):</span>
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      يرجى التقاط أو رفع صور واضحة لوثائقك الثبوتية لمراجعتها واعتماد حسابك من الإدارة.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* 1. National ID - Front */}
                      <DocumentUploader
                        id="reg-id-front"
                        label="بطاقة الهوية الشخصية (الوجه الأمامي)"
                        description="صورة واضحة للرقم القومي والاسم والصورة"
                        required={true}
                        value={idCardFront}
                        onChange={setIdCardFront}
                      />

                      {/* 2. National ID - Back */}
                      <DocumentUploader
                        id="reg-id-back"
                        label="بطاقة الهوية الشخصية (الظهر)"
                        description="صورة واضحة لظهر البطاقة وتاريخ الانتهاء"
                        required={true}
                        value={idCardBack}
                        onChange={setIdCardBack}
                      />

                      {/* 3. Driver License */}
                      <DocumentUploader
                        id="reg-driver-license"
                        label="رخصة القيادة الشخصية"
                        description="رخصة قيادة سارية ومطابقة لنوع المركبة"
                        required={true}
                        value={driverLicense}
                        onChange={setDriverLicense}
                      />

                      {/* 4. Vehicle License */}
                      <DocumentUploader
                        id="reg-vehicle-license"
                        label="رخصة تسيير المركبة"
                        description="رخصة تسيير المركبة المعتمدة للتوصيل"
                        required={true}
                        value={vehicleLicense}
                        onChange={setVehicleLicense}
                      />
                    </div>
                  </div>

                  {/* Notes (Optional) */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-800 mb-1">
                      ملاحظات أو خبرات سابقة في التوصيل (اختياري)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="أي معلومات إضافية تود إرفاقها لطلبك..."
                      value={regNotes}
                      onChange={(e) => setRegNotes(e.target.value)}
                      className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600"
                    />
                  </div>

                  <div className="border-t border-neutral-200 pt-3">
                    <span className="block text-xs font-bold text-neutral-700 mb-2">بيانات حساب الدخول:</span>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  البريد الإلكتروني <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute right-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    placeholder="driver@example.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full text-xs border border-neutral-300 rounded-xl pr-10 pl-3 py-3 focus:outline-hidden focus:border-emerald-600 font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  كلمة المرور <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute right-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full text-xs border border-neutral-300 rounded-xl pr-10 pl-3 py-3 focus:outline-hidden focus:border-emerald-600 font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthSubmitting || registrationSubmitting}
                className="w-full py-3.5 rounded-xl text-xs font-bold text-white shadow-md transition flex items-center justify-center space-x-2 space-x-reverse bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400"
              >
                {isAuthSubmitting || registrationSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري المعالجة والتحقق...</span>
                  </>
                ) : authMode === 'register' ? (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>إرسال طلب تسجيل السائق للاعتماد</span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4" />
                    <span>تسجيل الدخول</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs">
              {authMode === 'login' ? (
                <>
                  <span className="text-neutral-500">ليس لديك حساب سائق؟</span>
                  <button
                    onClick={() => {
                      setAuthMode('register');
                      setLocalAuthError(null);
                      clearAuthError();
                    }}
                    className="font-bold text-emerald-700 hover:text-emerald-900 underline"
                  >
                    تسجيل سائق دليفري جديد
                  </button>
                </>
              ) : (
                <>
                  <span className="text-neutral-500">لديك حساب مسجل بالفعل؟</span>
                  <button
                    onClick={() => {
                      setAuthMode('login');
                      setLocalAuthError(null);
                      clearAuthError();
                    }}
                    className="font-bold text-emerald-700 hover:text-emerald-900 underline"
                  >
                    تسجيل الدخول
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Collapsible Supabase Project Config Button */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowSupabaseSettings(!showSupabaseSettings)}
              className="text-[11px] text-neutral-500 hover:text-neutral-800 underline inline-flex items-center space-x-1 space-x-reverse"
            >
              <Database className="w-3.5 h-3.5" />
              <span>إعدادات ربط Supabase (URL & Key)</span>
            </button>
            {showSupabaseSettings && (
              <div className="mt-3 p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm text-right text-xs space-y-3">
                <h4 className="font-bold text-neutral-800">بيانات الاتصال بقاعدة البيانات</h4>
                <div>
                  <label className="block text-neutral-500 text-[10px] mb-1">Project URL</label>
                  <input
                    type="text"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2 font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-neutral-500 text-[10px] mb-1">Anon Public Key</label>
                  <input
                    type="text"
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2 font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={handleSaveSupabaseConfig}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs"
                >
                  حفظ الإعدادات وإعادة الاتصال
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Dedicated Error Screen when fetching driver fails or connection issue occurs
  if (authStatus === 'error') {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col justify-center items-center p-4 font-['Cairo',sans-serif] text-neutral-900" dir="rtl">
        {toastMessage && (
          <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
            <div className="p-4 rounded-2xl shadow-xl border bg-rose-50 text-rose-900 border-rose-200 text-xs font-semibold">
              {toastMessage.text}
            </div>
          </div>
        )}
        <div className="bg-white max-w-lg w-full rounded-3xl border border-neutral-200 p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center space-x-1.5 space-x-reverse px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-900 border border-rose-200">
            <span>تعذر الاتصال بالخادم أو تحميل البيانات</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-neutral-900">خطأ في الاتصال بقاعدة البيانات</h2>
            <p className="text-xs text-neutral-600 leading-relaxed">
              {driverAuthError || 'حدث خطأ أثناء محاولة الاتصال بالخادم أو جلب بيانات السائق. لم يتم إنهاء جلستك، ويمكنك المحاولة مجددًا فور استقرار الاتصال.'}
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => retryFetchDriver()}
              disabled={isSyncingDriver}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingDriver ? 'animate-spin' : ''}`} />
              <span>إعادة المحاولة الآن</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <LogOut className="w-4 h-4 text-neutral-500" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Gatekeeping: Check Driver Profile, Approval Status, and Active Status
  // If no driver record found in delivery_drivers table for this user
  if (authStatus === 'no_record' || !currentDriver) {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col justify-center items-center p-4 font-['Cairo',sans-serif] text-neutral-900" dir="rtl">
        {toastMessage && (
          <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
            <div className="p-4 rounded-2xl shadow-xl border bg-emerald-50 text-emerald-950 border-emerald-200 text-xs font-semibold">
              {toastMessage.text}
            </div>
          </div>
        )}
        <div className="bg-white max-w-lg w-full rounded-3xl border border-neutral-200 p-8 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-neutral-900">بيانات السائق غير مكتملة</h2>
            <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
              أنت مسجل الدخول بالبريد الإلكتروني <span className="font-bold text-neutral-800 dir-ltr font-mono">{supabaseUser?.email}</span>، ولكن لم يتم العثور على سجل دليفري مرتبط بك في جدول <code>delivery_drivers</code>.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 text-right leading-relaxed">
            وفقاً لقواعد المنظومة، يجب تسجيل بيانات السائق كاملة أولاً حتى تتم مراجعتها واعتمادها من قِبل إدارة طلبات البيت.
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                setAuthMode('register');
                handleLogout();
              }}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-xs transition"
            >
              تسجيل بيانات سائق دليفري جديد
            </button>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold text-xs transition"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If Driver is PENDING APPROVAL -> STRICTLY BLOCK APP ENTRY!
  if (authStatus === 'pending_approval' || currentDriver.status === 'pending_approval') {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 font-['Cairo',sans-serif] text-neutral-900" dir="rtl">
        {toastMessage && (
          <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
            <div
              className={`p-4 rounded-2xl shadow-xl border flex items-start space-x-3 space-x-reverse ${
                toastMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border-rose-200'
                  : toastMessage.type === 'info'
                  ? 'bg-sky-50 text-sky-900 border-sky-200'
                  : 'bg-emerald-50 text-emerald-950 border-emerald-200'
              }`}
            >
              {toastMessage.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : toastMessage.type === 'info' ? (
                <AlertTriangle className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <p className="text-xs font-semibold leading-relaxed">{toastMessage.text}</p>
            </div>
          </div>
        )}
        <div className="bg-white max-w-xl w-full rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-xl space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <div className="inline-flex items-center space-x-1.5 space-x-reverse px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping mr-1" />
              <span>الحالة: قيد المراجعة والاعتماد (pending_approval)</span>
            </div>
            <h2 className="text-2xl font-extrabold text-neutral-900">
              تم إرسال طلب التسجيل بنجاح
            </h2>
            <div className="space-y-1.5 max-w-md mx-auto">
              <p className="text-sm font-bold text-neutral-800">
                بياناتك قيد المراجعة من إدارة طلبات البيت.
              </p>
              <p className="text-xs text-neutral-600 leading-relaxed">
                سيتم تفعيل حسابك بعد اعتماد بياناتك من الإدارة. لا يمكنك استلام أو معاينة الطلبات قبل صدور الموافقة الرسمية.
              </p>
            </div>
          </div>

          {/* Submitted Driver Details Card */}
          <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-5 space-y-3 text-xs">
            <h3 className="font-bold text-neutral-800 text-xs border-b border-neutral-200 pb-2 flex items-center space-x-2 space-x-reverse">
              <User className="w-4 h-4 text-emerald-700" />
              <span>بيانات حساب السائق المسجلة:</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-neutral-400 block text-[11px]">الاسم الكامل:</span>
                <span className="font-bold text-neutral-900">{currentDriver.full_name}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px]">رقم الهاتف:</span>
                <span className="font-mono font-bold text-neutral-900" dir="ltr">{currentDriver.phone}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px]">الرقم القومي:</span>
                <span className="font-mono font-bold text-neutral-900" dir="ltr">{currentDriver.national_id || 'غير مسجل'}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px]">المحافظة والمركز:</span>
                <span className="font-bold text-neutral-900">
                  {currentDriver.governorate_name || '-'} {currentDriver.markaz_name ? `(${currentDriver.markaz_name})` : ''}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px]">نوع وسيلة النقل:</span>
                <span className="font-bold text-neutral-900">{currentDriver.vehicle_type || 'دراجة نارية'}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[11px]">رقم لوحة المركبة:</span>
                <span className="font-bold text-neutral-900">{currentDriver.vehicle_plate || 'بدون لوحة'}</span>
              </div>
            </div>

            {/* Uploaded Documents Status Confirmation with Visual Previews */}
            <div className="border-t border-neutral-200/80 pt-3 space-y-2">
              <span className="font-extrabold text-neutral-800 text-[11px] block">الوثائق والمستندات المحفوظة في قاعدة البيانات:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {[
                  {
                    title: 'بطاقة الهوية (الوجه الأمامي)',
                    img: resolveDocImage(currentDriver.id_card_front_path, 'idCardFront', currentDriver.user_id),
                    label: 'بطاقة الرقم القومي (الوجه الأمامي)',
                  },
                  {
                    title: 'بطاقة الهوية (الظهر)',
                    img: resolveDocImage(currentDriver.id_card_back_path, 'idCardBack', currentDriver.user_id),
                    label: 'بطاقة الرقم القومي (ظهر البطاقة)',
                  },
                  {
                    title: 'رخصة القيادة الشخصية',
                    img: resolveDocImage(currentDriver.driver_license_path, 'driverLicense', currentDriver.user_id),
                    label: 'رخصة القيادة الشخصية',
                  },
                  {
                    title: 'رخصة تسيير المركبة',
                    img: resolveDocImage(currentDriver.vehicle_license_path, 'vehicleLicense', currentDriver.user_id),
                    label: 'رخصة تسيير المركبة',
                  },
                ].map((doc, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center space-x-2 space-x-reverse min-w-0">
                      {doc.img ? (
                        <img
                          src={doc.img}
                          alt={doc.title}
                          className="w-10 h-10 rounded-lg object-cover border border-neutral-200 shrink-0 shadow-2xs cursor-pointer hover:opacity-90 transition"
                          onClick={() => openDocumentViewer(doc.title, doc.img, doc.label)}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0 text-neutral-400">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-neutral-800 font-bold truncate block text-xs">{doc.title}</span>
                        {doc.img ? (
                          <span className="text-emerald-700 text-[10px] font-semibold flex items-center space-x-1 space-x-reverse">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                            <span>تم الحفظ بقاعدة البيانات</span>
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-[10px]">
                            {currentDriver.id_card_front_path ? 'مسار الوثيقة مسجل' : 'غير مرفوعة'}
                          </span>
                        )}
                      </div>
                    </div>
                    {doc.img && (
                      <button
                        type="button"
                        onClick={() => openDocumentViewer(doc.title, doc.img, doc.label)}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold border border-emerald-200 shrink-0 transition flex items-center space-x-1 space-x-reverse"
                      >
                        <Eye className="w-3 h-3" />
                        <span>معاينة</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={checkApprovalStatus}
              disabled={isSyncing}
              className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>إعادة التحقق من الحالة</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <LogOut className="w-4 h-4 text-neutral-500" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>

        {/* Document Viewer Modal inside Pending Screen */}
        <DocumentViewerModal
          isOpen={viewingDocModal.isOpen}
          onClose={() => setViewingDocModal((prev) => ({ ...prev, isOpen: false }))}
          title={viewingDocModal.title}
          imageUrl={viewingDocModal.imageUrl}
          documentTypeLabel={viewingDocModal.label}
        />
      </div>
    );
  }

  // If Driver is REJECTED -> STRICTLY BLOCK APP ENTRY!
  if (authStatus === 'rejected' || currentDriver.status === 'rejected') {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col justify-center items-center p-4 font-['Cairo',sans-serif] text-neutral-900" dir="rtl">
        {toastMessage && (
          <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
            <div className="p-4 rounded-2xl shadow-xl border bg-rose-50 text-rose-900 border-rose-200 text-xs font-semibold">
              {toastMessage.text}
            </div>
          </div>
        )}
        <div className="bg-white max-w-lg w-full rounded-3xl border border-neutral-200 p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <XCircle className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center space-x-1.5 space-x-reverse px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-900 border border-rose-200">
            <span>الحالة: تم الرفض من الإدارة (rejected)</span>
          </div>
          <h2 className="text-2xl font-extrabold text-neutral-900">
            تم رفض طلبك
          </h2>
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 text-right space-y-1">
            <span className="font-bold block">سبب الرفض:</span>
            <p className="leading-relaxed">{currentDriver.rejection_reason || 'بيانات غير مستوفاة أو غير متطابقة مع الشروط.'}</p>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            يمكنك التواصل مع إدارة طلبات البيت لمزيد من التفاصيل.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-neutral-900 hover:bg-black text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2 space-x-reverse"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    );
  }

  // If Driver is INACTIVE -> STRICTLY BLOCK APP ENTRY!
  if (authStatus === 'disabled' || !currentDriver.is_active) {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col justify-center items-center p-4 font-['Cairo',sans-serif] text-neutral-900" dir="rtl">
        {toastMessage && (
          <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
            <div className="p-4 rounded-2xl shadow-xl border bg-amber-50 text-amber-900 border-amber-200 text-xs font-semibold">
              {toastMessage.text}
            </div>
          </div>
        )}
        <div className="bg-white max-w-lg w-full rounded-3xl border border-neutral-200 p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <PowerOff className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center space-x-1.5 space-x-reverse px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
            <span>الحالة: معطل (is_active = false)</span>
          </div>
          <h2 className="text-2xl font-extrabold text-neutral-900">
            الحساب غير نشط أو موقوف بقرار إداري
          </h2>
          <p className="text-xs text-neutral-600 leading-relaxed">
            لا يمكنك استعراض أو استلام الطلبات حتى يتم تفعيل الحساب من إدارة طلبات البيت.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={checkApprovalStatus}
              disabled={isSyncing}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>إعادة التحقق من الحالة</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <LogOut className="w-4 h-4 text-neutral-500" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. MAIN APP VIEW (Accessible only when Approved & Active Driver OR Admin)
  const driverFirstName = currentDriver?.full_name?.trim().split(/\s+/)[0] || 'كابتن';
  const driverInitial = driverFirstName.charAt(0) || 'س';
  const isOrdersView = ['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Cairo',sans-serif] text-slate-900 selection:bg-blue-200" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
          <div
            className={`p-4 rounded-2xl shadow-xl border flex items-start space-x-3 space-x-reverse ${
              toastMessage.type === 'error'
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : toastMessage.type === 'info'
                ? 'bg-blue-50 text-blue-900 border-blue-200'
                : 'bg-emerald-50 text-emerald-950 border-emerald-200'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : toastMessage.type === 'info' ? (
              <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <p className="text-xs font-semibold leading-relaxed">{toastMessage.text}</p>
          </div>
        </div>
      )}

      {/* Compact Blue & White Sticky Top Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Brand + Greeting */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 p-0.5 flex items-center justify-center border border-blue-200/80 overflow-hidden shrink-0">
              <img
                src={headerImageSrc}
                alt="شعار طلباتي دليفري"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== window.location.origin + DEFAULT_FALLBACK_ASSET) {
                    target.src = DEFAULT_FALLBACK_ASSET;
                  }
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base text-blue-700 truncate">
                  طلباتي دليفري
                </span>
                <span
                  className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    settings?.delivery_enabled
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {settings?.delivery_enabled ? 'الخدمة فعالة' : 'الخدمة معطلة'}
                </span>
              </div>
              {currentDriver && (
                <p className="text-[11px] text-slate-500 font-semibold truncate">
                  أهلًا، {driverFirstName}
                </p>
              )}
            </div>
          </div>

          {/* Right Header Actions: Profile Avatar Chip, Notifications Bell, Sync & Quick Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {currentDriver && (
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`min-h-[40px] flex items-center gap-2 rounded-xl px-2 sm:px-2.5 py-1 text-xs border transition cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-blue-50 border-blue-300 text-blue-800'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                }`}
                title="عرض الملف الشخصي للسائق"
              >
                <div className="relative w-7 h-7 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  {driverInitial}
                  <span
                    className={`absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      currentDriver.status === 'approved' && currentDriver.is_active
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  />
                </div>
                <div className="hidden sm:flex flex-col items-start leading-tight max-w-[130px]">
                  <span className="font-bold truncate w-full text-right">
                    {currentDriver.full_name}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold">
                    {currentDriver.status === 'approved' ? 'حساب معتمد' : currentDriver.status}
                  </span>
                </div>
              </button>
            )}

            {/* Notifications Bell Button (Backed by real pending orders & Realtime events) */}
            <button
              type="button"
              onClick={() => setIsNotificationsModalOpen(true)}
              className="relative min-w-[40px] min-h-[40px] p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 bg-slate-50 border border-slate-200 rounded-xl transition flex items-center justify-center cursor-pointer"
              title="الإشعارات وتنبيهات الطلبات"
              aria-label="الإشعارات"
            >
              <Bell className="w-4 h-4" />
              {allCategoryCounts.pending > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums shadow-xs">
                  {allCategoryCounts.pending > 99 ? '99+' : allCategoryCounts.pending}
                </span>
              )}
            </button>

            {/* Compact Online / Sync Button */}
            <button
              type="button"
              onClick={() => {
                void triggerOfflineQueueSync();
                void syncWithSupabase();
              }}
              disabled={isSyncing || isSyncingOfflineQueue}
              title={
                isOnline
                  ? pendingOfflineCount > 0
                    ? `مزامنة (${pendingOfflineCount} معلق)`
                    : 'تحديث ومزامنة الطلبات'
                  : 'غير متصل بالإنترنت'
              }
              className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border transition flex items-center justify-center gap-1 cursor-pointer ${
                isOnline
                  ? 'bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border-slate-200'
                  : 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
              }`}
            >
              {isOnline ? (
                <RefreshCw
                  className={`w-4 h-4 ${
                    isSyncing || isSyncingOfflineQueue ? 'animate-spin text-blue-600' : ''
                  }`}
                />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-700" />
              )}
            </button>

            {/* Quick Logout Button (Desktop) */}
            <button
              type="button"
              onClick={handleLogout}
              title="تسجيل الخروج"
              className="hidden sm:flex min-h-[40px] p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 bg-slate-50 border border-slate-200 rounded-xl transition items-center justify-center cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Offline Status Warning Banner */}
        {!isOnline && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between font-bold animate-in fade-in">
            <div className="flex items-center space-x-2 space-x-reverse max-w-6xl mx-auto w-full">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="flex-1">
                وضع عدم الاتصال: طلباتك المسندة متاحة للمتابعة والتوصيل، وقبول طلبات جديدة متوقف مؤقتًا حتى عودة الاتصال.
              </span>
              {pendingOfflineCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] shrink-0">
                  {pendingOfflineCount} معلق
                </span>
              )}
            </div>
          </div>
        )}

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:flex max-w-6xl mx-auto px-4 sm:px-6 border-t border-slate-100 space-x-4 space-x-reverse text-xs font-bold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
              activeTab === 'pending'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>الطلبات الجديدة</span>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] tabular-nums">
              {displayCounts.pending}
            </span>
            {(isRealtimeConnected || isPharmacyRealtimeActive) && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                title="البث اللحظي متصل"
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accepted')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
              activeTab === 'accepted'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>قيد التوصيل</span>
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] tabular-nums">
              {displayCounts.accepted}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
              activeTab === 'completed'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>مكتملة</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] tabular-nums">
              {displayCounts.completed}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cancelled')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
              activeTab === 'cancelled'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>ملغاة</span>
            <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] tabular-nums">
              {displayCounts.cancelled}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4 text-blue-600" />
            <span>الملف الشخصي</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
              activeTab === 'settings'
                ? 'border-blue-600 text-blue-700 font-extrabold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4 text-blue-600" />
            <span>الإعدادات</span>
          </button>
        </div>
      </header>

      {/* Main App Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8 space-y-4 sm:space-y-5">
        {/* Warning Banner: Global Delivery Service Disabled */}
        {!settings?.delivery_enabled && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-950 flex items-start space-x-3 space-x-reverse shadow-2xs">
            <PowerOff className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h3 className="text-xs sm:text-sm font-bold">خدمة الدليفري متوقفة حاليًا بقرار الإدارة</h3>
              <p className="text-[11px] sm:text-xs text-rose-800">
                لا يمكن قبول طلبات جديدة حتى تتم إعادة تفعيل الخدمة في النظام.
              </p>
            </div>
          </div>
        )}

        {/* Driver Approval & Active Status Alert */}
        {currentDriver && currentDriver.status !== 'approved' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-950 flex items-start space-x-3 space-x-reverse shadow-2xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold">
                حالة حساب السائق: {currentDriver.status === 'pending_approval' ? 'قيد المراجعة' : 'مرفوض'}
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                {currentDriver.status === 'pending_approval'
                  ? 'حسابك بانتظار موافقة الإدارة العامة قبل قبول الطلبات.'
                  : `تم رفض الحساب من قبل الإدارة: ${currentDriver.rejection_reason || 'بيانات غير مستوفاة'}`}
              </p>
            </div>
          </div>
        )}

        {/* 1. Prominent Driver Work Status Card (Home / Orders Views) */}
        {isOrdersView && currentDriver && currentDriver.status === 'approved' && currentDriver.is_active && (
          isWorking ? (
            <section
              aria-label="حالة العمل"
              className="bg-white border border-blue-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-600"></span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
                      متاح للعمل الآن
                    </h2>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      يستقبل الطلبات
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>النظام يتابع اتصالك المباشر بالطلبات</span>
                    {lastHeartbeatTime && (
                      <span className="text-slate-600 font-mono">
                        • آخر تأكيد:{' '}
                        {new Date(lastHeartbeatTime).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                    {heartbeatConsecutiveFailures > 0 && (
                      <span className="text-rose-600 font-bold">
                        (إعادة اتصال #{heartbeatConsecutiveFailures})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStopWork}
                disabled={isUpdatingAvailability}
                className="min-h-[44px] px-5 py-2.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <Power className="w-4 h-4" />
                <span>إيقاف العمل</span>
              </button>
            </section>
          ) : (
            <section
              aria-label="حالة العمل"
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-500">
                  <PowerOff className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
                      متوقف عن العمل
                    </h2>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      غير متاح لطلبات جديدة
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    اضغط على «بدء العمل» لتفعيل التوافر واستقبال الطلبات في نطاقك الجغرافي.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartWork}
                disabled={isUpdatingAvailability}
                className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-slate-300 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-xs transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>بدء العمل</span>
              </button>
            </section>
          )
        )}

        {/* 2. Four Operational & Financial Summary Cards */}
        {isOrdersView && (
          <section
            aria-label="ملخص العمليات والمستحقات"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            {/* Card 1: New Pending Orders */}
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`text-right bg-white rounded-2xl p-3.5 sm:p-4 border shadow-2xs transition cursor-pointer flex flex-col justify-between gap-2 ${
                activeTab === 'pending'
                  ? 'border-blue-400 ring-2 ring-blue-100'
                  : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-slate-600">
                  الطلبات الجديدة
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums">
                  {allCategoryCounts.pending}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                  متاحة للقبول الآن
                </div>
              </div>
            </button>

            {/* Card 2: In-Delivery Active Orders */}
            <button
              type="button"
              onClick={() => setActiveTab('accepted')}
              className={`text-right bg-white rounded-2xl p-3.5 sm:p-4 border shadow-2xs transition cursor-pointer flex flex-col justify-between gap-2 ${
                activeTab === 'accepted'
                  ? 'border-blue-400 ring-2 ring-blue-100'
                  : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-slate-600">
                  قيد التوصيل
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums">
                  {allCategoryCounts.accepted}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                  طلبات جارية معك
                </div>
              </div>
            </button>

            {/* Card 3: Driver Net Earnings (Authoritative Stored Fields Only) */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-2xs flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-slate-600">
                  صافي ربح السائق
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div
                  className={`text-lg sm:text-xl font-extrabold tabular-nums ${
                    driverAccountingSummary.driverNetAmount !== null
                      ? 'text-emerald-700'
                      : 'text-slate-500'
                  }`}
                >
                  {driverAccountingSummary.driverNetAmount !== null
                    ? `${driverAccountingSummary.driverNetAmount.toFixed(2)} ج.م`
                    : 'غير متاح'}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                  {driverAccountingSummary.driverNetAmount !== null
                    ? `من ${driverAccountingSummary.driverNetPopulatedCount} طلب مكتمل`
                    : `${driverAccountingSummary.completedOrdersCount} طلب مكتمل • بيانات الحسابات`}
                </div>
              </div>
            </div>

            {/* Card 4: Admin Commission / Due (Authoritative Stored Fields Only) */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-2xs flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-slate-600">
                  صافي مستحق الإدارة
                </span>
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div
                  className={`text-lg sm:text-xl font-extrabold tabular-nums ${
                    driverAccountingSummary.adminCommissionAmount !== null
                      ? 'text-slate-900'
                      : 'text-slate-500'
                  }`}
                >
                  {driverAccountingSummary.adminCommissionAmount !== null
                    ? `${driverAccountingSummary.adminCommissionAmount.toFixed(2)} ج.م`
                    : 'غير متاح'}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                  {driverAccountingSummary.adminCommissionAmount !== null
                    ? `من ${driverAccountingSummary.adminCommissionPopulatedCount} طلب مكتمل`
                    : `${driverAccountingSummary.completedOrdersCount} طلب مكتمل • بيانات الحسابات`}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. Orders Filter Bar & Search (Directly Above Orders List) */}
        {isOrdersView && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center text-xs font-bold flex-wrap gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setOrderCategoryView('all')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                    orderCategoryView === 'all'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>جميع الطلبات</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                      orderCategoryView === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {activeTab === 'pending'
                      ? allCategoryCounts.pending
                      : activeTab === 'accepted'
                      ? allCategoryCounts.accepted
                      : activeTab === 'completed'
                      ? allCategoryCounts.completed
                      : allCategoryCounts.cancelled}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderCategoryView('regular')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border ${
                    orderCategoryView === 'regular'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-blue-50/70 text-blue-800 border-blue-200 hover:bg-blue-100/70'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>نواقص المنزل</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
                      orderCategoryView === 'regular'
                        ? 'bg-white text-blue-800'
                        : 'bg-blue-100 text-blue-900'
                    }`}
                  >
                    {activeTab === 'pending'
                      ? homeCounts.pending
                      : activeTab === 'accepted'
                      ? homeCounts.accepted
                      : activeTab === 'completed'
                      ? homeCounts.completed
                      : homeCounts.cancelled}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderCategoryView('pharmacy')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border ${
                    orderCategoryView === 'pharmacy'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-emerald-50/70 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70'
                  }`}
                >
                  <Pill className="w-3.5 h-3.5" />
                  <span>الصيدلية</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
                      orderCategoryView === 'pharmacy'
                        ? 'bg-white text-emerald-800'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {activeTab === 'pending'
                      ? pharmacyCounts.pending
                      : activeTab === 'accepted'
                      ? pharmacyCounts.accepted
                      : activeTab === 'completed'
                      ? pharmacyCounts.completed
                      : pharmacyCounts.cancelled}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderCategoryView('restaurant')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer border ${
                    orderCategoryView === 'restaurant'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-2xs'
                      : 'bg-orange-50/70 text-orange-800 border-orange-200 hover:bg-orange-100/70'
                  }`}
                >
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                  <span>المطاعم</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
                      orderCategoryView === 'restaurant'
                        ? 'bg-white text-orange-800'
                        : 'bg-orange-100 text-orange-900'
                    }`}
                  >
                    {activeTab === 'pending'
                      ? restaurantCounts.pending
                      : activeTab === 'accepted'
                      ? restaurantCounts.accepted
                      : activeTab === 'completed'
                      ? restaurantCounts.completed
                      : restaurantCounts.cancelled}
                  </span>
                </button>
              </div>

              <span className="text-[11px] font-semibold text-slate-500 px-2 hidden lg:inline">
                الترتيب: الأقدم أولًا
              </span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="البحث برقم الطلب، اسم العميل، المطعم، الصيدلية، أو العنوان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[42px] bg-white border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* ORDERS LIST VIEW: Unified Chronological (Oldest First -> Newest Last) */}
        {/* ------------------------------------------------------------- */}
        {isOrdersView && orderCategoryView === 'all' && (
          <div className="space-y-4">
            {/* Stopped section operational notices when viewing Pending */}
            {activeTab === 'pending' &&
              (!householdSectionEval.canShowNewOrders ||
                !pharmacySectionEval.canShowNewOrders ||
                !restaurantSectionEval.canShowNewOrders) && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 space-y-1">
                  <strong className="font-extrabold block">
                    تنبيه تشغيل الأقسام:
                  </strong>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {!householdSectionEval.canShowNewOrders && (
                      <span className="bg-white border border-amber-200 px-2.5 py-1 rounded-lg">
                        نواقص المنزل: {householdSectionEval.reason}
                      </span>
                    )}
                    {!pharmacySectionEval.canShowNewOrders && (
                      <span className="bg-white border border-amber-200 px-2.5 py-1 rounded-lg">
                        الصيدلية: {pharmacySectionEval.reason}
                      </span>
                    )}
                    {!restaurantSectionEval.canShowNewOrders && (
                      <span className="bg-white border border-amber-200 px-2.5 py-1 rounded-lg">
                        المطاعم: {restaurantSectionEval.reason}
                      </span>
                    )}
                  </div>
                </div>
              )}

            {unifiedChronologicalOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 sm:p-12 text-center border border-slate-200 shadow-2xs">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3 text-blue-600">
                  <Package className="w-7 h-7" />
                </div>
                <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
                  {activeTab === 'pending' && !isWorking
                    ? 'أنت متوقف عن العمل حاليًا'
                    : 'لا توجد طلبات في هذا التبويب حاليًا'}
                </h4>
                <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                  {activeTab === 'pending'
                    ? !isWorking
                      ? 'اضغط على «بدء العمل» في البطاقة العلوية لتفعيل استقبال وقبول الطلبات المتاحة في نطاقك الجغرافي.'
                      : centralGeoContext.coverageLoadState === 'empty'
                      ? 'لا توجد مناطق تغطية مركزية نشطة مسجلة لحسابك حاليًا، لذا لن تظهر طلبات جديدة حتى يتم تفعيل نطاق تغطية لك.'
                      : centralGeoContext.coverageLoadState === 'permission_denied' ||
                        centralGeoContext.coverageLoadState === 'error' ||
                        centralGeoContext.coverageLoadState === 'table_missing'
                      ? centralGeoContext.coverageError ||
                        'تعذر تحميل بيانات التغطية الجغرافية المركزية حاليًا.'
                      : 'أنت متاح الآن وفي انتظار الطلبات الجديدة. بمجرد وصول طلب في نطاقك سيظهر هنا مرتبًا من الأقدم للأحدث.'
                    : 'لا توجد طلبات مطابقة في هذا القسم حاليًا.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unifiedChronologicalOrders.map((item, idx) => {
                  if (item.kind === 'pharmacy') {
                    const pOrder = item.order as any;
                    const canAcceptPharmacy =
                      Boolean(isWorking) &&
                      Boolean(settings?.delivery_enabled) &&
                      pharmacySectionEval.canAcceptNewOrders &&
                      currentDriver?.status === 'approved' &&
                      Boolean(currentDriver?.is_active) &&
                      pOrder.status === 'pending_review';
                    return (
                      <PharmacyOrderCard
                        key={item.id}
                        order={pOrder}
                        currentDriverId={currentDriver?.id}
                        driverLocation={driverLocation}
                        routeDistance={routeDistances[getOrderRouteKey('pharmacy', pOrder.id)]}
                        sequenceNumber={idx + 1}
                        navigationEnabled={systemSettings.navigation_enabled === true}
                        canAccept={canAcceptPharmacy}
                        isWorking={isWorking}
                        isActionLoading={isPharmacyActionLoading}
                        onOpenDetails={(ord) => setSelectedPharmacyOrder(ord)}
                        onAcceptOrder={acceptPharmacyOrder}
                        onStartShopping={startPharmacyShopping}
                        onCompleteDelivery={completePharmacyDelivery}
                        onRequestCancellation={(ord) =>
                          setPharmacyCancelTarget(ord)
                        }
                        onCallCustomer={callCustomer}
                        onOpenMap={(ord) =>
                          setMapModalTarget({ order: ord, orderType: 'pharmacy' })
                        }
                      />
                    );
                  }

                  if (item.kind === 'restaurant') {
                    const rOrder = item.order as DeliveryOrder;
                    const canAcceptRest =
                      Boolean(isWorking) &&
                      Boolean(settings?.delivery_enabled) &&
                      restaurantSectionEval.canAcceptNewOrders &&
                      currentDriver?.status === 'approved' &&
                      Boolean(currentDriver?.is_active) &&
                      rOrder.status === 'pending_review';
                    return (
                      <RestaurantOrderCard
                        key={item.id}
                        order={rOrder}
                        currentDriverId={currentDriver?.id}
                        driverLocation={driverLocation}
                        routeDistance={routeDistances[getOrderRouteKey('restaurant', rOrder.id)]}
                        sequenceNumber={idx + 1}
                        navigationEnabled={systemSettings.navigation_enabled === true}
                        canAccept={canAcceptRest}
                        isWorking={isWorking}
                        isActionLoading={isActionLoading}
                        onOpenDetails={setSelectedRestaurantOrder}
                        onAcceptOrder={handleAcceptOrder}
                        onStartShopping={handleStartShopping}
                        onCompleteOrder={handleCompleteOrder}
                        onRequestCancellation={(ord) => setCancelModalOrder(ord)}
                        onCallPhone={callCustomer}
                        onOpenMap={(ord) =>
                          setMapModalTarget({ order: ord, orderType: 'restaurant' })
                        }
                      />
                    );
                  }

                  const hOrder = item.order as DeliveryOrder;
                  const canAcceptHome =
                    hOrder.status === 'pending_review' &&
                    Boolean(settings?.delivery_enabled) &&
                    householdSectionEval.canAcceptNewOrders &&
                    currentDriver?.status === 'approved' &&
                    Boolean(currentDriver?.is_active) &&
                    isWorking;
                  return (
                    <HouseholdOrderCard
                      key={item.id}
                      order={hOrder}
                      currentDriver={currentDriver}
                      driverLocation={driverLocation}
                      routeDistance={routeDistances[getOrderRouteKey('regular', hOrder.id)]}
                      sequenceNumber={idx + 1}
                      navigationEnabled={systemSettings.navigation_enabled === true}
                      canAccept={canAcceptHome}
                      isWorking={isWorking}
                      isActionLoading={isActionLoading}
                      onOpenDetails={setSelectedOrder}
                      onAcceptOrder={handleAcceptOrder}
                      onStartShopping={handleStartShopping}
                      onCompleteOrder={handleCompleteOrder}
                      onRequestCancellation={(ord) => {
                        setCancelModalOrder(ord);
                        setCancelReasonText('');
                      }}
                      onCallCustomer={callCustomer}
                      onOpenMap={(ord) =>
                        setMapModalTarget({ order: ord, orderType: 'regular' })
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* PHARMACY ORDERS SECTION (Modals mounted always; cards rendered when category === 'pharmacy') */}
        {/* ------------------------------------------------------------- */}
        {isOrdersView &&
          (orderCategoryView === 'all' || orderCategoryView === 'pharmacy') && (
            <PharmacyOrdersSection
              activeTab={activeTab}
              searchQuery={searchQuery}
              currentDriver={currentDriver}
              driverLocation={driverLocation}
              routeDistances={routeDistances}
              navigationEnabled={systemSettings.navigation_enabled === true}
              hideCardsList={orderCategoryView === 'all'}
              isWorking={isWorking}
              deliveryEnabled={Boolean(settings?.delivery_enabled)}
              geoContext={centralGeoContext}
              sectionSettings={sectionSettings}
              pharmacyOrders={pharmacyOrders}
              selectedPharmacyOrder={selectedPharmacyOrder}
              cancellationTargetOrderOverride={pharmacyCancelTarget}
              onChangeCancellationTargetOrder={setPharmacyCancelTarget}
              isPharmacyLoading={isPharmacyLoading}
              isPharmacyActionLoading={isPharmacyActionLoading}
              isPharmacyRealtimeActive={isPharmacyRealtimeActive}
              realtimeStatus={pharmacyRealtimeStatus}
              onOpenDiagnostics={() => setIsDiagnosticModalOpen(true)}
              onSelectPharmacyOrder={setSelectedPharmacyOrder}
              onRefreshPharmacyOrders={() => loadPharmacyOrders('تحديث يدوي')}
              onAcceptOrder={acceptPharmacyOrder}
              onStartShopping={startPharmacyShopping}
              onUpdateMedicineItem={updateMedicineItem}
              onSavePrescriptionImageNote={saveImageDriverNote}
              onAddVisitedPharmacy={addVisitedPharmacy}
              onRemoveVisitedPharmacy={removeVisitedPharmacy}
              onSuggestPharmacyChange={suggestPharmacyChange}
              onSaveReceiptImage={saveReceiptCameraImage}
              onSaveOrderTotals={saveOrderTotals}
              onCompletePreparation={completePreparation}
              onMarkUnableToFulfill={markUnableToFulfill}
              onCompleteDelivery={completePharmacyDelivery}
              onRequestCancellation={requestPharmacyCancellation}
              onCallCustomer={callCustomer}
              onOpenMap={(ord) => setMapModalTarget({ order: ord, orderType: 'pharmacy' })}
            />
          )}

        {/* ------------------------------------------------------------- */}
        {/* RESTAURANT ORDERS SECTION (Modals mounted always; cards rendered when category === 'restaurant') */}
        {/* ------------------------------------------------------------- */}
        {isOrdersView &&
          (orderCategoryView === 'all' || orderCategoryView === 'restaurant') && (
            <RestaurantOrdersSection
              activeTab={activeTab}
              searchQuery={searchQuery}
              currentDriver={currentDriver}
              driverLocation={driverLocation}
              routeDistances={routeDistances}
              navigationEnabled={systemSettings.navigation_enabled === true}
              hideCardsList={orderCategoryView === 'all'}
              isWorking={isWorking}
              deliveryEnabled={Boolean(settings?.delivery_enabled)}
              sectionSettings={sectionSettings}
              restaurantOrders={filteredRestaurantOrders}
              selectedRestaurantOrder={selectedRestaurantOrder}
              isActionLoading={isActionLoading}
              isSyncing={isSyncing}
              onRefreshOrders={() => void syncWithSupabase()}
              onSelectOrder={setSelectedRestaurantOrder}
              onAcceptOrder={handleAcceptOrder}
              onStartShopping={handleStartShopping}
              onUpdateDeliveryItem={handleUpdateDeliveryItem}
              onCompleteShopping={handleCompleteShopping}
              onCompleteOrder={handleCompleteOrder}
              onOpenCancellationModal={(order) => setCancelModalOrder(order)}
              onCallPhone={callCustomer}
              onOpenMap={(ord) => setMapModalTarget({ order: ord, orderType: 'restaurant' })}
            />
          )}

        {/* ------------------------------------------------------------- */}
        {/* HOUSEHOLD ORDERS SECTION (Only when category === 'regular')    */}
        {/* ------------------------------------------------------------- */}
        {isOrdersView && orderCategoryView === 'regular' && (
          <div className="space-y-4">
            {activeTab === 'pending' && !householdSectionEval.canShowNewOrders && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center space-x-3 space-x-reverse text-rose-950 shadow-2xs">
                <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0 text-rose-700">
                  <Package className="w-5 h-5" />
                </div>
                <div className="text-xs leading-relaxed">
                  <strong className="block text-rose-950 font-extrabold text-sm mb-0.5">
                    استقبال طلبات نواقص المنزل الجديدة متوقف حاليًا
                  </strong>
                  <span>
                    {householdSectionEval.reason} (الطلبات المقبولة والمسندة إليك مسبقًا تبقى متاحة للاستكمال في تبويب «قيد التوصيل»).
                  </span>
                </div>
              </div>
            )}

            <div className="bg-white border border-blue-200/80 text-slate-900 rounded-2xl p-3.5 px-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 text-blue-600">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-slate-900">طلبات نواقص المنزل</h3>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold tabular-nums">
                      {filteredHomeOrders.length} طلب
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">مرتبة من الأقدم إلى الأحدث</p>
                </div>
              </div>
            </div>

            {filteredHomeOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3 text-blue-500">
                  <Package className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-800">
                  {activeTab === 'pending' && !isWorking
                    ? 'أنت متوقف عن العمل حاليًا'
                    : activeTab === 'pending' && !householdSectionEval.canShowNewOrders
                    ? 'استقبال الطلبات الجديدة لقسم نواقص المنزل متوقف حاليًا'
                    : 'لا توجد طلبات في هذا القسم'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  {activeTab === 'pending'
                    ? !isWorking
                      ? 'اضغط على «بدء العمل» لتفعيل حالتك واستقبال الطلبات.'
                      : !householdSectionEval.canShowNewOrders
                      ? householdSectionEval.reason
                      : 'بمجرد وصول طلب جديد في نطاقك سيظهر هنا فورًا.'
                    : 'لا توجد طلبات مسجلة في هذا القسم.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredHomeOrders.map((order, idx) => {
                  const canAccept =
                    order.status === 'pending_review' &&
                    Boolean(settings?.delivery_enabled) &&
                    householdSectionEval.canAcceptNewOrders &&
                    currentDriver?.status === 'approved' &&
                    Boolean(currentDriver?.is_active) &&
                    isWorking;
                  return (
                    <HouseholdOrderCard
                      key={order.id}
                      order={order}
                      currentDriver={currentDriver}
                      driverLocation={driverLocation}
                      routeDistance={routeDistances[getOrderRouteKey('regular', order.id)]}
                      sequenceNumber={idx + 1}
                      navigationEnabled={systemSettings.navigation_enabled === true}
                      canAccept={canAccept}
                      isWorking={isWorking}
                      isActionLoading={isActionLoading}
                      onOpenDetails={setSelectedOrder}
                      onAcceptOrder={handleAcceptOrder}
                      onStartShopping={handleStartShopping}
                      onCompleteOrder={handleCompleteOrder}
                      onRequestCancellation={(ord) => {
                        setCancelModalOrder(ord);
                        setCancelReasonText('');
                      }}
                      onCallCustomer={callCustomer}
                      onOpenMap={(ord) => setMapModalTarget({ order: ord, orderType: 'regular' })}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: DRIVER PROFILE (Strict read-only for immutable fields) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'profile' && currentDriver && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-6">
                <div className="flex items-center space-x-4 space-x-reverse">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-2xl border border-emerald-200">
                    {currentDriver.full_name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <h2 className="text-xl font-extrabold text-neutral-900">{currentDriver.full_name}</h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          currentDriver.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : currentDriver.status === 'pending_approval'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {currentDriver.status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 font-mono mt-1" dir="ltr">
                      {currentDriver.phone}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <button
                    onClick={openEditProfile}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1.5 space-x-reverse"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>تعديل البيانات المسموحة</span>
                  </button>
                </div>
              </div>

              {/* Driver Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {/* Full Name (Non-editable) */}
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-1">
                  <span className="text-neutral-500 font-semibold flex items-center space-x-1.5 space-x-reverse">
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                    <span>اسم السائق (غير قابل للتعديل)</span>
                  </span>
                  <div className="font-bold text-neutral-900 text-sm">{currentDriver.full_name}</div>
                </div>

                {/* National ID (Non-editable) */}
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-1">
                  <span className="text-neutral-500 font-semibold flex items-center space-x-1.5 space-x-reverse">
                    <CreditCard className="w-3.5 h-3.5 text-neutral-400" />
                    <span>الرقم القومي (غير قابل للتعديل)</span>
                  </span>
                  <div className="font-bold font-mono text-neutral-900 text-sm" dir="ltr">
                    {currentDriver.national_id || 'غير مسجل'}
                  </div>
                </div>

                {/* Phone (Editable) */}
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-1">
                  <span className="text-neutral-500 font-semibold flex items-center space-x-1.5 space-x-reverse">
                    <Phone className="w-3.5 h-3.5 text-neutral-400" />
                    <span>رقم الهاتف (قابل للتعديل)</span>
                  </span>
                  <div className="font-bold font-mono text-neutral-900 text-sm" dir="ltr">
                    {currentDriver.phone}
                  </div>
                </div>

                {/* Governorate (Editable) */}
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-1">
                  <span className="text-neutral-500 font-semibold flex items-center space-x-1.5 space-x-reverse">
                    <Building className="w-3.5 h-3.5 text-neutral-400" />
                    <span>المحافظة وكودها</span>
                  </span>
                  <div className="font-bold text-neutral-900 text-sm">
                    {currentDriver.governorate_name || 'غير محدد'} ({currentDriver.governorate_code || '---'})
                  </div>
                </div>

                {/* Markaz (Editable) */}
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-1">
                  <span className="text-neutral-500 font-semibold flex items-center space-x-1.5 space-x-reverse">
                    <Navigation className="w-3.5 h-3.5 text-neutral-400" />
                    <span>المركز / المدينة</span>
                  </span>
                  <div className="font-bold text-neutral-900 text-sm">{currentDriver.markaz_name || 'غير محدد'}</div>
                </div>

                {/* Vehicle Type & Plate (Editable) */}
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-1">
                  <span className="text-neutral-500 font-semibold flex items-center space-x-1.5 space-x-reverse">
                    <Truck className="w-3.5 h-3.5 text-neutral-400" />
                    <span>المركبة ولوحة الأرقام</span>
                  </span>
                  <div className="font-bold text-neutral-900 text-sm">
                    {currentDriver.vehicle_type || 'غير محدد'} - {currentDriver.vehicle_plate || 'بدون لوحة'}
                  </div>
                </div>
              </div>

              {/* Central Coverage Zones & Driver Affiliation */}
              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-emerald-950 flex items-center space-x-1.5 space-x-reverse">
                    <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                    <span>نطاق التغطية الجغرافية المركزي المعتمد:</span>
                  </strong>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white border border-emerald-200 text-emerald-900">
                    {centralGeoContext.driverAffiliation === 'restaurant_staff'
                      ? 'سائق مطعم (restaurant_driver_area_coverage)'
                      : 'سائق منصة (delivery_driver_area_coverage)'}
                  </span>
                </div>
                {centralGeoContext.coverageRows.filter((c) => c.is_active !== false).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {centralGeoContext.coverageRows
                      .filter((c) => c.is_active !== false)
                      .map((cov) => {
                        const area = centralGeoContext.areas.find((a) => a.id === cov.area_id);
                        const center = centralGeoContext.centers.find(
                          (c) => c.id === (cov.center_id || area?.center_id)
                        );
                        const gov = centralGeoContext.governorates.find(
                          (g) => g.id === (cov.governorate_id || center?.governorate_id)
                        );
                        const label = [
                          gov?.name_ar || gov?.name,
                          center?.name_ar || center?.name,
                          area?.name_ar || area?.name,
                        ]
                          .filter(Boolean)
                          .join(' - ');
                        return (
                          <span
                            key={cov.id}
                            className="px-2.5 py-1 bg-white border border-emerald-200 rounded-lg text-[11px] font-semibold text-neutral-800"
                          >
                            {label || cov.area_id || cov.center_id || cov.governorate_id}
                          </span>
                        );
                      })}
                  </div>
                ) : (
                  <p className="text-amber-800 text-[11px] font-semibold">
                    {centralGeoContext.coverageFailedOperation
                      ? `تعذر قراءة جدول ${centralGeoContext.coverageFailedOperation.table} (${centralGeoContext.coverageFailedOperation.operation}${
                          centralGeoContext.coverageFailedOperation.isRls ? ' - RLS' : ''
                        }): ${centralGeoContext.coverageFailedOperation.message}`
                      : centralGeoContext.coverageError ||
                        'لا توجد مناطق تغطية مركزية نشطة مسجلة لهذا السائق حاليًا (لن تظهر طلبات جديدة حتى تُسجل التغطية في النظام).'}
                  </p>
                )}
              </div>

              {/* Uploaded Documents Status Confirmation in Profile */}
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-2 text-xs">
                <strong className="text-neutral-800 block text-xs">الوثائق الرسمية المحفوظة في قاعدة البيانات:</strong>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {[
                    {
                      title: 'بطاقة الهوية (الوجه الأمامي)',
                      img: resolveDocImage(currentDriver.id_card_front_path, 'idCardFront', currentDriver.user_id),
                      label: 'بطاقة الرقم القومي (الوجه الأمامي)',
                    },
                    {
                      title: 'بطاقة الهوية (الظهر)',
                      img: resolveDocImage(currentDriver.id_card_back_path, 'idCardBack', currentDriver.user_id),
                      label: 'بطاقة الرقم القومي (ظهر البطاقة)',
                    },
                    {
                      title: 'رخصة القيادة الشخصية',
                      img: resolveDocImage(currentDriver.driver_license_path, 'driverLicense', currentDriver.user_id),
                      label: 'رخصة القيادة الشخصية',
                    },
                    {
                      title: 'رخصة تسيير المركبة',
                      img: resolveDocImage(currentDriver.vehicle_license_path, 'vehicleLicense', currentDriver.user_id),
                      label: 'رخصة تسيير المركبة',
                    },
                  ].map((doc, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center space-x-2 space-x-reverse min-w-0">
                        {doc.img ? (
                          <img
                            src={doc.img}
                            alt={doc.title}
                            className="w-10 h-10 rounded-lg object-cover border border-neutral-200 shrink-0 shadow-2xs cursor-pointer hover:opacity-90 transition"
                            onClick={() => openDocumentViewer(doc.title, doc.img, doc.label)}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0 text-neutral-400">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-neutral-800 font-bold truncate block text-xs">{doc.title}</span>
                          {doc.img ? (
                            <span className="text-emerald-700 text-[10px] font-semibold flex items-center space-x-1 space-x-reverse">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 inline shrink-0" />
                              <span>محفوظة في قاعدة البيانات</span>
                            </span>
                          ) : (
                            <span className="text-neutral-500 text-[10px]">
                              {currentDriver.id_card_front_path ? 'مسار الوثيقة مسجل' : 'غير مرفوعة'}
                            </span>
                          )}
                        </div>
                      </div>
                      {doc.img && (
                        <button
                          type="button"
                          onClick={() => openDocumentViewer(doc.title, doc.img, doc.label)}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold border border-emerald-200 shrink-0 transition flex items-center space-x-1 space-x-reverse"
                        >
                          <Eye className="w-3 h-3" />
                          <span>معاينة</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Driver Notes */}
              {currentDriver.notes && (
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-1 text-xs">
                  <strong className="text-neutral-700 block">ملاحظات السائق (notes):</strong>
                  <p className="text-neutral-600">{currentDriver.notes}</p>
                </div>
              )}

              {/* Status Notice */}
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl text-xs text-sky-950 space-y-1">
                <strong>قاعدة الأمان المعتمدة في النظام:</strong>
                <p>
                  البيانات الثابتة كـ "الاسم الكامل full_name" و "الرقم القومي national_id" محظور تعديلها لحماية الهوية.
                  عند تعديل أيٍّ من البيانات المسموح بها (المحافظة، المركز، نوع المركبة، اللوحة، الهاتف، الملاحظات)، سيتم
                  تحديث حالة السائق تلقائيًا إلى <code>pending_approval</code> وتعطيله <code>is_active = false</code> حتى
                  موافقة الإدارة مجددًا.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 4: SETTINGS (GPS, Sections Operational Status, Sync & Supabase) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'settings' && (
          <div className="space-y-5">
            {/* 1. Location & GPS Settings Card (Moved out of Home screen) */}
            {currentDriver && currentDriver.status === 'approved' && currentDriver.is_active && (
              <DriverLocationSettingsCard
                driverLocation={driverLocation}
                gpsStatus={gpsStatus}
                gpsErrorMessage={gpsErrorMessage}
                isLoadingGPS={isLoadingGPS}
                isTrackingActive={isTrackingActive}
                trackingAccuracyWarning={trackingAccuracyWarning}
                lastTrackingResult={lastTrackingResult}
                systemSettings={systemSettings}
                centralGeoContext={centralGeoContext}
                onRefreshGPS={() => void requestGPSLocation(false)}
              />
            )}

            {/* 2. Central Sections & Delivery Operational Status Panel (Moved out of Home screen) */}
            {currentDriver && currentDriver.status === 'approved' && currentDriver.is_active && (
              <SectionStatusPanel
                sectionSettings={sectionSettings}
                isRefreshing={isSyncing || isRefreshingSections}
                onRefresh={() => {
                  void refreshSectionSettings();
                  if (authStatus === 'approved_active') {
                    void syncWithSupabase();
                  }
                }}
                globalDeliveryEnabled={settings?.delivery_enabled}
              />
            )}

            {/* 3. System Status & Sync Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex items-center space-x-3 space-x-reverse">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-neutral-900">حالة الاتصال والمزامنة</h2>
                  <p className="text-xs text-neutral-500">
                    مؤشرات حالة الشبكة، والبث اللحظي، وطابور العمليات غير المتصلة (Offline First)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {/* Internet Connection */}
                <div className={`p-4 rounded-2xl border flex items-center space-x-3 space-x-reverse ${
                  isOnline ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isOnline ? 'bg-emerald-200/80 text-emerald-800' : 'bg-rose-200 text-rose-800'
                  }`}>
                    {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-neutral-500">اتصال الإنترنت</div>
                    <div className="text-xs font-extrabold">{isOnline ? 'متصل بالشبكة' : 'غير متصل (أوفلاين)'}</div>
                  </div>
                </div>

                {/* Delivery Orders Stream (delivery_orders) */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-2 ${
                  deliveryRealtimeStatus === 'SUBSCRIBED'
                    ? 'bg-sky-50/70 border-sky-200 text-sky-950'
                    : deliveryRealtimeStatus === 'CHANNEL_ERROR'
                    ? 'bg-rose-50 border-rose-200 text-rose-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}>
                  <div className="flex items-center space-x-2.5 space-x-reverse">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      deliveryRealtimeStatus === 'SUBSCRIBED'
                        ? 'bg-sky-200/80 text-sky-800'
                        : deliveryRealtimeStatus === 'CHANNEL_ERROR'
                        ? 'bg-rose-200 text-rose-800'
                        : 'bg-amber-200 text-amber-800'
                    }`}>
                      <Radio className={`w-4 h-4 ${deliveryRealtimeStatus === 'SUBSCRIBED' ? 'animate-pulse' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-neutral-500 truncate">بث طلبات التوصيل</div>
                      <div className="text-xs font-extrabold truncate">
                        {deliveryRealtimeStatus === 'SUBSCRIBED'
                          ? 'SUBSCRIBED (متصل)'
                          : deliveryRealtimeStatus === 'CHANNEL_ERROR'
                          ? 'CHANNEL_ERROR (خطأ)'
                          : deliveryRealtimeStatus === 'TIMED_OUT'
                          ? 'TIMED_OUT (مهلة)'
                          : deliveryRealtimeStatus === 'CLOSED'
                          ? 'CLOSED (مغلق)'
                          : 'جاري الاتصال...'}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-500 pt-1 border-t border-neutral-200/60 flex items-center justify-between">
                    <span>آخر حدث:</span>
                    <span className="font-bold text-neutral-700">{deliveryLastEventTime || 'لا يوجد'}</span>
                  </div>
                  {deliveryRealtimeError && (
                    <div className="text-[10px] text-rose-600 truncate">{deliveryRealtimeError}</div>
                  )}
                </div>

                {/* Pharmacy Orders Stream (pharmacy_orders) */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-2 ${
                  pharmacyRealtimeStatus === 'SUBSCRIBED'
                    ? 'bg-teal-50/70 border-teal-200 text-teal-950'
                    : pharmacyRealtimeStatus === 'CHANNEL_ERROR'
                    ? 'bg-rose-50 border-rose-200 text-rose-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}>
                  <div className="flex items-center space-x-2.5 space-x-reverse">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      pharmacyRealtimeStatus === 'SUBSCRIBED'
                        ? 'bg-teal-200/80 text-teal-800'
                        : pharmacyRealtimeStatus === 'CHANNEL_ERROR'
                        ? 'bg-rose-200 text-rose-800'
                        : 'bg-amber-200 text-amber-800'
                    }`}>
                      <Pill className={`w-4 h-4 ${pharmacyRealtimeStatus === 'SUBSCRIBED' ? 'animate-pulse' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-neutral-500 truncate">بث فواتير الصيدلية</div>
                      <div className="text-xs font-extrabold truncate">
                        {pharmacyRealtimeStatus === 'SUBSCRIBED'
                          ? 'SUBSCRIBED (متصل)'
                          : pharmacyRealtimeStatus === 'CHANNEL_ERROR'
                          ? 'CHANNEL_ERROR (خطأ)'
                          : pharmacyRealtimeStatus === 'TIMED_OUT'
                          ? 'TIMED_OUT (مهلة)'
                          : pharmacyRealtimeStatus === 'CLOSED'
                          ? 'CLOSED (مغلق)'
                          : 'جاري الاتصال...'}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-500 pt-1 border-t border-neutral-200/60 flex items-center justify-between">
                    <span>آخر حدث:</span>
                    <span className="font-bold text-neutral-700">{pharmacyLastEventTime || 'لا يوجد'}</span>
                  </div>
                  {pharmacyRealtimeError && (
                    <div className="text-[10px] text-rose-600 truncate">
                      {typeof pharmacyRealtimeError === 'string' ? pharmacyRealtimeError : String(pharmacyRealtimeError)}
                    </div>
                  )}
                </div>

                {/* Offline Queue */}
                <div className={`p-4 rounded-2xl border flex items-center space-x-3 space-x-reverse ${
                  pendingOfflineCount === 0 ? 'bg-neutral-50 border-neutral-200 text-neutral-800' : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    pendingOfflineCount === 0 ? 'bg-neutral-200 text-neutral-700' : 'bg-amber-200 text-amber-800'
                  }`}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-neutral-500">العمليات المعلقة للمزامنة</div>
                    <div className="text-xs font-extrabold">
                      {pendingOfflineCount === 0 ? 'لا توجد عمليات معلقة' : `${pendingOfflineCount} عملية بانتظار الخادم`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action row for sync and live diagnostics */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsDiagnosticModalOpen(true)}
                  className="px-4 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 space-x-reverse shadow-xs cursor-pointer"
                >
                  <Activity className="w-4 h-4" />
                  <span>فتح سجلات وتشخيص البث اللحظي (Realtime)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    reconnectPharmacyRealtime();
                    showToast('تم إرسال أمر إعادة الاتصال بقنوات البث اللحظي.', 'info');
                  }}
                  className="px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 space-x-reverse shadow-xs cursor-pointer"
                >
                  <Radio className="w-4 h-4" />
                  <span>إعادة الاتصال الفوري (Reconnect)</span>
                </button>

                <button
                  type="button"
                  disabled={isSyncing || isSyncingOfflineQueue || !isOnline}
                  onClick={async () => {
                    await triggerOfflineQueueSync();
                    await syncWithSupabase();
                    await loadPharmacyOrders();
                    showToast('تمت المزامنة التعويضية بنجاح.', 'success');
                  }}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 space-x-reverse shadow-xs cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing || isSyncingOfflineQueue ? 'animate-spin' : ''}`} />
                  <span>مزامنة فورية تعويضية للبيانات</span>
                </button>

                <span className="text-[11px] text-neutral-500">
                  تتم المزامنة التعويضية تلقائيًا عند عودة الاتصال لضمان ظهور الفواتير المستجدة دون فقدان.
                </span>
              </div>
            </div>

            {/* Active Driver Profile & Logout Card */}
            {currentDriver && (
              <div className="bg-white rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <div className="w-10 h-10 rounded-2xl bg-neutral-100 text-neutral-800 flex items-center justify-center">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-neutral-900">{currentDriver.full_name}</h2>
                      <p className="text-xs text-neutral-500">
                        {currentDriver.governorate_name || 'بدون محافظة'} • {currentDriver.markaz_name || 'بدون مركز'} • {currentDriver.phone || ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-2xs"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج ومسح التخزين المؤقت</span>
                  </button>
                </div>
              </div>
            )}

            {/* Supabase Connection Configuration */}
            <div className="bg-white rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center space-x-3 space-x-reverse">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-neutral-900">إعدادات الاتصال بـ Supabase</h2>
                  <p className="text-xs text-neutral-500">
                    ربط التطبيق المباشر بمشروع Supabase وقراءة الجداول والـ RPCs الحالية
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Project URL</label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="https://your-project.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Anon Public Key</label>
                  <input
                    type="password"
                    dir="ltr"
                    placeholder="eyJhbGciOi..."
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-sky-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    حفظ والاتصال الآن
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation (One-handed ergonomic thumb zone) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`relative min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold active:scale-95 transition cursor-pointer ${
              activeTab === 'pending'
                ? 'text-blue-700 bg-blue-50/90 font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <Clock className="w-5 h-5 mb-0.5" />
              {allCategoryCounts.pending > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[9px] font-extrabold flex items-center justify-center tabular-nums">
                  {allCategoryCounts.pending > 99 ? '99+' : allCategoryCounts.pending}
                </span>
              )}
            </div>
            <span>جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accepted')}
            className={`relative min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold active:scale-95 transition cursor-pointer ${
              activeTab === 'accepted'
                ? 'text-blue-700 bg-blue-50/90 font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <Truck className="w-5 h-5 mb-0.5" />
              {allCategoryCounts.accepted > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-extrabold flex items-center justify-center tabular-nums">
                  {allCategoryCounts.accepted > 99 ? '99+' : allCategoryCounts.accepted}
                </span>
              )}
            </div>
            <span>قيد التوصيل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold active:scale-95 transition cursor-pointer ${
              activeTab === 'completed'
                ? 'text-blue-700 bg-blue-50/90 font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 mb-0.5" />
            <span>مكتملة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cancelled')}
            className={`min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold active:scale-95 transition cursor-pointer ${
              activeTab === 'cancelled'
                ? 'text-blue-700 bg-blue-50/90 font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <XCircle className="w-5 h-5 mb-0.5" />
            <span>ملغاة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold active:scale-95 transition cursor-pointer ${
              activeTab === 'settings'
                ? 'text-blue-700 bg-blue-50/90 font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span>الإعدادات</span>
          </button>
        </div>
      </nav>

      {/* Driver Notifications & Realtime Alerts Modal */}
      <DriverNotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        pendingTotalCount={allCategoryCounts.pending}
        acceptedTotalCount={allCategoryCounts.accepted}
        isWorking={isWorking}
        deliveryRealtimeStatus={deliveryRealtimeStatus}
        pharmacyRealtimeStatus={pharmacyRealtimeStatus}
        deliveryLastEventTime={deliveryLastEventTime}
        pharmacyLastEventTime={pharmacyLastEventTime}
        recentLogs={pharmacyDiagnosticLogs}
        isSyncing={isSyncing}
        onGoToPendingOrders={() => setActiveTab('pending')}
        onOpenDiagnostics={() => setIsDiagnosticModalOpen(true)}
        onRefreshAll={() => {
          void triggerOfflineQueueSync();
          void syncWithSupabase();
          void loadPharmacyOrders('تحديث يدوي');
        }}
      />

      {/* Modal: Order Details, Shopping Flow & Status History */}
      {selectedOrder && (() => {
        const isSelectedOrderAssigned = selectedOrder.assigned_driver_id === currentDriver?.id;
        const items = selectedOrder.items || [];
        const totalItemsCount = items.length;
        const purchasedCount = items.filter((it) => it.item_status === 'purchased').length;
        const missingCount = items.filter((it) => it.item_status === 'missing').length;
        const pendingItemsCount = items.filter((it) => !it.item_status || it.item_status === 'pending').length;
        const isShoppingReadyToComplete = totalItemsCount > 0 && pendingItemsCount === 0;

        // Group items strictly by category_name from delivery_order_items
        const groupedItems: { [cat: string]: DeliveryOrderItem[] } = {};
        items.forEach((it) => {
          const cat = it.category_name?.trim() || 'فئة عامة / غير مصنف';
          if (!groupedItems[cat]) groupedItems[cat] = [];
          groupedItems[cat].push(it);
        });

        return (
          <div 
            onClick={() => setSelectedOrder(null)}
            className="fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-right"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <span className="font-mono text-xs font-bold bg-neutral-100 text-neutral-800 px-2.5 py-1 rounded-lg border border-neutral-200">
                    {selectedOrder.order_number || selectedOrder.id.slice(0, 8)}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      selectedOrder.status === 'pending_review'
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : selectedOrder.status === 'accepted'
                        ? 'bg-blue-50 text-blue-900 border-blue-200'
                        : selectedOrder.status === 'shopping'
                        ? 'bg-purple-50 text-purple-900 border-purple-200'
                        : selectedOrder.status === 'shopping_completed'
                        ? 'bg-teal-50 text-teal-900 border-teal-200'
                        : selectedOrder.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                        : selectedOrder.status === 'cancellation_pending'
                        ? 'bg-orange-50 text-orange-950 border-orange-200'
                        : 'bg-rose-50 text-rose-900 border-rose-200'
                    }`}
                  >
                    {selectedOrder.status === 'pending_review' && 'قيد المراجعة'}
                    {selectedOrder.status === 'accepted' && 'مقبول / جاهز لبدء التسوق'}
                    {selectedOrder.status === 'shopping' && 'مرحلة التسوق الميداني'}
                    {selectedOrder.status === 'shopping_completed' && 'اكتمل التسوق / جاهز للتسليم'}
                    {selectedOrder.status === 'completed' && 'مكتمل ومسلّم للعميل'}
                    {selectedOrder.status === 'cancellation_pending' && 'بانتظار موافقة الإلغاء'}
                    {selectedOrder.status === 'cancelled' && 'ملغي'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="p-1 rounded-xl hover:bg-neutral-100 text-neutral-500 active:scale-90 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs">
                {/* Status Guidance Alert */}
                {selectedOrder.status === 'accepted' && isSelectedOrderAssigned && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-purple-950">
                    <div className="space-y-0.5">
                      <div className="font-bold text-sm flex items-center space-x-1.5 space-x-reverse text-purple-900">
                        <ShoppingCart className="w-4 h-4 text-purple-700" />
                        <span>الطلب جاهز لبدء التسوق</span>
                      </div>
                      <p className="text-purple-800 text-[11px] leading-relaxed">
                        اضغط على «بدء التسوق» لتفعيل قائمة المنتجات وتسجيل الأسعار الفعلية وحالات الأصناف.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleStartShopping(selectedOrder)}
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer shadow-xs flex items-center justify-center space-x-1 space-x-reverse"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>بدء التسوق الآن</span>
                    </button>
                  </div>
                )}

                {selectedOrder.status === 'shopping' && (
                  <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-4 space-y-2 text-purple-950">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm flex items-center space-x-1.5 space-x-reverse text-purple-900">
                        <Store className="w-4 h-4 text-purple-700" />
                        <span>مرحلة التسوق الميداني جارية</span>
                      </div>
                      <div className="flex items-center space-x-1.5 space-x-reverse text-[11px] font-bold">
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          تم الشراء: {purchasedCount}
                        </span>
                        <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                          ناقص: {missingCount}
                        </span>
                        <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                          متبقي: {pendingItemsCount}
                        </span>
                      </div>
                    </div>
                    <p className="text-purple-800 text-[11px] leading-relaxed">
                      قم بفحص كل منتج في المتجر: إذا كان متوفرًا اضغط «تم الشراء» وسجل سعره الفعلي، وإذا لم تجده اضغط «ناقص» مع ذكر السبب. لا يمكن إنهاء التسوق قبل تحديد حالة جميع المنتجات.
                    </p>
                  </div>
                )}

                {selectedOrder.status === 'shopping_completed' && (
                  <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-teal-950">
                    <div className="space-y-0.5">
                      <div className="font-bold text-sm flex items-center space-x-1.5 space-x-reverse text-teal-900">
                        <CheckSquare className="w-4 h-4 text-teal-700" />
                        <span>اكتملت مرحلة التسوق بنجاح</span>
                      </div>
                      <p className="text-teal-800 text-[11px] leading-relaxed">
                        تم احتساب الفاتورة الفعلية ({Number(selectedOrder.actual_total_amount ?? selectedOrder.total_amount).toFixed(2)} ج.م). الطلب جاهز الآن للتسليم للعميل.
                      </p>
                    </div>
                    {isSelectedOrderAssigned && (
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => handleCompleteOrder(selectedOrder)}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer shadow-xs flex items-center justify-center space-x-1 space-x-reverse"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>إتمام التوصيل</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Customer & Address Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-semibold block">بيانات العميل:</span>
                      {Boolean(selectedOrder.customer_phone || selectedOrder.phone_number) && (
                        <button
                          type="button"
                          onClick={() => callCustomer(selectedOrder.customer_phone || selectedOrder.phone_number)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1 space-x-reverse cursor-pointer shadow-xs"
                        >
                          <Phone className="w-3 h-3" />
                          <span>اتصال بالعميل</span>
                        </button>
                      )}
                    </div>
                    <div className="font-bold text-neutral-900 text-sm">{selectedOrder.customer_name}</div>
                    <div className="text-neutral-600 font-mono" dir="ltr">
                      {selectedOrder.customer_phone || selectedOrder.phone_number}
                    </div>
                    {selectedOrder.household_name && (
                      <div className="text-neutral-500 mt-1">المنزل: {selectedOrder.household_name}</div>
                    )}
                  </div>

                  <div className="bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200/80 space-y-1">
                    <span className="text-neutral-500 font-semibold block">عنوان التسليم:</span>
                    <div className="font-bold text-neutral-900">
                      {selectedOrder.governorate_name || selectedOrder.governorate} - {selectedOrder.markaz_name || selectedOrder.center}
                      {selectedOrder.delivery_area_name ? ` - ${selectedOrder.delivery_area_name}` : ''}
                    </div>
                    <div className="text-neutral-700 leading-relaxed">{selectedOrder.detailed_address}</div>
                    {selectedOrder.delivery_notes && (
                      <div className="text-amber-800 bg-amber-50 p-2 rounded-lg mt-2 border border-amber-200 text-[11px]">
                        <strong>ملاحظات التسليم:</strong> {selectedOrder.delivery_notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* SHOPPING SECTION (قسم التسوق والمنتجات مقسمة حسب الفئات) */}
                {/* ------------------------------------------------------------- */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <ShoppingCart className="w-4 h-4 text-purple-700" />
                      <h4 className="font-bold text-sm text-neutral-900">
                        منتجات الطلب وقائمة التسوق ({totalItemsCount})
                      </h4>
                    </div>
                    {totalItemsCount > 0 && (
                      <span className="text-[11px] text-neutral-500">
                        {purchasedCount + missingCount} من {totalItemsCount} مكتمل
                      </span>
                    )}
                  </div>

                  {totalItemsCount === 0 ? (
                    <div className="p-4 bg-neutral-50 rounded-2xl text-center text-neutral-500 border border-neutral-200">
                      لا توجد عناصر مسجلة في هذا الطلب.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {Object.entries(groupedItems).map(([categoryName, catItems]) => (
                        <div
                          key={categoryName}
                          className="bg-neutral-50/80 rounded-2xl border border-neutral-200 overflow-hidden"
                        >
                          {/* Category Header */}
                          <div className="bg-neutral-100/90 px-4 py-2.5 border-b border-neutral-200 flex items-center justify-between">
                            <span className="font-bold text-neutral-900 flex items-center space-x-1.5 space-x-reverse">
                              <Store className="w-3.5 h-3.5 text-neutral-600" />
                              <span>{categoryName}</span>
                            </span>
                            <span className="text-[10px] font-bold text-neutral-500 bg-white px-2 py-0.5 rounded-full border border-neutral-200">
                              {catItems.length} {catItems.length === 1 ? 'صنف' : 'أصناف'}
                            </span>
                          </div>

                          {/* Items in Category */}
                          <div className="divide-y divide-neutral-200/70 p-2 sm:p-3 space-y-2">
                            {catItems.map((item) => {
                              const isPurchased = item.item_status === 'purchased';
                              const isMissing = item.item_status === 'missing';
                              const isPending = !item.item_status || item.item_status === 'pending';
                              const isEditingThis = editingItemId === item.id;
                              const isMissingThis = missingItemId === item.id;
                              const numericQty = getSafeNumericQty(item.quantity);

                              return (
                                <div
                                  key={item.id}
                                  className={`p-3 rounded-xl transition ${
                                    isPurchased
                                      ? 'bg-emerald-50/50 border border-emerald-200/60'
                                      : isMissing
                                      ? 'bg-rose-50/50 border border-rose-200/60'
                                      : 'bg-white border border-neutral-200/70 shadow-2xs'
                                  }`}
                                >
                                  {/* Item Details Row */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="space-y-1">
                                      <div className="flex items-center space-x-2 space-x-reverse">
                                        <span className="font-bold text-neutral-900 text-sm">
                                          {item.product_name}
                                        </span>
                                        {/* Status Badge */}
                                        {isPurchased && (
                                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            تم الشراء
                                          </span>
                                        )}
                                        {isMissing && (
                                          <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            ناقص / غير متوفر
                                          </span>
                                        )}
                                        {isPending && (
                                          <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            بانتظار الفحص
                                          </span>
                                        )}
                                      </div>

                                      <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-3">
                                        <span>
                                          الكمية المطلوبة: <strong className="text-neutral-800">{item.quantity}</strong>
                                        </span>
                                        <span>
                                          السعر التقديري للقطعة: <strong className="text-neutral-700">{Number(item.unit_price).toFixed(2)} ج.م</strong>
                                        </span>
                                        <span>
                                          الإجمالي التقديري: <strong className="text-neutral-700">{Number(item.total_price).toFixed(2)} ج.م</strong>
                                        </span>
                                      </div>

                                      {/* Saved Actual Price or Missing Reason */}
                                      {isPurchased && item.actual_unit_price != null && (
                                        <div className="text-[11px] text-emerald-900 bg-emerald-100/70 px-2.5 py-1 rounded-lg inline-flex items-center space-x-2 space-x-reverse font-medium mt-1">
                                          <span>سعر الشراء الفعلي للقطعة: <strong>{Number(item.actual_unit_price).toFixed(2)} ج.م</strong></span>
                                          <span>•</span>
                                          <span>الإجمالي الفعلي: <strong>{Number(item.actual_total_price ?? (numericQty * item.actual_unit_price)).toFixed(2)} ج.م</strong></span>
                                        </div>
                                      )}

                                      {isMissing && item.missing_reason && (
                                        <div className="text-[11px] text-rose-900 bg-rose-100/70 px-2.5 py-1 rounded-lg font-medium mt-1">
                                          <strong>سبب النقص:</strong> {item.missing_reason}
                                        </div>
                                      )}
                                    </div>

                                    {/* Action Buttons (Only active during shopping status & assigned to current driver) */}
                                    {selectedOrder.status === 'shopping' && isSelectedOrderAssigned && !isEditingThis && !isMissingThis && (
                                      <div className="flex items-center space-x-2 space-x-reverse pt-2 sm:pt-0 shrink-0">
                                        <button
                                          type="button"
                                          disabled={isActionLoading}
                                          onClick={() => {
                                            setEditingItemId(item.id);
                                            setItemPriceInput(
                                              item.actual_unit_price != null
                                                ? String(item.actual_unit_price)
                                                : String(item.unit_price || '')
                                            );
                                            setMissingItemId(null);
                                          }}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1 space-x-reverse ${
                                            isPurchased
                                              ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                                              : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs'
                                          }`}
                                        >
                                          <CheckSquare className="w-3.5 h-3.5" />
                                          <span>{isPurchased ? 'تعديل السعر' : 'تم الشراء'}</span>
                                        </button>

                                        <button
                                          type="button"
                                          disabled={isActionLoading}
                                          onClick={() => {
                                            setMissingItemId(item.id);
                                            setMissingReasonInput(item.missing_reason || 'غير متوفر بالمتجر');
                                            setEditingItemId(null);
                                          }}
                                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                            isMissing
                                              ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                                              : 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                                          }`}
                                        >
                                          <span>{isMissing ? 'تعديل النقص' : 'ناقص'}</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Inline Form: Actual Unit Price (Purchased) */}
                                  {isEditingThis && (
                                    <div className="mt-3 p-3 bg-emerald-50/80 rounded-xl border border-emerald-300 space-y-2 animate-in fade-in duration-100">
                                      <div className="font-bold text-emerald-950 text-xs flex items-center space-x-1 space-x-reverse">
                                        <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                                        <span>تسجيل سعر الشراء الفعلي لمنتج «{item.product_name}»</span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[11px] font-semibold text-emerald-900 mb-1">
                                            سعر الوحدة الفعلي (ج.م) *
                                          </label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            autoFocus
                                            value={itemPriceInput}
                                            onChange={(e) => setItemPriceInput(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-emerald-600"
                                          />
                                        </div>
                                        <div className="bg-white/80 p-2 rounded-lg border border-emerald-200 flex flex-col justify-center text-[11px]">
                                          <span className="text-neutral-500">حساب إجمالي الصنف:</span>
                                          <span className="font-bold text-neutral-900">
                                            {numericQty} × {Number(parseFloat(itemPriceInput) || 0).toFixed(2)} ={' '}
                                            <span className="text-emerald-700">
                                              {(numericQty * (parseFloat(itemPriceInput) || 0)).toFixed(2)} ج.م
                                            </span>
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex items-center space-x-2 space-x-reverse justify-end pt-1">
                                        <button
                                          type="button"
                                          onClick={() => setEditingItemId(null)}
                                          className="px-3 py-1.5 text-neutral-600 hover:bg-neutral-200/60 rounded-lg text-xs font-semibold cursor-pointer"
                                        >
                                          إلغاء
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isActionLoading || !itemPriceInput}
                                          onClick={() => {
                                            const p = parseFloat(itemPriceInput);
                                            handleUpdateDeliveryItem(item, 'purchased', p, undefined);
                                          }}
                                          className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-neutral-300 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
                                        >
                                          حفظ وتأكيد الشراء
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Inline Form: Missing Reason */}
                                  {isMissingThis && (
                                    <div className="mt-3 p-3 bg-rose-50/80 rounded-xl border border-rose-300 space-y-2 animate-in fade-in duration-100">
                                      <div className="font-bold text-rose-950 text-xs">
                                        تأكيد نقص منتج «{item.product_name}» وتسجيل السبب
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-semibold text-rose-900 mb-1">
                                          سبب عدم التوفر (إلزامي) *
                                        </label>
                                        <input
                                          type="text"
                                          autoFocus
                                          value={missingReasonInput}
                                          onChange={(e) => setMissingReasonInput(e.target.value)}
                                          placeholder="اكتب سبب النقص..."
                                          className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs text-neutral-900 focus:outline-rose-600"
                                        />
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                          {['غير متوفر بالمتجر', 'انتهت الكمية بالمحل', 'المتجر مغلق', 'صنف تالف / منتهي الصلاحية'].map((reason) => (
                                            <button
                                              key={reason}
                                              type="button"
                                              onClick={() => setMissingReasonInput(reason)}
                                              className="px-2 py-0.5 bg-white hover:bg-rose-100 border border-rose-200 rounded-md text-[10px] text-rose-800 transition cursor-pointer"
                                            >
                                              {reason}
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="flex items-center space-x-2 space-x-reverse justify-end pt-1">
                                        <button
                                          type="button"
                                          onClick={() => setMissingItemId(null)}
                                          className="px-3 py-1.5 text-neutral-600 hover:bg-neutral-200/60 rounded-lg text-xs font-semibold cursor-pointer"
                                        >
                                          إلغاء
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isActionLoading || !missingReasonInput.trim()}
                                          onClick={() => {
                                            handleUpdateDeliveryItem(item, 'missing', undefined, missingReasonInput);
                                          }}
                                          className="px-4 py-1.5 bg-rose-700 hover:bg-rose-800 disabled:bg-neutral-300 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
                                        >
                                          تأكيد النقص
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Shopping Completion Control within Shopping Section */}
                  {selectedOrder.status === 'shopping' && isSelectedOrderAssigned && (
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="space-y-0.5 text-right w-full sm:w-auto">
                        <div className="font-bold text-sm text-purple-950 flex items-center space-x-1.5 space-x-reverse">
                          <CheckSquare className="w-4 h-4 text-purple-700" />
                          <span>إنهاء مرحلة التسوق واحتساب الفاتورة</span>
                        </div>
                        <p className="text-purple-800 text-[11px]">
                          {isShoppingReadyToComplete
                            ? 'تمت مراجعة جميع المنتجات! اضغط لاعتماد الفاتورة الفعلية وتحويل الطلب لمرحلة التوصيل.'
                            : `يتبقى (${pendingItemsCount}) منتج معلق. يرجى تحديد حالتها كـ (تم الشراء) أو (ناقص) لتتمكن من الإنهاء.`}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={!isShoppingReadyToComplete || isActionLoading}
                        onClick={() => handleCompleteShopping(selectedOrder)}
                        className="w-full sm:w-auto px-5 py-2.5 bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center justify-center space-x-1.5 space-x-reverse shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>إكمال التسوق وتأكيد الفاتورة</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Financial Summary (Stored DB fields only - zero computed fallback) */}
                {(() => {
                  const fin = extractOrderFinancialBreakdown(selectedOrder);
                  return (
                    <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-2">
                      <h4 className="font-bold text-sm text-neutral-900 border-b border-neutral-200 pb-1.5">
                        الملخص المالي للفاتورة:
                      </h4>
                      {fin.hasIncompleteFinancials && (
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900">
                          البيانات المالية غير مكتملة
                        </div>
                      )}
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-neutral-600">
                          <span>إجمالي المنتجات الأصلي (التقديري):</span>
                          <span className="font-mono">
                            {fin.subtotal != null ? `${fin.subtotal.toFixed(2)} ج.م` : 'غير متوفر'}
                          </span>
                        </div>

                        {(selectedOrder.status === 'shopping_completed' || selectedOrder.status === 'completed') && (
                          <div className="flex justify-between text-purple-900 font-bold bg-purple-50/70 p-1.5 rounded-lg border border-purple-200">
                            <span>إجمالي المنتجات الفعلي بعد التسوق:</span>
                            <span className="font-mono">
                              {fin.actualItemsTotal != null
                                ? `${fin.actualItemsTotal.toFixed(2)} ج.م`
                                : fin.subtotal != null
                                ? `${fin.subtotal.toFixed(2)} ج.م`
                                : 'غير متوفر'}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between text-neutral-600">
                          <span>رسوم التوصيل (delivery_fee):</span>
                          <span className="font-mono">
                            {fin.deliveryFee != null ? `${fin.deliveryFee.toFixed(2)} ج.م` : 'غير متوفر'}
                          </span>
                        </div>

                        {fin.deliveryBaseFee != null && (
                          <div className="flex justify-between text-neutral-600">
                            <span>الرسوم الأساسية للتوصيل (delivery_base_fee):</span>
                            <span className="font-mono">{fin.deliveryBaseFee.toFixed(2)} ج.م</span>
                          </div>
                        )}

                        {fin.customerDeliveryFee != null && (
                          <div className="flex justify-between text-neutral-600">
                            <span>رسوم التوصيل على العميل (customer_delivery_fee):</span>
                            <span className="font-mono">{fin.customerDeliveryFee.toFixed(2)} ج.م</span>
                          </div>
                        )}

                        {fin.deliveryAdminCommission != null && (
                          <div className="flex justify-between text-neutral-600">
                            <span>عمولة الإدارة (delivery_admin_commission):</span>
                            <span className="font-mono">{fin.deliveryAdminCommission.toFixed(2)} ج.م</span>
                          </div>
                        )}

                        {fin.deliveryDriverNet != null && (
                          <div className="flex justify-between text-emerald-700 font-bold">
                            <span>صافي ربح السائق (delivery_driver_net):</span>
                            <span className="font-mono">{fin.deliveryDriverNet.toFixed(2)} ج.م</span>
                          </div>
                        )}

                        <div className="flex justify-between text-neutral-900 pt-2 border-t border-neutral-200 text-sm font-bold">
                          {selectedOrder.status === 'shopping_completed' || selectedOrder.status === 'completed' ? (
                            <>
                              <span>المبلغ الفعلي المطلوب تحصيله:</span>
                              <span className="text-emerald-700 font-extrabold font-mono text-base">
                                {fin.actualTotalAmount != null || fin.totalAmount != null
                                  ? `${Number(fin.actualTotalAmount ?? fin.totalAmount).toFixed(2)} ج.م`
                                  : 'غير متوفر'}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>الإجمالي المطلوب تقديريًا:</span>
                              <span className="text-neutral-800 font-mono">
                                {fin.totalAmount != null ? `${fin.totalAmount.toFixed(2)} ج.م` : 'غير متوفر'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Status History */}
                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-neutral-900">
                    سجل تغييرات حالة الطلب (delivery_order_status_history):
                  </h4>
                  <div className="border-r-2 border-emerald-400 mr-2 pr-4 space-y-3">
                    {orderHistory
                      .filter((h) => h.order_id === selectedOrder.id)
                      .map((h) => (
                        <div key={h.id} className="relative">
                          <div className="absolute -right-5 top-1 w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-white" />
                          <div className="flex items-center space-x-2 space-x-reverse">
                            <span className="font-bold text-neutral-900">{h.new_status}</span>
                            <span className="text-neutral-400 text-[10px]">
                              {formatSafeDateTime(h.created_at)}
                            </span>
                          </div>
                          <p className="text-neutral-600 mt-0.5">{h.note || h.notes}</p>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2 space-x-reverse">
                  {Boolean(selectedOrder.customer_phone || selectedOrder.phone_number) && (
                    <button
                      type="button"
                      onClick={() => callCustomer(selectedOrder.customer_phone || selectedOrder.phone_number)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-xs"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>اتصال بالعميل</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setMapModalTarget({ order: selectedOrder, orderType: 'regular' })}
                    className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 space-x-reverse cursor-pointer shadow-2xs"
                  >
                    <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                    <span>الخريطة والملاحة</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  {/* Context Action Button in Modal Footer */}
                  {selectedOrder.status === 'accepted' && isSelectedOrderAssigned && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleStartShopping(selectedOrder)}
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>بدء التسوق</span>
                    </button>
                  )}

                  {selectedOrder.status === 'shopping' && isSelectedOrderAssigned && (
                    <button
                      type="button"
                      disabled={!isShoppingReadyToComplete || isActionLoading}
                      onClick={() => handleCompleteShopping(selectedOrder)}
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>إكمال التسوق</span>
                    </button>
                  )}

                  {selectedOrder.status === 'shopping_completed' && isSelectedOrderAssigned && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleCompleteOrder(selectedOrder)}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>إتمام التوصيل</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="px-5 py-2 bg-neutral-200 hover:bg-neutral-300 active:scale-95 text-neutral-800 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Request Order Cancellation */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden text-right p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-bold text-base text-neutral-900">طلب إلغاء الطلب من السائق</h3>
              <button onClick={() => setCancelModalOrder(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestCancellationSubmit} className="space-y-4 text-xs">
              <p className="text-neutral-600 leading-relaxed">
                يرجى تدوين سبب واضح لطلب الإلغاء. سيتحول الطلب لحالة <code>cancellation_pending</code> حتى تبت الإدارة في
                القرار.
              </p>

              <div>
                <label className="block font-bold text-neutral-800 mb-1">
                  سبب الإلغاء (إلزامي) <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={cancelReasonText}
                  onChange={(e) => setCancelReasonText(e.target.value)}
                  placeholder="مثال: عطل في المركبة، تعذر التواصل مع العميل..."
                  className="w-full border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 space-x-reverse pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold transition"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition"
                >
                  إرسال طلب الإلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Driver Profile */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden text-right p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-bold text-base text-neutral-900">تعديل بيانات السائق المسموحة</h3>
              <button onClick={() => setEditProfileOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDriverProfile} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
                <strong>تنبيه إداري:</strong> البيانات الثابتة (الاسم الكامل والرقم القومي) لا يمكن تعديلها. عند حفظ
                التعديلات، ستتحول حالتك تلقائيًا إلى <code>pending_approval</code> ويتعطل حسابك حتى مراجعة الإدارة.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 mb-1">رقم الهاتف (phone)</label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl p-2.5 focus:outline-hidden focus:border-emerald-600 font-mono"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 mb-1">اسم المحافظة (governorate_name)</label>
                  <input
                    type="text"
                    value={editGovernorateName}
                    onChange={(e) => setEditGovernorateName(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl p-2.5 focus:outline-hidden focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 mb-1">كود المحافظة (governorate_code)</label>
                  <input
                    type="text"
                    placeholder="مثال: DKH"
                    value={editGovernorateCode}
                    onChange={(e) => setEditGovernorateCode(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl p-2.5 focus:outline-hidden focus:border-emerald-600 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 mb-1">المركز / المدينة (markaz_name)</label>
                  <input
                    type="text"
                    value={editMarkazName}
                    onChange={(e) => setEditMarkazName(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl p-2.5 focus:outline-hidden focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 mb-1">نوع المركبة (vehicle_type)</label>
                  <input
                    type="text"
                    value={editVehicleType}
                    onChange={(e) => setEditVehicleType(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl p-2.5 focus:outline-hidden focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 mb-1">لوحة أرقام المركبة (vehicle_plate)</label>
                  <input
                    type="text"
                    placeholder="مثال: ط ج د ٥١٢"
                    value={editVehiclePlate}
                    onChange={(e) => setEditVehiclePlate(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl p-2.5 focus:outline-hidden focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 mb-1">ملاحظات السائق (notes)</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border border-neutral-300 rounded-xl p-2.5 focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 space-x-reverse pt-2">
                <button
                  type="button"
                  onClick={() => setEditProfileOpen(false)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-xs transition"
                >
                  حفظ وتحديث الحالة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={viewingDocModal.isOpen}
        onClose={() => setViewingDocModal((prev) => ({ ...prev, isOpen: false }))}
        title={viewingDocModal.title}
        imageUrl={viewingDocModal.imageUrl}
        documentTypeLabel={viewingDocModal.label}
      />

      {/* Realtime Diagnostics & Monitoring Modal */}
      <PharmacyRealtimeDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        pharmacyStatus={pharmacyRealtimeStatus}
        pharmacyError={pharmacyRealtimeError}
        pharmacyLastEventTime={pharmacyLastEventTime}
        pharmacyLastEventDetails={pharmacyLastEventDetails}
        pharmacyEventsCount={pharmacyEventsCount}
        pharmacyRawEventsCount={pharmacyRawEventsCount}
        lastCompensatorySyncTime={lastCompensatorySyncTime}
        lastCompensatorySyncCount={lastCompensatorySyncCount}
        lastCompensatorySyncSource={lastCompensatorySyncSource}
        diagnosticLogs={pharmacyDiagnosticLogs}
        onClearLogs={clearDiagnosticLogs}
        onReconnect={() => reconnectPharmacyRealtime()}
        onCompensatorySync={() => loadPharmacyOrders('مزامنة تعويضية يدوية')}
        deliveryStatus={deliveryRealtimeStatus}
        deliveryError={deliveryRealtimeError}
        deliveryLastEventTime={deliveryLastEventTime}
      />

      {/* Order GPS & External Navigation Modal */}
      <OrderMapModal
        isOpen={Boolean(mapModalTarget)}
        onClose={() => setMapModalTarget(null)}
        order={mapModalTarget?.order || null}
        orderType={mapModalTarget?.orderType || 'regular'}
        driverLocation={driverLocation}
        gpsStatus={gpsStatus}
        gpsErrorMessage={gpsErrorMessage}
        isLoadingGPS={isLoadingGPS}
        systemSettings={systemSettings}
        isTrackingActive={isTrackingActive}
        lastTrackingResult={lastTrackingResult}
        onRefreshGPS={() => requestGPSLocation(false)}
        supabase={getClient()}
        driverId={currentDriver?.id || null}
        routeDistance={
          mapModalTarget?.order?.id
            ? routeDistances[getOrderRouteKey(mapModalTarget.orderType, mapModalTarget.order.id)]
            : null
        }
        onRecalculateRoute={recalculateOrderRoute}
      />
    </div>
  );
}

