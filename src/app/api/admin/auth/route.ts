import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADMIN_COOKIE_NAME = 'notebase_admin_session';

/**
 * Helper to fetch credentials securely on the server
 */
async function getAdminServerCredentials(): Promise<{ id: string; password: string }> {
  const client = getSupabaseClient();
  const defaultId = process.env.ADMIN_DEFAULT_ID || 'admin';
  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';

  if (!client) {
    return { id: defaultId, password: defaultPassword };
  }

  try {
    const { data, error } = await client
      .from('admin_credentials')
      .select('id, password')
      .limit(1);

    if (error || !data || data.length === 0) {
      // Seed default admin in database if not present
      const defaultAdmin = { id: defaultId, password: defaultPassword, updated_at: new Date().toISOString() };
      await client.from('admin_credentials').upsert(defaultAdmin);
      return { id: defaultId, password: defaultPassword };
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
    const { action, id, password, currentPassword, newPassword } = body;

    // 1. ACTION: LOGIN
    if (action === 'login') {
      if (!id || !password) {
        return NextResponse.json(
          { success: false, error: 'Please enter both Admin ID and Password.' },
          { status: 400 }
        );
      }

      const creds = await getAdminServerCredentials();

      const isIdMatch = id.trim() === creds.id.trim();
      const isPassMatch = password.trim() === creds.password.trim();

      if (!isIdMatch || !isPassMatch) {
        return NextResponse.json(
          { success: false, error: 'Invalid Admin ID or Password.' },
          { status: 401 }
        );
      }

      // Login success: Set secure session cookie
      const response = NextResponse.json({
        success: true,
        adminId: creds.id,
      });

      response.cookies.set({
        name: ADMIN_COOKIE_NAME,
        value: `auth_${Buffer.from(creds.id).toString('base64')}_${Date.now()}`,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    // 2. ACTION: CHANGE PASSWORD
    if (action === 'change-password') {
      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password and new password are required.' },
          { status: 400 }
        );
      }

      const creds = await getAdminServerCredentials();

      if (currentPassword.trim() !== creds.password.trim()) {
        return NextResponse.json(
          { success: false, error: 'Current password does not match.' },
          { status: 400 }
        );
      }

      const cleanNewPassword = newPassword.trim();
      const client = getSupabaseClient();
      if (client) {
        await client
          .from('admin_credentials')
          .upsert({
            id: creds.id,
            password: cleanNewPassword,
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
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME);
  if (cookie && cookie.value) {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false });
}
