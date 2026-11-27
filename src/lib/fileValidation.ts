export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

export type AllowedFileCategory = 'pdf' | 'image' | 'html';

export const ALLOWED_FILE_INPUT_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.gif,.html,.htm,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/html';

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'html',
  'htm',
]);

const EXTENSION_MIME_MAP: Record<string, { category: AllowedFileCategory; defaultMime: string; allowedMimes: string[] }> = {
  pdf: {
    category: 'pdf',
    defaultMime: 'application/pdf',
    allowedMimes: ['application/pdf', 'application/x-pdf', ''],
  },
  png: {
    category: 'image',
    defaultMime: 'image/png',
    allowedMimes: ['image/png', ''],
  },
  jpg: {
    category: 'image',
    defaultMime: 'image/jpeg',
    allowedMimes: ['image/jpeg', 'image/jpg', 'image/pjpeg', ''],
  },
  jpeg: {
    category: 'image',
    defaultMime: 'image/jpeg',
    allowedMimes: ['image/jpeg', 'image/jpg', 'image/pjpeg', ''],
  },
  webp: {
    category: 'image',
    defaultMime: 'image/webp',
    allowedMimes: ['image/webp', ''],
  },
  gif: {
    category: 'image',
    defaultMime: 'image/gif',
    allowedMimes: ['image/gif', ''],
  },
  html: {
    category: 'html',
    defaultMime: 'text/html',
    allowedMimes: ['text/html', 'application/xhtml+xml', ''],
  },
  htm: {
    category: 'html',
    defaultMime: 'text/html',
    allowedMimes: ['text/html', 'application/xhtml+xml', ''],
  },
};

export interface FileValidationResult {
  valid: boolean;
  category?: AllowedFileCategory;
  extension?: string;
  canonicalMime?: string;
  error?: string;
}

export function getFileExtension(fileName: string): string {
  const clean = (fileName || '').trim();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === clean.length - 1) return '';
  return clean.slice(lastDot + 1).toLowerCase();
}

export function hasAllowedFileExtension(fileName?: string): boolean {
  const ext = getFileExtension(fileName || '');
  return Boolean(ext && ALLOWED_EXTENSIONS.has(ext));
}

export function isPdfFile(fileName?: string, mimeType?: string): boolean {
  const ext = getFileExtension(fileName || '');
  return ext === 'pdf' || (ext === '' && (mimeType || '').toLowerCase() === 'application/pdf');
}

export function resolveDocumentFilename(title: string, sourceFileName?: string): string {
  const cleanTitle = (title || 'document').trim() || 'document';
  if (hasAllowedFileExtension(cleanTitle)) {
    return cleanTitle;
  }
  const sourceExt = getFileExtension(sourceFileName || '');
  const ext = sourceExt && ALLOWED_EXTENSIONS.has(sourceExt) ? sourceExt : 'pdf';
  return `${cleanTitle}.${ext}`;
}

export function detectPreviewFileCategory(
  title?: string,
  fileUrl?: string,
  filePath?: string
): AllowedFileCategory {
  const candidates = [title, fileUrl, filePath];
  for (const raw of candidates) {
    if (!raw) continue;
    const withoutQuery = raw.split('#')[0].split('?')[0];
    const ext = getFileExtension(withoutQuery);
    if (ext && EXTENSION_MIME_MAP[ext]) {
      return EXTENSION_MIME_MAP[ext].category;
    }
  }
  return 'pdf';
}

export function validateFileMetadataOnly(
  fileName: string,
  mimeType?: string,
  fileSize?: number
): FileValidationResult {
  const cleanName = (fileName || '').trim();
  if (!cleanName) {
    return { valid: false, error: 'File name is missing.' };
  }

  const ext = getFileExtension(cleanName);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error:
        'Invalid file type! Only PDF (.pdf), Image (.png, .jpg, .jpeg, .webp, .gif), and HTML (.html, .htm) files are allowed.',
    };
  }

  const rule = EXTENSION_MIME_MAP[ext];
  const normalizedMime = (mimeType || '').trim().toLowerCase().split(';')[0];

  // Reject when browser/caller explicitly passes an unrelated/dangerous MIME type
  if (
    normalizedMime &&
    normalizedMime !== 'application/octet-stream' &&
    !rule.allowedMimes.includes(normalizedMime)
  ) {
    return {
      valid: false,
      error: `File MIME type (${normalizedMime}) does not match .${ext}. Only genuine PDF, Image, or HTML files are allowed.`,
    };
  }

  if (typeof fileSize === 'number') {
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return { valid: false, error: 'Selected file is empty.' };
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      return { valid: false, error: 'File exceeds the maximum 500 MB Google Drive upload limit.' };
    }
  }

  return {
    valid: true,
    category: rule.category,
    extension: ext,
    canonicalMime: rule.defaultMime,
  };
}

function startsWithBytes(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function startsWithAscii(bytes: Uint8Array, text: string, offset = 0): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function looksLikeBinaryExecutableOrArchive(bytes: Uint8Array): boolean {
  // MZ (Windows PE/EXE), ELF, ZIP/JAR/DOCX (PK), RAR, 7z, Mach-O
  if (startsWithAscii(bytes, 'MZ')) return true;
  if (startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true; // \x7FELF
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) return true; // PK..
  if (startsWithAscii(bytes, 'Rar!')) return true;
  if (startsWithBytes(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return true; // 7z
  return false;
}

/**
 * Verifies file extension + MIME + actual binary magic bytes / HTML text signature.
 * Can run in both browser and Node.js server using the first up to 4 KB of the file.
 */
export function inspectFileSignatureAndContent(
  fileName: string,
  mimeType: string | undefined,
  headBytes: Uint8Array,
  fileSize?: number
): FileValidationResult {
  const metaCheck = validateFileMetadataOnly(fileName, mimeType, fileSize);
  if (!metaCheck.valid || !metaCheck.extension || !metaCheck.category) {
    return metaCheck;
  }

  if (!headBytes || headBytes.length === 0) {
    return { valid: false, error: 'File content is empty or unreadable.' };
  }

  const ext = metaCheck.extension;

  if (ext === 'pdf') {
    // Allow optional leading whitespace/BOM before %PDF- within first 64 bytes
    let foundPdf = false;
    const scanLimit = Math.min(headBytes.length - 5, 64);
    for (let i = 0; i <= scanLimit; i++) {
      if (startsWithAscii(headBytes, '%PDF-', i)) {
        foundPdf = true;
        break;
      }
    }
    if (!foundPdf) {
      return {
        valid: false,
        error: 'Fake or corrupted PDF rejected: file content does not start with %PDF-.',
      };
    }
    return metaCheck;
  }

  if (ext === 'png') {
    const isPng = startsWithBytes(headBytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!isPng) {
      return {
        valid: false,
        error: 'Fake or corrupted PNG rejected: invalid PNG image header.',
      };
    }
    return metaCheck;
  }

  if (ext === 'jpg' || ext === 'jpeg') {
    const isJpeg = startsWithBytes(headBytes, [0xff, 0xd8, 0xff]);
    if (!isJpeg) {
      return {
        valid: false,
        error: 'Fake or corrupted JPEG rejected: invalid JPG/JPEG image header.',
      };
    }
    return metaCheck;
  }

  if (ext === 'gif') {
    const isGif = startsWithAscii(headBytes, 'GIF87a') || startsWithAscii(headBytes, 'GIF89a');
    if (!isGif) {
      return {
        valid: false,
        error: 'Fake or corrupted GIF rejected: invalid GIF image header.',
      };
    }
    return metaCheck;
  }

  if (ext === 'webp') {
    const isWebp = startsWithAscii(headBytes, 'RIFF', 0) && startsWithAscii(headBytes, 'WEBP', 8);
    if (!isWebp) {
      return {
        valid: false,
        error: 'Fake or corrupted WEBP rejected: invalid WEBP image header.',
      };
    }
    return metaCheck;
  }

  if (ext === 'html' || ext === 'htm') {
    if (looksLikeBinaryExecutableOrArchive(headBytes) || startsWithAscii(headBytes, '%PDF-')) {
      return {
        valid: false,
        error: 'Invalid HTML file rejected: binary/archive content disguised as HTML.',
      };
    }
    // Reject NUL bytes (binary file)
    for (let i = 0; i < headBytes.length; i++) {
      if (headBytes[i] === 0x00) {
        return {
          valid: false,
          error: 'Invalid HTML file rejected: contains binary NUL bytes.',
        };
      }
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(headBytes).trim();
    const hasHtmlTag =
      /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<(?:div|p|h[1-6]|section|article|main|header|footer|table|ul|ol|script|style|meta|title|link|span|a|img)[\s>/]/i.test(
        text
      );
    if (!hasHtmlTag) {
      return {
        valid: false,
        error: 'Invalid HTML file rejected: file does not contain valid HTML markup.',
      };
    }
    return metaCheck;
  }

  return {
    valid: false,
    error: 'Unsupported file type. Only PDF, Image, and HTML files are allowed.',
  };
}

/**
 * Browser-side File validator: inspects first 4 KB + extension + MIME + 500 MB size cap.
 */
export async function validateUploadFileClient(file: File): Promise<FileValidationResult & { headBase64?: string }> {
  const metaCheck = validateFileMetadataOnly(file.name, file.type, file.size);
  if (!metaCheck.valid) {
    return metaCheck;
  }

  try {
    const slice = file.slice(0, 4096);
    const buf = await slice.arrayBuffer();
    const headBytes = new Uint8Array(buf);
    const inspected = inspectFileSignatureAndContent(file.name, file.type, headBytes, file.size);
    if (!inspected.valid) {
      return inspected;
    }

    let binary = '';
    for (let i = 0; i < headBytes.length; i++) {
      binary += String.fromCharCode(headBytes[i]);
    }
    const headBase64 = typeof btoa !== 'undefined' ? btoa(binary) : '';
    return { ...inspected, headBase64 };
  } catch {
    return { valid: false, error: 'Failed to read and verify selected file.' };
  }
}
