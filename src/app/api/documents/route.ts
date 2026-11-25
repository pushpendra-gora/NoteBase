import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

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
    const type = searchParams.get('type'); // 'Notes' or 'PYQ' or 'All'

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Database service is unreachable on the server.' },
        { status: 503 }
      );
    }

    let allDocs: any[] = [];

    // Query notes
    if (type !== 'PYQ') {
      let query = client.from('notes').select('*');
      if (year) query = query.eq('year', year);
      if (branch) query = query.eq('branch', branch);
      if (semester) query = query.eq('semester', semester);
      const { data, error } = await query;
      if (!error && data) {
        allDocs.push(...data.map((d) => ({ ...d, type: 'Notes' })));
      }
    }

    // Query pyqs
    if (type !== 'Notes') {
      let query = client.from('pyqs').select('*');
      if (year) query = query.eq('year', year);
      if (branch) query = query.eq('branch', branch);
      if (semester) query = query.eq('semester', semester);
      const { data, error } = await query;
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
      code: code || 'DOC101',
      pages: typeof pages === 'number' ? pages : 20,
      size: size || '3.5 MB',
      owner: owner || 'Department Faculty',
      file_url: file_url || null,
      file_path: file_path || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from(targetTable)
      .upsert(payload)
      .select();

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
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');

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

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('API /api/documents DELETE error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while deleting document.' },
      { status: 500 }
    );
  }
}
