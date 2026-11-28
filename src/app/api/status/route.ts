import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseCredentials } from '@/lib/supabase';
import { getAdminSession, verifyActiveStaffSession } from '@/lib/serverAuth';
import { loadMultiDriveState } from '@/lib/serverDrive';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const isAdmin = Boolean(getAdminSession(req));
  const isStaff = isAdmin || Boolean(await verifyActiveStaffSession(req));
  const customUrl = isAdmin ? (req.headers.get('x-supabase-url') || undefined) : undefined;
  const customKey = isAdmin ? (req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined) : undefined;

  const creds = getSupabaseCredentials(customUrl, customKey);
  const envMultiDrive = await loadMultiDriveState(null);

  if (!creds.url || !creds.key) {
    return NextResponse.json({
      success: false,
      connected: false,
      ...(isStaff
        ? {
            error:
              'Supabase credentials are missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel.',
            tables: {},
          }
        : {}),
      googleDrive: {
        configured: envMultiDrive.drives.length > 0,
      },
    });
  }

  const client = getSupabaseClient(creds.url, creds.key);
  if (!client) {
    return NextResponse.json({
      success: false,
      connected: false,
      ...(isStaff
        ? {
            error:
              'Failed to initialize Supabase client with provided URL and Key. Ensure URL starts with https:// and Key is valid.',
            tables: {},
          }
        : {}),
      googleDrive: {
        configured: envMultiDrive.drives.length > 0,
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

  // 5. Admin Credentials Table Check
  try {
    const adminRowId = (process.env.ADMIN_DEFAULT_ID || 'admin').trim();
    const { error } = await client.from('admin_credentials').select('id').eq('id', adminRowId).limit(1).maybeSingle();
    tablesStatus.admin_credentials = { exists: !error, error: error?.message };
  } catch (e: any) {
    tablesStatus.admin_credentials = { exists: false, error: e?.message };
  }

  const multiState = await loadMultiDriveState(client);
  const hasAnyTableError = Object.values(tablesStatus).some((t) => !t.exists);
  const primaryError = Object.entries(tablesStatus).find(([, t]) => !t.exists)?.[1]?.error;

  return NextResponse.json({
    success: !hasAnyTableError,
    connected: !hasAnyTableError,
    ...(isStaff ? { tables: tablesStatus } : {}),
    ...(isStaff
      ? {
          error: hasAnyTableError
            ? primaryError || 'One or more Supabase tables are missing. Please run supabase-schema.sql in Supabase SQL Editor.'
            : null,
        }
      : {}),
    googleDrive: {
      configured: multiState.drives.length > 0,
    },
  });
}
