import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { isBranchMatch } from '@/lib/coordinatorService';
import {
  COORDINATOR_COOKIE_NAME,
  createSignedSessionToken,
  getCoordinatorSession,
  hashPassword,
  verifyPassword,
} from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getCoordinatorSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    coordinator: {
      id: session.id,
      name: session.name,
      year: session.year,
      branch: session.branch,
    },
  });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COORDINATOR_COOKIE_NAME);
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, branch, password } = body;

    if (!year || !branch) {
      return NextResponse.json(
        { success: false, error: 'Please select both Year and Branch.' },
        { status: 400 }
      );
    }

    if (!password || !password.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please enter Coordinator Password.' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Database service is currently unreachable.' },
        { status: 503 }
      );
    }

    // Query coordinator records for this year from Supabase securely on server
    const { data, error } = await client
      .from('coordinators')
      .select('id, name, branch, year, initials, status, password')
      .eq('year', year);

    if (error || !data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: `No coordinator account found for ${year} - ${branch}. Please ask Admin to register you first.` },
        { status: 404 }
      );
    }

    // Find coordinator matching branch
    const matchingCoord = data.find((c) => isBranchMatch(c.branch, branch));

    if (!matchingCoord) {
      return NextResponse.json(
        { success: false, error: `No coordinator account found for ${year} - ${branch}. Please ask Admin to register you first.` },
        { status: 404 }
      );
    }

    if (matchingCoord.status === 'Inactive') {
      return NextResponse.json(
        { success: false, error: 'Your coordinator account is currently set to Inactive. Please contact Admin.' },
        { status: 403 }
      );
    }

    const inputPassword = password.trim();
    const correctPassword = (matchingCoord.password || '').trim();

    if (!correctPassword || !verifyPassword(inputPassword, correctPassword)) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password! Please enter the valid coordinator password assigned by Admin.' },
        { status: 401 }
      );
    }

    // Success: Set signed coordinator session cookie & return info WITHOUT password
    const response = NextResponse.json({
      success: true,
      coordinator: {
        id: matchingCoord.id,
        name: matchingCoord.name,
        branch: matchingCoord.branch,
        year: matchingCoord.year,
        initials: matchingCoord.initials,
      },
    });

    response.cookies.set({
      name: COORDINATOR_COOKIE_NAME,
      value: createSignedSessionToken('coordinator', {
        id: matchingCoord.id,
        name: matchingCoord.name,
        branch: matchingCoord.branch,
        year: matchingCoord.year,
      }),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) {
    console.error('Coordinator Auth Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = getCoordinatorSession(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in as Coordinator.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword || newPassword.trim().length < 4) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password (min 4 chars) are required.' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Database service is currently unreachable.' },
        { status: 503 }
      );
    }

    const { data, error } = await client
      .from('coordinators')
      .select('id, password')
      .eq('id', session.id)
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Coordinator account not found.' },
        { status: 404 }
      );
    }

    if (!verifyPassword(currentPassword, data.password || '')) {
      return NextResponse.json(
        { success: false, error: 'Current password does not match.' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await client
      .from('coordinators')
      .update({ password: hashPassword(newPassword.trim()) })
      .eq('id', session.id);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
