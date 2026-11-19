import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return false;
  if (nLat === 0 && nLng === 0) return false;
  return true;
}

function parseBoolSetting(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1' || val === 1) return true;
  if (val === 'false' || val === '0' || val === 0) return false;
  return null;
}

function parseDurationSeconds(rawDuration: unknown): number | null {
  if (typeof rawDuration !== 'string') return null;
  const match = rawDuration.match(/^(\d+(?:\.\d+)?)s$/i);
  if (!match) return null;
  const secs = Math.round(Number(match[1]));
  return Number.isFinite(secs) && secs >= 0 ? secs : null;
}

function extractRoutingSettings(rows: any[]): {
  navigationEnabled: boolean | null;
  routingProvider: string | null;
  routingEngine: string | null;
} {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { navigationEnabled: null, routingProvider: null, routingEngine: null };
  }

  const first = rows[0];
  if (
    first &&
    ('navigation_enabled' in first || 'routing_provider' in first || 'routing_engine' in first)
  ) {
    return {
      navigationEnabled: parseBoolSetting(first.navigation_enabled),
      routingProvider: first.routing_provider ? String(first.routing_provider).trim() : null,
      routingEngine: first.routing_engine ? String(first.routing_engine).trim() : null,
    };
  }

  let navigationEnabled: boolean | null = null;
  let routingProvider: string | null = null;
  let routingEngine: string | null = null;

  for (const r of rows) {
    const k = String(r.key || r.setting_key || r.name || '').toLowerCase().trim();
    const v = r.value ?? r.setting_value ?? r.setting_val;
    if (k === 'navigation_enabled') navigationEnabled = parseBoolSetting(v);
    if (k === 'routing_provider') routingProvider = v ? String(v).trim() : null;
    if (k === 'routing_engine') routingEngine = v ? String(v).trim() : null;
  }

  return { navigationEnabled, routingProvider, routingEngine };
}

function isSupportedGoogleRouting(provider: string | null, engine: string | null): boolean {
  if (!provider) return false;
  const p = provider.toLowerCase().trim();
  const isGoogle =
    p === 'google' ||
    p === 'google_maps' ||
    p === 'google_routes' ||
    p === 'routes_api' ||
    p === 'gmaps';
  if (!isGoogle) return false;

  if (!engine) return true;
  const e = engine.toLowerCase().trim();
  return (
    e === 'routes_api' ||
    e === 'routes' ||
    e === 'google_routes' ||
    e === 'google_maps' ||
    e === 'directions' ||
    e === 'drive'
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        success: false,
        status: 'unavailable',
        is_road_distance: false,
        error: 'Method not allowed',
      },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'SERVER_CONFIG_MISSING',
          error: 'إعدادات Supabase غير مكتملة على الخادم.',
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'UNAUTHORIZED',
          error: 'رمز المصادقة مطلوب.',
        },
        401
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'INVALID_SESSION',
          error: 'جلسة المستخدم غير صالحة.',
        },
        401
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'INVALID_BODY',
          error: 'بيانات الطلب غير صالحة.',
        },
        400
      );
    }

    const {
      orderId,
      orderType,
      originLat,
      originLng,
      destinationLat,
      destinationLng,
    } = body as Record<string, unknown>;

    if (!isValidCoord(originLat, originLng) || !isValidCoord(destinationLat, destinationLng)) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'INVALID_COORDINATES',
          error: 'إحداثيات المسار غير صالحة أو غير مكتملة.',
        },
        400
      );
    }

    // 1. Verify driver exists, approved & active
    const { data: driver, error: driverErr } = await supabase
      .from('delivery_drivers')
      .select('id, status, is_active')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (driverErr || !driver || driver.status !== 'approved' || !driver.is_active) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'DRIVER_NOT_ELIGIBLE',
          error: 'حساب السائق غير معتمد أو غير نشط.',
        },
        403
      );
    }

    // 2. Verify order eligibility when orderId is supplied
    if (orderId) {
      const targetTable = orderType === 'pharmacy' ? 'pharmacy_orders' : 'delivery_orders';
      const { data: orderRow, error: orderErr } = await supabase
        .from(targetTable)
        .select('*')
        .eq('id', String(orderId))
        .maybeSingle();

      if (orderErr || !orderRow) {
        return jsonResponse(
          {
            success: false,
            status: 'unavailable',
            is_road_distance: false,
            code: 'ORDER_NOT_FOUND',
            error: 'الطلب غير موجود أو غير متاح للوصول.',
          },
          404
        );
      }

      const assignedId = orderRow.assigned_driver_id || orderRow.driver_id || null;
      if (assignedId && String(assignedId) !== String(driver.id)) {
        return jsonResponse(
          {
            success: false,
            status: 'unavailable',
            is_road_distance: false,
            code: 'ORDER_NOT_OWNED',
            error: 'الطلب مخصص لسائق آخر.',
          },
          403
        );
      }
    }

    // 3. Enforce central delivery_system_settings
    const { data: settingsRows, error: settingsErr } = await supabase
      .from('delivery_system_settings')
      .select('*')
      .limit(50);

    if (settingsErr || !Array.isArray(settingsRows) || settingsRows.length === 0) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'SETTINGS_UNAVAILABLE',
          error: 'تعذر التحقق من إعدادات التوجيه والملاحة المركزية.',
        },
        503
      );
    }

    const { navigationEnabled, routingProvider, routingEngine } = extractRoutingSettings(settingsRows);
    if (navigationEnabled !== true) {
      return jsonResponse(
        {
          success: false,
          status: 'disabled',
          is_road_distance: false,
          code: 'NAVIGATION_DISABLED',
          error: 'خدمة الملاحة والتوجيه متوقفة حاليًا من الإعدادات المركزية.',
        },
        403
      );
    }

    if (!isSupportedGoogleRouting(routingProvider, routingEngine)) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'UNSUPPORTED_ROUTING_CONFIG',
          error: `إعداد مزود أو محرك التوجيه غير مدعوم (${routingProvider || 'غير محدد'} / ${routingEngine || 'غير محدد'}).`,
        },
        422
      );
    }

    if (!googleMapsApiKey || googleMapsApiKey.trim() === '') {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'MAPS_SECRET_MISSING',
          error: 'مفتاح حساب مسافة الطريق غير مهيأ في أسرار الخادم (GOOGLE_MAPS_API_KEY).',
        },
        503
      );
    }

    // 4. Call Google Maps Platform Routes API v2 server-side
    const routesRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleMapsApiKey.trim(),
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: Number(originLat),
              longitude: Number(originLng),
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: Number(destinationLat),
              longitude: Number(destinationLng),
            },
          },
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        languageCode: 'ar',
        units: 'METRIC',
      }),
    });

    if (!routesRes.ok) {
      const errPayload = await routesRes.json().catch(() => ({}));
      const errCode =
        routesRes.status === 429 || errPayload?.error?.status === 'RESOURCE_EXHAUSTED'
          ? 'ROUTES_QUOTA_EXCEEDED'
          : 'ROUTES_API_ERROR';
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: errCode,
          error: 'تعذر حساب مسافة الطريق الفعلي عبر مزود الخرائط.',
        },
        502
      );
    }

    const routesData = await routesRes.json();
    const firstRoute = Array.isArray(routesData?.routes) ? routesData.routes[0] : null;
    const distanceMeters =
      firstRoute?.distanceMeters !== undefined && firstRoute?.distanceMeters !== null
        ? Number(firstRoute.distanceMeters)
        : null;
    const durationSeconds = parseDurationSeconds(firstRoute?.duration);

    if (distanceMeters === null || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
      return jsonResponse(
        {
          success: false,
          status: 'unavailable',
          is_road_distance: false,
          code: 'NO_ROUTE_FOUND',
          error: 'لم يتم العثور على مسار طريق صالح بين النقطتين.',
        },
        404
      );
    }

    return jsonResponse({
      success: true,
      status: 'road_distance',
      is_road_distance: true,
      distance_meters: Math.round(distanceMeters),
      distance_km: Number((distanceMeters / 1000).toFixed(2)),
      duration_seconds: durationSeconds,
      provider: routingProvider || 'google',
      engine: routingEngine || 'routes_api',
      calculated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        status: 'unavailable',
        is_road_distance: false,
        code: 'INTERNAL_ERROR',
        error: 'حدث خطأ أثناء حساب مسافة الطريق.',
      },
      500
    );
  }
});
