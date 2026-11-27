import { NextRequest, NextResponse } from 'next/server';
import { extractGoogleDriveFileId } from '@/lib/serverDrive';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_PREVIEW_BYTES = 10 * 1024 * 1024; // 10 MB safe cap for HTML/Image preview proxy

function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 6) {
    const ascii6 = Buffer.from(bytes.subarray(0, 6)).toString('ascii');
    if (ascii6 === 'GIF87a' || ascii6 === 'GIF89a') {
      return 'image/gif';
    }
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

async function readResponseBytesWithLimit(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLen = Number(res.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    throw new Error('FILE_TOO_LARGE');
  }

  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error('FILE_TOO_LARGE');
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('FILE_TOO_LARGE');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get('mode');
    const rawUrl = req.nextUrl.searchParams.get('url') || '';

    if (mode !== 'html' && mode !== 'image') {
      return NextResponse.json(
        { success: false, error: 'Invalid preview mode.' },
        { status: 400 }
      );
    }

    // Strict SSRF protection: only fetch verified Google Drive file IDs from drive.google.com
    const driveFileId = extractGoogleDriveFileId(rawUrl);
    if (!driveFileId || !/^[a-zA-Z0-9_-]{10,80}$/.test(driveFileId)) {
      return NextResponse.json(
        { success: false, error: 'Only valid Google Drive file URLs are supported by preview proxy.' },
        { status: 400 }
      );
    }

    const downloadUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(driveFileId)}`;
    const upstream = await fetch(downloadUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NoteBasePreview/1.0)',
      },
      cache: 'no-store',
    });

    if (upstream.url && upstream.url.includes('accounts.google.com')) {
      return NextResponse.json(
        { success: false, error: 'This Google Drive file is not publicly shared ("Anyone with the link").' },
        { status: 403 }
      );
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch preview file from Google Drive (HTTP ${upstream.status}).` },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 }
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = await readResponseBytesWithLimit(upstream, MAX_PREVIEW_BYTES);
    } catch (e: any) {
      if (e?.message === 'FILE_TOO_LARGE') {
        return NextResponse.json(
          { success: false, error: 'Preview file exceeds the 10 MB inline preview limit. Please download it instead.' },
          { status: 413 }
        );
      }
      throw e;
    }

    if (bytes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File returned empty content.' },
        { status: 502 }
      );
    }

    if (mode === 'image') {
      const detectedMime = detectImageMimeFromBytes(bytes);
      if (!detectedMime) {
        return NextResponse.json(
          { success: false, error: 'Upstream Drive response is not a valid image (file may be private).' },
          { status: 415 }
        );
      }
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          'Content-Type': detectedMime,
          'Content-Length': String(bytes.byteLength),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    // mode === 'html'
    // Reject binary content / NUL bytes or PDF disguised as HTML
    const headStr = Buffer.from(bytes.subarray(0, 8)).toString('ascii');
    if (headStr.startsWith('%PDF-') || headStr.startsWith('MZ') || headStr.startsWith('PK')) {
      return NextResponse.json(
        { success: false, error: 'File content is not an HTML document.' },
        { status: 415 }
      );
    }
    const sampleLimit = Math.min(bytes.length, 4096);
    for (let i = 0; i < sampleLimit; i++) {
      if (bytes[i] === 0x00) {
        return NextResponse.json(
          { success: false, error: 'Binary file cannot be rendered as HTML preview.' },
          { status: 415 }
        );
      }
    }

    const htmlText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (
      htmlText.includes('accounts.google.com/ServiceLogin') ||
      htmlText.includes('Sign in - Google Accounts')
    ) {
      return NextResponse.json(
        { success: false, error: 'This Google Drive HTML file requires public "Anyone with the link" sharing.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: true, html: htmlText },
      {
        status: 200,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=60',
        },
      }
    );
  } catch (err: any) {
    console.error('Preview File Proxy Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load file preview.' },
      { status: 500 }
    );
  }
}
