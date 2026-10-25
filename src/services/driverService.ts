import { DriverProfile, DriverStatus, DriverAvailability } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { mockDriverProfile, mockPendingDriverProfile } from './mockData';
import { ordersService } from './ordersService';

const CURRENT_DEMO_DRIVER_KEY = 'talabat_driver_demo_type';

export interface DriverAuthResult {
  success: boolean;
  message: string;
  driver?: DriverProfile;
  isMock: boolean;
  requiresApproval?: boolean;
}

class DriverService {
  private currentProfile: DriverProfile = { ...mockDriverProfile };
  private listeners: Array<(profile: DriverProfile) => void> = [];

  constructor() {
    // Check saved demo preference or initial state
    if (typeof window !== 'undefined') {
      const savedType = localStorage.getItem(CURRENT_DEMO_DRIVER_KEY);
      if (savedType === 'pending') {
        this.currentProfile = { ...mockPendingDriverProfile };
      }
    }
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

  // Switch demo profile for easy testing between approved and pending states
  public switchDemoDriver(type: 'approved' | 'pending'): DriverProfile {
    if (type === 'pending') {
      this.currentProfile = { ...mockPendingDriverProfile };
      localStorage.setItem(CURRENT_DEMO_DRIVER_KEY, 'pending');
    } else {
      this.currentProfile = { ...mockDriverProfile };
      localStorage.setItem(CURRENT_DEMO_DRIVER_KEY, 'approved');
    }
    this.notifyListeners();
    return this.currentProfile;
  }

  // Get current active profile
  public async getDriverProfile(): Promise<DriverProfile> {
    const client = getSupabaseClient();

    // If Supabase is configured and has an active session, attempt to inspect driver
    if (client && isSupabaseConfigured()) {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          // Check if driver profile exists in potential tables without assuming unverified schemas
          // First check user metadata
          const meta = user.user_metadata || {};
          const phone = user.phone || meta.phone || this.currentProfile.phone;
          const name = meta.full_name || meta.name || user.email?.split('@')[0] || 'مندوب طلبات البيت';
          const status = (meta.driver_status || meta.status || 'approved') as DriverStatus;

          // Query actual delivery_drivers table
          let remoteProfile: Partial<DriverProfile> = {};
          try {
            // First try by user_id
            let { data, error } = await client
              .from('delivery_drivers')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle();

            // If not found by user_id, try by id
            if (!data && !error) {
              const resById = await client
                .from('delivery_drivers')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
              data = resById.data;
              error = resById.error;
            }

            if (!error && data) {
              const govName = data.governorate_name || data.governorate;
              const markazName = data.markaz_name || data.center;
              const zoneLabel = govName && markazName ? `${govName} - ${markazName}` : govName || markazName || this.currentProfile.workingZone;

              remoteProfile = {
                id: data.id || user.id,
                userId: data.user_id || user.id,
                name: data.full_name || name,
                phone: data.phone || phone,
                status: (data.status as DriverStatus) || status,
                vehicleType: data.vehicle_type || this.currentProfile.vehicleType,
                vehiclePlate: data.vehicle_plate || this.currentProfile.vehiclePlate,
                vehicleModel: this.currentProfile.vehicleModel,
                governorate_name: govName,
                governorate_code: data.governorate_code,
                markaz_name: markazName,
                governorate: govName,
                center: markazName,
                workingZone: zoneLabel,
                rejectionReason: data.rejection_reason || undefined,
                rating: 5.0,
                totalTrips: 0,
                walletBalance: 0,
              };
            }
          } catch (err) {
            console.warn('[DriverService] Error querying delivery_drivers:', err);
          }

          this.currentProfile = {
            ...this.currentProfile,
            id: remoteProfile.id || user.id,
            userId: user.id,
            email: user.email || this.currentProfile.email,
            name: remoteProfile.name || name,
            phone: remoteProfile.phone || phone,
            status: remoteProfile.status || status,
            ...remoteProfile,
          };
          this.notifyListeners();
          return this.currentProfile;
        }
      } catch (err) {
        console.warn('Could not fetch Supabase driver profile, falling back to local state:', err);
      }
    }

    return this.currentProfile;
  }

  // Update driver availability (online / offline)
  public async updateAvailability(availability: DriverAvailability): Promise<boolean> {
    this.currentProfile.availability = availability;
    this.notifyListeners();

    const client = getSupabaseClient();
    if (client && isSupabaseConfigured()) {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          const isOnline = availability === 'online';
          // 1. Persist in auth user_metadata safely
          try {
            await client.auth.updateUser({
              data: { is_online: isOnline, availability },
            });
          } catch {
            // ignore
          }

          // 2. Update delivery_drivers table using only real columns: is_active and updated_at
          try {
            await client
              .from('delivery_drivers')
              .update({
                is_active: isOnline,
                updated_at: new Date().toISOString(),
              })
              .or(`user_id.eq.${user.id},id.eq.${this.currentProfile.id}`);
          } catch (tableErr) {
            console.warn('delivery_drivers column update skipped:', tableErr);
          }
        }
      } catch (err) {
        console.warn('delivery_drivers status update error:', err);
      }
    }

    return true;
  }

  // Real Supabase login with Email & Password
  public async loginWithSupabaseEmail(email: string, password: string): Promise<DriverAuthResult> {
    const client = getSupabaseClient();
    if (!client) {
      return {
        success: false,
        message: 'إعدادات Supabase غير متوفرة. يرجى إدخال الرابط والمفتاح في الإعدادات أو استخدام الوضع التجريبي.',
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
        ordersService.setDriverSession(profile.id, {
          governorate: profile.governorate,
          center: profile.center,
        });
        return {
          success: true,
          message: 'تم تسجيل الدخول بنجاح عبر Supabase',
          driver: profile,
          isMock: false,
          requiresApproval: profile.status === 'pending',
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

  // Demo Login (One-click fast testing)
  public async loginWithDemo(type: 'approved' | 'pending' = 'approved'): Promise<DriverAuthResult> {
    // Simulate brief network delay
    await new Promise((res) => setTimeout(res, 400));
    const profile = this.switchDemoDriver(type);
    ordersService.setDriverSession(profile.id, {
      governorate: profile.governorate,
      center: profile.center,
    });
    return {
      success: true,
      message: type === 'approved' ? 'تم الدخول ككابتن معتمد (بيانات تجريبية)' : 'تم الدخول بحساب قيد الاعتماد (بيانات تجريبية)',
      driver: profile,
      isMock: true,
      requiresApproval: profile.status === 'pending',
    };
  }

  // Logout (Requirement 6: clean up subscriptions and intervals)
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
    // Reset to default mock
    this.currentProfile = { ...mockDriverProfile, availability: 'offline' };
    this.notifyListeners();
  }
}

export const driverService = new DriverService();
