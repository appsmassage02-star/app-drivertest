import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'talabat_driver_supabase_url';
const STORAGE_KEY_KEY = 'talabat_driver_supabase_anon_key';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  // Check env first, then localStorage
  const envUrl = ((import.meta as any).env?.VITE_SUPABASE_URL as string) || '';
  const envKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || '';

  const storedUrl =
    typeof window !== 'undefined'
      ? localStorage.getItem('talabat_driver_supabase_url') ||
        localStorage.getItem('talabat_albayt_supabase_url') ||
        ''
      : '';
  const storedKey =
    typeof window !== 'undefined'
      ? localStorage.getItem('talabat_driver_supabase_anon_key') ||
        localStorage.getItem('talabat_albayt_supabase_anon_key') ||
        ''
      : '';

  const url = storedUrl.trim() || envUrl.trim();
  const anonKey = storedKey.trim() || envKey.trim();

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseCredentials();
  return Boolean(url && anonKey && url.startsWith('http'));
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();

  if (!url || !anonKey || !url.startsWith('http')) {
    return null;
  }

  if (cachedClient && cachedUrl === url && cachedKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    cachedUrl = url;
    cachedKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return null;
  }
}

export function saveSupabaseCredentials(url: string, anonKey: string): boolean {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_URL, url.trim());
      localStorage.setItem(STORAGE_KEY_KEY, anonKey.trim());
      cachedClient = null; // force recreation
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error saving credentials to localStorage', err);
    return false;
  }
}

export function clearSupabaseCredentials(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_URL);
      localStorage.removeItem(STORAGE_KEY_KEY);
      cachedClient = null;
      cachedUrl = '';
      cachedKey = '';
    }
  } catch (err) {
    console.error('Error clearing credentials', err);
  }
}

export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  hasAuthSession: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'لم يتم إدخال عنوان Supabase ومفتاح العميل (Anon Key) بعد.',
      hasAuthSession: false,
    };
  }

  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) {
      return {
        success: false,
        message: `تعذر الاتصال بـ Supabase Auth: ${error.message}`,
        hasAuthSession: false,
      };
    }

    return {
      success: true,
      message: session
        ? 'تم الاتصال بنجاح وتوجد جلسة نشطة للمندوب'
        : 'تم الاتصال بخادم Supabase بنجاح (جاهز لتسجيل الدخول)',
      hasAuthSession: Boolean(session),
    };
  } catch (err: any) {
    return {
      success: false,
      message: `خطأ في الاتصال: ${err?.message || 'تعذر الوصول إلى الخادم'}`,
      hasAuthSession: false,
    };
  }
}

export function subscribeToRealtimeChanges(
  table: string,
  onPayload: (payload: any) => void,
  onStatusChange?: (status: string) => void,
  filter?: string
): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const channelName = `public:${table}${filter ? `:${filter}` : ''}:${Date.now()}`;
    const channelConfig: any = { event: '*', schema: 'public', table };
    if (filter) {
      channelConfig.filter = filter;
    }

    const channel: RealtimeChannel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        channelConfig,
        (payload) => {
          onPayload(payload);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to ${table}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Channel error on ${table}:`, err);
        }
        if (onStatusChange) {
          onStatusChange(status);
        }
      });

    return () => {
      try {
        client.removeChannel(channel);
      } catch (e) {
        console.warn(`Error removing realtime channel for ${table}:`, e);
      }
    };
  } catch (err) {
    console.warn(`Could not subscribe to realtime on ${table}:`, err);
    return null;
  }
}

