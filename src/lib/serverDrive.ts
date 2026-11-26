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

export async function resolveGoogleDriveWebhookUrl(
  client?: SupabaseClient | null,
  fallbackScriptUrl?: string | null
): Promise<string | null> {
  let targetUrl =
    process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL ||
    process.env.GDRIVE_WEBHOOK_URL ||
    fallbackScriptUrl ||
    '';

  if (!targetUrl && client) {
    try {
      const { data } = await client
        .from('admin_credentials')
        .select('gdrive_webhook')
        .eq('id', 'admin')
        .limit(1)
        .single();
      if (data?.gdrive_webhook) {
        targetUrl = data.gdrive_webhook;
      }
    } catch {
      // Ignore optional lookup error
    }
  }

  const trimmed = targetUrl.trim();
  if (!trimmed || !isValidGoogleScriptUrl(trimmed) || trimmed.includes('/edit') || trimmed.endsWith('/dev')) {
    return null;
  }
  return trimmed;
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

  const webhookUrl = await resolveGoogleDriveWebhookUrl(client, customWebhookUrl);
  if (!webhookUrl) {
    return {
      attempted: false,
      deleted: false,
      error: 'Google Drive Web App URL is not configured.',
    };
  }

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
    const needsUpdate =
      errMsg.includes('base64') ||
      errMsg.includes('Invalid argument') ||
      text.includes('<!DOCTYPE') ||
      text.includes('<html');

    return {
      attempted: true,
      deleted: false,
      needsScriptUpdate: needsUpdate,
      error: errMsg || 'Google Drive delete did not succeed.',
    };
  } catch (err: any) {
    return {
      attempted: true,
      deleted: false,
      error: err?.message || 'Network error calling Google Drive Web App.',
    };
  }
}
