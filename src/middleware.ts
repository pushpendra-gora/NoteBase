import { NextRequest, NextResponse } from 'next/server';

const COORDINATOR_COOKIE_NAME = 'notebase_coordinator_session';

interface EdgeSessionPayload {
  role: 'admin' | 'coordinator';
  id: string;
  name?: string;
  year?: string;
  branch?: string;
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
    if (!payload || payload.role !== 'coordinator' || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (pathname.startsWith('/coordinator/dashboard')) {
    const token = req.cookies.get(COORDINATOR_COOKIE_NAME)?.value;
    const session = await verifyEdgeCoordinatorToken(token);

    if (!session || !session.year || !session.branch) {
      return NextResponse.redirect(new URL('/coordinator', req.url));
    }

    // Lock URL query parameters strictly to the verified coordinator session so URL tampering cannot view/access another branch or year
    const urlYear = searchParams.get('year');
    const urlBranch = searchParams.get('branch');
    const urlName = searchParams.get('name');

    if (
      urlYear !== session.year ||
      urlBranch !== session.branch ||
      (session.name && urlName !== session.name)
    ) {
      const canonical = new URL('/coordinator/dashboard', req.url);
      canonical.searchParams.set('year', session.year);
      canonical.searchParams.set('branch', session.branch);
      if (session.name) canonical.searchParams.set('name', session.name);
      return NextResponse.redirect(canonical);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/coordinator/dashboard/:path*'],
};
