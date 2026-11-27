import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, hashPassword } from '@/lib/serverAuth';
import { adjustMaterialCounts } from '@/lib/serverCounters';

export const dynamic = 'force-dynamic';

function resolveClient(req: NextRequest) {
  const isAdmin = Boolean(getAdminSession(req));
  const customUrl = isAdmin ? (req.headers.get('x-supabase-url') || undefined) : undefined;
  const customKey = isAdmin ? (req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key') || undefined) : undefined;
  return getSupabaseClient(customUrl, customKey);
}

/**
 * GET /api/coordinators
 * Fetches all coordinators directly from Supabase (Admin only, never exposes passwords)
 */
export async function GET(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin sign-in required.' },
        { status: 401 }
      );
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase client is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel or in Admin Settings.' },
        { status: 503 }
      );
    }

    const { data, error } = await client
      .from('coordinators')
      .select('id, name, branch, year, initials, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching coordinators from Supabase:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      coordinators: data || [],
    });
  } catch (err: any) {
    console.error('API /api/coordinators GET error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while fetching coordinators.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coordinators
 * Inserts or upserts a coordinator in Supabase
 */
export async function POST(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin sign-in required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, name, branch, year, password, initials, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Coordinator Name is required.' },
        { status: 400 }
      );
    }
    if (!branch || !year) {
      return NextResponse.json(
        { success: false, error: 'Branch and Year are required.' },
        { status: 400 }
      );
    }
    if (!password || !password.trim()) {
      return NextResponse.json(
        { success: false, error: 'Password is required.' },
        { status: 400 }
      );
    }

    const client = resolveClient(req);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Supabase database is not connected. Please verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel or Admin Settings.' },
        { status: 503 }
      );
    }

    const cleanInitials = initials || name.trim().split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'CO';
    const targetId = id || `coord-${Date.now()}`;

    const { data: existingCoord } = await client
      .from('coordinators')
      .select('id')
      .eq('id', targetId)
      .limit(1)
      .maybeSingle();

    const record = {
      id: targetId,
      name: name.trim(),
      branch: branch.trim(),
      year: year.trim(),
      password: hashPassword(password.trim()),
      initials: cleanInitials,
      status: status || 'Active',
    };

    const SAFE_COLUMNS = 'id, name, branch, year, initials, status, created_at';

    // Attempt upsert on primary key `id`
    let { data, error } = await client
      .from('coordinators')
      .upsert(record, { onConflict: 'id' })
      .select(SAFE_COLUMNS);

    // If upsert fails, try direct insert
    if (error) {
      const insertResult = await client
        .from('coordinators')
        .insert(record)
        .select(SAFE_COLUMNS);
      if (!insertResult.error) {
        data = insertResult.data;
        error = null;
      } else {
        error = insertResult.error;
      }
    }

    if (error) {
      console.error('Supabase error inserting coordinator:', error);
      const isTableMissing = error.message.includes('does not exist') || error.code === '42P01';
      return NextResponse.json(
        { 
          success: false, 
          error: isTableMissing 
            ? "Table 'coordinators' does not exist in Supabase. Please run supabase-schema.sql in Supabase SQL Editor."
            : error.message,
          code: error.code,
        },
        { status: 500 }
      );
    }

    if (!existingCoord) {
      await adjustMaterialCounts(client, { coordinators: 1 });
    }

    return NextResponse.json({
      success: true,
      coordinator: {
        id: record.id,
        name: record.name,
        branch: record.branch,
        year: record.year,
        initials: record.initials,
        status: record.status,
      },
      data,
    });
  } catch (err: any) {
    console.error('API /api/coordinators POST error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while saving coordinator to Supabase.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/coordinators
 * Updates an existing coordinator in Supabase
 */
export async function PUT(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin sign-in required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, name, branch, year, password, initials, status } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Coordinator ID is required for update.' },
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

    const updatePayload: any = {};
    if (name) updatePayload.name = name.trim();
    if (branch) updatePayload.branch = branch.trim();
    if (year) updatePayload.year = year.trim();
    if (password && password.trim()) updatePayload.password = hashPassword(password.trim());
    if (initials) updatePayload.initials = initials;
    if (status) updatePayload.status = status;

    const { error } = await client
      .from('coordinators')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      console.error('Supabase error updating coordinator:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const { password: _omitPassword, ...safeUpdated } = updatePayload;
    return NextResponse.json({ success: true, updated: safeUpdated });
  } catch (err: any) {
    console.error('API /api/coordinators PUT error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while updating coordinator.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coordinators
 * Deletes a coordinator from Supabase
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!getAdminSession(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin sign-in required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Coordinator ID is required.' },
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

    const { data: existingCoord } = await client
      .from('coordinators')
      .select('id')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    const { error } = await client
      .from('coordinators')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase error deleting coordinator:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (existingCoord) {
      await adjustMaterialCounts(client, { coordinators: -1 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('API /api/coordinators DELETE error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while deleting coordinator.' },
      { status: 500 }
    );
  }
}
