import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const MAX_VISIBLE_LOGS = 10;

function resolveClient(req: NextRequest) {
  const isAdmin = Boolean(getAdminSession(req));
  const customUrl = isAdmin ? (req.headers.get('x-supabase-url') || undefined) : undefined;
  const customKey = isAdmin
    ? (req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined)
    : undefined;
  return getSupabaseClient(customUrl, customKey);
}

function isMissingLogsTableError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('coordinator_login_logs') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

function parseBoundaryDate(raw: string | null, boundary: 'start' | 'end'): Date | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  // Support plain YYYY-MM-DD dates as well as full ISO timestamps
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
    const d = new Date(`${trimmed}${suffix}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * GET /api/coordinator-logs
 * Admin only: returns strictly the latest 10 coordinator login logs while keeping older logs safely in Supabase.
 */
export async function GET(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Only Admin can view coordinator login logs.' },
        { status: 401 }
      );
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not configured.' },
        { status: 503 }
      );
    }

    const { data, count, error } = await client
      .from('coordinator_login_logs')
      .select('id, coordinator_id, coordinator_name, year, branch, ip_address, user_agent, logged_in_at', {
        count: 'exact',
      })
      .order('logged_in_at', { ascending: false })
      .limit(MAX_VISIBLE_LOGS);

    if (error) {
      if (isMissingLogsTableError(error)) {
        return NextResponse.json(
          {
            success: false,
            tableMissing: true,
            error: 'Table "coordinator_login_logs" does not exist in Supabase yet. Run the SQL in Admin -> Coordinator Login Logs.',
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      logs: (data || []).slice(0, MAX_VISIBLE_LOGS),
      totalInDatabase: typeof count === 'number' ? count : (data || []).length,
    });
  } catch (err: any) {
    console.error('API /api/coordinator-logs GET error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching coordinator login logs.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coordinator-logs?from=...&to=...
 * Admin only: permanently deletes coordinator login logs within the specified date range from Supabase.
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Only Admin can delete coordinator login logs.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const fromDate = parseBoundaryDate(searchParams.get('from'), 'start');
    const toDate = parseBoundaryDate(searchParams.get('to'), 'end');

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { success: false, error: 'Both valid From Date and To Date are required.' },
        { status: 400 }
      );
    }

    if (fromDate.getTime() > toDate.getTime()) {
      return NextResponse.json(
        { success: false, error: 'From Date cannot be after To Date.' },
        { status: 400 }
      );
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not configured.' },
        { status: 503 }
      );
    }

    const { count, error } = await client
      .from('coordinator_login_logs')
      .delete({ count: 'exact' })
      .gte('logged_in_at', fromDate.toISOString())
      .lte('logged_in_at', toDate.toISOString());

    if (error) {
      if (isMissingLogsTableError(error)) {
        return NextResponse.json(
          { success: false, tableMissing: true, error: 'Table coordinator_login_logs is missing.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedCount: typeof count === 'number' ? count : 0,
    });
  } catch (err: any) {
    console.error('API /api/coordinator-logs DELETE error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error deleting coordinator login logs.' },
      { status: 500 }
    );
  }
}
