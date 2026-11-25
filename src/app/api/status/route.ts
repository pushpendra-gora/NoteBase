import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasDriveWebhook = Boolean(process.env.GOOGLE_DRIVE_WEBHOOK_URL);

  if (!envUrl || (!hasAnonKey && !hasServiceKey)) {
    return NextResponse.json({
      success: false,
      connected: false,
      error: 'Supabase credentials are missing on the server. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel Environment Variables and REDEPLOY.',
      tables: {},
      googleDrive: { configured: hasDriveWebhook },
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json({
      success: false,
      connected: false,
      error: 'Failed to initialize Supabase client with provided URL and Key.',
      tables: {},
      googleDrive: { configured: hasDriveWebhook },
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

  // 5. Admin Credentials Table Check
  try {
    const { error } = await client.from('admin_credentials').select('id').limit(1);
    tablesStatus.admin_credentials = { exists: !error, error: error?.message };
  } catch (e: any) {
    tablesStatus.admin_credentials = { exists: false, error: e?.message };
  }

  const hasAnyTableError = Object.values(tablesStatus).some((t) => !t.exists);
  const primaryError = Object.entries(tablesStatus).find(([, t]) => !t.exists)?.[1]?.error;

  return NextResponse.json({
    success: !hasAnyTableError,
    connected: !hasAnyTableError,
    supabaseUrl: envUrl,
    error: hasAnyTableError ? (primaryError || 'One or more Supabase tables are missing. Please run supabase-schema.sql in Supabase SQL Editor.') : null,
    tables: tablesStatus,
    googleDrive: { configured: hasDriveWebhook },
  });
}
