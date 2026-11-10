import { DriverProfile, DriverStatus, DriverAvailability } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { ordersService } from './ordersService';

export interface DriverAuthResult {
  success: boolean;
  message: string;
  driver?: DriverProfile;
  isMock: boolean;
  requiresApproval?: boolean;
}

class DriverService {
  private currentProfile: DriverProfile | null = null;
  private listeners: Array<(profile: DriverProfile | null) => void> = [];

  constructor() {
    // Initialized with null profile
  }

  // Subscribe to profile changes
  public onProfileChange(listener: (profile: DriverProfile | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentProfile);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.currentProfile));
  }

  // Get current active profile strictly from Supabase delivery_drivers table by user_id
  public async getDriverProfile(): Promise<DriverProfile | null> {
    const client = getSupabaseClient();

    if (client && isSupabaseConfigured()) {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          const meta = user.user_metadata || {};
          const phone = user.phone || meta.phone || '';
          const name = meta.full_name || meta.name || user.email?.split('@')[0] || 'مندوب';

          // Query actual delivery_drivers table strictly by user_id
          const { data, error } = await client
            .from('delivery_drivers')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (error) {
            console.error('[DriverService] Database error querying driver profile:', error.message);
            this.currentProfile = null;
            this.notifyListeners();
            return null;
          }

          if (data) {
            // Strict rule: Validate status. If missing or invalid, treat as incomplete data; do NOT assume pending_approval
            const validStatuses: DriverStatus[] = ['pending_approval', 'approved', 'rejected'];
            if (!data.status || !validStatuses.includes(data.status as DriverStatus)) {
              console.warn('[DriverService] Driver record has missing or invalid status:', data.status);
              this.currentProfile = null;
              this.notifyListeners();
              return null;
            }

            const govName = data.governorate_name || data.governorate;
            const markazName = data.markaz_name || data.center;
            const zoneLabel = govName && markazName ? `${govName} - ${markazName}` : govName || markazName || '';

            this.currentProfile = {
              id: data.id,
              userId: data.user_id || user.id,
              name: data.full_name || name,
              phone: data.phone || phone,
              email: user.email || '',
              status: data.status as DriverStatus,
              availability: data.is_available_for_work ? 'online' : 'offline',
              is_available_for_work: Boolean(data.is_available_for_work),
              availability_last_seen_at: data.availability_last_seen_at || null,
              vehicleType: data.vehicle_type || 'دراجة نارية',
              vehiclePlate: data.vehicle_plate || '',
              vehicleModel: '',
              governorate_name: govName,
              governorate_code: data.governorate_code,
              markaz_name: markazName,
              governorate: govName,
              center: markazName,
              workingZone: zoneLabel,
              rejectionReason: data.rejection_reason || undefined,
              rating: 5.0,
              totalTrips: 0,
              completionRate: 100,
              walletBalance: 0,
              todayEarnings: 0,
              todayTrips: 0,
              joinedDate: data.created_at || new Date().toISOString(),
            };
            this.notifyListeners();
            return this.currentProfile;
          } else {
            // Strict rule: No record in delivery_drivers -> return null, do not create stub
            console.warn('[DriverService] No delivery_drivers record found for user_id:', user.id);
            this.currentProfile = null;
            this.notifyListeners();
            return null;
          }
        }
      } catch (err) {
        console.error('[DriverService] Error querying driver profile:', err);
        this.currentProfile = null;
        this.notifyListeners();
        return null;
      }
    }

    this.currentProfile = null;
    this.notifyListeners();
    return null;
  }

  // Update driver work availability via authoritative RPC set_driver_availability
  public async setWorkAvailability(isAvailable: boolean): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured() || !this.currentProfile?.id) {
      return false;
    }

    try {
      const { error } = await client.rpc('set_driver_availability', {
        p_is_available: isAvailable,
      });

      if (error) {
        console.warn('[DriverService] set_driver_availability RPC error:', error.message);
        return false;
      }

      const nowIso = new Date().toISOString();
      this.currentProfile.is_available_for_work = isAvailable;
      this.currentProfile.availability_last_seen_at = nowIso;
      this.currentProfile.availability = isAvailable ? 'online' : 'offline';
      this.notifyListeners();
      return true;
    } catch (err) {
      console.warn('[DriverService] set_driver_availability exception:', err);
      return false;
    }
  }

  // Real Supabase login with Email & Password
  public async loginWithSupabaseEmail(email: string, password: string): Promise<DriverAuthResult> {
    const client = getSupabaseClient();
    if (!client) {
      return {
        success: false,
        message: 'إعدادات Supabase غير متوفرة. يرجى إدخال الرابط والمفتاح في الإعدادات.',
        isMock: false,
      };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return {
          success: false,
          message: error.message || 'فشل تسجيل الدخول. يرجى التحقق من البريد وكلمة المرور.',
          isMock: false,
        };
      }

      if (data.user) {
        const profile = await this.getDriverProfile();
        if (!profile) {
          return {
            success: false,
            message: 'لم يتم العثور على سجل سائق مرتبط بحسابك في قاعدة البيانات.',
            isMock: false,
          };
        }

        if (profile.status === 'approved' && profile.availability === 'online') {
          ordersService.setDriverSession(profile.id, {
            governorate: profile.governorate,
            center: profile.center,
          });
        } else {
          ordersService.cleanup();
        }
        return {
          success: true,
          message: 'تم تسجيل الدخول بنجاح عبر Supabase',
          driver: profile,
          isMock: false,
          requiresApproval: profile.status !== 'approved',
        };
      }

      return {
        success: false,
        message: 'لم يتم العثور على مستخدم',
        isMock: false,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'حدث خطأ أثناء محاولة تسجيل الدخول',
        isMock: false,
      };
    }
  }

  // Logout (clean up subscriptions and session)
  public async logout(): Promise<void> {
    ordersService.cleanup();
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        console.warn('Supabase sign out error:', err);
      }
    }
    this.currentProfile = null;
    this.notifyListeners();
  }
}

export const driverService = new DriverService();
