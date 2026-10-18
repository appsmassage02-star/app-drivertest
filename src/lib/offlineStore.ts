/**
 * Offline Store & Synchronization Manager for Delivery Driver App
 * Manages local persistence for assigned regular delivery orders, pharmacy orders,
 * offline action queue, and automatic sync upon network reconnection.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OfflineQueueItem {
  id: string;
  driverId: string;
  actionType:
    | 'delivery_start_shopping'
    | 'delivery_update_item'
    | 'delivery_complete'
    | 'delivery_cancel_request'
    | 'pharmacy_start_shopping'
    | 'pharmacy_update_item'
    | 'pharmacy_finish_shopping'
    | 'pharmacy_complete_delivery'
    | 'pharmacy_mark_contacted'
    | 'pharmacy_unable_to_fulfill';
  orderId: string;
  payload: any;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const STORAGE_PREFIX = 'talabat_driver_offline';

function getDeliveryOrdersKey(driverId: string): string {
  return `${STORAGE_PREFIX}_orders_${driverId}`;
}

function getPharmacyOrdersKey(driverId: string): string {
  return `${STORAGE_PREFIX}_pharmacy_${driverId}`;
}

function getQueueKey(driverId: string): string {
  return `${STORAGE_PREFIX}_queue_${driverId}`;
}

function getLastSyncKey(driverId: string): string {
  return `${STORAGE_PREFIX}_last_sync_${driverId}`;
}

/**
 * Saves assigned delivery orders to local storage for offline access.
 */
export function saveCachedDeliveryOrders(driverId: string, orders: any[]): void {
  if (!driverId) return;
  try {
    // Only store orders assigned to this driver or active
    const assignedOnly = orders.filter((o) => o && o.assigned_driver_id === driverId);
    localStorage.setItem(getDeliveryOrdersKey(driverId), JSON.stringify(assignedOnly));
    localStorage.setItem(getLastSyncKey(driverId), new Date().toISOString());
  } catch (err) {
    console.warn('[OfflineStore] Failed to cache delivery orders:', err);
  }
}

/**
 * Retrieves cached assigned delivery orders.
 */
export function getCachedDeliveryOrders(driverId: string): any[] {
  if (!driverId) return [];
  try {
    const raw = localStorage.getItem(getDeliveryOrdersKey(driverId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[OfflineStore] Failed to read cached delivery orders:', err);
    return [];
  }
}

/**
 * Saves assigned pharmacy orders to local storage for offline access.
 */
export function saveCachedPharmacyOrders(driverId: string, orders: any[]): void {
  if (!driverId) return;
  try {
    const assignedOnly = orders.filter(
      (o) =>
        o &&
        (o.assigned_driver_id === driverId ||
          o.delivery_assignment?.driver_id === driverId ||
          (o.status && o.status !== 'pending_review' && o.status !== 'cancelled'))
    );
    localStorage.setItem(getPharmacyOrdersKey(driverId), JSON.stringify(assignedOnly));
  } catch (err) {
    console.warn('[OfflineStore] Failed to cache pharmacy orders:', err);
  }
}

/**
 * Retrieves cached assigned pharmacy orders.
 */
export function getCachedPharmacyOrders(driverId: string): any[] {
  if (!driverId) return [];
  try {
    const raw = localStorage.getItem(getPharmacyOrdersKey(driverId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[OfflineStore] Failed to read cached pharmacy orders:', err);
    return [];
  }
}

/**
 * Retrieves the pending offline action queue for a driver.
 */
export function getOfflineQueue(driverId: string): OfflineQueueItem[] {
  if (!driverId) return [];
  try {
    const raw = localStorage.getItem(getQueueKey(driverId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[OfflineStore] Failed to read offline queue:', err);
    return [];
  }
}

/**
 * Enqueues an action to be executed when back online.
 * Deduplicates to prevent duplicate entries for identical actions.
 */
export function enqueueOfflineAction(
  item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'attempts'>
): OfflineQueueItem {
  const queue = getOfflineQueue(item.driverId);
  
  // Deduplication check: if an action of the same type on the same order with same payload exists, don't duplicate
  const existingIdx = queue.findIndex(
    (q) =>
      q.actionType === item.actionType &&
      q.orderId === item.orderId &&
      JSON.stringify(q.payload) === JSON.stringify(item.payload)
  );

  if (existingIdx >= 0) {
    return queue[existingIdx];
  }

  const newItem: OfflineQueueItem = {
    ...item,
    id: crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    attempts: 0,
  };

  queue.push(newItem);
  try {
    localStorage.setItem(getQueueKey(item.driverId), JSON.stringify(queue));
  } catch (err) {
    console.warn('[OfflineStore] Failed to save queued action:', err);
  }

  return newItem;
}

/**
 * Removes a processed action from the offline queue.
 */
export function removeOfflineAction(driverId: string, actionId: string): void {
  if (!driverId || !actionId) return;
  try {
    const queue = getOfflineQueue(driverId).filter((q) => q.id !== actionId);
    localStorage.setItem(getQueueKey(driverId), JSON.stringify(queue));
  } catch (err) {
    console.warn('[OfflineStore] Failed to remove offline action:', err);
  }
}

/**
 * Completely clears all cached data, queues, and documents for a driver upon logout.
 */
export function clearDriverOfflineCache(driverId: string): void {
  if (!driverId) return;
  try {
    localStorage.removeItem(getDeliveryOrdersKey(driverId));
    localStorage.removeItem(getPharmacyOrdersKey(driverId));
    localStorage.removeItem(getQueueKey(driverId));
    localStorage.removeItem(getLastSyncKey(driverId));
    localStorage.removeItem(`driver_docs_${driverId}`);
  } catch (err) {
    console.warn('[OfflineStore] Failed to clear driver cache:', err);
  }
}

/**
 * Processes and synchronizes queued offline actions with Supabase sequentially.
 */
export async function syncOfflineQueue(
  driverId: string,
  supabase: SupabaseClient | null,
  onProgress?: (pendingCount: number) => void
): Promise<{ synced: number; failed: number }> {
  if (!driverId || !supabase) return { synced: 0, failed: 0 };
  
  const queue = getOfflineQueue(driverId);
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of [...queue]) {
    try {
      let rpcName = '';
      let rpcParams: Record<string, any> = {};

      switch (item.actionType) {
        case 'delivery_start_shopping':
          rpcName = 'driver_start_shopping';
          rpcParams = { p_order_id: item.orderId };
          break;
        case 'delivery_update_item':
          rpcName = 'driver_update_order_item';
          rpcParams = item.payload;
          break;
        case 'delivery_complete':
          rpcName = 'complete_delivery_order';
          rpcParams = { p_order_id: item.orderId };
          break;
        case 'delivery_cancel_request':
          rpcName = 'request_order_cancellation';
          rpcParams = { p_order_id: item.orderId, p_reason: item.payload?.reason || '' };
          break;
        case 'pharmacy_start_shopping':
          rpcName = 'pharmacy_driver_start_shopping';
          rpcParams = { p_order_id: item.orderId };
          break;
        case 'pharmacy_update_item':
          rpcName = 'pharmacy_driver_update_item';
          rpcParams = item.payload;
          break;
        case 'pharmacy_finish_shopping':
          rpcName = 'pharmacy_driver_finish_shopping';
          rpcParams = {
            p_order_id: item.orderId,
            p_medicines_total: item.payload?.medicinesTotal || 0,
          };
          break;
        case 'pharmacy_complete_delivery':
          rpcName = 'pharmacy_driver_complete_delivery';
          rpcParams = { p_order_id: item.orderId };
          break;
        case 'pharmacy_mark_contacted':
          rpcName = 'pharmacy_driver_mark_customer_contacted';
          rpcParams = { p_order_id: item.orderId };
          break;
        case 'pharmacy_unable_to_fulfill':
          rpcName = 'pharmacy_driver_request_cancel';
          rpcParams = {
            p_order_id: item.orderId,
            p_reason: item.payload?.note || 'تعذر التنفيذ: جميع الأصناف غير متوفرة',
          };
          break;
        default:
          break;
      }

      if (rpcName) {
        const { error } = await supabase.rpc(rpcName, rpcParams);
        if (error) {
          // Check if error is due to already updated status (idempotent success)
          const msg = error.message.toLowerCase();
          if (
            msg.includes('already') ||
            msg.includes('لا يمكن تغيير') ||
            msg.includes('حالة أخرى') ||
            msg.includes('مكتمل')
          ) {
            console.log(`[OfflineStore] Action ${item.actionType} was already applied on server:`, error.message);
            removeOfflineAction(driverId, item.id);
            synced++;
          } else {
            console.warn(`[OfflineStore] Failed to sync action ${item.actionType}:`, error);
            item.attempts = (item.attempts || 0) + 1;
            item.lastError = error.message;
            failed++;
          }
        } else {
          removeOfflineAction(driverId, item.id);
          synced++;
        }
      } else {
        removeOfflineAction(driverId, item.id);
      }
    } catch (e: any) {
      console.warn(`[OfflineStore] Exception syncing action ${item.actionType}:`, e);
      failed++;
    }

    if (onProgress) {
      const remaining = getOfflineQueue(driverId).length;
      onProgress(remaining);
    }
  }

  return { synced, failed };
}
