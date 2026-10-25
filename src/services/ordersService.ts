import { DeliveryOrder, PharmacyOrder, OrderStatus, OrderFilter, OrderType, OrderItem } from '../types';
import { initialRegularOrders, initialPharmacyOrders, mockOrderHistory } from './mockData';
import { getSupabaseClient, isSupabaseConfigured, subscribeToRealtimeChanges } from './supabaseClient';

// Helper to normalize delivery order status from DB
function normalizeOrderStatus(rawStatus: any): OrderStatus {
  const s = String(rawStatus || '').toLowerCase().trim();
  if (['assigned', 'assign', 'driver_assigned'].includes(s)) return 'assigned';
  if (['accepted', 'accept', 'driver_accepted', 'approved_by_driver'].includes(s)) return 'accepted';
  if (['picked_up', 'picked', 'received', 'collected', 'at_driver'].includes(s)) return 'picked_up';
  if (['in_transit', 'on_way', 'out_for_delivery', 'delivering', 'delivering_to_customer'].includes(s)) return 'in_transit';
  if (['delivered', 'completed', 'done', 'fulfilled', 'closed'].includes(s)) return 'delivered';
  if (['cancelled', 'rejected', 'canceled', 'declined', 'failed'].includes(s)) return 'cancelled';
  return 'new';
}

// Helper to resolve Supabase storage paths to absolute public URLs
function resolveStorageUrl(client: any, rawPathOrUrl: string, defaultBucket = 'pharmacy'): string {
  if (!rawPathOrUrl || typeof rawPathOrUrl !== 'string') return '';
  const trimmed = rawPathOrUrl.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  if (client && client.storage) {
    try {
      let bucket = defaultBucket;
      let path = trimmed;

      if (trimmed.startsWith('pharmacy/')) {
        bucket = 'pharmacy';
        path = trimmed.replace(/^pharmacy\//, '');
      } else if (trimmed.startsWith('driver-documents/')) {
        bucket = 'driver-documents';
        path = trimmed.replace(/^driver-documents\//, '');
      }

      const { data } = client.storage.from(bucket).getPublicUrl(path);
      if (data?.publicUrl) return data.publicUrl;
    } catch {
      // ignore
    }
  }
  return trimmed;
}

class OrdersService {
  private regularOrders: DeliveryOrder[] = [...initialRegularOrders];
  private pharmacyOrders: PharmacyOrder[] = [...initialPharmacyOrders];
  private historyOrders: DeliveryOrder[] = [...mockOrderHistory];
  private listeners: Array<() => void> = [];

  // Concurrency & Debounce guards
  private isFetching = false;
  private fetchQueued = false;
  private realtimeDebounceTimer: any = null;

  // Realtime & Subscriptions
  private realtimeUnsubscribes: Array<() => void> = [];
  private pollingTimer: any = null;
  private lastSyncTime: Date = new Date();
  private lastSyncError: string | null = null;
  private currentDriverId: string | null = null;
  private currentDriverZone: { governorate?: string; center?: string } = {};

  // Browser event handler bindings
  private onOnlineBound: () => void;
  private onVisibilityChangeBound: () => void;

  constructor() {
    this.onOnlineBound = () => {
      console.log('[OrdersService] Internet connection restored. Refreshing authoritative orders...');
      this.refreshOrders();
    };

    this.onVisibilityChangeBound = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        console.log('[OrdersService] App resumed to foreground. Refreshing authoritative orders...');
        this.refreshOrders();
      }
    };

    this.setupWindowListeners();
    this.startAutoSync();
  }

  // Bind or switch driver session and zone
  public setDriverSession(driverId: string | null, zone?: { governorate?: string; center?: string }): void {
    const hasChanged = this.currentDriverId !== driverId ||
      this.currentDriverZone.governorate !== zone?.governorate ||
      this.currentDriverZone.center !== zone?.center;

    if (hasChanged) {
      this.currentDriverId = driverId;
      this.currentDriverZone = zone || {};
      console.log(`[OrdersService] Driver session set to: ${driverId || 'unassigned'} (Zone: ${zone?.governorate || '-'})`);
      this.setupSupabaseRealtime();
      this.refreshOrders();
    }
  }

  // Subscribe to changes across orders for instant reactive UI updates
  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.lastSyncTime = new Date();
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[OrdersService] Error notifying listener:', err);
      }
    });
  }

  public getLastSyncTime(): Date {
    return this.lastSyncTime;
  }

  public getLastSyncError(): string | null {
    return this.lastSyncError;
  }

  // Browser event listeners setup
  private setupWindowListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', this.onOnlineBound);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
    }
  }

  private removeWindowListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.onOnlineBound);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
    }
  }

  // Auto polling fallback for live updates
  public startAutoSync(intervalMs = 30000): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    this.pollingTimer = setInterval(() => {
      if (!this.isFetching) {
        this.refreshOrders();
      }
    }, intervalMs);

    this.setupSupabaseRealtime();
  }

  public stopAutoSync(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.realtimeDebounceTimer) {
      clearTimeout(this.realtimeDebounceTimer);
      this.realtimeDebounceTimer = null;
    }
    this.cleanupRealtime();
  }

  // Cleanup on logout / unmount
  public cleanup(): void {
    console.log('[OrdersService] Cleaning up orders service resources...');
    this.stopAutoSync();
    this.removeWindowListeners();
    this.currentDriverId = null;
    this.currentDriverZone = {};
    this.isFetching = false;
    this.fetchQueued = false;
  }

  // Setup Supabase Realtime using actual tables:
  // "delivery_orders", "delivery_order_items", "pharmacy_orders",
  // "pharmacy_delivery_orders", "pharmacy_order_items", "delivery_drivers"
  private setupSupabaseRealtime(): void {
    this.cleanupRealtime();
    if (!isSupabaseConfigured()) return;

    const handleRealtimeTrigger = (tableName: string, payload: any) => {
      console.log(`[Realtime Event] ${tableName} received:`, payload?.eventType);
      this.scheduleDebouncedFetch();
    };

    const handleStatusChange = (status: string) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Channel connected/reconnected. Fetching latest authoritative orders...');
        this.scheduleDebouncedFetch();
      }
    };

    // 1. Regular delivery tables
    const unsubDeliveryOrders = subscribeToRealtimeChanges(
      'delivery_orders',
      (payload) => handleRealtimeTrigger('delivery_orders', payload),
      handleStatusChange
    );
    if (unsubDeliveryOrders) this.realtimeUnsubscribes.push(unsubDeliveryOrders);

    const unsubDeliveryItems = subscribeToRealtimeChanges(
      'delivery_order_items',
      (payload) => handleRealtimeTrigger('delivery_order_items', payload)
    );
    if (unsubDeliveryItems) this.realtimeUnsubscribes.push(unsubDeliveryItems);

    // 2. Pharmacy tables
    const unsubPharmacyOrders = subscribeToRealtimeChanges(
      'pharmacy_orders',
      (payload) => handleRealtimeTrigger('pharmacy_orders', payload),
      handleStatusChange
    );
    if (unsubPharmacyOrders) this.realtimeUnsubscribes.push(unsubPharmacyOrders);

    const unsubPharmacyDelivery = subscribeToRealtimeChanges(
      'pharmacy_delivery_orders',
      (payload) => handleRealtimeTrigger('pharmacy_delivery_orders', payload)
    );
    if (unsubPharmacyDelivery) this.realtimeUnsubscribes.push(unsubPharmacyDelivery);

    const unsubPharmacyItems = subscribeToRealtimeChanges(
      'pharmacy_order_items',
      (payload) => handleRealtimeTrigger('pharmacy_order_items', payload)
    );
    if (unsubPharmacyItems) this.realtimeUnsubscribes.push(unsubPharmacyItems);

    // 3. Driver table for live driver profile / assignment updates
    const unsubDrivers = subscribeToRealtimeChanges(
      'delivery_drivers',
      (payload) => handleRealtimeTrigger('delivery_drivers', payload)
    );
    if (unsubDrivers) this.realtimeUnsubscribes.push(unsubDrivers);
  }

  private cleanupRealtime(): void {
    this.realtimeUnsubscribes.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {
        // ignore
      }
    });
    this.realtimeUnsubscribes = [];
  }

  // Debounced fetch to absorb burst events without duplicate queries
  private scheduleDebouncedFetch(delayMs = 350): void {
    if (this.realtimeDebounceTimer) {
      clearTimeout(this.realtimeDebounceTimer);
    }
    this.realtimeDebounceTimer = setTimeout(() => {
      this.refreshOrders();
    }, delayMs);
  }

  // Authoritative fetch from Supabase
  public async refreshOrders(): Promise<void> {
    const client = getSupabaseClient();

    // If Supabase is not configured, retain local state and notify listeners
    if (!client || !isSupabaseConfigured()) {
      this.notify();
      return;
    }

    // Concurrency Lock: prevent overlapping queries
    if (this.isFetching) {
      this.fetchQueued = true;
      return;
    }

    this.isFetching = true;
    this.lastSyncError = null;

    try {
      // 1. Determine authenticated driver ID & zone from "delivery_drivers"
      let effectiveDriverId = this.currentDriverId;
      let effectiveGovernorate = this.currentDriverZone.governorate;
      let effectiveCenter = this.currentDriverZone.center;

      try {
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          // Look up driver record in delivery_drivers
          let { data: driverRow } = await client
            .from('delivery_drivers')
            .select('id, user_id, full_name, phone, status, is_active, governorate_name, governorate_code, markaz_name')
            .eq('user_id', user.id)
            .maybeSingle();

          if (!driverRow) {
            const resById = await client
              .from('delivery_drivers')
              .select('id, user_id, full_name, phone, status, is_active, governorate_name, governorate_code, markaz_name')
              .eq('id', user.id)
              .maybeSingle();
            driverRow = resById.data;
          }

          if (driverRow) {
            effectiveDriverId = driverRow.id;
            this.currentDriverId = driverRow.id;
            effectiveGovernorate = driverRow.governorate_name || effectiveGovernorate;
            effectiveCenter = driverRow.markaz_name || effectiveCenter;
          } else {
            effectiveDriverId = user.id;
            this.currentDriverId = user.id;
          }
        }
      } catch (err) {
        console.warn('[OrdersService] Could not resolve driver session from auth:', err);
      }

      // 2. Fetch Regular Orders from "delivery_orders"
      const { regularOrdersList, historyFromRegular } = await this.fetchDeliveryOrdersFromDB(
        client,
        effectiveDriverId,
        effectiveGovernorate,
        effectiveCenter
      );

      // 3. Fetch Pharmacy Orders from "pharmacy_orders" and related tables
      const { pharmacyOrdersList, historyFromPharmacy } = await this.fetchPharmacyOrdersFromDB(
        client,
        effectiveDriverId,
        effectiveGovernorate,
        effectiveCenter
      );

      // 4. Update collections if any authoritative records returned
      if (regularOrdersList.length > 0 || historyFromRegular.length > 0) {
        this.regularOrders = regularOrdersList;
      }
      if (pharmacyOrdersList.length > 0 || historyFromPharmacy.length > 0) {
        this.pharmacyOrders = pharmacyOrdersList;
      }

      const combinedHistory = [...historyFromRegular, ...historyFromPharmacy];
      if (combinedHistory.length > 0) {
        this.historyOrders = combinedHistory;
      }
    } catch (err: any) {
      console.error('[OrdersService] Authoritative fetch error (preserving cached data):', err);
      this.lastSyncError = err?.message || 'تعذر جلب الطلبات من قاعدة البيانات';
    } finally {
      this.isFetching = false;
      this.notify();

      if (this.fetchQueued) {
        this.fetchQueued = false;
        setTimeout(() => this.refreshOrders(), 50);
      }
    }
  }

  // --- Fetch Regular Orders from "delivery_orders" & "delivery_order_items" ---
  private async fetchDeliveryOrdersFromDB(
    client: any,
    driverId: string | null,
    governorate?: string,
    center?: string
  ): Promise<{ regularOrdersList: DeliveryOrder[]; historyFromRegular: DeliveryOrder[] }> {
    const regularOrdersList: DeliveryOrder[] = [];
    const historyFromRegular: DeliveryOrder[] = [];

    try {
      // Query delivery_orders with nested delivery_order_items
      // Query delivery_orders with items:delivery_order_items(*) as proven in old code
      let query = client
        .from('delivery_orders')
        .select(`
          *,
          items:delivery_order_items(*)
        `)
        .order('created_at', { ascending: false })
        .limit(60);

      const { data: rows, error } = await query;

      if (error) {
        console.warn('[OrdersService] delivery_orders fetch error:', error.message);
        return { regularOrdersList, historyFromRegular };
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return { regularOrdersList, historyFromRegular };
      }

      // Check if items:delivery_order_items was empty for any orders (fallback direct fetch)
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
          const { data: directItems, error: itemsErr } = await client
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
          console.warn('[OrdersService] Fallback direct fetch of delivery_order_items failed:', e);
        }
      }

      for (const row of rows) {
        const orderStatus = normalizeOrderStatus(row.status);
        // assigned_driver_id is the proven column in delivery_orders
        const assignedDriverId = row.assigned_driver_id
          ? String(row.assigned_driver_id)
          : (row.driver_id ? String(row.driver_id) : null);

        // Permissions & Driver rights check:
        // 1. If assigned to another driver -> strictly exclude
        if (assignedDriverId && driverId && assignedDriverId !== String(driverId)) {
          continue;
        }

        // 2. If unassigned, must be in acceptable state and matching zone if set
        if (!assignedDriverId) {
          if (orderStatus === 'delivered' || orderStatus === 'cancelled') {
            continue;
          }
          const rowGov = row.governorate_name || row.governorate;
          const rowMarkaz = row.markaz_name || row.center;
          if (governorate && rowGov && rowGov !== governorate) {
            continue;
          }
          if (center && rowMarkaz && rowMarkaz !== center) {
            continue;
          }
        }

        // Merge items from items:delivery_order_items, delivery_order_items, or direct fallback
        const rawItems = (row.items && row.items.length > 0)
          ? row.items
          : ((row.delivery_order_items && row.delivery_order_items.length > 0)
            ? row.delivery_order_items
            : (directItemsMap[String(row.id)] || []));

        const items: OrderItem[] = rawItems.map((it: any, idx: number) => {
          const itemStatus = it.item_status || (it.is_purchased ? 'purchased' : 'pending');
          const isPurchased = itemStatus === 'purchased';
          const actualUnitPrice = it.actual_unit_price !== undefined && it.actual_unit_price !== null ? Number(it.actual_unit_price) : undefined;
          const actualTotalPrice = it.actual_total_price !== undefined && it.actual_total_price !== null ? Number(it.actual_total_price) : undefined;
          return {
            id: String(it.id || `itm-${idx}`),
            name: it.product_name || it.item_name || it.name || it.title || 'صنف',
            quantity: Number(it.quantity || it.qty || 1),
            unitPrice: Number(it.unit_price || it.price || 0),
            totalPrice: Number(it.total_price || it.total || (it.unit_price || 0) * (it.quantity || 1)),
            notes: it.notes || it.comment || '',
            unit: it.unit || '',
            item_status: itemStatus,
            actual_unit_price: actualUnitPrice,
            actual_total_price: actualTotalPrice,
            missing_reason: it.missing_reason || '',
            isPurchased,
          };
        });

        const itemsCount = items.length > 0
          ? items.reduce((sum, it) => sum + it.quantity, 0)
          : Number(row.items_count || 1);

        const total = Number(row.total_amount || row.total || row.total_price || 0);
        const deliveryFee = Number(row.delivery_fee || row.shipping_fee || 18);
        const subtotal = Number(row.subtotal || (total > deliveryFee ? total - deliveryFee : total));
        const driverFee = Number(row.driver_fee || (deliveryFee > 0 ? deliveryFee * 0.9 : 16));
        const isPaid = Boolean(row.is_paid || row.payment_status === 'paid');
        const paymentMethod = (row.payment_method || (isPaid ? 'card' : 'cash')) as any;

        const deliveryOrder: DeliveryOrder = {
          id: String(row.id),
          orderNumber: row.order_number || row.order_code || row.code || `#TB-${String(row.id).slice(0, 6)}`,
          type: 'regular',
          status: orderStatus,
          assigned_driver_id: assignedDriverId || undefined,
          governorate_name: row.governorate_name || row.governorate,
          markaz_name: row.markaz_name || row.center,
          createdAt: row.created_at
            ? new Date(row.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
            : 'الآن',
          estimatedDeliveryTime: row.estimated_delivery_time || '30 دقيقة',
          store: {
            id: String(row.store_id || row.restaurant_id || 'str-1'),
            name: row.store_name || row.restaurant_name || 'مطعم ومتجر طلبات البيت',
            phone: row.store_phone || row.restaurant_phone || '0590000000',
            address: row.store_address || row.pickup_address || 'الفرع الرئيسي',
            area: row.store_area || row.pickup_area || row.governorate_name || row.governorate || 'وسط المدينة',
            latitude: row.store_lat || row.pickup_latitude,
            longitude: row.store_lng || row.pickup_longitude,
          },
          customer: {
            id: String(row.customer_id || row.user_id || 'cst-1'),
            name: row.customer_name || 'عميل طلبات البيت',
            phone: row.customer_phone || '0500000000',
            address: row.delivery_address || row.customer_address || row.address || 'العنوان المسجل',
            area: row.area || row.customer_area || row.markaz_name || row.governorate_name || 'المنطقة الحالية',
            buildingNumber: row.building_number,
            floorNumber: row.floor_number,
            apartmentNumber: row.apartment_number,
            notes: row.notes || row.customer_notes,
            latitude: row.latitude || row.delivery_latitude,
            longitude: row.longitude || row.delivery_longitude,
          },
          items: items.length > 0 ? items : [
            {
              id: `itm-single-${row.id}`,
              name: row.items_summary || 'طلب توصيل معتمد',
              quantity: itemsCount,
              unitPrice: subtotal,
              totalPrice: subtotal,
            },
          ],
          itemsCount,
          subtotal,
          deliveryFee,
          discount: Number(row.discount || 0),
          total,
          driverFee,
          paymentMethod,
          isPaid,
          distanceKm: Number(row.distance_km || row.distance || 3.8),
          specialInstructions: row.special_instructions || row.driver_notes,
          governorate: row.governorate_name || row.governorate,
          center: row.markaz_name || row.center,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          phone_number: row.customer_phone || row.phone_number,
          detailed_address: row.detailed_address,
          order_number: row.order_number,
          total_amount: total,
          delivery_notes: row.delivery_notes,
          household_id: row.household_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
          actual_items_total: row.actual_items_total,
          actual_total_amount: row.actual_total_amount,
          raw_status: row.status,
        };

        if (orderStatus === 'delivered' || orderStatus === 'cancelled') {
          historyFromRegular.push(deliveryOrder);
        } else {
          regularOrdersList.push(deliveryOrder);
        }
      }
    } catch (err) {
      console.error('[OrdersService] Error processing delivery_orders:', err);
    }

    return { regularOrdersList, historyFromRegular };
  }

  // --- Fetch Pharmacy Orders from "pharmacy_orders", "pharmacy_delivery_orders",
  // "pharmacy_order_items", "pharmacy_order_files", "pharmacy_order_pharmacy_stops", "pharmacy_pharmacies" ---
  private async fetchPharmacyOrdersFromDB(
    client: any,
    driverId: string | null,
    governorate?: string,
    center?: string
  ): Promise<{ pharmacyOrdersList: PharmacyOrder[]; historyFromPharmacy: DeliveryOrder[] }> {
    const pharmacyOrdersList: PharmacyOrder[] = [];
    const historyFromPharmacy: DeliveryOrder[] = [];

    try {
      // 1. Fetch pharmacy orders with nested relations if available
      const { data: ordersRows, error: phrError } = await client
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
        console.warn('[OrdersService] pharmacy_orders fetch warning:', phrError.message);
        return { pharmacyOrdersList, historyFromPharmacy };
      }

      if (!Array.isArray(ordersRows) || ordersRows.length === 0) {
        return { pharmacyOrdersList, historyFromPharmacy };
      }

      const orderIds = ordersRows.map((r) => r.id);

      // 2. Direct Fallback Queries when nested relations return empty or unjoined:
      // A. Fallback for "pharmacy_order_items"
      const missingItemsOrderIds = ordersRows
        .filter((r) => !r.pharmacy_order_items || !Array.isArray(r.pharmacy_order_items) || r.pharmacy_order_items.length === 0)
        .map((r) => r.id);

      let directPharmacyItemsMap: Record<string, any[]> = {};
      if (missingItemsOrderIds.length > 0) {
        try {
          const { data: directItems } = await client
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
          console.warn('[OrdersService] Fallback fetch on pharmacy_order_items failed:', e);
        }
      }

      // B. Fallback for "pharmacy_order_files"
      let directFilesMap: Record<string, any[]> = {};
      try {
        const { data: directFiles } = await client
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
        const { data: directStops } = await client
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

      // 3. Process each pharmacy order
      for (const row of ordersRows) {
        const rowIdStr = String(row.id);
        const orderStatus = normalizeOrderStatus(row.status);

        // Check driver assignment and customer contact via "pharmacy_delivery_orders" table
        let assignedDriverId: string | null = null;
        let isCustomerContacted = false;

        const deliveryOrder = Array.isArray(row.pharmacy_delivery_orders)
          ? row.pharmacy_delivery_orders[0]
          : row.pharmacy_delivery_orders;

        if (deliveryOrder) {
          if (deliveryOrder.assigned_driver_id) {
            assignedDriverId = String(deliveryOrder.assigned_driver_id);
          }
          if (deliveryOrder.customer_contacted_at) {
            isCustomerContacted = true;
          }
        }

        // Permissions & Driver rights check:
        // 1. If assigned to another driver -> strictly exclude
        if (assignedDriverId && driverId && assignedDriverId !== String(driverId)) {
          continue;
        }

        // 2. If unassigned, must be available and match zone if defined
        if (!assignedDriverId) {
          if (orderStatus === 'delivered' || orderStatus === 'cancelled') {
            continue;
          }
          const rowGov = row.address_governorate_name || row.governorate;
          const rowMarkaz = row.address_center_name || row.center;
          if (governorate && rowGov && rowGov !== governorate) {
            continue;
          }
          if (center && rowMarkaz && rowMarkaz !== center) {
            continue;
          }
        }

        // Gather Items (from nested or direct fallback)
        const rawItems = (row.pharmacy_order_items && row.pharmacy_order_items.length > 0)
          ? row.pharmacy_order_items
          : (directPharmacyItemsMap[rowIdStr] || []);

        const items: OrderItem[] = rawItems.map((it: any, idx: number) => {
          const driverStatus = it.driver_status || (it.status || 'pending');
          const reqQty = Number(it.requested_quantity || it.quantity || 1);
          const purQty = Number(it.purchased_quantity || 0);
          const shoQty = Number(it.shortage_quantity || 0);
          return {
            id: String(it.id || `ph-itm-${idx}`),
            name: it.item_name || it.medicine_name || it.name || it.title || 'دواء / مستلزم طبي',
            quantity: reqQty,
            requested_quantity: reqQty,
            purchased_quantity: purQty,
            shortage_quantity: shoQty,
            unitPrice: Number(it.unit_price || it.price || 0),
            totalPrice: Number(it.total_price || it.total || (it.unit_price || 0) * reqQty),
            notes: it.notes || it.dosage || it.instructions || '',
            unit: it.unit || it.package_type || '',
            driver_status: driverStatus,
            status: driverStatus === 'available' ? 'available' : driverStatus === 'shortage' ? 'shortage' : driverStatus === 'alternative' ? 'alternative' : 'pending',
            isPurchased: driverStatus === 'available' || (purQty > 0 && shoQty === 0),
            shortage_reason: it.shortage_reason || '',
            driver_note: it.driver_note || '',
          };
        });

        // Gather Files (Prescriptions & Invoices) from pharmacy_order_files
        const rawFiles = (row.pharmacy_order_files && row.pharmacy_order_files.length > 0)
          ? row.pharmacy_order_files
          : (directFilesMap[rowIdStr] || []);

        const prescriptionImages: string[] = [];
        let invoiceUrl: string | undefined = undefined;
        let invoiceStoragePath: string | undefined = undefined;

        rawFiles.forEach((f: any) => {
          const rawPath = f.storage_path || f.file_url || f.url || f.path || f.file_path;
          const fileType = String(f.file_type || f.type || '').toLowerCase();
          if (rawPath) {
            const resolved = resolveStorageUrl(client, rawPath, 'pharmacy');
            if (fileType.includes('invoice') || fileType.includes('receipt') || fileType.includes('bill')) {
              invoiceUrl = resolved;
              invoiceStoragePath = rawPath;
            } else if (fileType.includes('prescription') || fileType.includes('recipe') || !fileType) {
              prescriptionImages.push(resolved);
            }
          }
        });

        // Gather Pharmacy Store info from "pharmacy_order_pharmacy_stops"
        const rawStops = (row.pharmacy_order_pharmacy_stops && row.pharmacy_order_pharmacy_stops.length > 0)
          ? row.pharmacy_order_pharmacy_stops
          : (directStopsMap[rowIdStr] || []);

        let primaryPharmacyName = row.requested_pharmacy_name || 'صيدلية معتمدة';
        let primaryPharmacyPhone = '0590000000';
        let primaryPharmacyAddress = row.address_text || 'فرع الصيدلية';
        let primaryPharmacyArea = row.address_center_name || row.address_governorate_name || 'وسط المدينة';

        if (rawStops.length > 0) {
          const firstStop = rawStops[0];
          primaryPharmacyName = firstStop.pharmacy_name || primaryPharmacyName;
          primaryPharmacyPhone = firstStop.pharmacy_phone || primaryPharmacyPhone;
          primaryPharmacyAddress = firstStop.address || primaryPharmacyAddress;
          primaryPharmacyArea = firstStop.center_name || firstStop.governorate_name || primaryPharmacyArea;
        }

        const parsedPharmacyStops = rawStops.map((s: any, idx: number) => {
          return {
            id: String(s.id || `stop-${idx}`),
            pharmacyId: String(s.pharmacy_id || `phr-${idx}`),
            pharmacyName: s.pharmacy_name || primaryPharmacyName,
            pharmacyPhone: s.pharmacy_phone || primaryPharmacyPhone,
            pharmacyAddress: s.address || primaryPharmacyAddress,
            status: s.stop_status || 'visited',
            stopOrder: Number(s.visit_sequence || idx + 1),
            notes: s.internal_note || '',
          };
        });

        const itemsCount = items.length > 0
          ? items.reduce((sum, it) => sum + it.quantity, 0)
          : Number(row.items_count || 1);

        const deliveryFee = Number(row.delivery_fee || 20);
        const medicinesTotal = Number(row.medicines_total || 0);
        const grandTotal = Number(row.grand_total || (medicinesTotal + deliveryFee));
        const subtotal = medicinesTotal;
        const driverFee = Number(deliveryFee > 0 ? deliveryFee * 0.9 : 18);
        const isPaid = false;

        const pharmacyOrder: PharmacyOrder = {
          id: rowIdStr,
          orderNumber: row.order_number || row.order_code || row.code || `#PH-${rowIdStr.slice(0, 6)}`,
          type: 'pharmacy',
          status: orderStatus,
          createdAt: row.created_at
            ? new Date(row.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
            : 'الآن',
          estimatedDeliveryTime: '35 دقيقة',
          store: {
            id: String(row.requested_pharmacy_id || 'phr-1'),
            name: primaryPharmacyName,
            phone: primaryPharmacyPhone,
            address: primaryPharmacyAddress,
            area: primaryPharmacyArea,
          },
          customer: {
            id: String(row.user_id || 'cst-ph-1'),
            name: row.prescription_title || 'عميل الروشتة',
            phone: row.customer_phone || row.phone_number || '0500000000',
            address: row.address_text || 'العنوان المسجل',
            area: row.address_center_name && row.address_governorate_name ? `${row.address_governorate_name} - ${row.address_center_name}` : row.address_center_name || row.address_governorate_name || 'المنطقة',
            buildingNumber: undefined,
            floorNumber: undefined,
            apartmentNumber: undefined,
            notes: row.customer_notes || undefined,
            latitude: row.address_latitude ? Number(row.address_latitude) : undefined,
            longitude: row.address_longitude ? Number(row.address_longitude) : undefined,
          },
          items: items.length > 0 ? items : [
            {
              id: `ph-item-single-${row.id}`,
              name: row.prescription_title || 'أدوية ومستلزمات طبية',
              quantity: itemsCount,
              unitPrice: subtotal,
              totalPrice: subtotal,
            },
          ],
          itemsCount,
          subtotal,
          deliveryFee,
          discount: 0,
          total: grandTotal,
          driverFee,
          paymentMethod: 'cash',
          isPaid,
          distanceKm: 4.2,
          specialInstructions: row.customer_notes || undefined,
          prescriptionImages: prescriptionImages.length > 0 ? prescriptionImages : undefined,
          pharmacyNotes: row.customer_notes || undefined,
          needsPrescription: true,
          prescriptionVerified: true,
          hasColdStorageMedicines: false,
          invoiceUrl,
          invoiceStoragePath,
          invoiceAmount: medicinesTotal > 0 ? medicinesTotal : undefined,
          urgencyLevel: 'normal',
          customerContacted: isCustomerContacted,
          assigned_driver_id: assignedDriverId || undefined,
          pharmacyStops: parsedPharmacyStops.length > 0 ? parsedPharmacyStops : undefined,
          governorate: row.address_governorate_name,
          center: row.address_center_name,
          governorate_name: row.address_governorate_name,
          governorate_code: row.address_governorate_code,
          markaz_name: row.address_center_name,
        };

        if (orderStatus === 'delivered' || orderStatus === 'cancelled') {
          historyFromPharmacy.push(pharmacyOrder);
        } else {
          pharmacyOrdersList.push(pharmacyOrder);
        }
      }
    } catch (err) {
      console.error('[OrdersService] Error processing pharmacy_orders:', err);
    }

    return { pharmacyOrdersList, historyFromPharmacy };
  }

  // Regular Orders Getters
  public async getRegularOrders(filter?: OrderFilter): Promise<DeliveryOrder[]> {
    let list = [...this.regularOrders];

    if (filter?.status && filter.status !== 'all') {
      list = list.filter((o) => o.status === filter.status);
    }

    if (filter?.searchQuery && filter.searchQuery.trim() !== '') {
      const q = filter.searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.store.name.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.customer.area.toLowerCase().includes(q)
      );
    }

    return list;
  }

  public async getRegularOrderById(id: string): Promise<DeliveryOrder | null> {
    const found = this.regularOrders.find((o) => o.id === id);
    if (found) return found;
    const fromHistory = this.historyOrders.find((o) => o.id === id);
    return fromHistory || null;
  }

  // Pharmacy Orders Getters
  public async getPharmacyOrders(filter?: OrderFilter): Promise<PharmacyOrder[]> {
    let list = [...this.pharmacyOrders];

    if (filter?.status && filter.status !== 'all') {
      list = list.filter((o) => o.status === filter.status);
    }

    if (filter?.searchQuery && filter.searchQuery.trim() !== '') {
      const q = filter.searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.store.name.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.customer.area.toLowerCase().includes(q)
      );
    }

    return list;
  }

  public async getPharmacyOrderById(id: string): Promise<PharmacyOrder | null> {
    const found = this.pharmacyOrders.find((o) => o.id === id);
    if (found) return found;
    const fromHistory = this.historyOrders.find((o) => o.id === id) as PharmacyOrder;
    return fromHistory || null;
  }

  // Order History Getters
  public async getHistoryOrders(filter?: OrderFilter): Promise<DeliveryOrder[]> {
    let list = [...this.historyOrders];

    if (filter?.type && filter.type !== 'all') {
      list = list.filter((o) => o.type === filter.type);
    }

    if (filter?.status && filter.status !== 'all') {
      list = list.filter((o) => o.status === filter.status);
    }

    if (filter?.searchQuery && filter.searchQuery.trim() !== '') {
      const q = filter.searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.store.name.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q)
      );
    }

    return list;
  }

  // Helper to ensure driver ID is never null
  public async getEffectiveDriverId(client?: any): Promise<string> {
    if (this.currentDriverId) return this.currentDriverId;
    const sb = client || getSupabaseClient();
    if (sb) {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          let { data: row } = await sb
            .from('delivery_drivers')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!row) {
            const byId = await sb
              .from('delivery_drivers')
              .select('id')
              .eq('id', user.id)
              .maybeSingle();
            row = byId.data;
          }
          if (row?.id) {
            this.currentDriverId = String(row.id);
            return this.currentDriverId;
          }
          this.currentDriverId = user.id;
          return user.id;
        }
      } catch {
        // fallback
      }
    }
    return this.currentDriverId || 'demo-driver-id';
  }

  // Driver action execution with verified RPC calls strictly adhering to docs/SUPABASE_OPENAPI_REFERENCE.md
  // No fake fallbacks or local falsification of failed server operations
  public async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    type: OrderType = 'regular',
    reason?: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    let serverSuccess = false;

    // 1. If Supabase is connected, execute server RPC FIRST
    if (client && isSupabaseConfigured()) {
      try {
        if (type === 'pharmacy') {
          if (newStatus === 'accepted') {
            const { error } = await client.rpc('pharmacy_driver_accept_order', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] pharmacy_driver_accept_order error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'picked_up') {
            const { error } = await client.rpc('pharmacy_driver_start_shopping', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] pharmacy_driver_start_shopping error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'in_transit') {
            const { error } = await client.rpc('pharmacy_driver_start_delivery', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] pharmacy_driver_start_delivery error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'delivered') {
            const { error } = await client.rpc('pharmacy_driver_complete_delivery', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] pharmacy_driver_complete_delivery error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'cancelled') {
            const { error } = await client.rpc('pharmacy_driver_request_cancel', {
              p_order_id: orderId,
              p_reason: reason || 'طلب إلغاء بواسطة المندوب',
            });
            if (error) {
              console.error('[OrdersService] pharmacy_driver_request_cancel error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          }
        } else {
          // Regular delivery_orders RPCs
          if (newStatus === 'accepted') {
            const { error } = await client.rpc('accept_delivery_order', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] accept_delivery_order error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'picked_up') {
            const { error } = await client.rpc('driver_start_shopping', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] driver_start_shopping error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'in_transit') {
            const { error } = await client.rpc('driver_complete_shopping', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] driver_complete_shopping error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'delivered') {
            const { error } = await client.rpc('complete_delivery_order', {
              p_order_id: orderId,
            });
            if (error) {
              console.error('[OrdersService] complete_delivery_order error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          } else if (newStatus === 'cancelled') {
            const { error } = await client.rpc('request_order_cancellation', {
              p_order_id: orderId,
              p_reason: reason || 'طلب إلغاء بواسطة المندوب',
            });
            if (error) {
              console.error('[OrdersService] request_order_cancellation error:', error.message);
              this.lastSyncError = error.message;
              return false;
            }
            serverSuccess = true;
          }
        }
      } catch (err: any) {
        console.error('[OrdersService] Status RPC error:', err);
        this.lastSyncError = err?.message || 'فشل استدعاء الخادم لتحديث الحالة';
        return false;
      }
    } else {
      // Demo mode only when Supabase is not configured
      serverSuccess = true;
    }

    // 2. Only update in-memory state if server confirmed success (or in demo mode)
    if (serverSuccess) {
      let updated = false;

      if (type === 'pharmacy') {
        const idx = this.pharmacyOrders.findIndex((o) => o.id === orderId);
        if (idx !== -1) {
          this.pharmacyOrders[idx].status = newStatus;
          if (newStatus === 'delivered' || newStatus === 'cancelled') {
            this.historyOrders = [this.pharmacyOrders[idx], ...this.historyOrders.filter((h) => h.id !== orderId)];
            this.pharmacyOrders.splice(idx, 1);
          }
          updated = true;
        }
      } else {
        const idx = this.regularOrders.findIndex((o) => o.id === orderId);
        if (idx !== -1) {
          this.regularOrders[idx].status = newStatus;
          if (newStatus === 'delivered' || newStatus === 'cancelled') {
            this.historyOrders = [this.regularOrders[idx], ...this.historyOrders.filter((h) => h.id !== orderId)];
            this.regularOrders.splice(idx, 1);
          }
          updated = true;
        }
      }

      if (updated) {
        this.notify();
      }
      return true;
    }

    return false;
  }

  // Regular order item update via RPC driver_update_delivery_item
  // Parameters in schema: p_actual_unit_price, p_item_id, p_item_status, p_missing_reason
  public async updateDeliveryItemPurchased(
    orderId: string,
    itemId: string,
    isPurchased: boolean,
    actualUnitPrice?: number,
    missingReason?: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (client && isSupabaseConfigured()) {
      const itemStatus = isPurchased ? 'purchased' : 'missing';
      const { error } = await client.rpc('driver_update_delivery_item', {
        p_item_id: itemId,
        p_item_status: itemStatus,
        p_actual_unit_price: actualUnitPrice !== undefined ? actualUnitPrice : 0,
        p_missing_reason: missingReason || '',
      });

      if (error) {
        console.error('[OrdersService] driver_update_delivery_item error:', error.message);
        this.lastSyncError = error.message;
        return false;
      }
    }

    // In-memory update only when server succeeds or demo mode
    const order = this.regularOrders.find((o) => o.id === orderId);
    if (order) {
      const it = order.items.find((item) => item.id === itemId);
      if (it) {
        it.isPurchased = isPurchased;
        it.item_status = isPurchased ? 'purchased' : 'missing';
        if (actualUnitPrice !== undefined) it.actual_unit_price = actualUnitPrice;
        if (missingReason !== undefined) it.missing_reason = missingReason;
        this.notify();
      }
    }

    return true;
  }

  // Pharmacy item update via RPC pharmacy_driver_update_item
  // Parameters in schema: p_item_id, p_purchased_quantity, p_shortage_reason, p_driver_note
  public async updatePharmacyItemStatus(
    orderId: string,
    itemId: string,
    driverStatus: 'available' | 'shortage' | 'alternative' | string,
    purchasedQuantity: number,
    shortageReason?: string,
    driverNote?: string
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (client && isSupabaseConfigured()) {
      const { error } = await client.rpc('pharmacy_driver_update_item', {
        p_item_id: itemId,
        p_purchased_quantity: purchasedQuantity,
        p_shortage_reason: shortageReason || '',
        p_driver_note: driverNote || '',
      });

      if (error) {
        console.error('[OrdersService] pharmacy_driver_update_item error:', error.message);
        this.lastSyncError = error.message;
        return false;
      }
    }

    // In-memory update only when server succeeds or demo mode
    const order = this.pharmacyOrders.find((o) => o.id === orderId);
    if (order) {
      const it = order.items.find((item) => item.id === itemId);
      if (it) {
        it.driver_status = driverStatus;
        it.status = driverStatus;
        it.purchased_quantity = purchasedQuantity;
        it.isPurchased = driverStatus === 'available' || purchasedQuantity > 0;
        if (shortageReason !== undefined) it.shortage_reason = shortageReason;
        if (driverNote !== undefined) it.driver_note = driverNote;
        this.notify();
      }
    }

    return true;
  }

  // Mark patient contacted via RPC pharmacy_driver_mark_customer_contacted
  // Parameters in schema: p_order_id
  public async markPatientContacted(orderId: string): Promise<boolean> {
    const client = getSupabaseClient();
    if (client && isSupabaseConfigured()) {
      const { error } = await client.rpc('pharmacy_driver_mark_customer_contacted', {
        p_order_id: orderId,
      });
      if (error) {
        console.error('[OrdersService] markPatientContacted RPC error:', error.message);
        this.lastSyncError = error.message;
        return false;
      }
    }

    const order = this.pharmacyOrders.find((o) => o.id === orderId);
    if (order) {
      order.customerContacted = true;
      this.notify();
    }
    return true;
  }

  // Add pharmacy stop via RPC pharmacy_driver_add_pharmacy_stop
  // Parameters in schema: p_internal_note, p_order_id, p_pharmacy_id, p_stop_status
  public async addPharmacyStop(
    orderId: string,
    pharmacyId: string,
    notes?: string,
    stopStatus: string = 'visited'
  ): Promise<boolean> {
    const client = getSupabaseClient();
    if (client && isSupabaseConfigured()) {
      const { error } = await client.rpc('pharmacy_driver_add_pharmacy_stop', {
        p_order_id: orderId,
        p_pharmacy_id: pharmacyId,
        p_stop_status: stopStatus,
        p_internal_note: notes || '',
      });
      if (error) {
        console.error('[OrdersService] addPharmacyStop RPC error:', error.message);
        this.lastSyncError = error.message;
        return false;
      }
    }
    return true;
  }

  // Cancel order with reason via RPC
  public async cancelOrder(orderId: string, reason: string, type: OrderType = 'regular'): Promise<boolean> {
    return this.updateOrderStatus(orderId, 'cancelled', type, reason);
  }

  // Upload pharmacy invoice to Storage bucket 'pharmacy' and record via RPC pharmacy_driver_add_receipt
  // Parameters in schema: p_mime_type, p_order_id, p_storage_path
  public async uploadAndAttachPharmacyInvoice(
    orderId: string,
    file: File,
    medicinesTotal?: number
  ): Promise<{ success: boolean; message?: string }> {
    const client = getSupabaseClient();
    if (client && isSupabaseConfigured()) {
      try {
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `receipts/${orderId}/${Date.now()}_${cleanName}`;

        // 1. Upload to proven Storage bucket 'pharmacy'
        const { data: uploadData, error: uploadErr } = await client.storage
          .from('pharmacy')
          .upload(storagePath, file, {
            contentType: file.type || 'image/jpeg',
            upsert: true,
          });

        if (uploadErr) {
          console.error('[OrdersService] Pharmacy storage upload error:', uploadErr.message);
          return {
            success: false,
            message: `فشل رفع صورة الفاتورة إلى وحدة التخزين (pharmacy): ${uploadErr.message}`,
          };
        }

        const effectivePath = uploadData?.path || storagePath;

        // 2. Call verified RPC pharmacy_driver_add_receipt
        const { error: rpcErr } = await client.rpc('pharmacy_driver_add_receipt', {
          p_order_id: orderId,
          p_storage_path: effectivePath,
          p_mime_type: file.type || 'image/jpeg',
        });

        if (rpcErr) {
          console.error('[OrdersService] pharmacy_driver_add_receipt error:', rpcErr.message);
          return {
            success: false,
            message: `فشل تسجيل الفاتورة في الطلب عبر الخادم: ${rpcErr.message}`,
          };
        }

        // 3. If medicinesTotal is provided, finish shopping total via pharmacy_driver_finish_shopping
        if (medicinesTotal !== undefined && medicinesTotal > 0) {
          const { error: finishErr } = await client.rpc('pharmacy_driver_finish_shopping', {
            p_order_id: orderId,
            p_medicines_total: medicinesTotal,
          });
          if (finishErr) {
            console.warn('[OrdersService] pharmacy_driver_finish_shopping note:', finishErr.message);
          }
        }

        const publicUrl = resolveStorageUrl(client, effectivePath, 'pharmacy');
        const order = this.pharmacyOrders.find((o) => o.id === orderId);
        if (order) {
          order.invoiceUrl = publicUrl;
          order.invoiceStoragePath = effectivePath;
          if (medicinesTotal !== undefined) order.invoiceAmount = medicinesTotal;
          this.notify();
        }

        return { success: true };
      } catch (err: any) {
        console.error('[OrdersService] Error uploading invoice:', err);
        return {
          success: false,
          message: err?.message || 'حدث خطأ غير متوقع أثناء معالجة الفاتورة',
        };
      }
    } else {
      // Demo mode fallback only when Supabase is completely unconfigured
      const order = this.pharmacyOrders.find((o) => o.id === orderId);
      if (order) {
        order.invoiceUrl = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80';
        if (medicinesTotal !== undefined) order.invoiceAmount = medicinesTotal;
        this.notify();
      }
      return { success: true };
    }
  }

  // Simulator helper for local and testing purposes
  public injectDemoNewOrder(type: 'regular' | 'pharmacy' = 'regular'): void {
    const timestamp = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    const randomId = Math.floor(1000 + Math.random() * 9000);

    if (type === 'regular') {
      const newOrder: DeliveryOrder = {
        id: `ord-reg-gen-${Date.now()}`,
        orderNumber: `#TB-${randomId}`,
        type: 'regular',
        status: 'new',
        createdAt: `الآن (${timestamp})`,
        estimatedDeliveryTime: '25 دقيقة',
        store: {
          id: 'str-gen',
          name: 'مطعم أطايب الريف',
          phone: '0599008811',
          address: 'شارع الملك فهد - مجمع التميمي',
          area: 'حي الملقا',
        },
        customer: {
          id: 'cst-gen',
          name: 'عبدالله بن راشد',
          phone: '0566778899',
          address: 'حي حطين، شارع فيد بن أسد',
          area: 'حي حطين',
          buildingNumber: '12',
          floorNumber: '1',
          apartmentNumber: '3',
          notes: 'يرجى وضع الطلب عند الباب',
        },
        items: [
          { id: 'gen-1', name: 'وجبة كرسبي حار سوبريم', quantity: 2, unitPrice: 38, totalPrice: 76 },
          { id: 'gen-2', name: 'بطاطس مقرمشة حجم عائلي', quantity: 1, unitPrice: 16, totalPrice: 16 },
        ],
        itemsCount: 3,
        subtotal: 92,
        deliveryFee: 16,
        discount: 0,
        total: 108,
        driverFee: 16.0,
        paymentMethod: 'cash',
        isPaid: false,
        distanceKm: 3.9,
      };
      this.regularOrders.unshift(newOrder);
    } else {
      const newPharmacy: PharmacyOrder = {
        id: `ord-phr-gen-${Date.now()}`,
        orderNumber: `#PH-${randomId}`,
        type: 'pharmacy',
        status: 'new',
        createdAt: `الآن (${timestamp})`,
        estimatedDeliveryTime: '30 دقيقة',
        needsPrescription: true,
        prescriptionVerified: true,
        hasColdStorageMedicines: false,
        urgencyLevel: 'urgent',
        store: {
          id: 'phr-gen',
          name: 'صيدلية النقاء - فرع الملقا',
          phone: '0599447722',
          address: 'شارع أنس بن مالك',
          area: 'الملقا',
        },
        customer: {
          id: 'cst-phr-gen',
          name: 'نورة بنت عبد الرحمن',
          phone: '0533445566',
          address: 'حي الياسمين، مجمع أوركيد',
          area: 'الياسمين',
          buildingNumber: '7',
          floorNumber: '2',
          apartmentNumber: '201',
          notes: 'مستعجل جداً لو سمحت',
        },
        items: [
          { id: 'ph-gen-1', name: 'خافض حرارة للأطفال تحاميل 125 ملجم', quantity: 2, unitPrice: 18, totalPrice: 36, unit: 'علبة' },
          { id: 'ph-gen-2', name: 'محلول جفاف فموي بالفواكه', quantity: 3, unitPrice: 12, totalPrice: 36, unit: 'أكياس' },
        ],
        itemsCount: 5,
        subtotal: 72,
        deliveryFee: 18,
        discount: 0,
        total: 90,
        driverFee: 18.0,
        paymentMethod: 'card',
        isPaid: true,
        distanceKm: 4.2,
        pharmacyNotes: 'تم التجهيز والتأكد من توافق الجرعات للطفل.',
        prescriptionImages: [
          'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=700&q=80',
        ],
      };
      this.pharmacyOrders.unshift(newPharmacy);
    }

    this.notify();
  }

  // Stats summary
  public getCounts() {
    const newRegular = this.regularOrders.filter((o) => o.status === 'new').length;
    const activeRegular = this.regularOrders.filter(
      (o) => o.status === 'accepted' || o.status === 'assigned' || o.status === 'picked_up' || o.status === 'in_transit'
    ).length;

    const newPharmacy = this.pharmacyOrders.filter((o) => o.status === 'new').length;
    const activePharmacy = this.pharmacyOrders.filter(
      (o) => o.status === 'accepted' || o.status === 'assigned' || o.status === 'picked_up' || o.status === 'in_transit'
    ).length;

    return {
      newRegular,
      activeRegular,
      totalRegular: this.regularOrders.length,
      newPharmacy,
      activePharmacy,
      totalPharmacy: this.pharmacyOrders.length,
      historyCount: this.historyOrders.length,
      totalPendingOrders: newRegular + newPharmacy,
    };
  }
}

export const ordersService = new OrdersService();
