import { SupabaseClient } from '@supabase/supabase-js';

export type DriverAssetType = 'header' | 'splash';

export interface AppAssetUploadRecord {
  id: string;
  app_key: string;
  asset_type: DriverAssetType | string;
  storage_path: string;
  public_url: string | null;
  mime_type: string | null;
  file_size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  created_at?: string;
  uploaded_by?: string | null;
}

export interface AppAssetRecord {
  id: string;
  app_key: string;
  asset_type: DriverAssetType | string;
  is_active: boolean;
  version: number | string;
  upload_id: string | null;
  updated_at?: string;
  updated_by?: string | null;
  upload?: AppAssetUploadRecord | AppAssetUploadRecord[] | null;
}

export interface CachedAssetData {
  appKey: 'driver';
  assetType: DriverAssetType;
  version: number | string;
  uploadId: string | null;
  storagePath: string;
  publicUrl: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  savedAt: string;
}

export interface CentralAssetSyncStatus {
  assetType: DriverAssetType;
  status: 'idle' | 'checking' | 'up_to_date' | 'updated' | 'staged_for_next_launch' | 'rls_restricted_or_empty' | 'error';
  activeVersion: number | string | null;
  stagedVersion?: number | string | null;
  source: 'local_cache' | 'remote_updated' | 'default_fallback';
  message: string;
  timestamp: string;
}

const APP_KEY = 'driver';
const BUCKET_NAME = 'app-assets';
export const DEFAULT_FALLBACK_ASSET = '/logo.png';

// LocalStorage Keys (Atomic Verified Active Keys + Staged Next-Launch Keys + Temp Staging Keys)
const STORAGE_KEYS = {
  header: {
    active: 'talabat_driver_central_asset_header_active_v1',
    temp: 'talabat_driver_central_asset_header_temp_v1',
  },
  splash: {
    active: 'talabat_driver_central_asset_splash_active_v1',
    staged: 'talabat_driver_central_asset_splash_staged_v1',
    temp: 'talabat_driver_central_asset_splash_temp_v1',
  },
} as const;

let splashSessionPromoted = false;
let sessionSplashImageSrc: string | null = null;

/**
 * Validates that a parsed object is a complete, non-corrupted CachedAssetData record.
 */
function isValidCachedAssetData(obj: unknown): obj is CachedAssetData {
  if (!obj || typeof obj !== 'object') return false;
  const record = obj as Record<string, unknown>;
  return (
    record.appKey === 'driver' &&
    (record.assetType === 'header' || record.assetType === 'splash') &&
    record.version !== undefined &&
    record.version !== null &&
    typeof record.dataUrl === 'string' &&
    record.dataUrl.startsWith('data:image/') &&
    record.dataUrl.length > 64
  );
}

/**
 * Safely reads and validates a cached asset record from localStorage.
 */
function readCachedRecord(storageKey: string): CachedAssetData | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidCachedAssetData(parsed)) {
      return parsed;
    }
    console.warn(`[CentralAssets] Invalid cached record structure in ${storageKey}; ignoring.`);
    return null;
  } catch (err) {
    console.warn(`[CentralAssets] Failed to read cached record from ${storageKey}:`, err);
    return null;
  }
}

/**
 * Returns the synchronous local header image immediately on app start without waiting for network.
 * Falls back to '/logo.png' if no verified local cache exists yet.
 */
export function getInitialHeaderAssetSrc(): string {
  const cached = readCachedRecord(STORAGE_KEYS.header.active);
  if (cached?.dataUrl) {
    return cached.dataUrl;
  }
  return DEFAULT_FALLBACK_ASSET;
}

/**
 * Returns the cached metadata for an asset type if available.
 */
export function getCachedAssetMetadata(assetType: DriverAssetType): CachedAssetData | null {
  return readCachedRecord(STORAGE_KEYS[assetType].active);
}

/**
 * Promotes any previously staged splash image into the active slot ONCE at the very start of a new app launch,
 * then locks the splash image source for the entire runtime session so the splash screen never reloads mid-run.
 */
export function getInitialSplashAssetSrc(): string {
  if (sessionSplashImageSrc) {
    return sessionSplashImageSrc;
  }

  if (!splashSessionPromoted) {
    splashSessionPromoted = true;
    try {
      const staged = readCachedRecord(STORAGE_KEYS.splash.staged);
      if (staged) {
        localStorage.setItem(STORAGE_KEYS.splash.active, JSON.stringify(staged));
        localStorage.removeItem(STORAGE_KEYS.splash.staged);
        console.info(
          `[CentralAssets] Promoted staged driver/splash (version=${staged.version}) to active for this launch.`
        );
      }
    } catch (err) {
      console.warn('[CentralAssets] Could not promote staged splash image:', err);
    }
  }

  const active = readCachedRecord(STORAGE_KEYS.splash.active);
  sessionSplashImageSrc = active?.dataUrl || DEFAULT_FALLBACK_ASSET;
  return sessionSplashImageSrc;
}

/**
 * Resolves the canonical public URL for an upload record using `public_url` or `storage_path` in bucket `app-assets`.
 */
function resolveAssetPublicUrl(
  supabase: SupabaseClient,
  upload: AppAssetUploadRecord
): string | null {
  if (upload.public_url && (upload.public_url.startsWith('http://') || upload.public_url.startsWith('https://'))) {
    return upload.public_url;
  }

  if (upload.storage_path) {
    // Strip leading bucket name if storage_path accidentally includes "app-assets/"
    const normalizedPath = upload.storage_path.replace(/^\/?app-assets\//, '').replace(/^\/+/, '');
    if (!normalizedPath) return null;
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(normalizedPath);
    return data?.publicUrl || null;
  }

  return null;
}

/**
 * Converts a Blob into a Base64 Data URL string.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not produce a valid image Data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Verifies that a Data URL is a genuine, decodable image with non-zero dimensions in the browser/WebView.
 */
function verifyImageDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error('Image decoding timed out after 10s.'));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeoutId);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        reject(new Error('Decoded image has zero dimensions.'));
      }
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Image failed to decode (corrupted or unsupported image data).'));
    };

    img.src = dataUrl;
  });
}

/**
 * Downloads an image from its URL (with cache-busting version query param),
 * verifies HTTP status, MIME type, non-empty size, converts to Data URL, and verifies decodability.
 */
async function downloadAndVerifyAssetImage(
  publicUrl: string,
  version: number | string
): Promise<{ dataUrl: string; mimeType: string; width: number; height: number }> {
  const separator = publicUrl.includes('?') ? '&' : '?';
  const versionedUrl = `${publicUrl}${separator}v=${encodeURIComponent(String(version))}`;

  const response = await fetch(versionedUrl, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${response.statusText}) while downloading asset from ${publicUrl}`);
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error('Downloaded asset file is empty (0 bytes).');
  }

  const mimeType = blob.type || 'image/png';
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Invalid MIME type "${mimeType}" — expected an image.`);
  }

  const dataUrl = await blobToDataUrl(blob);
  const { width, height } = await verifyImageDataUrl(dataUrl);

  return { dataUrl, mimeType, width, height };
}

/**
 * Queries `app_assets` and `app_asset_uploads` for a specific driver asset (`header` or `splash`),
 * strictly filtering by `app_key = 'driver'` and `asset_type = assetType` and `is_active = true`.
 */
async function fetchRemoteDriverAssetRecord(
  supabase: SupabaseClient,
  assetType: DriverAssetType
): Promise<{
  asset: AppAssetRecord | null;
  upload: AppAssetUploadRecord | null;
  rlsOrEmptyNote?: string;
}> {
  // Query app_assets with embedded app_asset_uploads via upload_id foreign key
  const { data: assetData, error: assetErr } = await supabase
    .from('app_assets')
    .select(
      'id, app_key, asset_type, is_active, version, upload_id, updated_at, updated_by, upload:app_asset_uploads(id, app_key, asset_type, storage_path, public_url, mime_type, file_size_bytes, width, height, created_at, uploaded_by)'
    )
    .eq('app_key', APP_KEY)
    .eq('asset_type', assetType)
    .eq('is_active', true)
    .maybeSingle();

  if (assetErr) {
    throw new Error(`خطأ أثناء قراءة جدول app_assets (${assetType}): [${assetErr.code || 'ERR'}] ${assetErr.message}`);
  }

  if (!assetData) {
    return {
      asset: null,
      upload: null,
      rlsOrEmptyNote:
        `لم يرجع الاستعلام سجلًا نشطًا لـ (${APP_KEY}/${assetType}) من جدول app_assets (قد يكون غير مرفوع بعد أو محجوبًا بسياسات صلاحيات القراءة RLS قبل تسجيل الدخول).`,
    };
  }

  const typedAsset = assetData as unknown as AppAssetRecord;

  // Extract embedded upload record or fetch directly by upload_id if not embedded
  let resolvedUpload: AppAssetUploadRecord | null = null;
  if (typedAsset.upload) {
    resolvedUpload = Array.isArray(typedAsset.upload) ? typedAsset.upload[0] || null : typedAsset.upload;
  }

  if (!resolvedUpload && typedAsset.upload_id) {
    const { data: directUpload, error: uploadErr } = await supabase
      .from('app_asset_uploads')
      .select('id, app_key, asset_type, storage_path, public_url, mime_type, file_size_bytes, width, height, created_at, uploaded_by')
      .eq('id', typedAsset.upload_id)
      .eq('app_key', APP_KEY)
      .eq('asset_type', assetType)
      .maybeSingle();

    if (uploadErr) {
      throw new Error(
        `خطأ أثناء قراءة جدول app_asset_uploads (${assetType}): [${uploadErr.code || 'ERR'}] ${uploadErr.message}`
      );
    }
    resolvedUpload = (directUpload as AppAssetUploadRecord) || null;
  }

  if (!resolvedUpload) {
    return {
      asset: typedAsset,
      upload: null,
      rlsOrEmptyNote:
        `تم العثور على سجل (${APP_KEY}/${assetType}) في app_assets (الإصدار ${typedAsset.version}) ولكن تعذر قراءة ملف الرفع المرتبط من app_asset_uploads (قد يكون محجوبًا بصلاحيات RLS أو غير مربوط).`,
    };
  }

  // Strict guard: never mix admin/home assets with driver assets
  if (resolvedUpload.app_key !== APP_KEY || resolvedUpload.asset_type !== assetType) {
    throw new Error(
      `عدم تطابق مفاتيح الصورة: السجل المرتبط ينتمي إلى (${resolvedUpload.app_key}/${resolvedUpload.asset_type}) بدلًا من (${APP_KEY}/${assetType}).`
    );
  }

  return { asset: typedAsset, upload: resolvedUpload };
}

/**
 * Synchronizes a single driver asset ('header' or 'splash') in the background:
 * 1. Reads remote metadata from `app_assets` & `app_asset_uploads`.
 * 2. Compares `version` and `upload_id` against the local verified copy (and staged copy for splash).
 * 3. If changed, downloads to temporary storage slot, verifies image decodability, and atomically swaps.
 *    - For 'header': replaces active cache and invokes `onHeaderUpdated(newDataUrl)` immediately.
 *    - For 'splash': writes to staged cache so it takes effect on the NEXT app launch without reloading the current splash.
 */
export async function syncSingleDriverAsset(
  supabase: SupabaseClient,
  assetType: DriverAssetType,
  onHeaderUpdated?: (newSrc: string, record: CachedAssetData) => void
): Promise<CentralAssetSyncStatus> {
  const nowIso = new Date().toISOString();
  const currentActive = readCachedRecord(STORAGE_KEYS[assetType].active);
  const currentStaged = assetType === 'splash' ? readCachedRecord(STORAGE_KEYS.splash.staged) : null;

  try {
    const { asset, upload, rlsOrEmptyNote } = await fetchRemoteDriverAssetRecord(supabase, assetType);

    if (!asset || !upload) {
      console.info(`[CentralAssets] ${APP_KEY}/${assetType}: ${rlsOrEmptyNote}`);
      return {
        assetType,
        status: 'rls_restricted_or_empty',
        activeVersion: currentActive?.version ?? null,
        stagedVersion: currentStaged?.version ?? null,
        source: currentActive ? 'local_cache' : 'default_fallback',
        message: rlsOrEmptyNote || 'لا يوجد سجل متاح حاليًا؛ تم الاحتفاظ بالصورة المحلية السليمة.',
        timestamp: nowIso,
      };
    }

    const remoteVersion = asset.version;
    const remoteUploadId = upload.id;

    // For splash: check if either active or staged already has this exact version & uploadId
    if (assetType === 'splash') {
      if (
        currentStaged &&
        String(currentStaged.version) === String(remoteVersion) &&
        currentStaged.uploadId === remoteUploadId
      ) {
        return {
          assetType,
          status: 'staged_for_next_launch',
          activeVersion: currentActive?.version ?? null,
          stagedVersion: currentStaged.version,
          source: currentActive ? 'local_cache' : 'default_fallback',
          message: `الإصدار الجديد (${remoteVersion}) محفوظ ومجهز مسبقًا للتشغيل القادم.`,
          timestamp: nowIso,
        };
      }

      if (
        !currentStaged &&
        currentActive &&
        String(currentActive.version) === String(remoteVersion) &&
        currentActive.uploadId === remoteUploadId
      ) {
        return {
          assetType,
          status: 'up_to_date',
          activeVersion: currentActive.version,
          stagedVersion: null,
          source: 'local_cache',
          message: `صورة البداية محدثة ومطابقة للإصدار المركزي (${remoteVersion}).`,
          timestamp: nowIso,
        };
      }
    } else {
      // For header: check if active already matches remote version & uploadId
      if (
        currentActive &&
        String(currentActive.version) === String(remoteVersion) &&
        currentActive.uploadId === remoteUploadId
      ) {
        return {
          assetType,
          status: 'up_to_date',
          activeVersion: currentActive.version,
          source: 'local_cache',
          message: `صورة الهيدر محدثة ومطابقة للإصدار المركزي (${remoteVersion}).`,
          timestamp: nowIso,
        };
      }
    }

    const publicUrl = resolveAssetPublicUrl(supabase, upload);
    if (!publicUrl) {
      throw new Error(`تعذر استخراج رابط صالح للصورة (${APP_KEY}/${assetType}) من السجل النشط.`);
    }

    console.info(
      `[CentralAssets] Downloading new version (${remoteVersion}) for ${APP_KEY}/${assetType} from ${publicUrl}...`
    );

    // Download & strictly verify decodable image
    const verifiedImage = await downloadAndVerifyAssetImage(publicUrl, remoteVersion);

    const newRecord: CachedAssetData = {
      appKey: APP_KEY,
      assetType,
      version: remoteVersion,
      uploadId: remoteUploadId,
      storagePath: upload.storage_path,
      publicUrl,
      dataUrl: verifiedImage.dataUrl,
      mimeType: verifiedImage.mimeType,
      width: verifiedImage.width,
      height: verifiedImage.height,
      savedAt: nowIso,
    };

    // Step 1: Write to temporary slot and verify read-back integrity (Atomic staging)
    const tempKey = STORAGE_KEYS[assetType].temp;
    localStorage.setItem(tempKey, JSON.stringify(newRecord));
    const verifiedTempReadback = readCachedRecord(tempKey);
    if (!verifiedTempReadback) {
      localStorage.removeItem(tempKey);
      throw new Error('فشل التحقق من سلامة النسخة المؤقتة بعد كتابتها في التخزين المحلي.');
    }

    // Step 2: Atomic replacement of target slot
    if (assetType === 'header') {
      localStorage.setItem(STORAGE_KEYS.header.active, JSON.stringify(verifiedTempReadback));
      localStorage.removeItem(tempKey);
      console.info(
        `[CentralAssets] Successfully updated driver/header to version=${remoteVersion} (${verifiedImage.width}x${verifiedImage.height}).`
      );
      if (onHeaderUpdated) {
        onHeaderUpdated(verifiedTempReadback.dataUrl, verifiedTempReadback);
      }
      return {
        assetType: 'header',
        status: 'updated',
        activeVersion: remoteVersion,
        source: 'remote_updated',
        message: `تم تنزيل والتحقق من صورة الهيدر الجديدة (الإصدار ${remoteVersion}) وعرضها فورًا.`,
        timestamp: nowIso,
      };
    } else {
      // Splash: if we had NO active local splash at all before, save to staged (and active metadata for future launches),
      // but NEVER mutate sessionSplashImageSrc during the current run.
      localStorage.setItem(STORAGE_KEYS.splash.staged, JSON.stringify(verifiedTempReadback));
      localStorage.removeItem(tempKey);
      console.info(
        `[CentralAssets] Successfully staged driver/splash version=${remoteVersion} (${verifiedImage.width}x${verifiedImage.height}) for next launch.`
      );
      return {
        assetType: 'splash',
        status: 'staged_for_next_launch',
        activeVersion: currentActive?.version ?? null,
        stagedVersion: remoteVersion,
        source: currentActive ? 'local_cache' : 'default_fallback',
        message: `تم تنزيل والتحقق من صورة البداية الجديدة (الإصدار ${remoteVersion}) وحفظها للتشغيل التالي.`,
        timestamp: nowIso,
      };
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn(
      `[CentralAssets] Keeping existing valid local image for ${APP_KEY}/${assetType} after sync error:`,
      errMsg
    );
    // Clean up any leftover temp key without touching active/staged slots
    try {
      localStorage.removeItem(STORAGE_KEYS[assetType].temp);
    } catch {
      // Ignore cleanup error
    }
    return {
      assetType,
      status: 'error',
      activeVersion: currentActive?.version ?? null,
      stagedVersion: currentStaged?.version ?? null,
      source: currentActive ? 'local_cache' : 'default_fallback',
      message: `تعذر تحديث الصورة (${errMsg}) — تم الاحتفاظ بآخر نسخة محلية سليمة.`,
      timestamp: nowIso,
    };
  }
}

/**
 * Synchronizes both `driver/header` and `driver/splash` concurrently in the background
 * without blocking app startup or authentication.
 */
export async function syncAllDriverCentralAssets(
  supabase: SupabaseClient | null,
  onHeaderUpdated?: (newSrc: string, record: CachedAssetData) => void
): Promise<{
  header: CentralAssetSyncStatus;
  splash: CentralAssetSyncStatus;
} | null> {
  if (!supabase) return null;

  const [headerStatus, splashStatus] = await Promise.all([
    syncSingleDriverAsset(supabase, 'header', onHeaderUpdated),
    syncSingleDriverAsset(supabase, 'splash'),
  ]);

  return {
    header: headerStatus,
    splash: splashStatus,
  };
}
