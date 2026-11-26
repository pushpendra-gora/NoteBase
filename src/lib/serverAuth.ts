import crypto from 'crypto';
import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'notebase_admin_session';
export const COORDINATOR_COOKIE_NAME = 'notebase_coordinator_session';

export interface SessionPayload {
  role: 'admin' | 'coordinator';
  id: string;
  name?: string;
  year?: string;
  branch?: string;
  exp: number;
}

function getSigningSecret(): string {
  const explicit = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET;
  if (explicit && explicit.trim().length >= 16) {
    return explicit.trim();
  }
  const seed = [
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.ADMIN_DEFAULT_PASSWORD || 'notebase-default-seed',
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain.trim(), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const cleanPlain = (plain || '').trim();
  const cleanStored = (stored || '').trim();
  if (!cleanPlain || !cleanStored) return false;

  if (cleanStored.startsWith('scrypt$')) {
    const parts = cleanStored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hexHash] = parts;
    try {
      const derived = crypto.scryptSync(cleanPlain, salt, 64);
      const expected = Buffer.from(hexHash, 'hex');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  // Legacy plaintext compatibility with constant-time comparison
  const a = Buffer.from(cleanPlain, 'utf8');
  const b = Buffer.from(cleanStored, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createSignedSessionToken(
  role: 'admin' | 'coordinator',
  claims: Omit<SessionPayload, 'role' | 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const payload: SessionPayload = {
    ...claims,
    role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedSessionToken(
  token: string | undefined | null,
  expectedRole?: 'admin' | 'coordinator'
): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(encoded)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (expectedRole && payload.role !== expectedRole) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getAdminSession(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifySignedSessionToken(token, 'admin');
}

export function getCoordinatorSession(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COORDINATOR_COOKIE_NAME)?.value;
  return verifySignedSessionToken(token, 'coordinator');
}

export function getStaffSession(req: NextRequest): SessionPayload | null {
  return getAdminSession(req) || getCoordinatorSession(req);
}

export function isValidGoogleScriptUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'script.google.com' || parsed.hostname === 'script.googleusercontent.com')
    );
  } catch {
    return false;
  }
}
