import crypto from 'crypto';
import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'notebase_admin_session';
export const COORDINATOR_COOKIE_NAME = 'notebase_coordinator_session';
export const COORDINATOR_IDLE_TIMEOUT_SECONDS = 60 * 60; // 1 hour inactivity limit

export interface SessionPayload {
  role: 'admin' | 'coordinator';
  id: string;
  name?: string;
  year?: string;
  branch?: string;
  exp: number;
}

// In-memory login attempt tracking per IP/action (mitigates brute-force & SQLi fuzzing)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_LIMIT_ENTRIES = 2000;

export function getClientIp(req: NextRequest): string {
  const vercelIp = req.headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    const first = vercelIp.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

export function checkLoginRateLimit(
  key: string,
  maxAttempts = 12,
  windowMs = 5 * 60 * 1000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES) {
    for (const [k, v] of loginAttempts.entries()) {
      if (now > v.resetAt) loginAttempts.delete(k);
    }
    if (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldestKey = loginAttempts.keys().next().value;
      if (oldestKey) loginAttempts.delete(oldestKey);
    }
  }
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function resetLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}

export function isSafeCredentialInput(value: unknown, maxLen = 128): value is string {
  if (typeof value !== 'string') return false;
  if (value.includes('\0')) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLen;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Compare dummy equal-length buffer so timing stays uniform
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function getSigningSecret(): string {
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
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain.trim(), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;
  if (plain.includes('\0') || stored.includes('\0')) return false;

  const cleanPlain = plain.trim();
  const cleanStored = stored.trim();
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
  return timingSafeEqualString(cleanPlain, cleanStored);
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
