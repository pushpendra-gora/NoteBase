import { SupabaseClient } from '@supabase/supabase-js';
import { isValidGoogleScriptUrl } from './serverAuth';

export interface ServerDriveEntry {
  id: string;
  name: string;
  webhookUrl: string;
  folderId?: string;
  source: 'env' | 'database';
}

export interface PublicDriveSummary {
  id: string;
  name: string;
  source: 'env' | 'database';
  hasCustomFolder: boolean;
  isActive: boolean;
}

export interface MultiDriveState {
  drives: ServerDriveEntry[];
  activeDrive: ServerDriveEntry | null;
  activeDriveId: string | null;
  nextEnvSlotNumber: number;
  schemaNeedsMigration: boolean;
}

export function extractGoogleDriveFileId(rawUrl?: string | null): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();

  const gdriveMatch = trimmed.match(/^gdrive:\/\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch?.[1]) return gdriveMatch[1];

  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch?.[1]) return fileDMatch[1];

  if (trimmed.includes('drive.google.com') || trimmed.includes('drive.usercontent.google.com')) {
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch?.[1]) return idMatch[1];
  }

  return null;
}

export function normalizeValidWebhook(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || !isValidGoogleScriptUrl(trimmed) || trimmed.includes('/edit') || trimmed.endsWith('/dev')) {
    return null;
  }
  return trimmed;
}

/**
 * Discovers all Google Drives configured via Vercel/server environment variables.
 * Supports primary unnumbered vars (`GOOGLE_DRIVE_WEBHOOK_URL`) and unlimited numbered slots (`GOOGLE_DRIVE_2_WEBHOOK_URL`, `GOOGLE_DRIVE_3_WEBHOOK_URL`, ...).
 */
export function getConfiguredEnvDrives(): { drives: ServerDriveEntry[]; maxSlotNumber: number } {
  const drives: ServerDriveEntry[] = [];
  let maxSlotNumber = 1;

  // Slot 1 (Primary): unnumbered or _1_ env vars
  const primaryWebhook = normalizeValidWebhook(
    process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL ||
      process.env.GDRIVE_WEBHOOK_URL ||
      process.env.GOOGLE_DRIVE_1_WEBHOOK_URL
  );
  if (primaryWebhook) {
    const primaryFolder = (
      process.env.GOOGLE_DRIVE_FOLDER_ID ||
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID ||
      process.env.GOOGLE_DRIVE_1_FOLDER_ID ||
      ''
    ).trim();
    drives.push({
      id: 'drive_1',
      name: (process.env.GOOGLE_DRIVE_1_NAME || 'Drive 1 (Primary)').trim(),
      webhookUrl: primaryWebhook,
      folderId: primaryFolder || undefined,
      source: 'env',
    });
  }

  // Additional numbered drives: GOOGLE_DRIVE_2_WEBHOOK_URL, GOOGLE_DRIVE_3_WEBHOOK_URL, ...
  const numberedSlots: number[] = [];
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^GOOGLE_DRIVE_(\d+)_WEBHOOK_URL$/);
    if (match?.[1]) {
      const slot = parseInt(match[1], 10);
      if (Number.isFinite(slot) && slot >= 2) {
        numberedSlots.push(slot);
      }
    }
  }
  numberedSlots.sort((a, b) => a - b);

  for (const slot of numberedSlots) {
    if (slot > maxSlotNumber) maxSlotNumber = slot;
    const url = normalizeValidWebhook(process.env[`GOOGLE_DRIVE_${slot}_WEBHOOK_URL`]);
    if (!url) continue;
    const folderId = (process.env[`GOOGLE_DRIVE_${slot}_FOLDER_ID`] || '').trim();
    const customName = (process.env[`GOOGLE_DRIVE_${slot}_NAME`] || `Drive ${slot}`).trim();
    drives.push({
      id: `drive_${slot}`,
      name: customName,
      webhookUrl: url,
      folderId: folderId || undefined,
      source: 'env',
    });
  }

  return { drives, maxSlotNumber };
}

/**
 * Loads full multi-drive state strictly on the server (Vercel Env Drives + Database Drives + Active Drive ID).
 */
export async function loadMultiDriveState(
  client?: SupabaseClient | null,
  adminId?: string
): Promise<MultiDriveState> {
  const targetAdminId = (adminId || process.env.ADMIN_DEFAULT_ID || 'admin').trim();
  const { drives: envDrives, maxSlotNumber } = getConfiguredEnvDrives();
  const drives: ServerDriveEntry[] = [...envDrives];
  let activeDriveId: string | null = null;
  let schemaNeedsMigration = false;

  if (client) {
    try {
      const { data, error } = await client
        .from('admin_credentials')
        .select('active_drive_id, gdrive_drives, gdrive_webhook, gdrive_folder_id')
        .eq('id', targetAdminId)
        .limit(1)
        .maybeSingle();

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('active_drive_id') || msg.includes('gdrive_drives') || error.code === '42703') {
          schemaNeedsMigration = true;
        }
        // Fallback read of legacy columns only
        const legacy = await client
          .from('admin_credentials')
          .select('gdrive_webhook, gdrive_folder_id')
          .eq('id', targetAdminId)
          .limit(1)
          .maybeSingle();
        const legacyUrl = normalizeValidWebhook(legacy.data?.gdrive_webhook);
        if (legacyUrl && !drives.some((d) => d.id === 'drive_1' || d.webhookUrl === legacyUrl)) {
          drives.unshift({
            id: 'drive_1',
            name: 'Drive 1 (Primary)',
            webhookUrl: legacyUrl,
            folderId: legacy.data?.gdrive_folder_id || undefined,
            source: 'database',
          });
        }
      } else if (data) {
        if (typeof data.active_drive_id === 'string' && data.active_drive_id.trim()) {
          activeDriveId = data.active_drive_id.trim();
        }
        const legacyUrl = normalizeValidWebhook(data.gdrive_webhook);
        if (legacyUrl && !drives.some((d) => d.id === 'drive_1' || d.webhookUrl === legacyUrl)) {
          drives.unshift({
            id: 'drive_1',
            name: 'Drive 1 (Primary)',
            webhookUrl: legacyUrl,
            folderId: data.gdrive_folder_id || undefined,
            source: 'database',
          });
        }

        if (Array.isArray(data.gdrive_drives)) {
          for (const item of data.gdrive_drives) {
            if (!item || typeof item !== 'object') continue;
            const validUrl = normalizeValidWebhook(item.webhookUrl);
            if (!validUrl) continue;
            const id = String(item.id || '').trim();
            if (!id || drives.some((d) => d.id === id)) continue;
            drives.push({
              id,
              name: String(item.name || 'Additional Drive').trim(),
              webhookUrl: validUrl,
              folderId: item.folderId ? String(item.folderId).trim() : undefined,
              source: 'database',
            });
          }
        }
      }
    } catch {
      // Optional lookup error ignored safely
    }
  }

  const activeDrive =
    (activeDriveId ? drives.find((d) => d.id === activeDriveId) : null) ||
    drives[0] ||
    null;

  return {
    drives,
    activeDrive,
    activeDriveId: activeDrive?.id || null,
    nextEnvSlotNumber: Math.max(maxSlotNumber + 1, drives.length + 1),
    schemaNeedsMigration,
  };
}

export async function resolveGoogleDriveWebhookCandidates(
  client?: SupabaseClient | null,
  fallbackScriptUrl?: string | null
): Promise<string[]> {
  const candidates: string[] = [];
  const add = (url?: string | null) => {
    const valid = normalizeValidWebhook(url);
    if (valid && !candidates.includes(valid)) {
      candidates.push(valid);
    }
  };

  add(fallbackScriptUrl);

  const state = await loadMultiDriveState(client);
  if (state.activeDrive) {
    add(state.activeDrive.webhookUrl);
  }
  for (const d of state.drives) {
    add(d.webhookUrl);
  }

  return candidates;
}

export async function resolveGoogleDriveWebhookUrl(
  client?: SupabaseClient | null,
  fallbackScriptUrl?: string | null
): Promise<string | null> {
  const list = await resolveGoogleDriveWebhookCandidates(client, fallbackScriptUrl);
  return list[0] || null;
}

export async function deleteFileFromGoogleDriveServer(
  fileUrlOrPath?: string | null,
  client?: SupabaseClient | null,
  customWebhookUrl?: string | null
): Promise<{
  attempted: boolean;
  deleted: boolean;
  needsScriptUpdate?: boolean;
  error?: string;
}> {
  const fileId = extractGoogleDriveFileId(fileUrlOrPath);
  if (!fileId) {
    return { attempted: false, deleted: false };
  }

  const webhookUrls = await resolveGoogleDriveWebhookCandidates(client, customWebhookUrl);
  if (webhookUrls.length === 0) {
    return {
      attempted: false,
      deleted: false,
      error: 'Google Drive Web App URL is not configured.',
    };
  }

  let lastError = 'Google Drive delete did not succeed.';
  let lastNeedsUpdate = false;

  for (const webhookUrl of webhookUrls) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', fileId }),
        redirect: 'follow',
      });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {}

      if (parsed?.success && (parsed.deleted || parsed.deletedFileId)) {
        return { attempted: true, deleted: true };
      }

      const errMsg = parsed?.error ? String(parsed.error) : text.slice(0, 150);
      lastNeedsUpdate =
        errMsg.includes('base64') ||
        errMsg.includes('Invalid argument') ||
        text.includes('<!DOCTYPE') ||
        text.includes('<html');
      lastError = errMsg || lastError;
    } catch (err: any) {
      lastError = err?.message || 'Network error calling Google Drive Web App.';
    }
  }

  return {
    attempted: true,
    deleted: false,
    needsScriptUpdate: lastNeedsUpdate,
    error: lastError,
  };
}
