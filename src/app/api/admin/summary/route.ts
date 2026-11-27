import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession } from '@/lib/serverAuth';
import { readMaterialCounts } from '@/lib/serverCounters';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/summary
 * Reads ONLY the single `material_counts` JSONB column from `admin_credentials`
 * (zero full table scans across notes/pyqs/lectures/coordinators unless `?recompute=1` is requested).
 */
export async function GET(req: NextRequest) {
  const adminSession = getAdminSession(req);
  if (!adminSession) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Admin sign-in required.' },
      { status: 401 }
    );
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: 'Supabase database is not configured on the server.',
      },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const forceRecompute = searchParams.get('recompute') === '1';

    const result = await readMaterialCounts(client, forceRecompute, adminSession.id);

    return NextResponse.json({
      success: !result.error,
      connected: !result.error,
      fromCounterColumn: result.fromCounterColumn,
      counterColumnMissing: result.columnMissing,
      error: result.error || null,
      counts: result.snapshot,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: err?.message || 'Failed to load admin summary.',
      },
      { status: 500 }
    );
  }
}
