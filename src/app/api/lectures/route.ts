import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, verifyActiveCoordinatorSession } from '@/lib/serverAuth';
import { isBranchMatch } from '@/lib/coordinatorService';
import { normalizeSafeExternalUrl } from '@/lib/urlSafety';
import { adjustMaterialCounts } from '@/lib/serverCounters';

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
 * GET /api/lectures
 * Public read for Students, Coordinators, and Admin.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const branch = searchParams.get('branch');
    const semester = searchParams.get('semester');
    const subject = searchParams.get('subject');

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not configured.' },
        { status: 503 }
      );
    }

    let query = client
      .from('lectures')
      .select('id, title, subject, semester, year, branch, faculty, link, date, created_at')
      .order('date', { ascending: false });

    if (year && year !== 'All') query = query.eq('year', year);
    if (branch && branch !== 'All') query = query.eq('branch', branch);
    if (semester && semester !== 'All') query = query.eq('semester', semester);
    if (subject && subject !== 'All') query = query.eq('subject', subject);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, lectures: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching lectures.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lectures
 * Authenticated Staff (Admin or Coordinator for their own Year & Branch).
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = adminSession ? null : await verifyActiveCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json();
    const id = String(body?.id || `lec-${Date.now()}`).trim();
    const title = String(body?.title || '').trim();
    const subject = String(body?.subject || '').trim();
    const semester = String(body?.semester || '').trim();
    const year = String(body?.year || '').trim();
    const branch = String(body?.branch || '').trim();
    const date = String(body?.date || new Date().toISOString().split('T')[0]).trim();
    const rawLink = body?.link ? String(body.link).trim() : '';

    if (!title || !subject || !semester || !year || !branch) {
      return NextResponse.json(
        { success: false, error: 'Title, Subject, Semester, Year, and Branch are required.' },
        { status: 400 }
      );
    }

    const safeLink = rawLink ? normalizeSafeExternalUrl(rawLink) : null;
    if (rawLink && !safeLink) {
      return NextResponse.json(
        { success: false, error: 'Invalid lecture URL. Only http:// and https:// links are allowed.' },
        { status: 400 }
      );
    }

    if (!adminSession && coordSession) {
      if (year !== coordSession.year || !coordSession.branch || !isBranchMatch(branch, coordSession.branch)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Cannot publish lectures outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Supabase database is not configured.' }, { status: 503 });
    }

    const { data: existingLec } = await client
      .from('lectures')
      .select('id')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    const { error } = await client.from('lectures').upsert({
      id,
      title,
      subject,
      semester,
      year,
      branch,
      link: safeLink,
      date,
      created_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!existingLec) {
      await adjustMaterialCounts(client, { lectures: 1, year, yearDelta: 1 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error saving lecture.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/lectures
 * Authenticated Staff (Admin or Coordinator for their own Year & Branch).
 */
export async function PATCH(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = adminSession ? null : await verifyActiveCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json();
    const id = String(body?.id || '').trim();
    const title = String(body?.title || '').trim();
    const rawLink = body?.link !== undefined ? String(body.link || '').trim() : undefined;

    if (!id || !title) {
      return NextResponse.json({ success: false, error: 'Lecture ID and Title are required.' }, { status: 400 });
    }

    const safeLink = rawLink ? normalizeSafeExternalUrl(rawLink) : null;
    if (rawLink && !safeLink) {
      return NextResponse.json(
        { success: false, error: 'Invalid lecture URL. Only http:// and https:// links are allowed.' },
        { status: 400 }
      );
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Supabase database is not configured.' }, { status: 503 });
    }

    if (!adminSession && coordSession) {
      const { data: row } = await client
        .from('lectures')
        .select('year, branch')
        .eq('id', id)
        .limit(1)
        .maybeSingle();

      if (
        !row ||
        row.year !== coordSession.year ||
        !coordSession.branch ||
        !isBranchMatch(row.branch, coordSession.branch)
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Cannot edit lectures outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const updatePayload: Record<string, any> = { title };
    if (rawLink !== undefined) updatePayload.link = safeLink;

    const { error } = await client.from('lectures').update(updatePayload).eq('id', id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error updating lecture.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/lectures
 * Authenticated Staff (Admin or Coordinator for their own Year & Branch).
 */
export async function DELETE(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = adminSession ? null : await verifyActiveCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Lecture ID is required.' }, { status: 400 });
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Supabase database is not configured.' }, { status: 503 });
    }

    const { data: existingRow } = await client
      .from('lectures')
      .select('year, branch')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    if (!adminSession && coordSession) {
      if (
        !existingRow ||
        existingRow.year !== coordSession.year ||
        !coordSession.branch ||
        !isBranchMatch(existingRow.branch, coordSession.branch)
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Cannot delete lectures outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const { error } = await client.from('lectures').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (existingRow) {
      await adjustMaterialCounts(client, {
        lectures: -1,
        year: existingRow.year || null,
        yearDelta: -1,
      });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error deleting lecture.' },
      { status: 500 }
    );
  }
}
