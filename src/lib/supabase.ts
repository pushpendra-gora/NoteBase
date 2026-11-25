import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read default credentials from environment variables or browser storage
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function getSupabaseCredentials() {
  if (typeof window !== 'undefined') {
    const savedUrl = localStorage.getItem('notehub_supabase_url');
    const savedKey = localStorage.getItem('notehub_supabase_anon_key');
    if (savedUrl && savedKey) {
      return { url: savedUrl, key: savedKey };
    }
  }
  return { url: envUrl, key: envKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseCredentials();
  return Boolean(
    url &&
    key &&
    url.startsWith('https://') &&
    url.includes('.supabase.co') &&
    key.length > 20
  );
}

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();
  if (!url || !key || !url.startsWith('https://')) {
    return null;
  }

  if (cachedClient && lastUsedUrl === url && lastUsedKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key);
    lastUsedUrl = url;
    lastUsedKey = key;
    return cachedClient;
  } catch (err) {
    console.error('Error creating Supabase client:', err);
    return null;
  }
}

export const supabase = getSupabaseClient();
