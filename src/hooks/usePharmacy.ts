import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  PharmacyOrder,
  PharmacyCompensationStatus,
  RealtimeConnectionStatus,
  RealtimeDiagnosticLog,
} from '../types/pharmacy';
import { pharmacyService, isPharmacyOrderMatchingDriverTerritory } from '../lib/pharmacyService';
import {
  saveCachedPharmacyOrders,
  getCachedPharmacyOrders,
  enqueueOfflineAction,
} from '../lib/offlineStore';
import type { DeliveryDriver } from '../App';

interface UsePharmacyOptions {
  currentDriver: DeliveryDriver | null;
  deliveryEnabled: boolean;
  onToast?: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export function usePharmacy({ currentDriver, deliveryEnabled, onToast }: UsePharmacyOptions) {
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [selectedPharmacyOrder, setSelectedPharmacyOrder] = useState<PharmacyOrder | null>(null);
  const [isPharmacyLoading, setIsPharmacyLoading] = useState<boolean>(false);
  const [isPharmacyActionLoading, setIsPharmacyActionLoading] = useState<boolean>(false);
  const [isPharmacyRealtimeActive, setIsPharmacyRealtimeActive] = useState<boolean>(false);

  // Realtime diagnostic state
  const [pharmacyRealtimeStatus, setPharmacyRealtimeStatus] =
    useState<RealtimeConnectionStatus>('CONNECTING');
  const [pharmacyRealtimeError, setPharmacyRealtimeError] = useState<string | null>(null);
  const [pharmacyLastEventTime, setPharmacyLastEventTime] = useState<string | null>(null);
  const [pharmacyLastEventDetails, setPharmacyLastEventDetails] = useState<string | null>(null);
  const [pharmacyEventsCount, setPharmacyEventsCount] = useState<number>(0);
  const [pharmacyRawEventsCount, setPharmacyRawEventsCount] = useState<number>(0);
  const [lastCompensatorySyncTime, setLastCompensatorySyncTime] = useState<string | null>(null);
  const [lastCompensatorySyncCount, setLastCompensatorySyncCount] = useState<number | null>(null);
  const [lastCompensatorySyncSource, setLastCompensatorySyncSource] = useState<string | null>(null);
  const [pharmacyDiagnosticLogs, setPharmacyDiagnosticLogs] = useState<RealtimeDiagnosticLog[]>([]);

  // Ref to always hold the freshest driver reference inside async callbacks and Realtime events
  const currentDriverRef = useRef<DeliveryDriver | null>(currentDriver);
  useEffect(() => {
    currentDriverRef.current = currentDriver;
  }, [currentDriver]);

  const addDiagnosticLog = useCallback(
    (entry: Omit<RealtimeDiagnosticLog, 'id' | 'timestamp'>) => {
      const newLog: RealtimeDiagnosticLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toLocaleTimeString('ar-EG', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        level: entry.level,
        message: typeof entry.message === 'string' ? entry.message : String(entry.message ?? ''),
        filterReason:
          typeof entry.filterReason === 'string'
            ? entry.filterReason
            : entry.filterReason
            ? String(entry.filterReason)
            : undefined,
        table:
          typeof entry.table === 'string'
            ? entry.table
            : entry.table
            ? String(entry.table)
            : undefined,
        eventType:
          typeof entry.eventType === 'string'
            ? entry.eventType
            : entry.eventType
            ? String(entry.eventType)
            : undefined,
        orderId:
          typeof entry.orderId === 'string'
            ? entry.orderId
            : entry.orderId
            ? String(entry.orderId)
            : undefined,
      };
      setPharmacyDiagnosticLogs((prev) => [newLog, ...prev.slice(0, 49)]);
    },
    []
  );

  const clearDiagnosticLogs = useCallback(() => {
    setPharmacyDiagnosticLogs([]);
  }, []);

  const notify = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'success') => {
      if (onToast) onToast(text, type);
    },
    [onToast]
  );

  const syncUpdatedOrderInState = useCallback((updated: PharmacyOrder) => {
    setPharmacyOrders((prev) => {
      const next = prev.some((o) => o.id === updated.id)
        ? prev.map((o) => (o.id === updated.id ? updated : o))
        : [updated, ...prev];
      if (currentDriverRef.current?.id) {
        saveCachedPharmacyOrders(currentDriverRef.current.id, next);
      }
      return next;
    });
    setSelectedPharmacyOrder((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  // Debounce and in-flight guards mirroring index.html scheduleEventRefetch
  const isPharmacySyncingRef = useRef<boolean>(false);
  const pendingPharmacySyncRef = useRef<boolean>(false);
  const debounceSyncTimerRef = useRef<any>(null);

  const executeLoadPharmacyOrders = useCallback(async (sourceLabel: string) => {
    if (isPharmacySyncingRef.current) {
      console.log('[usePharmacy] Order sync already in-flight, queueing next run.');
      pendingPharmacySyncRef.current = true;
      return;
    }
    isPharmacySyncingRef.current = true;
    setIsPharmacyLoading(true);
    const driver = currentDriverRef.current;
    try {
      if (navigator.onLine) {
        const data = await pharmacyService.getOrdersForDriver(driver);
        setPharmacyOrders((prev) => {
          // Detect if any new pending review order arrived in driver territory
          const prevIds = new Set(prev.map((o) => o.id));
          const newPendingOrders = data.filter((o) => !prevIds.has(o.id) && o.status === 'pending_review');
          if (newPendingOrders.length > 0) {
            notify('⚡ وصلت فاتورة صيدلية جديدة في نطاقك الجغرافي!', 'info');
            try {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioContextClass) {
                const audioCtx = new AudioContextClass();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
                osc.frequency.setValueAtTime(987.77, audioCtx.currentTime + 0.15); // B5
                gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.4);
              }
            } catch {
              // Audio context user gesture required in some browsers
            }
          }
          if (driver?.id) {
            saveCachedPharmacyOrders(driver.id, data);
          }
          return data;
        });

        setSelectedPharmacyOrder((prev) => {
          if (!prev) return null;
          const updated = data.find((o) => o.id === prev.id);
          return updated || null;
        });

        const timeFormatted = new Date().toLocaleTimeString('ar-EG', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setLastCompensatorySyncTime(timeFormatted);
        setLastCompensatorySyncCount(data.length);
        setLastCompensatorySyncSource(sourceLabel);

        addDiagnosticLog({
          level: 'info',
          message: `[مزامنة تعويضية عبر HTTP] تم جلب فواتير الصيدلية من السيرفر بنجاح (${data.length} فاتورة) [المصدر: ${sourceLabel}]`,
        });
      } else if (driver?.id) {
        const cached = getCachedPharmacyOrders(driver.id);
        setPharmacyOrders(cached);
        setSelectedPharmacyOrder((prev) => {
          if (!prev) return null;
          const updated = cached.find((o) => o.id === prev.id);
          return updated || prev;
        });
        addDiagnosticLog({
          level: 'warn',
          message: `[وضع أوفلاين] تم تحميل ${cached.length} فاتورة من التخزين المؤقت المحلي`,
        });
      }
    } catch (err: any) {
      console.warn('[usePharmacy] Error loading pharmacy orders:', err);
      addDiagnosticLog({
        level: 'error',
        message: `[خطأ استعلام HTTP] تعذر جلب فواتير الصيدلية من السيرفر: ${err?.message || 'خطأ غير معروف'}`,
      });
      if (driver?.id) {
        const cached = getCachedPharmacyOrders(driver.id);
        if (cached.length > 0) {
          setPharmacyOrders(cached);
        }
      }
    } finally {
      setIsPharmacyLoading(false);
      isPharmacySyncingRef.current = false;
      if (pendingPharmacySyncRef.current) {
        pendingPharmacySyncRef.current = false;
        setTimeout(() => {
          void executeLoadPharmacyOrders('مزامنة مؤجلة لأحداث وردت أثناء الجلب');
        }, 150);
      }
    }
  }, [addDiagnosticLog, notify]);

  const loadPharmacyOrders = useCallback((sourceLabelInput?: unknown) => {
    const sourceLabel =
      typeof sourceLabelInput === 'string' && sourceLabelInput.trim()
        ? sourceLabelInput.trim()
        : 'Realtime حدث / إعادة جلب';

    if (debounceSyncTimerRef.current) {
      clearTimeout(debounceSyncTimerRef.current);
    }
    // 250ms debounce coalescing related events, mirroring scheduleEventRefetch in index.html
    debounceSyncTimerRef.current = setTimeout(() => {
      void executeLoadPharmacyOrders(sourceLabel);
    }, 250);
  }, [executeLoadPharmacyOrders]);

  // Key to force Realtime reconnection on demand
  const [realtimeSessionKey, setRealtimeSessionKey] = useState<number>(1);
  const reconnectPharmacyRealtime = useCallback(() => {
    addDiagnosticLog({
      level: 'info',
      message: 'إعادة الاتصال يدويًا بقناة البث اللحظي لفواتير الصيدلية...',
    });
    setRealtimeSessionKey((k) => k + 1);
  }, [addDiagnosticLog]);

  // Realtime subscription lifecycle with status tracking, reconnection, and compensatory sync
  useEffect(() => {
    addDiagnosticLog({
      level: 'info',
      message: '[اتصال القناة] بدء تهيئة الاشتراك في بث فواتير الصيدلية (Realtime)...',
    });

    const unsubscribe = pharmacyService.subscribeToRealtime(
      // 1. Processed order payload listener
      (payload) => {
        const timeFormatted = new Date().toLocaleTimeString('ar-EG', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setPharmacyLastEventTime(timeFormatted);
        setPharmacyEventsCount((c) => c + 1);
        const detailsStr = `${payload.table || 'pharmacy_orders'} | ${payload.type} | #${(
          payload.orderId || 'unknown'
        ).slice(0, 8)}`;
        setPharmacyLastEventDetails(detailsStr);

        // If DELETE event, immediately purge from state and cache
        if (payload.type === 'ORDER_DELETED' && payload.orderId) {
          addDiagnosticLog({
            level: 'info',
            table: payload.table || 'pharmacy_orders',
            eventType: 'ORDER_DELETED',
            orderId: payload.orderId,
            passed: true,
            message: `[حذف من قاعدة البيانات] تم حذف الطلب #${payload.orderId.slice(0, 8)} من الواجهة والكاش`,
          });
          setPharmacyOrders((prev) => {
            const next = prev.filter((o) => o.id !== payload.orderId);
            if (currentDriverRef.current?.id) {
              saveCachedPharmacyOrders(currentDriverRef.current.id, next);
            }
            return next;
          });
          setSelectedPharmacyOrder((prev) => (prev?.id === payload.orderId ? null : prev));
        }

        // Schedule authoritative refetch mirroring index.html scheduleEventRefetch
        addDiagnosticLog({
          level: 'info',
          table: payload.table || 'pharmacy_orders',
          eventType: payload.type,
          orderId: payload.orderId || undefined,
          message: `⚡ [جدولة إعادة جلب] استُلم حدث (${payload.type}) من (${payload.table}) — تشغيل إعادة الجلب لبيانات السيرفر المعتمدة`,
        });
        loadPharmacyOrders(`Realtime: ${payload.table || 'pharmacy_orders'} (${payload.type})`);
      },
      // 2. Status change listener
      (status: string, err?: any) => {
        const normStatus = (status as RealtimeConnectionStatus) || 'DISCONNECTED';
        setPharmacyRealtimeStatus(normStatus);
        setIsPharmacyRealtimeActive(normStatus === 'SUBSCRIBED');

        if (err) {
          const errMsg =
            typeof err === 'string'
              ? err
              : err?.message
              ? String(err.message)
              : err?.error_description
              ? String(err.error_description)
              : 'خطأ غير محدد في اتصال القناة';
          setPharmacyRealtimeError(errMsg);
          addDiagnosticLog({
            level: 'error',
            message: `[خطأ اتصال القناة] (${normStatus}): ${errMsg}`,
            filterReason: normStatus,
          });
        } else {
          setPharmacyRealtimeError(null);
          addDiagnosticLog({
            level: normStatus === 'SUBSCRIBED' ? 'success' : 'info',
            message: `[اتصال القناة] تغيرت حالة القناة إلى: ${normStatus}`,
          });
        }

        // COMPENSATORY SYNC: Whenever channel becomes SUBSCRIBED, sync latest orders via HTTP
        if (normStatus === 'SUBSCRIBED') {
          addDiagnosticLog({
            level: 'info',
            message: '[اتصال القناة] القناة متصلة الآن (SUBSCRIBED) — بدء جلب تعويضي من السيرفر عبر HTTP لضمان عدم ضياع أي فواتير...',
          });
          void loadPharmacyOrders('اتصال القناة SUBSCRIBED');
        }
      },
      // 3. Raw event arrival listener (EXECUTED AT FIRST LINE BEFORE ANY FILTERS OR QUERIES)
      (table: string, eventType: string, recordId: string | null, _rawPayload: any) => {
        const timeFormatted = new Date().toLocaleTimeString('ar-EG', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setPharmacyLastEventTime(timeFormatted);
        setPharmacyRawEventsCount((c) => c + 1);
        setPharmacyLastEventDetails(`[RAW] ${table} | ${eventType} | #${(recordId || 'unknown').slice(0, 8)}`);

        addDiagnosticLog({
          level: 'info',
          table,
          eventType,
          orderId: recordId || undefined,
          message: `⚡ [وصول حدث قاعدة بيانات] استُلم حدث Realtime فعلي (${eventType}) من جدول (${table}) لمعرّف: #${(
            recordId || 'بدون معرّف'
          ).slice(0, 8)}`,
        });
      }
    );

    // Initial load
    void loadPharmacyOrders('تحميل أولي للمكون');

    return () => {
      if (debounceSyncTimerRef.current) {
        clearTimeout(debounceSyncTimerRef.current);
      }
      unsubscribe();
      setIsPharmacyRealtimeActive(false);
      setPharmacyRealtimeStatus('CLOSED');
      addDiagnosticLog({
        level: 'info',
        message: '[اتصال القناة] تم إغلاق اشتراك Realtime لفواتير الصيدلية.',
      });
    };
  }, [realtimeSessionKey, currentDriver?.id, loadPharmacyOrders, notify, addDiagnosticLog]);

  // Compensatory sync on network reconnect event
  useEffect(() => {
    const handleOnline = () => {
      addDiagnosticLog({
        level: 'info',
        message: 'تم رصد عودة اتصال الشبكة (online) — تنفيذ مزامنة تعويضية...',
      });
      void loadPharmacyOrders();
      setRealtimeSessionKey((k) => k + 1);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadPharmacyOrders, addDiagnosticLog]);


  // Accept Pharmacy Order
  const acceptPharmacyOrder = useCallback(
    async (order: PharmacyOrder) => {
      if (!deliveryEnabled) {
        notify('خدمة الدليفري معطلة حاليًا بقرار الإدارة العامة.', 'error');
        return;
      }
      if (!navigator.onLine) {
        notify('لا يمكن قبول طلب صيدلية جديد أثناء انقطاع الاتصال بالإنترنت. يرجى الانتظار حتى عودة الاتصال.', 'error');
        return;
      }
      if (!currentDriver) {
        notify('يرجى تسجيل الدخول كسائق أولاً.', 'error');
        return;
      }
      if (currentDriver.status !== 'approved' || !currentDriver.is_active) {
        notify('حسابك غير معتمد أو غير نشط حاليًا.', 'error');
        return;
      }

      setIsPharmacyActionLoading(true);
      try {
        const updated = await pharmacyService.acceptOrder(order.id, currentDriver);
        syncUpdatedOrderInState(updated);
        notify('تم قبول فاتورة الصيدلية بنجاح! يمكنك الآن بدء تجهيز الأدوية.', 'success');
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (
          msg.includes('already') ||
          msg.includes('assigned') ||
          msg.includes('تم إسناد') ||
          msg.includes('not pending') ||
          msg.includes('حالة أخرى')
        ) {
          notify('عذرًا، تم قبول هذا الطلب بالفعل من قبل سائق آخر.', 'error');
          setPharmacyOrders((prev) => prev.filter((o) => o.id !== order.id));
        } else {
          notify(err.message || 'تعذر قبول فاتورة الصيدلية.', 'error');
        }
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, deliveryEnabled, notify, syncUpdatedOrderInState]
  );

  // Start Shopping / Preparation
  const startPharmacyShopping = useCallback(
    async (order: PharmacyOrder) => {
      if (!currentDriver) return;
      setIsPharmacyActionLoading(true);
      try {
        if (!navigator.onLine) {
          enqueueOfflineAction({
            driverId: currentDriver.id,
            actionType: 'pharmacy_start_shopping',
            orderId: order.id,
            payload: {},
          });
          const updated: PharmacyOrder = {
            ...order,
            status: 'shopping',
            shopping_started_at: new Date().toISOString(),
          };
          syncUpdatedOrderInState(updated);
          notify('تم بدء مرحلة التجهيز محليًا (أوفلاين) وسيتم المزامنة تلقائيًا فور عودة الاتصال.', 'info');
          return;
        }
        const updated = await pharmacyService.startShopping(order.id, currentDriver.id);
        syncUpdatedOrderInState(updated);
        notify('بدأت مرحلة تجهيز فاتورة الصيدلية (shopping).', 'success');
      } catch (err: any) {
        notify(err.message || 'تعذر بدء تجهيز طلب الصيدلية.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Resolve Medicine Item (Purchased / Partial / Unavailable)
  const updateMedicineItem = useCallback(
    async (
      orderId: string,
      itemId: string,
      purchasedQuantity: number,
      shortageReason?: string | null
    ) => {
      setIsPharmacyActionLoading(true);
      try {
        if (!navigator.onLine && currentDriver) {
          enqueueOfflineAction({
            driverId: currentDriver.id,
            actionType: 'pharmacy_update_item',
            orderId,
            payload: {
              p_order_id: orderId,
              p_item_id: itemId,
              p_purchased_quantity: purchasedQuantity,
              p_shortage_reason: shortageReason || null,
            },
          });
          setPharmacyOrders((prev) =>
            prev.map((ord) => {
              if (ord.id !== orderId) return ord;
              const items = (ord.items || []).map((it) => {
                if (it.id !== itemId) return it;
                return {
                  ...it,
                  purchased_quantity: purchasedQuantity,
                  shortage_reason: shortageReason || null,
                  status: (purchasedQuantity > 0 ? (purchasedQuantity >= (it.quantity || 1) ? 'purchased' : 'partial') : 'unavailable') as any,
                };
              });
              return { ...ord, items };
            })
          );
          notify('تم حفظ حالة الصنف محليًا (أوفلاين) وسيتم المزامنة فور عودة الاتصال.', 'info');
          return;
        }
        const updated = await pharmacyService.updateItemResolution(orderId, itemId, {
          purchasedQuantity,
          shortageReason,
        });
        syncUpdatedOrderInState(updated);
        notify('تم تحديث حالة الصنف الدوائي بنجاح.', 'success');
      } catch (err: any) {
        notify(err.message || 'تعذر تحديث الصنف الدوائي.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Save Independent Note for a Prescription Image
  const saveImageDriverNote = useCallback(
    async (orderId: string, imageId: string, noteText: string) => {
      if (!currentDriver) return;
      setIsPharmacyActionLoading(true);
      try {
        const updated = await pharmacyService.savePrescriptionImageNote(
          orderId,
          imageId,
          currentDriver.id,
          noteText
        );
        syncUpdatedOrderInState(updated);
        notify('تم حفظ ملاحظة صورة الروشتة بنجاح.', 'success');
      } catch (err: any) {
        notify(err.message || 'تعذر حفظ ملاحظة الصورة.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Add internal visited pharmacy record
  const addVisitedPharmacy = useCallback(
    async (
      orderId: string,
      pharmacyName: string,
      addressOrNote?: string,
      pharmacyId?: string | null,
      stopStatus?: string
    ) => {
      if (!currentDriver) return;
      setIsPharmacyActionLoading(true);
      try {
        const updated = await pharmacyService.addDriverPharmacyVisit(
          orderId,
          currentDriver.id,
          pharmacyName,
          addressOrNote,
          pharmacyId,
          stopStatus
        );
        syncUpdatedOrderInState(updated);
        notify('تم تسجيل الصيدلية في سجل التجهيز الداخلي للسائق.', 'success');
      } catch (err: any) {
        notify(err.message || 'تعذر إضافة الصيدلية.', 'error');
        throw err;
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Remove internal visited pharmacy record
  const removeVisitedPharmacy = useCallback(
    async (orderId: string, visitId: string) => {
      setIsPharmacyActionLoading(true);
      try {
        const updated = await pharmacyService.removeDriverPharmacyVisit(orderId, visitId);
        syncUpdatedOrderInState(updated);
        notify('تم حذف الصيدلية من السجل الداخلي.', 'info');
      } catch (err: any) {
        notify(err.message || 'تعذر حذف الصيدلية.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [notify, syncUpdatedOrderInState]
  );

  // Suggest changing customer-specified pharmacy (without automatic change)
  const suggestPharmacyChange = useCallback(
    async (
      orderId: string,
      suggestedPharmacyName: string,
      reason: string,
      suggestedPharmacyId?: string | null
    ) => {
      if (!currentDriver) return;
      setIsPharmacyActionLoading(true);
      try {
        const updated = await pharmacyService.suggestPharmacyChange(
          orderId,
          currentDriver.id,
          suggestedPharmacyName,
          reason,
          suggestedPharmacyId
        );
        syncUpdatedOrderInState(updated);
        notify('تم إرسال اقتراح تغيير الصيدلية بنجاح دون تغيير الصيدلية الأصلية تلقائيًا.', 'info');
      } catch (err: any) {
        notify(err.message || 'تعذر إرسال اقتراح تغيير الصيدلية.', 'error');
        throw err;
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Save Receipt Camera Image
  const saveReceiptCameraImage = useCallback(
    async (orderId: string, receiptDataUrl: string | null) => {
      setIsPharmacyActionLoading(true);
      try {
        if (!navigator.onLine) {
          // Offline mode: cache receipt image locally on the order object
          setPharmacyOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    receipt_image_url: receiptDataUrl,
                    receipt_captured_at: new Date().toISOString(),
                  }
                : o
            )
          );
          setSelectedPharmacyOrder((prev) =>
            prev && prev.id === orderId
              ? {
                  ...prev,
                  receipt_image_url: receiptDataUrl,
                  receipt_captured_at: new Date().toISOString(),
                }
              : prev
          );
          notify(
            receiptDataUrl
              ? 'تم حفظ صورة فاتورة الشراء محليًا (وضع أوفلاين) وسيتم رفعها ومزامنتها فور عودة الاتصال.'
              : 'تمت إزالة صورة فاتورة الشراء محليًا.',
            'info'
          );
          return;
        }

        const updated = await pharmacyService.saveReceiptImage(orderId, receiptDataUrl);
        syncUpdatedOrderInState(updated);
        notify(
          receiptDataUrl
            ? 'تم التقاط وحفظ صورة فاتورة الشراء من الكاميرا بنجاح.'
            : 'تمت إزالة صورة فاتورة الشراء.',
          'success'
        );
      } catch (err: any) {
        notify(err.message || 'تعذر حفظ صورة الفاتورة.', 'error');
        throw err;
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [notify, syncUpdatedOrderInState]
  );

  // Save medicines total & delivery fee preview
  const saveOrderTotals = useCallback(
    async (orderId: string, medicinesTotal: number, deliveryFee: number) => {
      setIsPharmacyActionLoading(true);
      try {
        const updated = await pharmacyService.saveOrderTotals(orderId, medicinesTotal, deliveryFee);
        syncUpdatedOrderInState(updated);
        notify('تم تحديث إجمالي الأدوية ورسوم التوصيل.', 'success');
      } catch (err: any) {
        notify(err.message || 'تعذر حفظ الإجمالي.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [notify, syncUpdatedOrderInState]
  );

  // Complete Preparation -> ready_for_delivery
  const completePreparation = useCallback(
    async (
      orderId: string,
      medicinesTotal: number,
      deliveryFee: number,
      receiptImageUrl?: string | null
    ) => {
      setIsPharmacyActionLoading(true);
      try {
        if (!navigator.onLine && currentDriver) {
          enqueueOfflineAction({
            driverId: currentDriver.id,
            actionType: 'pharmacy_finish_shopping',
            orderId,
            payload: { medicinesTotal },
          });
          setPharmacyOrders((prev) =>
            prev.map((ord) => {
              if (ord.id !== orderId) return ord;
              return {
                ...ord,
                status: 'ready_for_delivery',
                ready_for_delivery_at: new Date().toISOString(),
                receipt_image_url: receiptImageUrl || ord.receipt_image_url,
                totals: {
                  medicines_total: medicinesTotal,
                  delivery_fee: deliveryFee,
                  final_total: Number((medicinesTotal + deliveryFee).toFixed(2)),
                },
              };
            })
          );
          notify('تم إنهاء التجهيز محليًا (أوفلاين) والطلب جاهز للتوصيل. ستتم المزامنة فور عودة الإنترنت.', 'info');
          return;
        }
        const updated = await pharmacyService.completePreparation(orderId, {
          medicinesTotal,
          deliveryFee,
          receiptImageUrl,
        });
        syncUpdatedOrderInState(updated);
        notify('اكتمل تجهيز فاتورة الصيدلية وأصبحت جاهزة للتوصيل (ready_for_delivery).', 'success');
      } catch (err: any) {
        notify(err.message || 'تعذر إتمام التجهيز.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Mark Unable To Fulfill (when all items unavailable)
  const markUnableToFulfill = useCallback(
    async (orderId: string, note?: string) => {
      if (!currentDriver) return;
      setIsPharmacyActionLoading(true);
      try {
        if (!navigator.onLine) {
          enqueueOfflineAction({
            driverId: currentDriver.id,
            actionType: 'pharmacy_unable_to_fulfill',
            orderId,
            payload: { note },
          });
          setPharmacyOrders((prev) =>
            prev.map((ord) => {
              if (ord.id !== orderId) return ord;
              return {
                ...ord,
                status: 'cancelled',
                cancellation_reason: note || 'تعذر التنفيذ: جميع الأصناف غير متوفرة',
              };
            })
          );
          notify('تم تسجيل تعذر التنفيذ محليًا (أوفلاين) وسيتم المزامنة فور عودة الاتصال.', 'info');
          return;
        }
        const updated = await pharmacyService.markUnableToFulfill(
          orderId,
          currentDriver.id,
          note
        );
        syncUpdatedOrderInState(updated);
        notify('تم تسجيل التواصل مع العميل وتحديث حالة الطلب لعدم توفر جميع الأصناف.', 'info');
      } catch (err: any) {
        notify(err.message || 'تعذر تحديث الحالة.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Complete Delivery -> completed
  const completePharmacyDelivery = useCallback(
    async (orderId: string) => {
      if (!currentDriver) return;
      setIsPharmacyActionLoading(true);
      try {
        if (!navigator.onLine) {
          enqueueOfflineAction({
            driverId: currentDriver.id,
            actionType: 'pharmacy_complete_delivery',
            orderId,
            payload: {},
          });
          setPharmacyOrders((prev) =>
            prev.map((ord) => {
              if (ord.id !== orderId) return ord;
              return {
                ...ord,
                status: 'completed',
                completed_at: new Date().toISOString(),
              };
            })
          );
          notify('تم تأكيد تسليم فاتورة الصيدلية محليًا (أوفلاين) وسيتم المزامنة فور عودة الاتصال.', 'info');
          return;
        }
        const updated = await pharmacyService.completeDelivery(orderId, currentDriver.id);
        syncUpdatedOrderInState(updated);
        notify('تم إتمام توصيل فاتورة الصيدلية للعميل بنجاح (completed).', 'success');
      } catch (err: any) {
        notify(err.message || 'تعذر إتمام التوصيل.', 'error');
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Request Cancellation (goes to admin review)
  const requestPharmacyCancellation = useCallback(
    async (orderId: string, reasonCategory: string, reasonText: string) => {
      if (!currentDriver) return;
      setIsPharmacyActionLoading(true);
      try {
        const updated = await pharmacyService.requestCancellation(
          orderId,
          currentDriver.id,
          reasonCategory,
          reasonText
        );
        syncUpdatedOrderInState(updated);
        notify('تم إرسال طلب الإلغاء للمراجعة الإدارية بنجاح.', 'info');
        return true;
      } catch (err: any) {
        notify(err.message || 'تعذر إرسال طلب الإلغاء.', 'error');
        return false;
      } finally {
        setIsPharmacyActionLoading(false);
      }
    },
    [currentDriver, notify, syncUpdatedOrderInState]
  );

  // Receive System Compensation Update (Hook ready for external system status)
  const updateSystemCompensationStatus = useCallback(
    async (
      orderId: string,
      status: PharmacyCompensationStatus,
      amount?: number | null,
      note?: string | null
    ) => {
      const updated = await pharmacyService.receiveSystemCompensationUpdate(
        orderId,
        status,
        amount,
        note
      );
      syncUpdatedOrderInState(updated);
    },
    [syncUpdatedOrderInState]
  );

  // Counts by tab matching the regular orders tabs
  const pharmacyCounts = useMemo(() => {
    const pending = pharmacyOrders.filter(
      (o) =>
        o.status === 'pending_review' &&
        isPharmacyOrderMatchingDriverTerritory(o, currentDriver)
    ).length;

    const accepted = pharmacyOrders.filter(
      (o) =>
        (o.status === 'accepted' ||
          o.status === 'shopping' ||
          o.status === 'ready_for_delivery') &&
        o.assigned_driver_id === currentDriver?.id
    ).length;

    const completed = pharmacyOrders.filter((o) => o.status === 'completed').length;

    const cancelled = pharmacyOrders.filter(
      (o) =>
        o.status === 'cancelled' ||
        o.status === 'unable_to_fulfill' ||
        Boolean(o.cancellation_request)
    ).length;

    return {
      pending,
      accepted,
      completed,
      cancelled,
      total: pharmacyOrders.length,
    };
  }, [pharmacyOrders, currentDriver]);

  return {
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
    updateSystemCompensationStatus,
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
  };
}
