import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { isBranchMatch } from '@/lib/coordinatorService';
import {
  COORDINATOR_COOKIE_NAME,
  COORDINATOR_IDLE_TIMEOUT_SECONDS,
  checkLoginRateLimit,
  createSignedSessionToken,
  getClientIp,
  getCoordinatorSession,
  hashPassword,
  isSafeCredentialInput,
  resetLoginRateLimit,
  verifyPassword,
} from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const ALLOWED_YEARS = new Set(['1st Year', '2nd Year', '3rd Year', '4th Year']);

function setCoordinatorCookie(
  response: NextResponse,
  claims: { id: string; name?: string; branch?: string; year?: string }
) {
  response.cookies.set({
    name: COORDINATOR_COOKIE_NAME,
    value: createSignedSessionToken(
      'coordinator',
      {
        id: claims.id,
        name: claims.name,
        branch: claims.branch,
        year: claims.year,
      },
      COORDINATOR_IDLE_TIMEOUT_SECONDS
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COORDINATOR_IDLE_TIMEOUT_SECONDS,
  });
}

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

export async function PUT(req: NextRequest) {
  const session = getCoordinatorSession(req);
  if (!session) {
    const response = NextResponse.json({ authenticated: false, expired: true }, { status: 401 });
    response.cookies.delete(COORDINATOR_COOKIE_NAME);
    return response;
  }

  const response = NextResponse.json({ authenticated: true });
  setCoordinatorCookie(response, {
    id: session.id,
    name: session.name,
    branch: session.branch,
    year: session.year,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COORDINATOR_COOKIE_NAME);
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const ipKey = `coord-login:${getClientIp(req)}`;
    const limit = checkLoginRateLimit(ipKey);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many login attempts. Please wait ${limit.retryAfterSec}s before trying again.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request payload.' }, { status: 400 });
    }
    const { year, branch, password } = body;

    if (!isSafeCredentialInput(year, 32) || !ALLOWED_YEARS.has(year.trim()) || !isSafeCredentialInput(branch, 80)) {
      return NextResponse.json(
        { success: false, error: 'Please select valid Year and Branch.' },
        { status: 400 }
      );
    }

    if (!isSafeCredentialInput(password, 128)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid Coordinator Password.' },
        { status: 400 }
      );
    }

    const cleanYear = year.trim();
    const cleanBranch = branch.trim();

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
      .eq('year', cleanYear);

    if (error || !data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: `No coordinator account found for ${cleanYear} - ${cleanBranch}. Please ask Admin to register you first.` },
        { status: 404 }
      );
    }

    // Find coordinator matching branch
    const matchingCoord = data.find((c) => isBranchMatch(c.branch, cleanBranch));

    if (!matchingCoord) {
      return NextResponse.json(
        { success: false, error: `No coordinator account found for ${cleanYear} - ${cleanBranch}. Please ask Admin to register you first.` },
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

    // Automatically upgrade any legacy plaintext coordinator password in DB to scrypt$ hash
    if (!correctPassword.startsWith('scrypt$')) {
      await client
        .from('coordinators')
        .update({ password: hashPassword(inputPassword) })
        .eq('id', matchingCoord.id)
        .then(() => {}, () => {});
    }

    resetLoginRateLimit(ipKey);

    // Record Coordinator login audit event in Supabase (non-blocking if table isn't created yet)
    try {
      const logEntry = {
        id: `coord-log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        coordinator_id: matchingCoord.id,
        coordinator_name: matchingCoord.name,
        year: cleanYear,
        branch: matchingCoord.branch,
        ip_address: getClientIp(req),
        user_agent: (req.headers.get('user-agent') || '').slice(0, 240),
        logged_in_at: new Date().toISOString(),
      };
      await client.from('coordinator_login_logs').insert(logEntry);
    } catch {
      // Login still succeeds even if coordinator_login_logs table hasn't been initialized yet
    }

    // Success: Set signed coordinator session cookie (1-hour sliding inactivity limit)
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

    setCoordinatorCookie(response, {
      id: matchingCoord.id,
      name: matchingCoord.name,
      branch: matchingCoord.branch,
      year: matchingCoord.year,
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
