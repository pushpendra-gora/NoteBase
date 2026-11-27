import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, isValidGoogleScriptUrl } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

function resolveAdminClient(req: NextRequest) {
  const customUrl = req.headers.get('x-supabase-url') || undefined;
  const customKey =
    req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined;
  return getSupabaseClient(customUrl, customKey);
}

/**
 * GET /api/admin/config
 * Admin-only: Fetches non-secret Google Drive config stored in admin_credentials.
 */
export async function GET(req: NextRequest) {
  if (!getAdminSession(req)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Admin sign-in required.' },
      { status: 401 }
    );
  }

  const client = resolveAdminClient(req);
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'Supabase database is not configured.' },
      { status: 503 }
    );
  }

  try {
    const { data, error } = await client
      .from('admin_credentials')
      .select('gdrive_webhook, gdrive_folder_id')
      .eq('id', 'admin')
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      configured: Boolean(
        process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
          process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL ||
          process.env.GDRIVE_WEBHOOK_URL ||
          data?.gdrive_webhook
      ),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to read admin config.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/config
 * Admin-only: Saves Google Drive webhook URL and optional folder ID cleanly on the server.
 */
export async function POST(req: NextRequest) {
  const adminSession = getAdminSession(req);
  if (!adminSession) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Admin sign-in required.' },
      { status: 401 }
    );
  }

  const client = resolveAdminClient(req);
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'Supabase database is not configured.' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const webhookUrl = String(body?.webhookUrl || '').trim();
    const folderId = String(body?.folderId || '').trim();

    if (webhookUrl && !isValidGoogleScriptUrl(webhookUrl)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Google Apps Script URL. Only https://script.google.com URLs are allowed.' },
        { status: 400 }
      );
    }

    const { error } = await client
      .from('admin_credentials')
      .update({
        gdrive_webhook: webhookUrl || null,
        gdrive_folder_id: folderId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminSession.id || 'admin');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to update admin config.' },
      { status: 500 }
    );
  }
}
