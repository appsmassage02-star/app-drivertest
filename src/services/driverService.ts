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

const DEFAULT_EMPTY_DRIVER_PROFILE: DriverProfile = {
  id: '',
  name: 'مندوب طلبات البيت',
  phone: '',
  email: '',
  status: 'pending_approval',
  availability: 'offline',
  vehicleType: 'دراجة نارية',
  vehiclePlate: '',
  vehicleModel: '',
  rating: 5.0,
  totalTrips: 0,
  completionRate: 100,
  walletBalance: 0,
  todayEarnings: 0,
  todayTrips: 0,
  workingZone: '',
  joinedDate: new Date().toISOString(),
};

class DriverService {
  private currentProfile: DriverProfile = { ...DEFAULT_EMPTY_DRIVER_PROFILE };
  private listeners: Array<(profile: DriverProfile) => void> = [];

  constructor() {
    // Initialized in clean, unauthenticated offline state
  }

  // Subscribe to profile changes
  public onProfileChange(listener: (profile: DriverProfile) => void): () => void {
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
  public async getDriverProfile(): Promise<DriverProfile> {
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

          if (!error && data) {
            const govName = data.governorate_name || data.governorate;
            const markazName = data.markaz_name || data.center;
            const zoneLabel = govName && markazName ? `${govName} - ${markazName}` : govName || markazName || '';

            this.currentProfile = {
              id: data.id,
              userId: data.user_id || user.id,
              name: data.full_name || name,
              phone: data.phone || phone,
              email: user.email || '',
              status: (data.status as DriverStatus) || 'pending_approval',
              availability: data.is_active ? 'online' : 'offline',
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
          } else {
            // No record or error -> reset to unapproved stub
            this.currentProfile = {
              ...DEFAULT_EMPTY_DRIVER_PROFILE,
              id: user.id,
              userId: user.id,
              email: user.email || '',
              status: 'pending_approval',
              availability: 'offline',
            };
          }
          this.notifyListeners();
          return this.currentProfile;
        }
      } catch (err) {
        console.warn('[DriverService] Error querying driver profile:', err);
      }
    }

    return this.currentProfile;
  }

  // Update driver availability (online / offline)
  public async updateAvailability(availability: DriverAvailability): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured() || !this.currentProfile.id) {
      return false;
    }

    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return false;

      const isOnline = availability === 'online';

      // Update delivery_drivers table using only real columns: is_active and updated_at
      const { error } = await client
        .from('delivery_drivers')
        .update({
          is_active: isOnline,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('id', this.currentProfile.id);

      if (error) {
        console.warn('[DriverService] Failed to update availability:', error.message);
        return false;
      }

      this.currentProfile.availability = availability;
      this.notifyListeners();
      return true;
    } catch (err) {
      console.warn('[DriverService] Availability update exception:', err);
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
    this.currentProfile = { ...DEFAULT_EMPTY_DRIVER_PROFILE };
    this.notifyListeners();
  }
}

export const driverService = new DriverService();
