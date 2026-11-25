import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseCredentials } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const customUrl = req.headers.get('x-supabase-url') || undefined;
  const customKey = req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined;

  const creds = getSupabaseCredentials(customUrl, customKey);
  let driveWebhookUrl = process.env.GOOGLE_DRIVE_WEBHOOK_URL || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL || '';
  let driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID || '';

  if (!creds.url || !creds.key) {
    return NextResponse.json({
      success: false,
      connected: false,
      error: 'Supabase credentials are missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel or enter them in Admin Settings.',
      tables: {},
      googleDrive: { 
        configured: Boolean(driveWebhookUrl),
        webhookUrl: driveWebhookUrl || undefined,
        folderId: driveFolderId || undefined,
      },
    });
  }

  const client = getSupabaseClient(creds.url, creds.key);
  if (!client) {
    return NextResponse.json({
      success: false,
      connected: false,
      error: 'Failed to initialize Supabase client with provided URL and Key. Ensure URL starts with https:// and Key is valid.',
      tables: {},
      googleDrive: { 
        configured: Boolean(driveWebhookUrl),
        webhookUrl: driveWebhookUrl || undefined,
        folderId: driveFolderId || undefined,
      },
    });
  }

  // Test real database connection and table availability
  const tablesStatus: Record<string, { exists: boolean; error?: string }> = {};

  // 1. Coordinators Table Check
  try {
    const { error } = await client.from('coordinators').select('id').limit(1);
    tablesStatus.coordinators = { exists: !error, error: error?.message };
  } catch (e: any) {
    tablesStatus.coordinators = { exists: false, error: e?.message };
  }

  // 2. Notes Table Check
  try {
    const { error } = await client.from('notes').select('id').limit(1);
    tablesStatus.notes = { exists: !error, error: error?.message };
  } catch (e: any) {
    tablesStatus.notes = { exists: false, error: e?.message };
  }

  // 3. PYQs Table Check
  try {
    const { error } = await client.from('pyqs').select('id').limit(1);
    tablesStatus.pyqs = { exists: !error, error: error?.message };
  } catch (e: any) {
    tablesStatus.pyqs = { exists: false, error: e?.message };
  }

  // 4. Subjects Table Check
  try {
    const { error } = await client.from('subjects').select('id').limit(1);
    tablesStatus.subjects = { exists: !error, error: error?.message };
  } catch (e: any) {
    tablesStatus.subjects = { exists: false, error: e?.message };
  }

  // 5. Admin Credentials Table Check & Drive Webhook Check
  try {
    const { data: adminData, error } = await client.from('admin_credentials').select('id, gdrive_webhook, gdrive_folder_id').eq('id', 'admin').limit(1).single();
    tablesStatus.admin_credentials = { exists: !error, error: error?.message };
    if (adminData?.gdrive_webhook && !driveWebhookUrl) {
      driveWebhookUrl = adminData.gdrive_webhook;
      if (adminData.gdrive_folder_id && !driveFolderId) {
        driveFolderId = adminData.gdrive_folder_id;
      }
    }
  } catch (e: any) {
    tablesStatus.admin_credentials = { exists: false, error: e?.message };
  }

  const hasAnyTableError = Object.values(tablesStatus).some((t) => !t.exists);
  const primaryError = Object.entries(tablesStatus).find(([, t]) => !t.exists)?.[1]?.error;

  return NextResponse.json({
    success: !hasAnyTableError,
    connected: !hasAnyTableError,
    supabaseUrl: creds.url,
    error: hasAnyTableError ? (primaryError || 'One or more Supabase tables are missing. Please run supabase-schema.sql in Supabase SQL Editor.') : null,
    tables: tablesStatus,
    googleDrive: { 
      configured: Boolean(driveWebhookUrl),
      webhookUrl: driveWebhookUrl || undefined,
      folderId: driveFolderId || undefined,
    },
  });
}
