/**
 * Formats byte count into a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Extracts real PDF page count from a local File without external libraries.
 * For large PDFs (>16 MB), reads only header and trailer slices to avoid high memory usage.
 * Returns 0 if the page count cannot be reliably determined.
 */
export async function extractPdfPageCount(file: File): Promise<number> {
  try {
    const decoder = new TextDecoder('latin1');
    const CHUNK_LIMIT = 16 * 1024 * 1024;
    let text = '';

    if (file.size > CHUNK_LIMIT) {
      const sliceSize = 4 * 1024 * 1024;
      const headBuf = await file.slice(0, sliceSize).arrayBuffer();
      const tailStart = Math.max(sliceSize, file.size - sliceSize);
      const tailBuf = await file.slice(tailStart, file.size).arrayBuffer();
      text = decoder.decode(new Uint8Array(headBuf)) + '\n' + decoder.decode(new Uint8Array(tailBuf));
    } else {
      const buffer = await file.arrayBuffer();
      text = decoder.decode(new Uint8Array(buffer));
    }

    // 1. Count explicit Page objects (/Type /Page but not /Type /Pages)
    const pageObjMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
    const countedPages = pageObjMatches ? pageObjMatches.length : 0;

    // 2. Also inspect /Pages /Count N declarations (root node holds total count)
    let maxPagesCount = 0;
    const countRegex = /\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)|\/Count\s+(\d+)[\s\S]{0,200}?\/Type\s*\/Pages/g;
    let match: RegExpExecArray | null;
    while ((match = countRegex.exec(text)) !== null) {
      const val = parseInt(match[1] || match[2] || '0', 10);
      if (val > maxPagesCount) {
        maxPagesCount = val;
      }
    }

    if (maxPagesCount > 0 && countedPages > 0) {
      return Math.max(maxPagesCount, countedPages);
    }
    return maxPagesCount || countedPages || 0;
  } catch {
    return 0;
  }
}
