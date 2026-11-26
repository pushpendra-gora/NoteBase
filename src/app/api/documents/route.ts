import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getStaffSession } from '@/lib/serverAuth';
import { deleteFileFromGoogleDriveServer } from '@/lib/serverDrive';

export const dynamic = 'force-dynamic';

function resolveClient(req: NextRequest) {
  const customUrl = req.headers.get('x-supabase-url') || undefined;
  const customKey = req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined;
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

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Database service is unreachable on the server.' },
        { status: 503 }
      );
    }

    const METADATA_COLUMNS = 'id, title, year, branch, semester, subject, code, pages, size, owner, file_url, file_path, created_at';
    let allDocs: any[] = [];

    // Query notes (only lightweight metadata from Supabase database)
    if (type !== 'PYQ') {
      let query = client.from('notes').select(METADATA_COLUMNS);
      if (year && year !== 'All') query = query.eq('year', year);
      if (branch && branch !== 'All') query = query.eq('branch', branch);
      if (semester && semester !== 'All') query = query.eq('semester', semester);
      if (subject && subject !== 'All') query = query.eq('subject', subject);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) {
        allDocs.push(...data.map((d) => ({ ...d, type: 'Notes' })));
      }
    }

    // Query pyqs (only lightweight metadata from Supabase database)
    if (type !== 'Notes') {
      let query = client.from('pyqs').select(METADATA_COLUMNS);
      if (year && year !== 'All') query = query.eq('year', year);
      if (branch && branch !== 'All') query = query.eq('branch', branch);
      if (semester && semester !== 'All') query = query.eq('semester', semester);
      if (subject && subject !== 'All') query = query.eq('subject', subject);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) {
        allDocs.push(...data.map((d) => ({ ...d, type: 'PYQ' })));
      }
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
    if (!getStaffSession(req)) {
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

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not connected on the server. Please check Vercel environment variables.' },
        { status: 503 }
      );
    }

    const targetTable = type === 'PYQ' ? 'pyqs' : 'notes';
    const targetId = id || `doc-${Date.now()}`;

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
    if (!getStaffSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Staff sign-in required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, title, type } = body;

    if (!id || !title || !title.trim()) {
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
    if (!getStaffSession(req)) {
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
    const customWebhook = req.headers.get('x-gdrive-webhook');

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

    // Look up existing file_url / file_path before deleting DB row so Drive file can also be deleted
    let fileRefToDelete: string | null = paramFileUrl || paramFilePath || null;
    if (!fileRefToDelete) {
      try {
        if (type === 'PYQ' || type === 'PYQs') {
          const { data } = await client.from('pyqs').select('file_url, file_path').eq('id', id).limit(1).maybeSingle();
          fileRefToDelete = data?.file_url || data?.file_path || null;
        } else if (type === 'Notes') {
          const { data } = await client.from('notes').select('file_url, file_path').eq('id', id).limit(1).maybeSingle();
          fileRefToDelete = data?.file_url || data?.file_path || null;
        } else {
          const [nRes, pRes] = await Promise.all([
            client.from('notes').select('file_url, file_path').eq('id', id).limit(1).maybeSingle(),
            client.from('pyqs').select('file_url, file_path').eq('id', id).limit(1).maybeSingle(),
          ]);
          fileRefToDelete = nRes.data?.file_url || nRes.data?.file_path || pRes.data?.file_url || pRes.data?.file_path || null;
        }
      } catch {
        // Ignore lookup error and proceed
      }
    }

    // Delete file from Google Drive first (best-effort, never blocks DB cleanup if Drive URL isn't set)
    const driveResult = await deleteFileFromGoogleDriveServer(fileRefToDelete, client, customWebhook);

    // If type is known, delete from specific table. Otherwise delete from both.
    if (type === 'PYQ' || type === 'PYQs') {
      const { error } = await client.from('pyqs').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } else if (type === 'Notes') {
      const { error } = await client.from('notes').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } else {
      await Promise.all([
        client.from('notes').delete().eq('id', id),
        client.from('pyqs').delete().eq('id', id),
      ]);
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
