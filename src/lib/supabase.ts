import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseCredentials(customUrl?: string, customKey?: string) {
  // 1. Explicitly provided credentials (e.g. from request headers or direct invocation)
  if (customUrl && customKey) {
    return { url: customUrl.trim(), key: customKey.trim() };
  }

  // 2. Client-side browser storage (allows Admin to set/override credentials in dashboard UI)
  if (typeof window !== 'undefined') {
    try {
      const savedUrl = localStorage.getItem('notehub_supabase_url');
      const savedKey = localStorage.getItem('notehub_supabase_anon_key');
      if (savedUrl && savedKey && savedUrl.trim() && savedKey.trim()) {
        return { url: savedUrl.trim(), key: savedKey.trim() };
      }
    } catch {
      // LocalStorage access may fail in restricted iframe environments
    }
  }

  // 3. Server / Client Environment Variables
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const envKey = (typeof window === 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
       process.env.SUPABASE_ANON_KEY || 
       process.env.NEXT_PUBLIC_SUPABASE_KEY || 
       process.env.SUPABASE_KEY || 
       '');

  return { url: envUrl.trim(), key: envKey.trim() };
}

export function saveSupabaseCredentials(url: string, key: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('notehub_supabase_url', url.trim());
    localStorage.setItem('notehub_supabase_anon_key', key.trim());
    // Invalidate client cache
    cachedClient = null;
    lastUsedUrl = '';
    lastUsedKey = '';
  } catch (err) {
    console.error('Failed to save Supabase credentials to localStorage:', err);
  }
}

export function clearSupabaseCredentials() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('notehub_supabase_url');
    localStorage.removeItem('notehub_supabase_anon_key');
    cachedClient = null;
    lastUsedUrl = '';
    lastUsedKey = '';
  } catch (err) {
    console.error('Failed to clear Supabase credentials from localStorage:', err);
  }
}

function isAllowedSupabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.supabase.in'))
    );
  } catch {
    return false;
  }
}

export function isSupabaseConfigured(customUrl?: string, customKey?: string): boolean {
  const { url, key } = getSupabaseCredentials(customUrl, customKey);
  return Boolean(
    url &&
    key &&
    isAllowedSupabaseUrl(url) &&
    key.length > 20
  );
}

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials(customUrl, customKey);
  if (!url || !key || !isAllowedSupabaseUrl(url)) {
    return null;
  }

  if (cachedClient && lastUsedUrl === url && lastUsedKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
    lastUsedUrl = url;
    lastUsedKey = key;
    return cachedClient;
  } catch (err) {
    console.error('Error creating Supabase client:', err);
    return null;
  }
}

export const supabase = getSupabaseClient();
