import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, getCoordinatorSession, getStaffSession } from '@/lib/serverAuth';
import { isBranchMatch } from '@/lib/coordinatorService';
import { deleteFileFromGoogleDriveServer } from '@/lib/serverDrive';
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
 * GET /api/documents
 * Fetches notes or pyqs from Supabase
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const branch = searchParams.get('branch');
    const semester = searchParams.get('semester');
    const subject = searchParams.get('subject');
    const type = searchParams.get('type'); // 'Notes' or 'PYQ' or 'All'
    const search = searchParams.get('search')?.trim() || '';
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? Math.min(50, Math.max(1, parseInt(limitParam, 10) || 5)) : null;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Database service is unreachable on the server.' },
        { status: 503 }
      );
    }

    const METADATA_COLUMNS = 'id, title, year, branch, semester, subject, code, pages, size, owner, file_url, file_path, created_at';
    const allDocs: any[] = [];
    const perTableFetchEnd = limit !== null ? offset + limit : null;

    const applyFilters = (q: any) => {
      if (year && year !== 'All') q = q.eq('year', year);
      if (branch && branch !== 'All') q = q.eq('branch', branch);
      if (semester && semester !== 'All') q = q.eq('semester', semester);
      if (subject && subject !== 'All') q = q.eq('subject', subject);
      if (search) {
        const clean = search.replace(/[%_,]/g, ' ').trim();
        if (clean) {
          q = q.or(`title.ilike.%${clean}%,subject.ilike.%${clean}%,owner.ilike.%${clean}%`);
        }
      }
      return q;
    };

    // Query notes (only lightweight metadata; paginated when limit is supplied)
    if (type !== 'PYQ' && type !== 'PYQs') {
      let query = applyFilters(
        client.from('notes').select(METADATA_COLUMNS).order('created_at', { ascending: false })
      );
      if (perTableFetchEnd !== null) {
        const rangeStart = type === 'Notes' ? offset : 0;
        const rangeEnd = type === 'Notes' ? offset + limit! : perTableFetchEnd;
        query = query.range(rangeStart, rangeEnd);
      }
      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      if (data) {
        allDocs.push(...data.map((d: any) => ({ ...d, type: 'Notes' })));
      }
    }

    // Query pyqs (only lightweight metadata; paginated when limit is supplied)
    if (type !== 'Notes') {
      let query = applyFilters(
        client.from('pyqs').select(METADATA_COLUMNS).order('created_at', { ascending: false })
      );
      if (perTableFetchEnd !== null) {
        const isOnlyPyq = type === 'PYQ' || type === 'PYQs';
        const rangeStart = isOnlyPyq ? offset : 0;
        const rangeEnd = isOnlyPyq ? offset + limit! : perTableFetchEnd;
        query = query.range(rangeStart, rangeEnd);
      }
      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      if (data) {
        allDocs.push(...data.map((d: any) => ({ ...d, type: 'PYQ' })));
      }
    }

    // Sort globally newest-first
    allDocs.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    if (limit !== null) {
      const isSingleTable = type === 'Notes' || type === 'PYQ' || type === 'PYQs';
      if (isSingleTable) {
        const hasMore = allDocs.length > limit;
        return NextResponse.json({
          success: true,
          documents: allDocs.slice(0, limit),
          hasMore,
        });
      }
      const sliced = allDocs.slice(offset, offset + limit);
      const hasMore = allDocs.length > offset + limit;
      return NextResponse.json({
        success: true,
        documents: sliced,
        hasMore,
      });
    }

    return NextResponse.json({
      success: true,
      documents: allDocs,
    });
  } catch (err: any) {
    console.error('API /api/documents GET error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching documents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents
 * Inserts or updates a document (note or pyq) in Supabase
 */
export async function POST(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Staff sign-in required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, title, subject, code, year, branch, semester, type, pages, size, owner, file_url, file_path } = body;

    if (!title || !subject || !year || !branch || !semester) {
      return NextResponse.json(
        { success: false, error: 'Title, Subject, Year, Branch, and Semester are required.' },
        { status: 400 }
      );
    }

    // Coordinators can only upload within their own assigned Year & Branch
    if (!adminSession && coordSession) {
      if (
        String(year).trim() !== coordSession.year ||
        !coordSession.branch ||
        !isBranchMatch(String(branch).trim(), coordSession.branch)
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. You can only manage materials for your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not connected on the server. Please check Vercel environment variables.' },
        { status: 503 }
      );
    }

    const targetTable = type === 'PYQ' ? 'pyqs' : 'notes';
    const targetId = id || `doc-${Date.now()}`;

    // Check if document ID already exists so counter column increments ONLY on genuine new inserts (or adjusts year on move)
    const { data: existingDoc } = await client
      .from(targetTable)
      .select('id, year')
      .eq('id', targetId)
      .limit(1)
      .maybeSingle();

    const payload = {
      id: targetId,
      title: title.trim(),
      year: year.trim(),
      branch: branch.trim(),
      semester: semester.trim(),
      subject: subject.trim(),
      code: code || (type === 'PYQ' ? 'PYQ101' : 'DOC101'),
      pages: typeof pages === 'number' && pages > 0 ? pages : 0,
      size: typeof size === 'string' && size.trim() ? size.trim() : '',
      owner: owner || 'Department Faculty',
      file_url: file_url || null,
      file_path: file_path || null,
      created_at: new Date().toISOString(),
    };

    let { data, error } = await client
      .from(targetTable)
      .upsert(payload, { onConflict: 'id' })
      .select();

    if (error) {
      const insertFallback = await client
        .from(targetTable)
        .insert(payload)
        .select();
      if (!insertFallback.error) {
        data = insertFallback.data;
        error = null;
      }
    }

    if (error) {
      console.error(`Error saving document to ${targetTable}:`, error);
      return NextResponse.json(
        { success: false, error: `Supabase database error: ${error.message} (table: ${targetTable})` },
        { status: 500 }
      );
    }

    if (!existingDoc) {
      await adjustMaterialCounts(client, {
        notes: targetTable === 'notes' ? 1 : 0,
        pyqs: targetTable === 'pyqs' ? 1 : 0,
        year: payload.year,
        yearDelta: 1,
      });
    } else if (existingDoc.year !== payload.year) {
      await adjustMaterialCounts(client, {
        prevYear: existingDoc.year,
        prevYearDelta: -1,
        year: payload.year,
        yearDelta: 1,
      });
    }

    return NextResponse.json({
      success: true,
      document: payload,
      data,
    });
  } catch (err: any) {
    console.error('API /api/documents POST error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while saving document.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents
 * Deletes a document from Supabase
 */
export async function PATCH(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Staff sign-in required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, title, type } = body;

    if (!id || !title || !String(title).trim()) {
      return NextResponse.json(
        { success: false, error: 'Document ID and Title are required.' },
        { status: 400 }
      );
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase client is not connected.' },
        { status: 503 }
      );
    }

    // If Coordinator, verify target document belongs to their assigned Year & Branch
    if (!adminSession && coordSession) {
      const [nRes, pRes] = await Promise.all([
        type !== 'PYQ' && type !== 'PYQs'
          ? client.from('notes').select('year, branch').eq('id', id).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        type !== 'Notes'
          ? client.from('pyqs').select('year, branch').eq('id', id).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const row = nRes.data || pRes.data;
      if (
        !row ||
        row.year !== coordSession.year ||
        !coordSession.branch ||
        !isBranchMatch(row.branch, coordSession.branch)
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. You cannot modify documents outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const cleanTitle = title.trim();
    if (type === 'PYQ' || type === 'PYQs') {
      const { error } = await client.from('pyqs').update({ title: cleanTitle }).eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } else if (type === 'Notes') {
      const { error } = await client.from('notes').update({ title: cleanTitle }).eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } else {
      await Promise.all([
        client.from('notes').update({ title: cleanTitle }).eq('id', id),
        client.from('pyqs').update({ title: cleanTitle }).eq('id', id),
      ]);
    }

    return NextResponse.json({ success: true, id, title: cleanTitle });
  } catch (err: any) {
    console.error('API /api/documents PATCH error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while updating document.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Staff sign-in required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');
    const paramFileUrl = searchParams.get('fileUrl');
    const paramFilePath = searchParams.get('filePath');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required.' },
        { status: 400 }
      );
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase client is not connected.' },
        { status: 503 }
      );
    }

    // Look up existing DB row for authorization, Drive cleanup, and counter decrement
    let dbRow: { year?: string; branch?: string; file_url?: string | null; file_path?: string | null; _table?: 'notes' | 'pyqs' } | null = null;
    try {
      if (type === 'PYQ' || type === 'PYQs') {
        const { data } = await client.from('pyqs').select('year, branch, file_url, file_path').eq('id', id).limit(1).maybeSingle();
        if (data) dbRow = { ...data, _table: 'pyqs' };
      } else if (type === 'Notes') {
        const { data } = await client.from('notes').select('year, branch, file_url, file_path').eq('id', id).limit(1).maybeSingle();
        if (data) dbRow = { ...data, _table: 'notes' };
      } else {
        const [nRes, pRes] = await Promise.all([
          client.from('notes').select('year, branch, file_url, file_path').eq('id', id).limit(1).maybeSingle(),
          client.from('pyqs').select('year, branch, file_url, file_path').eq('id', id).limit(1).maybeSingle(),
        ]);
        if (nRes.data) dbRow = { ...nRes.data, _table: 'notes' };
        else if (pRes.data) dbRow = { ...pRes.data, _table: 'pyqs' };
      }
    } catch {
      // Ignore lookup error for Admin fallback
    }

    if (!adminSession && coordSession) {
      if (
        !dbRow ||
        dbRow.year !== coordSession.year ||
        !coordSession.branch ||
        !dbRow.branch ||
        !isBranchMatch(dbRow.branch, coordSession.branch)
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. You cannot delete documents outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const fileRefToDelete: string | null =
      dbRow?.file_url ||
      dbRow?.file_path ||
      (adminSession ? paramFileUrl || paramFilePath || null : null);

    const skipCount = Boolean(adminSession && searchParams.get('skipCount') === '1');

    // Delete file from Google Drive first (best-effort, never blocks DB cleanup if Drive URL isn't set)
    const driveResult = await deleteFileFromGoogleDriveServer(fileRefToDelete, client);

    // Delete from DB and track exact deleted rows per table for accurate counters
    let deletedNotesRows: Array<{ id: string; year?: string | null }> = [];
    let deletedPyqsRows: Array<{ id: string; year?: string | null }> = [];

    if (type === 'PYQ' || type === 'PYQs') {
      const { data: delData, error } = await client.from('pyqs').delete().eq('id', id).select('id, year');
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      deletedPyqsRows = delData || [];
    } else if (type === 'Notes') {
      const { data: delData, error } = await client.from('notes').delete().eq('id', id).select('id, year');
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      deletedNotesRows = delData || [];
    } else {
      const [nDel, pDel] = await Promise.all([
        client.from('notes').delete().eq('id', id).select('id, year'),
        client.from('pyqs').delete().eq('id', id).select('id, year'),
      ]);
      deletedNotesRows = nDel.data || [];
      deletedPyqsRows = pDel.data || [];
    }

    if (!skipCount && (deletedNotesRows.length > 0 || deletedPyqsRows.length > 0)) {
      const yearAdjustments = [
        ...deletedNotesRows.map((r) => ({ year: r.year || null, delta: -1 })),
        ...deletedPyqsRows.map((r) => ({ year: r.year || null, delta: -1 })),
      ];
      await adjustMaterialCounts(client, {
        notes: -deletedNotesRows.length,
        pyqs: -deletedPyqsRows.length,
        yearAdjustments,
      });
    }

    return NextResponse.json({
      success: true,
      deletedId: id,
      driveAttempted: driveResult.attempted,
      driveDeleted: driveResult.deleted,
      driveNeedsScriptUpdate: driveResult.needsScriptUpdate,
      driveError: driveResult.error,
    });
  } catch (err: any) {
    console.error('API /api/documents DELETE error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while deleting document.' },
      { status: 500 }
    );
  }
}
