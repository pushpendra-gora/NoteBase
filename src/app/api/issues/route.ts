import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, verifyActiveCoordinatorSession, verifyActiveStaffSession } from '@/lib/serverAuth';
import { isBranchMatch } from '@/lib/coordinatorService';
import { adjustMaterialCounts, recomputeAndSaveMaterialCounts } from '@/lib/serverCounters';

export const dynamic = 'force-dynamic';

function resolveClient(req: NextRequest) {
  const isAdmin = Boolean(getAdminSession(req));
  const customUrl = isAdmin ? (req.headers.get('x-supabase-url') || undefined) : undefined;
  const customKey = isAdmin
    ? (req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined)
    : undefined;
  return getSupabaseClient(customUrl, customKey);
}

function isMissingIssuesTableError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('coordinator_issues') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

/**
 * GET /api/issues
 * Admin sees all coordinator issues; Coordinator sees only their own year/branch issues.
 */
export async function GET(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = adminSession ? null : await verifyActiveCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Staff sign-in required.' },
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

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');

    let query = client
      .from('coordinator_issues')
      .select('id, coordinator_id, coordinator_name, year, branch, subject, description, status, admin_reply, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (statusFilter === 'Open' || statusFilter === 'Resolved') {
      query = query.eq('status', statusFilter);
    }

    if (!adminSession && coordSession?.year) {
      query = query.eq('year', coordSession.year);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingIssuesTableError(error)) {
        return NextResponse.json(
          {
            success: false,
            tableMissing: true,
            error: 'Table "coordinator_issues" does not exist in Supabase yet. Run supabase-schema.sql in Supabase SQL Editor.',
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let issues = data || [];
    if (!adminSession && coordSession) {
      issues = issues.filter(
        (item: any) =>
          (coordSession.id && item.coordinator_id === coordSession.id) ||
          (item.year === coordSession.year &&
            coordSession.branch &&
            isBranchMatch(item.branch, coordSession.branch))
      );
    }

    return NextResponse.json({
      success: true,
      issues,
    });
  } catch (err: any) {
    console.error('API /api/issues GET error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching issues.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/issues
 * Allows Coordinator (or Staff) to submit an issue to Admin and store it in Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const staff = await verifyActiveStaffSession(req);
    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Staff sign-in required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const subject = String(body?.subject || '').trim();
    const description = String(body?.description || '').trim();

    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'Please enter an Issue Subject / Title.' },
        { status: 400 }
      );
    }
    if (!description) {
      return NextResponse.json(
        { success: false, error: 'Please write the issue details before sending.' },
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

    const coordSession = staff.role === 'coordinator' ? staff : null;
    const coordinatorName =
      (coordSession?.name && coordSession.name.trim()) ||
      String(body?.coordinator_name || '').trim() ||
      'Coordinator';
    const year =
      (coordSession?.year && coordSession.year.trim()) ||
      String(body?.year || '').trim() ||
      'All Years';
    const branch =
      (coordSession?.branch && coordSession.branch.trim()) ||
      String(body?.branch || '').trim() ||
      'All Branches';
    const coordinatorId = coordSession?.id || String(body?.coordinator_id || '').trim() || null;

    const now = new Date().toISOString();
    const payload = {
      id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      coordinator_id: coordinatorId,
      coordinator_name: coordinatorName,
      year,
      branch,
      subject,
      description,
      status: 'Open',
      admin_reply: null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await client
      .from('coordinator_issues')
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (isMissingIssuesTableError(error)) {
        return NextResponse.json(
          {
            success: false,
            tableMissing: true,
            error: 'Issues table is not created in Supabase yet. Please ask Admin to run the updated SQL schema.',
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await adjustMaterialCounts(client, { openIssues: 1 });

    return NextResponse.json({
      success: true,
      issue: data || payload,
    });
  } catch (err: any) {
    console.error('API /api/issues POST error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error submitting issue.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/issues
 * Admin only: Solve/Resolve (or Reopen) an issue and optionally save an Admin reply.
 */
export async function PATCH(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Only Admin can resolve or update issues.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const id = String(body?.id || '').trim();
    const status = body?.status === 'Resolved' ? 'Resolved' : body?.status === 'Open' ? 'Open' : null;
    const adminReply =
      typeof body?.admin_reply === 'string' ? body.admin_reply.trim() || null : undefined;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Issue ID is required.' }, { status: 400 });
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not configured.' },
        { status: 503 }
      );
    }

    const { data: existingIssue } = status
      ? await client.from('coordinator_issues').select('status').eq('id', id).limit(1).maybeSingle()
      : { data: null };

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (status) updatePayload.status = status;
    if (adminReply !== undefined) updatePayload.admin_reply = adminReply;

    const { data, error } = await client
      .from('coordinator_issues')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (isMissingIssuesTableError(error)) {
        return NextResponse.json(
          { success: false, tableMissing: true, error: 'Table coordinator_issues is missing.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (status && existingIssue && existingIssue.status !== status) {
      await adjustMaterialCounts(client, {
        openIssues: status === 'Resolved' ? -1 : 1,
      });
    }

    return NextResponse.json({ success: true, issue: data });
  } catch (err: any) {
    console.error('API /api/issues PATCH error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error updating issue.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/issues
 * Admin only: Permanently delete a single issue (?id=...), all resolved (?mode=resolved), or all (?mode=all) from database.
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Only Admin can delete issues.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const mode = searchParams.get('mode');

    if (!id && mode !== 'resolved' && mode !== 'all') {
      return NextResponse.json(
        { success: false, error: 'Issue ID or delete mode (resolved/all) is required.' },
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

    let query = client.from('coordinator_issues').delete();
    if (id) {
      query = query.eq('id', id);
    } else if (mode === 'resolved') {
      query = query.eq('status', 'Resolved');
    } else if (mode === 'all') {
      query = query.neq('id', '');
    }

    const { error } = await query;

    if (error) {
      if (isMissingIssuesTableError(error)) {
        return NextResponse.json(
          { success: false, tableMissing: true, error: 'Table coordinator_issues is missing.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (mode === 'all' || id) {
      await recomputeAndSaveMaterialCounts(client).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      deletedId: id || null,
      mode: mode || 'single',
    });
  } catch (err: any) {
    console.error('API /api/issues DELETE error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error deleting issue.' },
      { status: 500 }
    );
  }
}
