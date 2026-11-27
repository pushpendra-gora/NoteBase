import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, getCoordinatorSession } from '@/lib/serverAuth';
import { isBranchMatch } from '@/lib/coordinatorService';

export const dynamic = 'force-dynamic';

function resolveClient(req: NextRequest) {
  const isAdmin = Boolean(getAdminSession(req));
  const customUrl = isAdmin ? (req.headers.get('x-supabase-url') || undefined) : undefined;
  const customKey = isAdmin
    ? (req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined)
    : undefined;
  return getSupabaseClient(customUrl, customKey);
}

/**
 * GET /api/subjects
 * Public curriculum read for Students, Coordinators, and Admin.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const branch = searchParams.get('branch');
    const semester = searchParams.get('semester');

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not configured.' },
        { status: 503 }
      );
    }

    let query = client
      .from('subjects')
      .select('id, title, code, year, branch, semester, unit_snippets, pyq_snippets, created_at')
      .order('created_at', { ascending: true });

    if (year && year !== 'All') query = query.eq('year', year);
    if (branch && branch !== 'All') query = query.eq('branch', branch);
    if (semester && semester !== 'All') query = query.eq('semester', semester);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subjects: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching subjects.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/subjects
 * Authenticated Staff (Admin or Coordinator for their own Year & Branch).
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json();
    const year = String(body?.year || '').trim();
    const branch = String(body?.branch || '').trim();
    const semester = String(body?.semester || '').trim();
    const title = String(body?.title || '').trim();
    const code = String(body?.code || 'SUB101').trim();

    if (!year || !branch || !semester || !title) {
      return NextResponse.json(
        { success: false, error: 'Year, Branch, Semester, and Subject Title are required.' },
        { status: 400 }
      );
    }

    if (!adminSession && coordSession) {
      if (year !== coordSession.year || !coordSession.branch || !isBranchMatch(branch, coordSession.branch)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Cannot add subjects outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Supabase database is not configured.' }, { status: 503 });
    }

    const { error } = await client.from('subjects').insert([
      {
        title,
        code,
        year,
        branch,
        semester,
        unit_snippets: Array.isArray(body?.unitSnippets)
          ? body.unitSnippets
          : [`${title} Unit 1 concepts.`, `${title} Unit 2 examples.`],
        pyq_snippets: Array.isArray(body?.pyqSnippets)
          ? body.pyqSnippets
          : [`Important University Question Paper for ${title}.`],
      },
    ]);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error adding subject.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/subjects
 * Authenticated Staff (Admin or Coordinator for their own Year & Branch).
 */
export async function PATCH(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json();
    const year = String(body?.year || '').trim();
    const branch = String(body?.branch || '').trim();
    const semester = String(body?.semester || '').trim();
    const oldTitle = String(body?.oldTitle || '').trim();
    const newTitle = String(body?.newTitle || '').trim();
    const newCode = String(body?.newCode || '').trim();

    if (!year || !branch || !semester || !oldTitle || !newTitle || !newCode) {
      return NextResponse.json(
        { success: false, error: 'Missing required subject update fields.' },
        { status: 400 }
      );
    }

    if (!adminSession && coordSession) {
      if (year !== coordSession.year || !coordSession.branch || !isBranchMatch(branch, coordSession.branch)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Cannot modify subjects outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Supabase database is not configured.' }, { status: 503 });
    }

    const { error } = await client
      .from('subjects')
      .update({ title: newTitle, code: newCode })
      .eq('year', year)
      .eq('branch', branch)
      .eq('semester', semester)
      .eq('title', oldTitle);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (oldTitle !== newTitle) {
      await Promise.all([
        client.from('notes').update({ subject: newTitle }).eq('year', year).eq('branch', branch).eq('semester', semester).eq('subject', oldTitle),
        client.from('pyqs').update({ subject: newTitle }).eq('year', year).eq('branch', branch).eq('semester', semester).eq('subject', oldTitle),
        client.from('lectures').update({ subject: newTitle }).eq('year', year).eq('branch', branch).eq('semester', semester).eq('subject', oldTitle),
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error updating subject.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/subjects
 * Authenticated Staff (Admin or Coordinator for their own Year & Branch).
 */
export async function DELETE(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = String(searchParams.get('year') || '').trim();
    const branch = String(searchParams.get('branch') || '').trim();
    const semester = String(searchParams.get('semester') || '').trim();
    const title = String(searchParams.get('title') || '').trim();

    if (!year || !branch || !semester || !title) {
      return NextResponse.json({ success: false, error: 'Missing required subject delete parameters.' }, { status: 400 });
    }

    if (!adminSession && coordSession) {
      if (year !== coordSession.year || !coordSession.branch || !isBranchMatch(branch, coordSession.branch)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Cannot delete subjects outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Supabase database is not configured.' }, { status: 503 });
    }

    const { error } = await client
      .from('subjects')
      .delete()
      .eq('year', year)
      .eq('branch', branch)
      .eq('semester', semester)
      .eq('title', title);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error deleting subject.' },
      { status: 500 }
    );
  }
}
