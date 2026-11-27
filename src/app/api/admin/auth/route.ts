import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import {
  ADMIN_COOKIE_NAME,
  checkLoginRateLimit,
  createSignedSessionToken,
  getAdminSession,
  getClientIp,
  hashPassword,
  isSafeCredentialInput,
  resetLoginRateLimit,
  timingSafeEqualString,
  verifyPassword,
} from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * Helper to fetch credentials securely on the server
 */
async function getAdminServerCredentials(targetId?: string): Promise<{ id: string; password: string }> {
  const client = getSupabaseClient();
  const defaultId = process.env.ADMIN_DEFAULT_ID || 'admin';
  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';

  if (!client) {
    return { id: defaultId, password: defaultPassword };
  }

  try {
    if (targetId) {
      const { data: exactData, error: exactErr } = await client
        .from('admin_credentials')
        .select('id, password')
        .eq('id', targetId)
        .limit(1);

      if (!exactErr && exactData && exactData.length > 0) {
        return {
          id: exactData[0].id || defaultId,
          password: exactData[0].password || defaultPassword,
        };
      }
    }

    const { data, error } = await client
      .from('admin_credentials')
      .select('id, password')
      .limit(1);

    if (error || !data || data.length === 0) {
      // Seed default admin with hashed password if table is empty
      const hashedDefault = hashPassword(defaultPassword);
      const defaultAdmin = { id: defaultId, password: hashedDefault, updated_at: new Date().toISOString() };
      await client.from('admin_credentials').upsert(defaultAdmin);
      return { id: defaultId, password: hashedDefault };
    }

    return {
      id: data[0].id || defaultId,
      password: data[0].password || defaultPassword,
    };
  } catch {
    return { id: defaultId, password: defaultPassword };
  }
}

/**
 * POST handler for Admin Login and Password Change
 * NEVER exposes passwords to the client JavaScript bundle!
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request payload.' }, { status: 400 });
    }
    const { action, id, password, currentPassword, newPassword } = body;

    // 1. ACTION: LOGIN
    if (action === 'login') {
      const ipKey = `admin-login:${getClientIp(req)}`;
      const limit = checkLoginRateLimit(ipKey);
      if (!limit.allowed) {
        return NextResponse.json(
          { success: false, error: `Too many login attempts. Please wait ${limit.retryAfterSec}s before trying again.` },
          { status: 429 }
        );
      }

      if (!isSafeCredentialInput(id, 64) || !isSafeCredentialInput(password, 128)) {
        return NextResponse.json(
          { success: false, error: 'Please enter valid Admin ID and Password.' },
          { status: 400 }
        );
      }

      const cleanId = id.trim();
      const creds = await getAdminServerCredentials(cleanId);

      const isIdMatch = timingSafeEqualString(cleanId, (creds.id || '').trim());
      const isPassMatch = verifyPassword(password, creds.password);

      if (!isIdMatch || !isPassMatch) {
        return NextResponse.json(
          { success: false, error: 'Invalid Admin ID or Password.' },
          { status: 401 }
        );
      }

      resetLoginRateLimit(ipKey);

      // Login success: Set signed secure session cookie
      const response = NextResponse.json({
        success: true,
        adminId: creds.id,
      });

      response.cookies.set({
        name: ADMIN_COOKIE_NAME,
        value: createSignedSessionToken('admin', { id: creds.id }),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    // 2. ACTION: CHANGE PASSWORD (Requires active verified admin session)
    if (action === 'change-password') {
      const session = getAdminSession(req);
      if (!session) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized. Please sign in as Admin first.' },
          { status: 401 }
        );
      }

      if (!isSafeCredentialInput(currentPassword, 128) || !isSafeCredentialInput(newPassword, 128)) {
        return NextResponse.json(
          { success: false, error: 'Valid current password and new password are required.' },
          { status: 400 }
        );
      }

      const creds = await getAdminServerCredentials();

      if (!verifyPassword(currentPassword, creds.password)) {
        return NextResponse.json(
          { success: false, error: 'Current password does not match.' },
          { status: 400 }
        );
      }

      const hashedNewPassword = hashPassword(newPassword.trim());
      const client = getSupabaseClient();
      if (client) {
        await client
          .from('admin_credentials')
          .upsert({
            id: creds.id,
            password: hashedNewPassword,
            updated_at: new Date().toISOString(),
          });
      }

      return NextResponse.json({
        success: true,
        message: 'Admin password updated successfully in database.',
      });
    }

    // 3. ACTION: LOGOUT
    if (action === 'logout') {
      const response = NextResponse.json({ success: true });
      response.cookies.delete(ADMIN_COOKIE_NAME);
      return response;
    }

    return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Admin Auth Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}

/**
 * GET handler to check session status
 */
export async function GET(req: NextRequest) {
  const session = getAdminSession(req);
  if (session) {
    return NextResponse.json({ authenticated: true, adminId: session.id });
  }
  return NextResponse.json({ authenticated: false });
}
