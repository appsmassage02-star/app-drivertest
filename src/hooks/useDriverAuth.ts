import { useState, useEffect, useCallback, useRef } from 'react';
import { User, SupabaseClient } from '@supabase/supabase-js';
import { DeliveryDriver, DriverAppState, DriverStatus } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from '../services/supabaseClient';
import { ordersService } from '../services/ordersService';
import { clearDriverOfflineCache } from '../lib/offlineStore';

export interface UseDriverAuthReturn {
  supabaseUser: User | null;
  currentDriver: DeliveryDriver | null;
  authStatus: DriverAppState;
  authError: string | null;
  isAuthSubmitting: boolean;
  isSyncingDriver: boolean;
  splashMessage: string;
  splashStep: number;
  loginWithEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkDriverStatus: () => Promise<void>;
  saveDriverProfile: (fields: Partial<DeliveryDriver>) => Promise<{ success: boolean; error?: string; updatedDriver?: DeliveryDriver }>;
  setDriverAfterRegistration: (driver: DeliveryDriver, user: User) => void;
  clearAuthError: () => void;
  retryFetchDriver: () => Promise<void>;
}

export function useDriverAuth(): UseDriverAuthReturn {
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [currentDriver, setCurrentDriver] = useState<DeliveryDriver | null>(null);
  const [authStatus, setAuthStatus] = useState<DriverAppState>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState<boolean>(false);
  const [isSyncingDriver, setIsSyncingDriver] = useState<boolean>(false);
  const [splashMessage, setSplashMessage] = useState<string>('التحقق من جلسة المستخدم...');
  const [splashStep, setSplashStep] = useState<number>(1);

  // Sequence ref to prevent race conditions from concurrent or rapid auth events
  const fetchSeqRef = useRef<number>(0);
  const currentDriverRef = useRef<DeliveryDriver | null>(null);
  currentDriverRef.current = currentDriver;

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // Determine state strictly from database row values
  const deriveDriverState = (driver: DeliveryDriver): DriverAppState => {
    if (driver.status === 'pending_approval') {
      return 'pending_approval';
    }
    if (driver.status === 'rejected') {
      return 'rejected';
    }
    if (!driver.is_active) {
      return 'disabled';
    }
    if (driver.status === 'approved' && driver.is_active) {
      return 'approved_active';
    }
    // Any other unexpected combination fails safely to disabled
    return 'disabled';
  };

  /**
   * Authoritative fetch of driver profile strictly by user_id linked to auth.users.
   * Never defaults to 'approved' or 'is_active = true'.
   * Distinguishes connection failures from missing records.
   */
  const fetchDriverRecord = useCallback(
    async (
      userId: string,
      client?: SupabaseClient | null
    ): Promise<{ driver: DeliveryDriver | null; state: DriverAppState; error?: string }> => {
      const supabase = client || getSupabaseClient();
      if (!supabase) {
        return { driver: null, state: 'error', error: 'إعدادات الاتصال بـ Supabase غير مهيأة' };
      }

      const currentSeq = ++fetchSeqRef.current;

      try {
        const { data, error } = await supabase
          .from('delivery_drivers')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        // Check if a subsequent request took precedence
        if (currentSeq !== fetchSeqRef.current) {
          return { driver: null, state: 'loading' };
        }

        if (error) {
          console.warn('[DriverAuth] Error querying delivery_drivers by user_id:', error.message);
          return {
            driver: null,
            state: 'error',
            error: `تعذر جلب ملف السائق من الخادم: ${error.message}`,
          };
        }

        if (!data) {
          // No record exists in delivery_drivers for this user_id
          return { driver: null, state: 'no_record' };
        }

        const typedDriver = data as DeliveryDriver;
        const state = deriveDriverState(typedDriver);
        return { driver: typedDriver, state };
      } catch (err: any) {
        if (currentSeq !== fetchSeqRef.current) {
          return { driver: null, state: 'loading' };
        }
        console.error('[DriverAuth] Network/exception querying delivery_drivers:', err);
        return {
          driver: null,
          state: 'error',
          error: err?.message || 'فشل الاتصال بالخادم أثناء التحقق من بيانات السائق',
        };
      }
    },
    []
  );

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    if (!supabase || !isSupabaseConfigured()) {
      setAuthStatus('no_session');
      return;
    }

    async function init() {
      setSplashMessage('التحقق من جلسة المصادقة الحالية...');
      setSplashStep(1);

      try {
        const { data, error: sessionErr } = await supabase!.auth.getSession();
        if (!isMounted) return;

        if (sessionErr) {
          console.warn('[DriverAuth] Session check returned error:', sessionErr.message);
          setAuthError(`تعذر التحقق من جلسة المصادقة: ${sessionErr.message}`);
          setAuthStatus('error');
          return;
        }

        const session = data?.session;
        if (!session?.user) {
          // Strictly set no_session only when Supabase confirms no active session exists
          setSupabaseUser(null);
          setCurrentDriver(null);
          setAuthStatus('no_session');
          return;
        }

        // Active session found: inspect driver record
        setSupabaseUser(session.user);
        setSplashMessage('جلب بيانات السائق وفحص الاعتماد الإداري...');
        setSplashStep(2);

        const result = await fetchDriverRecord(session.user.id, supabase);
        if (!isMounted) return;

        if (result.state === 'error') {
          setAuthError(result.error || 'تعذر الاتصال بقاعدة البيانات');
          setAuthStatus('error');
          return;
        }

        setCurrentDriver(result.driver);
        setAuthStatus(result.state);

        // Bind driver session with ordersService only if approved and active
        if (result.driver && result.state === 'approved_active') {
          ordersService.setDriverSession(result.driver.id, {
            governorate: result.driver.governorate_name || undefined,
            center: result.driver.markaz_name || undefined,
          });
        } else {
          ordersService.cleanup();
        }

        setSplashStep(3);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[DriverAuth] Unhandled exception during init:', err);
        setAuthError(err?.message || 'حدث خطأ غير متوقع أثناء استعادة الجلسة');
        setAuthStatus('error');
      }
    }

    init();

    // Listen to Supabase Auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      console.log(`[DriverAuth] onAuthStateChange event: ${event}`);

      if (event === 'SIGNED_OUT') {
        // Discard any in-flight fetches
        fetchSeqRef.current++;
        ordersService.cleanup();
        if (currentDriverRef.current?.id) {
          clearDriverOfflineCache(currentDriverRef.current.id);
        }
        setSupabaseUser(null);
        setCurrentDriver(null);
        setAuthError(null);
        setAuthStatus('no_session');
        setIsAuthSubmitting(false);
        setIsSyncingDriver(false);
        return;
      }

      if (event === 'SIGNED_IN') {
        if (session?.user) {
          // If already loaded for the exact same user, avoid redundant refetch
          if (supabaseUser?.id === session.user.id && currentDriverRef.current) {
            return;
          }
          setSupabaseUser(session.user);
          const result = await fetchDriverRecord(session.user.id, supabase);
          if (!isMounted) return;

          if (result.state === 'error') {
            setAuthError(result.error || 'تعذر جلب ملف السائق');
            setAuthStatus('error');
            return;
          }

          setCurrentDriver(result.driver);
          setAuthStatus(result.state);

          if (result.driver && result.state === 'approved_active') {
            ordersService.setDriverSession(result.driver.id, {
              governorate: result.driver.governorate_name || undefined,
              center: result.driver.markaz_name || undefined,
            });
          } else {
            ordersService.cleanup();
          }
        }
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchDriverRecord]);

  /**
   * Real email/password login via Supabase Auth.
   * Catches invalid credentials immediately without freezing on splash.
   */
  const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);
    setIsAuthSubmitting(true);

    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConfigured()) {
      const msg = 'إعدادات ربط Supabase غير متوفرة. يرجى ضبط الرابط والمفتاح أولاً.';
      setAuthError(msg);
      setIsAuthSubmitting(false);
      return { success: false, error: msg };
    }

    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) {
        const msg = 'يرجى إدخال البريد الإلكتروني وكلمة المرور.';
        setAuthError(msg);
        setIsAuthSubmitting(false);
        return { success: false, error: msg };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        let localizedMsg = error.message;
        if (error.message.includes('Invalid login credentials')) {
          localizedMsg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        } else if (error.message.includes('Email not confirmed')) {
          localizedMsg = 'البريد الإلكتروني غير مؤكد بعد. يرجى تفعيل حسابك من بريدك الإلكتروني.';
        }
        setAuthError(localizedMsg);
        setIsAuthSubmitting(false);
        return { success: false, error: localizedMsg };
      }

      if (!data.user) {
        const msg = 'لم يتم العثور على بيانات المستخدم بعد تسجيل الدخول.';
        setAuthError(msg);
        setIsAuthSubmitting(false);
        return { success: false, error: msg };
      }

      setSupabaseUser(data.user);

      // Fetch driver record strictly linked via user_id
      const result = await fetchDriverRecord(data.user.id, supabase);
      if (result.state === 'error') {
        setAuthError(result.error || 'تعذر تحميل بيانات السائق من قاعدة البيانات.');
        setAuthStatus('error');
        setIsAuthSubmitting(false);
        return { success: false, error: result.error };
      }

      setCurrentDriver(result.driver);
      setAuthStatus(result.state);

      if (result.driver && result.state === 'approved_active') {
        ordersService.setDriverSession(result.driver.id, {
          governorate: result.driver.governorate_name || undefined,
          center: result.driver.markaz_name || undefined,
        });
      } else {
        ordersService.cleanup();
      }

      setIsAuthSubmitting(false);
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول.';
      setAuthError(msg);
      setIsAuthSubmitting(false);
      return { success: false, error: msg };
    }
  };

  /**
   * Complete clean logout:
   * Cleans up subscriptions, cancels sync timers, clears driver cache, signs out of Supabase.
   */
  const logout = async (): Promise<void> => {
    fetchSeqRef.current++;
    ordersService.cleanup();

    if (currentDriverRef.current?.id) {
      clearDriverOfflineCache(currentDriverRef.current.id);
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[DriverAuth] Sign out warning:', err);
      }
    }

    setSupabaseUser(null);
    setCurrentDriver(null);
    setAuthError(null);
    setAuthStatus('no_session');
    setIsAuthSubmitting(false);
    setIsSyncingDriver(false);
  };

  /**
   * Retry recovering session and fetching driver record (e.g. after connection/server error).
   * - Does NOT wipe the session on transient failure.
   * - Differentiates genuine absence of session from connection/server errors.
   * - Prevents concurrent in-flight retries.
   */
  const retryFetchDriver = async (): Promise<void> => {
    if (isSyncingDriver) return; // Prevent concurrent retries
    setIsSyncingDriver(true);
    setAuthError(null);

    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConfigured()) {
      setAuthError('إعدادات الاتصال بـ Supabase غير مهيأة.');
      setAuthStatus('error');
      setIsSyncingDriver(false);
      return;
    }

    try {
      // 1. Re-verify session from unified client
      const { data, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        setAuthError(`تعذر استعادة الجلسة بسبب خطأ في الاتصال: ${sessionErr.message}`);
        setAuthStatus('error');
        setIsSyncingDriver(false);
        return;
      }

      const session = data?.session;
      if (!session?.user) {
        // Confirmed that no session exists
        setSupabaseUser(null);
        setCurrentDriver(null);
        setAuthStatus('no_session');
        setIsSyncingDriver(false);
        return;
      }

      // 2. Session exists, fetch driver record strictly linked via user_id
      setSupabaseUser(session.user);
      const result = await fetchDriverRecord(session.user.id, supabase);

      if (result.state === 'error') {
        setAuthError(result.error || 'فشل الاتصال بقاعدة البيانات.');
        setAuthStatus('error');
        setIsSyncingDriver(false);
        return;
      }

      setCurrentDriver(result.driver);
      setAuthStatus(result.state);

      if (result.driver && result.state === 'approved_active') {
        ordersService.setDriverSession(result.driver.id, {
          governorate: result.driver.governorate_name || undefined,
          center: result.driver.markaz_name || undefined,
        });
      } else {
        ordersService.cleanup();
      }
    } catch (err: any) {
      setAuthError(err?.message || 'حدث خطأ في الاتصال أثناء إعادة المحاولة.');
      setAuthStatus('error');
    } finally {
      setIsSyncingDriver(false);
    }
  };

  /**
   * Check approval status explicitly without page reload.
   */
  const checkDriverStatus = async (): Promise<void> => {
    await retryFetchDriver();
  };

  /**
   * Safe driver profile update:
   * - Only updates allowed fields (phone, vehicle_type, vehicle_plate, governorate, markaz, notes)
   * - Never allows modifying approval fields or national_id/full_name
   * - Mandatory business rule: status reverts to 'pending_approval' and is_active = false
   * - Updates local state with actual server response via .select().single()
   */
  const saveDriverProfile = async (
    fields: Partial<DeliveryDriver>
  ): Promise<{ success: boolean; error?: string; updatedDriver?: DeliveryDriver }> => {
    if (!currentDriver || !supabaseUser) {
      return { success: false, error: 'لا توجد جلسة سائق صالحة للتعديل' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'الاتصال بقاعدة البيانات غير متوفر' };
    }

    // Validation
    const cleanPhone = (fields.phone || '').trim();
    if (!cleanPhone) {
      return { success: false, error: 'رقم الهاتف مطلوب وإلزامي' };
    }

    // Payload limited strictly to permissible columns in the delivery_drivers schema
    const updatePayload = {
      phone: cleanPhone,
      governorate_name: fields.governorate_name ? fields.governorate_name.trim() : null,
      governorate_code: fields.governorate_code ? fields.governorate_code.trim() : null,
      markaz_name: fields.markaz_name ? fields.markaz_name.trim() : null,
      vehicle_type: fields.vehicle_type ? fields.vehicle_type.trim() : null,
      vehicle_plate: fields.vehicle_plate ? fields.vehicle_plate.trim() : null,
      notes: fields.notes ? fields.notes.trim() : null,
      // Mandatory system rule: re-triggers approval cycle
      status: 'pending_approval' as DriverStatus,
      is_active: false,
      updated_at: new Date().toISOString(),
    };

    try {
      // Strictly scope update to current authenticated user_id AND driver id
      const { data, error } = await supabase
        .from('delivery_drivers')
        .update(updatePayload)
        .eq('id', currentDriver.id)
        .eq('user_id', supabaseUser.id)
        .select()
        .single();

      if (error) {
        console.error('[DriverAuth] Profile update error:', error.message);
        return { success: false, error: `فشل تحديث البيانات: ${error.message}` };
      }

      if (!data) {
        return { success: false, error: 'لم يُرجع الخادم السجل المحدث' };
      }

      const updated = data as DeliveryDriver;
      setCurrentDriver(updated);
      setAuthStatus('pending_approval');

      // Since driver is now pending and inactive, clear active order listening
      ordersService.cleanup();

      return { success: true, updatedDriver: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'حدث خطأ أثناء حفظ التعديلات' };
    }
  };

  /**
   * Set driver state directly after successful registration in App.tsx.
   */
  const setDriverAfterRegistration = useCallback((driver: DeliveryDriver, user: User) => {
    setSupabaseUser(user);
    setCurrentDriver(driver);
    setAuthStatus(deriveDriverState(driver));
    setAuthError(null);
  }, []);

  return {
    supabaseUser,
    currentDriver,
    authStatus,
    authError,
    isAuthSubmitting,
    isSyncingDriver,
    splashMessage,
    splashStep,
    loginWithEmail,
    logout,
    checkDriverStatus,
    saveDriverProfile,
    setDriverAfterRegistration,
    clearAuthError,
    retryFetchDriver,
  };
}
