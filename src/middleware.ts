import { NextRequest, NextResponse } from 'next/server';

const COORDINATOR_COOKIE_NAME = 'notebase_coordinator_session';

interface EdgeSessionPayload {
  role: 'admin' | 'coordinator';
  id: string;
  name?: string;
  year?: string;
  branch?: string;
  jti?: string;
  exp: number;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getEdgeSigningSecret(): Promise<string> {
  const explicit = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET;
  if (explicit && explicit.trim().length >= 16) {
    return explicit.trim();
  }
  const seed = [
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    process.env.ADMIN_DEFAULT_PASSWORD || 'notebase-default-seed',
    process.env.GOOGLE_DRIVE_WEBHOOK_URL || process.env.GDRIVE_WEBHOOK_URL || '',
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyEdgeCoordinatorToken(token: string | undefined): Promise<EdgeSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  try {
    const secret = await getEdgeSigningSecret();
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded));
    const expectedSig = uint8ArrayToBase64Url(new Uint8Array(mac));

    // Constant-time comparison
    if (sig.length !== expectedSig.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const payloadBytes = base64UrlToUint8Array(encoded);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as EdgeSessionPayload;
    if (
      !payload ||
      payload.role !== 'coordinator' ||
      !payload.id ||
      !payload.jti ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function isSessionStillActiveInDb(session: EdgeSessionPayload): Promise<boolean> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!supabaseUrl || !supabaseKey) return true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/coordinators?id=eq.${encodeURIComponent(
      session.id
    )}&select=id,status,active_session_id,session_expires_at&limit=1`;

    const res = await fetch(endpoint, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // Allow graceful fallback if DB column migration hasn't been applied yet
      return true;
    }
    const rows = (await res.json()) as Array<{
      id?: string;
      status?: string;
      active_session_id?: string | null;
      session_expires_at?: string | null;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      return false;
    }
    const row = rows[0];
    if (row.status === 'Inactive') return false;
    if (!row.active_session_id || row.active_session_id !== session.jti) return false;
    if (row.session_expires_at && new Date(row.session_expires_at).getTime() < Date.now()) {
      return false;
    }
    return true;
  } catch {
    // Do not hard-fail navigation on brief network timeout; client verify will still validate via /api/coordinator/auth
    return true;
  }
}

function redirectToCoordinatorLogin(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/coordinator', req.url));
  res.cookies.delete(COORDINATOR_COOKIE_NAME);
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith('/coordinator/dashboard')) {
    const token = req.cookies.get(COORDINATOR_COOKIE_NAME)?.value;
    const session = await verifyEdgeCoordinatorToken(token);

    if (!session || !session.year || !session.branch) {
      return redirectToCoordinatorLogin(req);
    }

    const active = await isSessionStillActiveInDb(session);
    if (!active) {
      return redirectToCoordinatorLogin(req);
    }

    // Never expose or rely on query parameters in the Coordinator dashboard URL
    if (search && search.length > 0) {
      const cleanUrl = new URL('/coordinator/dashboard', req.url);
      const res = NextResponse.redirect(cleanUrl);
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      return res;
    }

    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/coordinator/dashboard/:path*'],
};
