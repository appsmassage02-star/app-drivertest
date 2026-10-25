import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  Phone,
  User,
  Power,
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
  Activity
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
  isOrderMatchingDriverTerritory,
} from './data/locationOrderMatcher';
import { usePharmacy } from './hooks/usePharmacy';
import { ordersService } from './services/ordersService';
import { PharmacyOrdersSection } from './components/pharmacy/PharmacyOrdersSection';
import { PharmacyRealtimeDiagnosticModal } from './components/pharmacy/PharmacyRealtimeDiagnosticModal';
import { RealtimeConnectionStatus } from './types/pharmacy';
import {
  getInitialHeaderAssetSrc,
  getInitialSplashAssetSrc,
  syncAllDriverCentralAssets,
  DEFAULT_FALLBACK_ASSET,
} from './lib/centralAssetsService';

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

export type DriverStatus = 'pending_approval' | 'approved' | 'rejected';

export interface DeliveryDriver {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  is_active: boolean;
  vehicle_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  status: DriverStatus;
  governorate_name: string | null;
  governorate_code: string | null;
  markaz_name: string | null;
  vehicle_plate: string | null;
  national_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  id_card_front_path?: string | null;
  id_card_back_path?: string | null;
  driver_license_path?: string | null;
  vehicle_license_path?: string | null;
}

export interface DeliverySettings {
  id: string;
  delivery_enabled: boolean;
  default_delivery_fee: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  id: 'default',
  delivery_enabled: true,
  default_delivery_fee: 15.0,
  created_at: '',
  updated_at: '',
};

export interface DeliveryGovernorateSetting {
  id: string;
  governorate_code: string;
  governorate_name: string;
  is_active: boolean;
  delivery_fee: number;
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
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
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
// ============================================================================

const STORAGE_KEY_URL = 'talabat_albayt_supabase_url';
const STORAGE_KEY_KEY = 'talabat_albayt_supabase_anon_key';

function getSupabaseCredentials() {
  const metaEnv = (import.meta as any).env || {};
  const envUrl = (metaEnv.VITE_SUPABASE_URL as string) || '';
  const envKey = (metaEnv.VITE_SUPABASE_ANON_KEY as string) || '';
  const localUrl = localStorage.getItem(STORAGE_KEY_URL) || '';
  const localKey = localStorage.getItem(STORAGE_KEY_KEY) || '';
  return {
    url: localUrl || envUrl,
    anonKey: localKey || envKey,
  };
}

let cachedSupabase: SupabaseClient | null = null;
export function getClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) return null;
  if (!cachedSupabase) {
    try {
      cachedSupabase = createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    } catch {
      return null;
    }
  }
  return cachedSupabase;
}

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
  // Splash Screen State & Central Assets State (Synchronous Local Cache on Startup)
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [splashMessage, setSplashMessage] = useState('جاري التحقق من هوية السائق وبيانات الحساب...');
  const [splashStep, setSplashStep] = useState(1);
  const [splashImageSrc] = useState<string>(() => getInitialSplashAssetSrc());
  const [headerImageSrc, setHeaderImageSrc] = useState<string>(() => getInitialHeaderAssetSrc());

  // Authentication & Session State
  const [supabaseUser, setSupabaseUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showSupabaseSettings, setShowSupabaseSettings] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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

  // Memoized available centers for the currently selected governorate
  const availableCenters = useMemo(() => {
    const matched = EGYPT_GOVERNORATES.find((g) => g.name === regGovernorateName);
    return matched ? matched.centers : [];
  }, [regGovernorateName]);

  // Primary Live States - Strictly Real Database Data
  const [currentDriver, setCurrentDriver] = useState<DeliveryDriver | null>(null);
  const currentDriverRef = useRef<DeliveryDriver | null>(null);
  currentDriverRef.current = currentDriver;
  const [driverNotFoundInTable, setDriverNotFoundInTable] = useState(false);
  const [settings, setSettings] = useState<DeliverySettings>(DEFAULT_DELIVERY_SETTINGS);
  const [governorates, setGovernorates] = useState<DeliveryGovernorateSetting[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<DeliveryOrderStatusHistory[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [deliveryRealtimeStatus, setDeliveryRealtimeStatus] = useState<RealtimeConnectionStatus>('CONNECTING');
  const [deliveryRealtimeError, setDeliveryRealtimeError] = useState<string | null>(null);
  const [deliveryLastEventTime, setDeliveryLastEventTime] = useState<string | null>(null);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);

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

  // Order Category Filter ('all' | 'regular' | 'pharmacy') so "فاتورة صيدلية" is clearly displayed alongside regular orders
  const [orderCategoryView, setOrderCategoryView] = useState<'all' | 'regular' | 'pharmacy'>('all');

  // Isolated Pharmacy Driver Hook (Stage 1: Service/Repository without Supabase mutations)
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
    deliveryEnabled: Boolean(settings?.delivery_enabled),
    onToast: showToast,
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

  // Helper to resolve real document image: from DB Base64 Data URL, or device cache
  const resolveDocImage = (
    dbPath?: string | null,
    docType?: 'idCardFront' | 'idCardBack' | 'driverLicense' | 'vehicleLicense',
    userId?: string
  ): string | null => {
    if (dbPath && (dbPath.startsWith('data:image/') || dbPath.startsWith('http://') || dbPath.startsWith('https://'))) {
      return dbPath;
    }
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

      // 1. Fetch delivery_settings
      const { data: sData, error: sErr } = await supabase
        .from('delivery_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (!sErr && sData) {
        setSettings(sData as DeliverySettings);
      }

      // 2. Fetch delivery_governorate_settings
      const { data: gData, error: gErr } = await supabase
        .from('delivery_governorate_settings')
        .select('*')
        .order('governorate_name', { ascending: true });
      if (!gErr && gData) {
        setGovernorates(gData as DeliveryGovernorateSetting[]);
      }

      // 3. Fetch authenticated delivery_driver profile from Supabase delivery_drivers table
      const effectiveUserId = userId || supabaseUser?.id;
      if (effectiveUserId) {
        const { data: myDriver, error: myErr } = await supabase
          .from('delivery_drivers')
          .select('*')
          .eq('user_id', effectiveUserId)
          .maybeSingle();

        if (!myErr && myDriver) {
          const activeDriver = myDriver as DeliveryDriver;
          setCurrentDriver(activeDriver);
          currentDriverRef.current = activeDriver;
          setDriverNotFoundInTable(false);
        } else {
          setCurrentDriver(null);
          currentDriverRef.current = null;
          setDriverNotFoundInTable(true);
        }
      }

      // 4. Fetch delivery_orders & delivery_order_items (from reference talabat-al-bayt-driver)
      const activeDriver = currentDriverRef.current;
      const driverId = activeDriver?.id ? String(activeDriver.id) : null;
      const governorate = (activeDriver?.governorate_name || (activeDriver as any)?.governorate || '').trim();
      const center = (activeDriver?.markaz_name || (activeDriver as any)?.center || '').trim();

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

        const regularOrdersList: DeliveryOrder[] = [];
        for (const row of rows) {
          const assignedDriverId = row.assigned_driver_id
            ? String(row.assigned_driver_id)
            : (row.driver_id ? String(row.driver_id) : null);

          // 1. If assigned to another driver -> strictly exclude
          if (assignedDriverId && driverId && assignedDriverId !== driverId) {
            continue;
          }

          // 2. If unassigned, must be in acceptable state and matching zone if set
          if (!assignedDriverId) {
            if (row.status === 'completed' || row.status === 'delivered' || row.status === 'cancelled') {
              continue;
            }
            const rowGov = (row.governorate_name || row.governorate || '').trim();
            const rowMarkaz = (row.markaz_name || row.center || '').trim();
            if (governorate && rowGov && rowGov !== governorate) {
              continue;
            }
            if (center && rowMarkaz && rowMarkaz !== center) {
              continue;
            }
          }

          const rawItems = (row.items && row.items.length > 0)
            ? row.items
            : ((row.delivery_order_items && row.delivery_order_items.length > 0)
              ? row.delivery_order_items
              : (directItemsMap[String(row.id)] || []));

          row.items = rawItems;
          row.assigned_driver_id = assignedDriverId;
          regularOrdersList.push(row as DeliveryOrder);
        }

        setOrders(regularOrdersList);
        if (driverId) {
          saveCachedDeliveryOrders(driverId, regularOrdersList);
        }
      }
    } catch (err: any) {
      console.warn('Supabase sync warning:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [supabaseUser?.id]);

  // Check Supabase Auth Session on Mount & Bootstrap Splash Screen
  useEffect(() => {
    const supabase = getClient();
    if (!supabase) {
      setIsSplashActive(false);
      setAuthLoading(false);
      return;
    }

    let isMounted = true;

    async function initSession() {
      setSplashMessage('التحقق من جلسة المستخدم...');
      setSplashStep(1);

      try {
        const { data: { session } } = await supabase!.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          setSupabaseUser(session.user);
          setSplashMessage('جلب بيانات السائق وفحص الاعتماد الإداري...');
          setSplashStep(2);
          await syncWithSupabase(session.user.id);
          if (!isMounted) return;

          setSplashMessage('تحميل بيانات التطبيق وقائمة الطلبات...');
          setSplashStep(3);
          setTimeout(() => {
            if (isMounted) {
              setIsSplashActive(false);
              setAuthLoading(false);
            }
          }, 450);
        } else {
          if (isMounted) {
            setIsSplashActive(false);
            setAuthLoading(false);
          }
        }
      } catch (err) {
        console.warn('Init session error:', err);
        if (isMounted) {
          setIsSplashActive(false);
          setAuthLoading(false);
        }
      }
    }

    initSession();

    // Non-blocking background check for central assets on startup
    void syncAllDriverCentralAssets(supabase, (newHeaderSrc) => {
      if (isMounted) setHeaderImageSrc(newHeaderSrc);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void syncAllDriverCentralAssets(supabase, (newHeaderSrc) => {
          if (isMounted) setHeaderImageSrc(newHeaderSrc);
        });
      }
      if (event === 'SIGNED_OUT') {
        setSupabaseUser(null);
        setCurrentDriver(null);
        setDriverNotFoundInTable(false);
        setIsSplashActive(false);
        setAuthLoading(false);
      }
    });

    // Authoritative Realtime & Auto-Sync (from reference talabat-al-bayt-driver)
    setIsRealtimeConnected(true);
    setDeliveryRealtimeStatus('SUBSCRIBED');

    const unsubOrders = ordersService.subscribe(() => {
      if (!isMounted) return;
      void syncWithSupabase();
      setIsRealtimeConnected(true);
      setDeliveryRealtimeStatus('SUBSCRIBED');
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

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      supabase.removeChannel(assetsChannel);
      unsubOrders();
    };
  }, []);

  // Sync driver session with ordersService
  useEffect(() => {
    if (currentDriver?.id) {
      ordersService.setDriverSession(currentDriver.id, {
        governorate: currentDriver.governorate_name || (currentDriver as any).governorate,
        center: currentDriver.markaz_name || (currentDriver as any).center,
      });
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
  }, [currentDriver, triggerOfflineQueueSync, syncWithSupabase, showToast]);

  // Handle Driver Authentication (Login / Register)
  // CRITICAL RULE: Stage 1 creates delivery_driver record only. No Household, no profiles.
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);

    const supabase = getClient();
    if (!supabase) {
      setAuthError('يرجى ضبط رابط ومشروع Supabase أولاً من تبويب الإعدادات.');
      setAuthSubmitting(false);
      return;
    }

    try {
      if (authMode === 'login') {
        // Activate Splash Screen for smooth background verification without flicker
        setIsSplashActive(true);
        setSplashMessage('التحقق من صحة بيانات الدخول...');
        setSplashStep(1);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });

        if (error) {
          setIsSplashActive(false);
          throw error;
        }

        if (data.user) {
          setSupabaseUser(data.user);
          setSplashMessage('جلب بيانات السائق وفحص الاعتماد الإداري...');
          setSplashStep(2);
          await syncWithSupabase(data.user.id);
          setSplashStep(3);
          setTimeout(() => {
            setIsSplashActive(false);
            showToast('تم تسجيل الدخول بنجاح.');
          }, 400);
        }
      } else {
        // Register Mode Validations
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

        // Process & compress all 4 documents into high-clarity, compact Base64 Data URLs (guaranteed for PostgreSQL database storage)
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
          // Case 1: Active session already returned by signUp
          activeUserId = authData.session.user.id;
          finalUser = authData.session.user;
          console.log('[DRIVER REGISTER] Active session obtained from signUp. User ID:', activeUserId);
        } else {
          // Case 2: authData.session is null -> Establish session via signInWithPassword
          console.log('[DRIVER REGISTER] authData.session is null. Initiating signInWithPassword to obtain authenticated session...');
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: authEmail.trim(),
            password: authPassword,
          });

          if (signInErr) {
            console.error('[DRIVER REGISTER] signInWithPassword failed after signUp:', signInErr);
            throw new Error(
              `تم إنشاء حساب المستخدم في auth.users ولكن تعذر تفعيل جلسة المصادقة تلقائيًا: ${signInErr.message}. ` +
              `إذا كان خيار تأكيد البريد مفعّلاً في Supabase، يرجى تأكيد البريد ثم تسجيل الدخول.`
            );
          }

          if (!signInData.session || !signInData.session.user?.id) {
            console.error('[DRIVER REGISTER] No session or user id returned from signInWithPassword');
            throw new Error(
              'تم إنشاء الحساب ولكن تعذر إنشاء جلسة مصادقة صالحة. يرجى المحاولة مرة أخرى عبر تسجيل الدخول.'
            );
          }

          activeUserId = signInData.session.user.id;
          finalUser = signInData.session.user;
          console.log('[DRIVER REGISTER] Authenticated session established via signInWithPassword. Session User ID:', activeUserId);
        }

        // Storage paths for the 4 documents
        const bucketName = 'driver-documents';
        const docBasePath = `drivers/${activeUserId}/documents`;
        const frontDocPath = `${docBasePath}/id_card_front.webp`;
        const backDocPath = `${docBasePath}/id_card_back.webp`;
        const driverLicenseDocPath = `${docBasePath}/driver_license.webp`;
        const vehicleLicenseDocPath = `${docBasePath}/vehicle_license.webp`;

        // Extract native binary blobs from the processed document results
        const frontBlob = frontProcessed.blob;
        const backBlob = backProcessed.blob;
        const driverLicenseBlob = driverLicenseProcessed.blob;
        const vehicleLicenseBlob = vehicleLicenseProcessed.blob;

        // Wrap WebP/JPEG blobs into standard File objects for robust multi-platform upload
        const frontFile = new File([frontBlob], 'id_card_front.webp', { type: 'image/webp' });
        const backFile = new File([backBlob], 'id_card_back.webp', { type: 'image/webp' });
        const driverLicenseFile = new File([driverLicenseBlob], 'driver_license.webp', { type: 'image/webp' });
        const vehicleLicenseFile = new File([vehicleLicenseBlob], 'vehicle_license.webp', { type: 'image/webp' });

        // Track uploaded paths for cleanup if any subsequent step fails
        const uploadedPaths: string[] = [];

        const rollbackUploadedFiles = async () => {
          if (uploadedPaths.length > 0) {
            try {
              console.warn('[DRIVER REGISTER] Rolling back uploaded storage files:', uploadedPaths);
              await supabase.storage.from(bucketName).remove(uploadedPaths);
            } catch (cleanupErr) {
              console.warn('[DRIVER REGISTER] Rollback cleanup error:', cleanupErr);
            }
          }
        };

        // 2. Resilient Document Upload to Supabase Storage
        // Attempts storage upload if bucket is provisioned; if storage is unavailable or bucket not yet created,
        // it gracefully retains the canonical document paths in delivery_drivers without throwing or blocking registration.
        const uploadDocSafely = async (
          docPath: string,
          file: File,
          label: string
        ): Promise<{ success: boolean; path: string }> => {
          try {
            const { error: upErr } = await supabase.storage
              .from(bucketName)
              .upload(docPath, file, {
                contentType: 'image/webp',
                upsert: true,
              });

            if (upErr) {
              console.warn(
                `[DRIVER REGISTER] ${label} storage upload skipped (${upErr.message || 'Bucket not found / RLS'}). Document reference preserved.`
              );
              return { success: false, path: docPath };
            }
            uploadedPaths.push(docPath);
            return { success: true, path: docPath };
          } catch (storageErr: any) {
            console.warn(
              `[DRIVER REGISTER] ${label} storage service unreachable (${storageErr?.message || 'Storage unavailable'}). Document reference preserved.`
            );
            return { success: false, path: docPath };
          }
        };

        // Upload documents concurrently with non-blocking error tolerance
        await Promise.all([
          uploadDocSafely(frontDocPath, frontFile, 'Front ID'),
          uploadDocSafely(backDocPath, backFile, 'Back ID'),
          uploadDocSafely(driverLicenseDocPath, driverLicenseFile, 'Driver License'),
          uploadDocSafely(vehicleLicenseDocPath, vehicleLicenseFile, 'Vehicle License'),
        ]);

        // Cache document previews locally for instant visual confirmation on this device
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

        // Lookup governorate code
        const matchedGov = EGYPT_GOVERNORATES.find((g) => g.name === regGovernorateName.trim());
        const matchedGovCode = matchedGov ? matchedGov.code : null;

        // 6. Insert record into delivery_drivers with verified Base64 data URLs ensuring documents are 100% saved in Postgres
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
          notes: `[الدولة: مصر] [العنوان التفصيلي: ${regDetailedAddress.trim()}] ${regNotes.trim() ? `[ملاحظات: ${regNotes.trim()}]` : ''} [الوثائق المرفوعة: بطاقة وجه + ظهر، رخصة قيادة، رخصة مركبة] [مسارات الوثائق: بطاقة أمامي=${frontDocPath} | بطاقة ظهر=${backDocPath} | رخصة قيادة=${driverLicenseDocPath} | رخصة مركبة=${vehicleLicenseDocPath}]`.trim(),
          status: 'pending_approval' as DriverStatus,
          is_active: false,
          id_card_front_path: frontProcessed.dataUrl || frontDocPath,
          id_card_back_path: backProcessed.dataUrl || backDocPath,
          driver_license_path: driverLicenseProcessed.dataUrl || driverLicenseDocPath,
          vehicle_license_path: vehicleLicenseProcessed.dataUrl || vehicleLicenseDocPath,
        };

        console.log('[DRIVER REGISTER] Attempting INSERT into delivery_drivers with driverRecord:', driverRecord);

        // Insert directly into delivery_drivers under the authenticated session
        const { data: inserted, error: tableErr } = await supabase
          .from('delivery_drivers')
          .insert(driverRecord)
          .select()
          .single();

        if (tableErr) {
          console.error('[DRIVER REGISTER] INSERT Error:', {
            code: tableErr.code,
            message: tableErr.message,
            details: tableErr.details,
            hint: tableErr.hint,
            userId: activeUserId,
          });

          // Rollback uploaded files to prevent orphaned files in storage
          await rollbackUploadedFiles();

          if (tableErr.code === '42501' && tableErr.message?.includes('permission denied')) {
            throw new Error(
              `تم رفع الوثائق ولكن تعذر حفظ بيانات السائق بسبب صلاحيات قاعدة البيانات (42501): ينقص دور المستخدم المصادق عليه (authenticated) تصريح الإدراج في جدول delivery_drivers.`
            );
          }

          throw new Error(
            `تم رفع الوثائق ولكن تعذر حفظ بيانات السائق في قاعدة البيانات: ${tableErr.message}`
          );
        }

        if (inserted) {
          setCurrentDriver(inserted as DeliveryDriver);
          setDriverNotFoundInTable(false);
        }

        setSupabaseUser(finalUser);
        showToast('تم تقديم طلب تسجيل السائق ورفع الوثائق بنجاح! بياناتك قيد مراجعة الإدارة.', 'success');
        await syncWithSupabase(activeUserId);
      }
    } catch (err: any) {
      setAuthError(err.message || 'حدث خطأ أثناء المصادقة.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const checkApprovalStatus = async () => {
    setIsSyncing(true);
    try {
      const supabase = getClient();
      if (supabase && supabaseUser?.id) {
        await syncWithSupabase(supabaseUser.id);
        const { data: refreshedDriver, error } = await supabase
          .from('delivery_drivers')
          .select('*')
          .eq('user_id', supabaseUser.id)
          .maybeSingle();

        if (error) {
          showToast(`خطأ في فحص الحالة: ${error.message}`, 'error');
          return;
        }

        if (refreshedDriver) {
          setCurrentDriver(refreshedDriver as DeliveryDriver);
          setDriverNotFoundInTable(false);
          if (refreshedDriver.status === 'approved' && refreshedDriver.is_active) {
            showToast('تهانينا! تمت الموافقة على حسابك وتفعيله بنجاح من قبل الإدارة.', 'success');
          } else if (refreshedDriver.status === 'rejected') {
            showToast(`تم رفض الحساب من قبل الإدارة: ${refreshedDriver.rejection_reason || 'بيانات غير مستوفاة'}`, 'error');
          } else if (!refreshedDriver.is_active) {
            showToast('حسابك معطل حالياً بقرار إداري.', 'info');
          } else {
            showToast('حسابك لا يزال قيد المراجعة لدى لوحة الإدارة (pending_approval).', 'info');
          }
        } else {
          setDriverNotFoundInTable(true);
          showToast('لم يتم العثور على سجل سائق مرتبط بحسابك.', 'error');
        }
      }
    } catch (err: any) {
      showToast('حدث خطأ أثناء فحص حالة الحساب.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    const supabase = getClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    if (currentDriver?.id) {
      clearDriverOfflineCache(currentDriver.id);
    }
    setOrders([]);
    setSelectedOrder(null);
    setOrderHistory([]);
    setPendingOfflineCount(0);
    setSupabaseUser(null);
    setCurrentDriver(null);
    setDriverNotFoundInTable(false);
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
    if (!currentDriver) return;

    const supabase = getClient();
    const updatedFields = {
      phone: editPhone.trim(),
      governorate_name: editGovernorateName.trim() || null,
      governorate_code: editGovernorateCode.trim() || null,
      markaz_name: editMarkazName.trim() || null,
      vehicle_type: editVehicleType.trim() || null,
      vehicle_plate: editVehiclePlate.trim() || null,
      notes: editNotes.trim() || null,
      // Mandatory rule: reverts to pending_approval and is_active = false until re-approved by admin
      status: 'pending_approval' as DriverStatus,
      is_active: false,
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      const { error: updateErr } = await supabase
        .from('delivery_drivers')
        .update(updatedFields)
        .eq('id', currentDriver.id);

      if (updateErr) {
        showToast(`فشل تحديث بيانات السائق: ${updateErr.message}`, 'error');
        return;
      }
    }

    const updatedDriver: DeliveryDriver = {
      ...currentDriver,
      ...updatedFields,
    };

    setCurrentDriver(updatedDriver);
    currentDriverRef.current = updatedDriver;
    setEditProfileOpen(false);
    showToast('تم حفظ التعديلات بنجاح. تم تحويل حسابك إلى (قيد مراجعة الإدارة pending_approval) وتعطيله مؤقتًا حتى إعادة الاعتماد.', 'info');
    // Immediately re-evaluate orders based on new location
    syncWithSupabase(updatedDriver.user_id || undefined);
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
    if (!navigator.onLine) {
      showToast('لا يمكن قبول طلب توصيل جديد أثناء انقطاع الاتصال بالإنترنت. يرجى الانتظار حتى عودة الاتصال.', 'error');
      return;
    }
    if (order.status !== 'pending_review') {
      showToast(`لا يمكن قبول الطلب وهو في حالة: ${order.status}`, 'error');
      return;
    }

    const supabase = getClient();
    const now = new Date().toISOString();

    if (supabase) {
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
          msg.includes('حالة أخرى')
        ) {
          showToast('عذرًا، تم قبول هذا الطلب بالفعل من قبل سائق آخر.', 'error');
          setOrders((prev) => prev.filter((o) => o.id !== order.id));
          if (selectedOrder?.id === order.id) setSelectedOrder(null);
        } else {
          showToast(`فشل قبول الطلب: ${error.message}`, 'error');
        }
        return;
      }
    }

    // Local State & History Update
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
        setOrders((prev) => prev.map((o) => (o.id === orderId ? refreshed : o)));
        setSelectedOrder((prev) => (prev?.id === orderId ? refreshed : prev));
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
    setCancelModalOrder(null);
    setCancelReasonText('');
    showToast('تم إرسال طلب الإلغاء بنجاح وهو الآن في انتظار قرار الإدارة (cancellation_pending).', 'info');
  };

  // Save Supabase Configuration
  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (supabaseUrl) localStorage.setItem(STORAGE_KEY_URL, supabaseUrl.trim());
    else localStorage.removeItem(STORAGE_KEY_URL);

    if (supabaseKey) localStorage.setItem(STORAGE_KEY_KEY, supabaseKey.trim());
    else localStorage.removeItem(STORAGE_KEY_KEY);

    cachedSupabase = null;
    showToast('تم حفظ إعدادات Supabase وجارٍ مزامنة البيانات...', 'info');
    syncWithSupabase();
  };

  // Filtered Orders for the active view tab
  const filteredOrders = useMemo(() => {
    let list = [...orders];

    // Status filter
    if (activeTab === 'pending') {
      list = list.filter((o) => o.status === 'pending_review' && isOrderMatchingDriverTerritory(o, currentDriver));
    } else if (activeTab === 'accepted') {
      list = list.filter(
        (o) =>
          (o.status === 'accepted' || o.status === 'shopping' || o.status === 'shopping_completed') &&
          o.assigned_driver_id === currentDriver?.id
      );
    } else if (activeTab === 'completed') {
      list = list.filter((o) => o.status === 'completed');
    } else if (activeTab === 'cancelled') {
      list = list.filter((o) => o.status === 'cancelled' || o.status === 'cancellation_pending');
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number?.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_phone?.includes(q) ||
          o.detailed_address?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [orders, activeTab, currentDriver, searchQuery]);

  // Order Counts
  const counts = useMemo(
    () => ({
      pending: orders.filter((o) => o.status === 'pending_review' && isOrderMatchingDriverTerritory(o, currentDriver)).length,
      accepted: orders.filter(
        (o) =>
          (o.status === 'accepted' || o.status === 'shopping' || o.status === 'shopping_completed') &&
          o.assigned_driver_id === currentDriver?.id
      ).length,
      completed: orders.filter((o) => o.status === 'completed').length,
      cancelled: orders.filter((o) => o.status === 'cancelled' || o.status === 'cancellation_pending').length,
    }),
    [orders, currentDriver]
  );

  const displayCounts = useMemo(() => {
    if (orderCategoryView === 'regular') {
      return counts;
    }
    if (orderCategoryView === 'pharmacy') {
      return pharmacyCounts;
    }
    return {
      pending: counts.pending + pharmacyCounts.pending,
      accepted: counts.accepted + pharmacyCounts.accepted,
      completed: counts.completed + pharmacyCounts.completed,
      cancelled: counts.cancelled + pharmacyCounts.cancelled,
    };
  }, [orderCategoryView, counts, pharmacyCounts]);

  // 1. Initial Loading Screen / Splash Screen
  if (isSplashActive || authLoading) {
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
                setAuthError(null);
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
                setAuthError(null);
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
            {authError && (
              <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2 space-x-reverse">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="font-semibold leading-relaxed space-y-2 flex-1">
                  <p className="whitespace-pre-line">{authError}</p>
                  {authError.includes('GRANT') && (
                    <div className="mt-2 p-2.5 bg-neutral-900 text-emerald-400 font-mono text-[11px] rounded-xl select-all border border-neutral-800" dir="ltr">
                      GRANT INSERT, UPDATE, SELECT ON public.delivery_drivers TO authenticated;
                    </div>
                  )}
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
                          const matched = EGYPT_GOVERNORATES.find((g) => g.name === newGov);
                          if (matched && matched.centers.length > 0) {
                            setRegMarkazName(matched.centers[0]);
                          } else {
                            setRegMarkazName('');
                          }
                        }}
                        className="w-full text-xs border border-neutral-300 rounded-xl p-3 focus:outline-hidden focus:border-emerald-600 font-semibold bg-white"
                      >
                        {EGYPT_GOVERNORATES.map((gov) => (
                          <option key={gov.code} value={gov.name}>
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
                disabled={authSubmitting}
                className="w-full py-3.5 rounded-xl text-xs font-bold text-white shadow-md transition flex items-center justify-center space-x-2 space-x-reverse bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400"
              >
                {authSubmitting ? (
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
                      setAuthError(null);
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
                      setAuthError(null);
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

  // 3. Gatekeeping: Check Driver Profile, Approval Status, and Active Status
  // If no driver record found in delivery_drivers table for this user
  if (driverNotFoundInTable || !currentDriver) {
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
  if (currentDriver.status === 'pending_approval') {
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
  if (currentDriver.status === 'rejected') {
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
  if (!currentDriver.is_active) {
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
  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col font-['Cairo',sans-serif] text-neutral-900 selection:bg-emerald-200" dir="rtl">
      {/* Toast Notification */}
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

      {/* Primary Top Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-white p-0.5 flex items-center justify-center shadow-xs border border-neutral-200 overflow-hidden">
              <img
                src={headerImageSrc}
                alt="شعار التطبيق"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== window.location.origin + DEFAULT_FALLBACK_ASSET) {
                    target.src = DEFAULT_FALLBACK_ASSET;
                  }
                }}
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="font-extrabold text-base text-neutral-900">طلبات البيت</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  تطبيق الدليفري
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">نظام إدارة وتوصيل الطلبات المنزلية</p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 space-x-reverse">
            {/* Global Delivery Status Indicator */}
            <div
              className={`hidden sm:flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-bold border ${
                settings?.delivery_enabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{settings?.delivery_enabled ? 'الخدمة فعالة' : 'الخدمة معطلة'}</span>
            </div>

            {/* Authenticated User / Driver Badge */}
            {currentDriver && (
              <div className="flex items-center space-x-2 space-x-reverse bg-neutral-100 border border-neutral-200 rounded-xl px-3 py-1 text-xs">
                <User className="w-3.5 h-3.5 text-emerald-700" />
                <span className="font-bold text-neutral-800 max-w-[120px] sm:max-w-[180px] truncate">{currentDriver.full_name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 hidden md:inline">
                  معتمد ومفعل
                </span>
              </div>
            )}

            {/* Online / Offline & Sync Indicator */}
            <div
              className={`flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border-amber-300 animate-pulse'
              }`}
              title={
                isOnline
                  ? pendingOfflineCount > 0
                    ? `متصل - يتبقى (${pendingOfflineCount}) عملية قيد المزامنة`
                    : 'متصل بالإنترنت ومزامن بالكامل'
                  : 'وضع عدم الاتصال (أوفلاين) - يمكنك متابعة وتوصيل طلباتك المسندة'
              }
            >
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span className="hidden sm:inline">
                {isOnline
                  ? isSyncingOfflineQueue
                    ? 'جاري المزامنة...'
                    : pendingOfflineCount > 0
                    ? `معلق (${pendingOfflineCount})`
                    : 'متصل'
                  : 'أوفلاين'}
              </span>
            </div>

            {/* Sync Button */}
            <button
              onClick={() => {
                void triggerOfflineQueueSync();
                void syncWithSupabase();
              }}
              disabled={isSyncing || isSyncingOfflineQueue}
              title="مزامنة مع قاعدة بيانات Supabase"
              className="p-2 text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing || isSyncingOfflineQueue ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              title="تسجيل الخروج"
              className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 bg-neutral-100 rounded-xl transition flex items-center space-x-1 space-x-reverse text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">خروج</span>
            </button>
          </div>
        </div>

        {/* Offline Status Warning Banner */}
        {!isOnline && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between font-bold animate-in fade-in">
            <div className="flex items-center space-x-2 space-x-reverse max-w-6xl mx-auto w-full">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="flex-1">
                أنت تعمل حاليًا في وضع عدم الاتصال (Offline-First). طلباتك المسندة وعناوينها متاحة للمتابعة والتوصيل. قبول طلبات جديدة معطل حتى عودة الاتصال.
              </span>
              {pendingOfflineCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] shrink-0">
                  {pendingOfflineCount} إجراء معلق
                </span>
              )}
            </div>
          </div>
        )}

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:flex max-w-6xl mx-auto px-4 sm:px-6 border-t border-neutral-100 space-x-4 space-x-reverse text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse ${
              activeTab === 'pending'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>طلبات جديدة</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-[10px]">
              {displayCounts.pending}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                isRealtimeConnected || isPharmacyRealtimeActive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-neutral-100 text-neutral-500'
              }`}
              title={
                isRealtimeConnected || isPharmacyRealtimeActive
                  ? 'تحديث لحظي فوري متصل'
                  : 'جاري الاتصال بالتحديث اللحظي'
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isRealtimeConnected || isPharmacyRealtimeActive
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-neutral-400'
                }`}
              />
              <span>لحظي</span>
            </span>
          </button>

          <button
            onClick={() => setActiveTab('accepted')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse ${
              activeTab === 'accepted'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>قيد التوصيل (طلباتي)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[10px]">
              {displayCounts.accepted}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse ${
              activeTab === 'completed'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>مكتملة</span>
            <span className="px-1.5 py-0.2 rounded-full bg-teal-100 text-teal-900 text-[10px]">
              {displayCounts.completed}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('cancelled')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse ${
              activeTab === 'cancelled'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>ملغاة / طلبات إلغاء</span>
            <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-900 text-[10px]">
              {displayCounts.cancelled}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse ${
              activeTab === 'profile'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <User className="w-4 h-4 text-emerald-700" />
            <span>الملف الشخصي للسائق</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 space-x-reverse ${
              activeTab === 'settings'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Database className="w-4 h-4 text-sky-600" />
            <span>ربط Supabase</span>
          </button>
        </div>
      </header>

      {/* Main App Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8 space-y-6">
        {/* Warning Banner: Delivery Service Disabled */}
        {!settings?.delivery_enabled && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-950 flex items-start space-x-3 space-x-reverse shadow-xs">
            <PowerOff className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold">خدمة الدليفري معطلة عامًا (delivery_enabled = false)</h3>
              <p className="text-xs text-rose-800">
                تم إيقاف خدمة التوصيل بقرار الإدارة. لا يمكن للسائقين قبول طلبات جديدة حتى تتم إعادة تفعيل الخدمة من جدول
                delivery_settings.
              </p>
            </div>
          </div>
        )}

        {/* Driver Approval & Active Status Alert */}
        {currentDriver && currentDriver.status !== 'approved' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-950 flex items-start space-x-3 space-x-reverse shadow-xs">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold">
                حالة حساب السائق: {currentDriver.status === 'pending_approval' ? 'قيد المراجعة (pending_approval)' : 'مرفوض (rejected)'}
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                {currentDriver.status === 'pending_approval'
                  ? 'حسابك بانتظار موافقة الإدارة العامة. لن تتمكن من قبول أو استلام أي طلبات قبل مراجعة واعتماد بياناتك وتفعيل حسابك.'
                  : `تم رفض الحساب من قبل الإدارة. سبب الرفض: ${currentDriver.rejection_reason || 'بيانات غير مستوفاة'}`}
              </p>
            </div>
          </div>
        )}

        {/* Search Bar & Order Type Switcher (Regular Orders + Pharmacy Invoice) */}
        {['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab) && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-2xl border border-neutral-200 shadow-2xs">
              <div className="flex items-center space-x-1.5 space-x-reverse text-xs font-bold flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setOrderCategoryView('all')}
                  className={`px-3.5 py-2 rounded-xl transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
                    orderCategoryView === 'all'
                      ? 'bg-neutral-900 text-white shadow-2xs'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>جميع الطلبات</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderCategoryView('regular')}
                  className={`px-3.5 py-2 rounded-xl transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
                    orderCategoryView === 'regular'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>الطلبات العادية</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-[10px]">
                    {activeTab === 'pending'
                      ? counts.pending
                      : activeTab === 'accepted'
                      ? counts.accepted
                      : activeTab === 'completed'
                      ? counts.completed
                      : counts.cancelled}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderCategoryView('pharmacy')}
                  className={`px-3.5 py-2 rounded-xl transition flex items-center space-x-1.5 space-x-reverse cursor-pointer border ${
                    orderCategoryView === 'pharmacy'
                      ? 'bg-teal-700 text-white border-teal-700 shadow-2xs'
                      : 'bg-teal-50/80 text-teal-900 border-teal-200 hover:bg-teal-100'
                  }`}
                >
                  <Pill className="w-3.5 h-3.5" />
                  <span>فاتورة صيدلية</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      orderCategoryView === 'pharmacy'
                        ? 'bg-white text-teal-900'
                        : 'bg-teal-200/80 text-teal-950'
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
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="البحث برقم الطلب، اسم العميل، رقم الهاتف، أو العنوان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-neutral-200 rounded-xl pr-9 pl-4 py-2 text-xs font-semibold focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* PHARMACY ORDERS SECTION (Isolated Pharmacy Driver System)     */}
        {/* ------------------------------------------------------------- */}
        {['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab) &&
          (orderCategoryView === 'all' || orderCategoryView === 'pharmacy') && (
            <PharmacyOrdersSection
              activeTab={activeTab}
              searchQuery={searchQuery}
              currentDriver={currentDriver}
              deliveryEnabled={Boolean(settings?.delivery_enabled)}
              pharmacyOrders={pharmacyOrders}
              selectedPharmacyOrder={selectedPharmacyOrder}
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
            />
          )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: REGULAR ORDERS LIST (Tabs: pending, accepted, completed, cancelled) */}
        {/* ------------------------------------------------------------- */}
        {['pending', 'accepted', 'completed', 'cancelled'].includes(activeTab) &&
          (orderCategoryView === 'all' || orderCategoryView === 'regular') && (
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-neutral-200 shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3 text-neutral-400">
                  <Package className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-neutral-800">لا توجد طلبات في هذا القسم</h4>
                <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto leading-relaxed">
                  {activeTab === 'pending'
                    ? 'النظام في وضع الاستعداد اللحظي. بمجرد أن يرسل أحد المنازل طلبًا جديدًا، سيظهر هنا فورًا دون الحاجة لتحديث الصفحة.'
                    : 'بانتظار وصول وتحديث طلبات التوصيل من المنازل (Home App).'}
                </p>
                {activeTab === 'pending' && (
                  <div className="mt-4 inline-flex items-center space-x-2 space-x-reverse px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>التحديث اللحظي فعال (Real-time Live Sync)</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrders.map((order) => {
                  const isAssignedToCurrent = order.assigned_driver_id === currentDriver?.id;
                  const canAccept =
                    order.status === 'pending_review' &&
                    Boolean(settings?.delivery_enabled) &&
                    currentDriver?.status === 'approved' &&
                    currentDriver?.is_active;
                  const canStartShopping = order.status === 'accepted' && isAssignedToCurrent;
                  const isShopping = order.status === 'shopping' && isAssignedToCurrent;
                  const canComplete = order.status === 'shopping_completed' && isAssignedToCurrent;
                  const canCancel =
                    (order.status === 'accepted' || order.status === 'shopping') && isAssignedToCurrent;

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl border border-neutral-200 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between"
                    >
                      <div className="p-5 space-y-3">
                        {/* Order Number & Status Badge */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 space-x-reverse">
                            <span className="font-mono text-xs font-bold bg-neutral-100 text-neutral-800 px-2.5 py-1 rounded-lg border border-neutral-200">
                              {order.order_number || order.id.slice(0, 8)}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                order.status === 'pending_review'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : order.status === 'accepted'
                                  ? 'bg-blue-50 text-blue-900 border-blue-200'
                                  : order.status === 'shopping'
                                  ? 'bg-purple-50 text-purple-900 border-purple-200'
                                  : order.status === 'shopping_completed'
                                  ? 'bg-teal-50 text-teal-900 border-teal-200'
                                  : order.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                                  : order.status === 'cancellation_pending'
                                  ? 'bg-orange-50 text-orange-950 border-orange-200'
                                  : 'bg-rose-50 text-rose-900 border-rose-200'
                              }`}
                            >
                              {order.status === 'pending_review' && 'قيد المراجعة (pending_review)'}
                              {order.status === 'accepted' && 'مقبول / جاهز للتسوق (accepted)'}
                              {order.status === 'shopping' && 'جاري التسوق (shopping)'}
                              {order.status === 'shopping_completed' && 'اكتمل التسوق (shopping_completed)'}
                              {order.status === 'completed' && 'مكتمل ومسلّم (completed)'}
                              {order.status === 'cancellation_pending' && 'بانتظار موافقة الإلغاء (cancellation_pending)'}
                              {order.status === 'cancelled' && 'ملغي (cancelled)'}
                            </span>
                          </div>
                          <span className="text-[11px] text-neutral-400">
                            {formatSafeTime(order.created_at)}
                          </span>
                        </div>

                        {/* Customer & Address details */}
                        <div className="bg-neutral-50 rounded-xl p-3.5 border border-neutral-200/70 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-neutral-900 flex items-center space-x-1.5 space-x-reverse">
                              <User className="w-3.5 h-3.5 text-emerald-700" />
                              <span>{order.customer_name}</span>
                            </div>
                            <div className="text-neutral-600 flex items-center space-x-1 space-x-reverse font-mono text-[11px]" dir="ltr">
                              <Phone className="w-3 h-3 text-neutral-400" />
                              <span>{order.customer_phone || order.phone_number}</span>
                            </div>
                          </div>

                          <div className="text-neutral-700 flex items-start space-x-1.5 space-x-reverse pt-1 border-t border-neutral-200/60">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <span>
                              <strong>
                                {order.governorate_name || order.governorate} - {order.markaz_name || order.center}:
                              </strong>{' '}
                              {order.detailed_address}
                            </span>
                          </div>
                        </div>

                        {/* Order Items */}
                        {order.items && order.items.length > 0 && (
                          <div className="text-xs space-y-1">
                            <span className="font-semibold text-neutral-600 flex items-center space-x-1 space-x-reverse">
                              <Package className="w-3.5 h-3.5 text-emerald-700" />
                              <span>المنتجات ({order.items.length}):</span>
                            </span>
                            <div className="bg-neutral-50 rounded-lg p-2 border border-neutral-200/50 space-y-1.5 text-[11px]">
                              {order.items.map((it) => (
                                <div key={it.id} className="flex items-center justify-between text-neutral-700 py-0.5">
                                  <div className="flex items-center space-x-1.5 space-x-reverse">
                                    <span className="font-medium">{it.product_name}</span>
                                    <span className="text-[10px] text-neutral-400 font-mono">({it.quantity})</span>
                                    {it.item_status === 'purchased' && (
                                      <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                                        تم الشراء
                                      </span>
                                    )}
                                    {it.item_status === 'missing' && (
                                      <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded text-[9px] font-bold" title={it.missing_reason || ''}>
                                        ناقص
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-bold text-neutral-800">
                                    {it.item_status === 'purchased' && it.actual_total_price != null
                                      ? `${Number(it.actual_total_price).toFixed(2)} ج.م`
                                      : it.item_status === 'missing'
                                      ? '0.00 ج.م'
                                      : `${Number(it.total_price).toFixed(2)} ج.م`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cancellation Alert */}
                        {order.status === 'cancellation_pending' && (
                          <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 space-y-1">
                            <strong className="block text-orange-900">طلب إلغاء من السائق:</strong>
                            <p>{order.cancellation_reason}</p>
                          </div>
                        )}

                        {/* Financial Totals */}
                        <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
                          <span className="text-neutral-500">
                            توصيل: {Number(order.delivery_fee).toFixed(2)} ج.م
                          </span>
                          <span className="font-bold text-sm text-neutral-900">
                            {order.status === 'shopping_completed' || order.status === 'completed' ? (
                              <>
                                الإجمالي الفعلي:{' '}
                                <span className="text-emerald-700 font-extrabold">
                                  {Number(order.actual_total_amount ?? order.total_amount).toFixed(2)} ج.م
                                </span>
                              </>
                            ) : (
                              <>
                                الإجمالي التقديري:{' '}
                                <span className="text-neutral-800">
                                  {Number(order.total_amount).toFixed(2)} ج.م
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="bg-neutral-50 px-5 py-3 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 active:scale-95 transition flex items-center space-x-1 space-x-reverse cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>
                              {order.status === 'shopping' ? 'إدارة التسوق والمنتجات' : 'تفاصيل الطلب والسجل'}
                            </span>
                          </button>
                        </div>

                        <div className="flex items-center space-x-2 space-x-reverse">
                          {/* Call Customer Button (Visible when customer phone is available and driver is assigned) */}
                          {(order.status === 'accepted' || order.status === 'shopping' || order.status === 'shopping_completed') &&
                            isAssignedToCurrent &&
                            Boolean(order.customer_phone || order.phone_number) && (
                              <button
                                type="button"
                                onClick={() => callCustomer(order.customer_phone || order.phone_number)}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
                                title={`اتصال هاتفي بالعميل (${order.customer_phone || order.phone_number})`}
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>اتصال</span>
                              </button>
                            )}

                          {/* Accept Order Button */}
                          {order.status === 'pending_review' && (
                            <button
                              type="button"
                              disabled={!canAccept || isActionLoading}
                              onClick={() => handleAcceptOrder(order)}
                              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                              title={
                                currentDriver?.status !== 'approved'
                                  ? 'حسابك غير معتمد'
                                  : !currentDriver?.is_active
                                  ? 'حسابك معطل'
                                  : 'قبول الطلب'
                              }
                            >
                              قبول الطلب
                            </button>
                          )}

                          {/* Start Shopping Button (accepted) */}
                          {canStartShopping && (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleStartShopping(order)}
                              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>بدء التسوق</span>
                            </button>
                          )}

                          {/* Continue Shopping Button (shopping) */}
                          {isShopping && (
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>متابعة التسوق</span>
                            </button>
                          )}

                          {/* Complete Delivery Button (only on shopping_completed) */}
                          {canComplete && (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleCompleteOrder(order)}
                              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:bg-neutral-300 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>إتمام التوصيل</span>
                            </button>
                          )}

                          {/* Request Cancellation */}
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelModalOrder(order);
                                setCancelReasonText('');
                              }}
                              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                            >
                              طلب إلغاء
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
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
        {/* VIEW 4: SUPABASE CONNECTION CONFIGURATION */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* System Status & Sync Card */}
            <div className="bg-white rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-xs space-y-5">
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

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200 shadow-lg px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`relative flex flex-col items-center py-1 rounded-xl text-[11px] font-bold active:scale-90 transition duration-150 cursor-pointer ${
              activeTab === 'pending' ? 'text-emerald-700 font-extrabold' : 'text-neutral-500'
            }`}
          >
            <div className="relative">
              <Clock className="w-5 h-5 mb-0.5" />
              {(isRealtimeConnected || isPharmacyRealtimeActive) && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              )}
              {(isRealtimeConnected || isPharmacyRealtimeActive) && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
              )}
            </div>
            <span>جديدة ({displayCounts.pending})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accepted')}
            className={`flex flex-col items-center py-1 rounded-xl text-[11px] font-bold active:scale-90 transition duration-150 cursor-pointer ${
              activeTab === 'accepted' ? 'text-emerald-700 font-extrabold' : 'text-neutral-500'
            }`}
          >
            <Truck className="w-5 h-5 mb-0.5" />
            <span>طلباتي ({displayCounts.accepted})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`flex flex-col items-center py-1 rounded-xl text-[11px] font-bold active:scale-90 transition duration-150 cursor-pointer ${
              activeTab === 'completed' ? 'text-emerald-700 font-extrabold' : 'text-neutral-500'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 mb-0.5" />
            <span>مكتملة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cancelled')}
            className={`flex flex-col items-center py-1 rounded-xl text-[11px] font-bold active:scale-90 transition duration-150 cursor-pointer ${
              activeTab === 'cancelled' ? 'text-emerald-700 font-extrabold' : 'text-neutral-500'
            }`}
          >
            <XCircle className="w-5 h-5 mb-0.5" />
            <span>ملغاة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center py-1 rounded-xl text-[11px] font-bold active:scale-90 transition duration-150 cursor-pointer ${
              activeTab === 'profile' ? 'text-emerald-700 font-extrabold' : 'text-neutral-500'
            }`}
          >
            <User className="w-5 h-5 mb-0.5" />
            <span>الملف</span>
          </button>
        </div>
      </nav>

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

                {/* Financial Summary */}
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-2">
                  <h4 className="font-bold text-sm text-neutral-900 border-b border-neutral-200 pb-1.5">
                    الملخص المالي للفاتورة:
                  </h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-neutral-600">
                      <span>إجمالي المنتجات الأصلي (التقديري):</span>
                      <span className="font-mono">{Number(selectedOrder.subtotal).toFixed(2)} ج.م</span>
                    </div>

                    {(selectedOrder.status === 'shopping_completed' || selectedOrder.status === 'completed') && (
                      <div className="flex justify-between text-purple-900 font-bold bg-purple-50/70 p-1.5 rounded-lg border border-purple-200">
                        <span>إجمالي المنتجات الفعلي بعد التسوق:</span>
                        <span className="font-mono">
                          {Number(selectedOrder.actual_items_total ?? selectedOrder.subtotal).toFixed(2)} ج.م
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-neutral-600">
                      <span>رسوم التوصيل:</span>
                      <span className="font-mono">{Number(selectedOrder.delivery_fee).toFixed(2)} ج.م</span>
                    </div>

                    <div className="flex justify-between text-neutral-900 pt-2 border-t border-neutral-200 text-sm font-bold">
                      {selectedOrder.status === 'shopping_completed' || selectedOrder.status === 'completed' ? (
                        <>
                          <span>المبلغ الفعلي المطلوب تحصيله:</span>
                          <span className="text-emerald-700 font-extrabold font-mono text-base">
                            {Number(selectedOrder.actual_total_amount ?? selectedOrder.total_amount).toFixed(2)} ج.م
                          </span>
                        </>
                      ) : (
                        <>
                          <span>الإجمالي المطلوب تقديريًا:</span>
                          <span className="text-neutral-800 font-mono">
                            {Number(selectedOrder.total_amount).toFixed(2)} ج.م
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

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
    </div>
  );
}

