import { SupabaseClient } from '@supabase/supabase-js';
import { isValidGoogleScriptUrl } from './serverAuth';

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

function normalizeValidWebhook(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || !isValidGoogleScriptUrl(trimmed) || trimmed.includes('/edit') || trimmed.endsWith('/dev')) {
    return null;
  }
  return trimmed;
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

  if (client) {
    try {
      const { data } = await client
        .from('admin_credentials')
        .select('gdrive_webhook')
        .not('gdrive_webhook', 'is', null)
        .limit(1)
        .maybeSingle();
      add(data?.gdrive_webhook);
    } catch {
      // Ignore optional lookup error
    }
  }

  add(process.env.GOOGLE_DRIVE_WEBHOOK_URL);
  add(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL);
  add(process.env.GDRIVE_WEBHOOK_URL);

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
