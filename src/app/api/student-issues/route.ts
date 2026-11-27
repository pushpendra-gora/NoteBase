import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession } from '@/lib/serverAuth';
import { FIRST_YEAR_GROUPS, STANDARD_BRANCHES, YEARS } from '@/data/notesData';
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

function isMissingStudentIssuesTableError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('student_issues') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

/**
 * GET /api/student-issues
 * STRICTLY Admin only: students can never fetch any student issues.
 */
export async function GET(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Only Admin can view student issues.' },
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
      .from('student_issues')
      .select('id, student_name, year, branch, subject, description, status, admin_reply, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (statusFilter === 'Open' || statusFilter === 'Resolved') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingStudentIssuesTableError(error)) {
        return NextResponse.json(
          {
            success: false,
            tableMissing: true,
            error: 'Table "student_issues" does not exist in Supabase yet. Run the SQL in Admin -> Students Issues or supabase-schema.sql.',
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      issues: data || [],
    });
  } catch (err: any) {
    console.error('API /api/student-issues GET error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching student issues.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/student-issues
 * Public student write-only submission: saves student name, year, branch, title, and issue details for Admin.
 * Returns only `{ success: true, id }` and never exposes stored issues.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const studentName = String(body?.student_name || '').trim();
    const year = String(body?.year || '').trim();
    const branch = String(body?.branch || '').trim();
    const subject = String(body?.subject || '').trim();
    const description = String(body?.description || '').trim();

    if (studentName.length < 2 || studentName.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Please enter your Name (2–100 characters).' },
        { status: 400 }
      );
    }

    if (!YEARS.includes(year as any)) {
      return NextResponse.json(
        { success: false, error: 'Please select a valid Year.' },
        { status: 400 }
      );
    }

    const allowedBranches: readonly string[] =
      year === '1st Year' ? FIRST_YEAR_GROUPS : STANDARD_BRANCHES;
    if (!allowedBranches.includes(branch)) {
      return NextResponse.json(
        { success: false, error: 'Please select a valid Branch / Group for your Year.' },
        { status: 400 }
      );
    }

    if (subject.length < 2 || subject.length > 160) {
      return NextResponse.json(
        { success: false, error: 'Please enter an Issue Title (2–160 characters).' },
        { status: 400 }
      );
    }

    if (description.length < 4 || description.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Please describe your issue (4–2000 characters).' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Server database is currently unavailable.' },
        { status: 503 }
      );
    }

    const now = new Date().toISOString();
    const payload = {
      id: `st-issue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      student_name: studentName,
      year,
      branch,
      subject,
      description,
      status: 'Open',
      admin_reply: null,
      created_at: now,
      updated_at: now,
    };

    const { error } = await client.from('student_issues').insert(payload);

    if (error) {
      if (isMissingStudentIssuesTableError(error)) {
        return NextResponse.json(
          {
            success: false,
            tableMissing: true,
            error: 'Student issues service is not initialized in the database yet. Please inform Admin.',
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await adjustMaterialCounts(client, { openStudentIssues: 1 });

    return NextResponse.json({
      success: true,
      id: payload.id,
    });
  } catch (err: any) {
    console.error('API /api/student-issues POST error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Unable to submit issue right now.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/student-issues
 * Admin only: Solve/Resolve or Reopen a student issue and optionally store an Admin resolution note.
 */
export async function PATCH(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Only Admin can resolve student issues.' },
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
      ? await client.from('student_issues').select('status').eq('id', id).limit(1).maybeSingle()
      : { data: null };

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (status) updatePayload.status = status;
    if (adminReply !== undefined) updatePayload.admin_reply = adminReply;

    const { data, error } = await client
      .from('student_issues')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (isMissingStudentIssuesTableError(error)) {
        return NextResponse.json(
          { success: false, tableMissing: true, error: 'Table student_issues is missing.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (status && existingIssue && existingIssue.status !== status) {
      await adjustMaterialCounts(client, {
        openStudentIssues: status === 'Resolved' ? -1 : 1,
      });
    }

    return NextResponse.json({ success: true, issue: data });
  } catch (err: any) {
    console.error('API /api/student-issues PATCH error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error updating student issue.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/student-issues
 * Admin only: Permanently delete a single issue (?id=...), all solved (?mode=resolved), or all (?mode=all) from database.
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Only Admin can delete student issues.' },
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

    let query = client.from('student_issues').delete();
    if (id) {
      query = query.eq('id', id);
    } else if (mode === 'resolved') {
      query = query.eq('status', 'Resolved');
    } else if (mode === 'all') {
      query = query.neq('id', '');
    }

    const { error } = await query;

    if (error) {
      if (isMissingStudentIssuesTableError(error)) {
        return NextResponse.json(
          { success: false, tableMissing: true, error: 'Table student_issues is missing.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await recomputeAndSaveMaterialCounts(client).catch(() => {});

    return NextResponse.json({
      success: true,
      deletedId: id || null,
      mode: mode || 'single',
    });
  } catch (err: any) {
    console.error('API /api/student-issues DELETE error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error deleting student issue.' },
      { status: 500 }
    );
  }
}
