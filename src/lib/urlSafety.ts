/**
 * Validates that a URL is an explicit http://, https://, or gdrive:// reference
 * and blocks dangerous protocols such as javascript:, data:, vbscript:, or file:.
 */
export function normalizeSafeExternalUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('gdrive://')) {
    const fileId = trimmed.replace('gdrive://', '').trim();
    if (/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    }
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function openSafeExternalUrl(rawUrl?: string | null): boolean {
  const safe = normalizeSafeExternalUrl(rawUrl);
  if (!safe || typeof window === 'undefined') return false;
  window.open(safe, '_blank', 'noopener,noreferrer');
  return true;
}
