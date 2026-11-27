import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, getCoordinatorSession, isValidGoogleScriptUrl } from '@/lib/serverAuth';
import { isBranchMatch } from '@/lib/coordinatorService';
import { deleteFileFromGoogleDriveServer, extractGoogleDriveFileId, loadMultiDriveState } from '@/lib/serverDrive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

function isGoogleLoginHtml(text: string): boolean {
  return (
    text.includes('accounts.google.com') ||
    text.includes('ServiceLogin') ||
    text.includes('Sign in - Google Accounts') ||
    text.includes('ppConfig') ||
    text.includes('<!DOCTYPE') ||
    text.includes('<html')
  );
}

function isOldScriptError(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('base64') ||
    lower.includes('invalid argument') ||
    lower.includes('cannot read properties') ||
    lower.includes('missing data')
  );
}

export async function POST(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in as Admin or Coordinator.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action, scriptUrl, driveId, fileName, mimeType, fileSize, base64, folderId, fileId, origin } = body || {};

    const client = getSupabaseClient();
    const multiState = await loadMultiDriveState(client);

    // Pick targeted Drive if Admin is testing a specific slot; otherwise use the Admin-selected Active Drive
    const selectedDrive =
      adminSession && driveId
        ? multiState.drives.find((d) => d.id === String(driveId).trim()) || null
        : multiState.activeDrive;

    if (adminSession && driveId && !selectedDrive) {
      return NextResponse.json(
        { success: false, error: 'Selected Google Drive slot is not configured on the server.' },
        { status: 404 }
      );
    }

    const targetScriptUrl = selectedDrive?.webhookUrl || (adminSession ? scriptUrl : undefined);
    const targetFolderId =
      (adminSession && folderId ? String(folderId).trim() : undefined) || selectedDrive?.folderId;

    if (!targetScriptUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Google Drive Web App URL is not configured. Please set GOOGLE_DRIVE_WEBHOOK_URL in Vercel or add a Drive in Admin -> Statistics.',
        },
        { status: 400 }
      );
    }

    if (targetScriptUrl.includes('/edit') || targetScriptUrl.endsWith('/dev') || !isValidGoogleScriptUrl(targetScriptUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid Google Apps Script Web App URL configured on server (must be https://script.google.com/.../exec).',
        },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------------
    // MODE 1: INIT DIRECT BROWSER-TO-DRIVE RESUMABLE UPLOAD (500 MB, 0 bytes through Vercel)
    // -----------------------------------------------------------------------
    if (action === 'init') {
      const cleanName = String(fileName || '').trim();
      const sizeBytes = Number(fileSize);
      const cleanMime = String(mimeType || 'application/pdf').trim() || 'application/pdf';

      if (!cleanName || (!cleanName.toLowerCase().endsWith('.pdf') && cleanMime !== 'application/pdf')) {
        return NextResponse.json(
          { success: false, error: 'Only valid PDF (.pdf) files are allowed.' },
          { status: 400 }
        );
      }

      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid or empty file size.' },
          { status: 400 }
        );
      }

      if (sizeBytes > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { success: false, error: 'File exceeds the maximum 500 MB Google Drive upload limit.' },
          { status: 413 }
        );
      }

      // Ask Apps Script (server-to-server) for short-lived OAuth token + destination folder ID
      const tokenRes = await fetch(targetScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getTokenAndFolder',
          folderId: targetFolderId || '',
        }),
        redirect: 'follow',
      });
      const tokenText = await tokenRes.text();

      if (isGoogleLoginHtml(tokenText)) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Google Apps Script requires authorization: set "Who has access" to "Anyone" and deploy.',
          },
          { status: 403 }
        );
      }

      let tokenJson: any = null;
      try {
        tokenJson = JSON.parse(tokenText);
      } catch {}

      if (!tokenJson?.success || !tokenJson?.accessToken) {
        const errStr = String(tokenJson?.error || tokenText.slice(0, 200));
        if (isOldScriptError(errStr) || !tokenJson) {
          return NextResponse.json(
            {
              success: false,
              needsScriptUpdate: true,
              error:
                'Deployed Google Apps Script needs to be updated (copy latest script from Admin -> Statistics -> View / Copy Setup Script) to support direct 500 MB uploads.',
            },
            { status: 422 }
          );
        }
        return NextResponse.json(
          { success: false, error: `Google Apps Script Error: ${errStr}` },
          { status: 502 }
        );
      }

      // Initiate Resumable Upload Session with Google Drive v3 API, passing browser Origin so CORS is bound cleanly
      const reqOrigin =
        (typeof origin === 'string' && /^https?:\/\/[^/]+$/.test(origin.trim()) ? origin.trim() : null) ||
        req.headers.get('origin') ||
        new URL(req.url).origin;

      const resolvedFolderId = String(tokenJson.folderId || targetFolderId || '').trim();
      const driveInitRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenJson.accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': cleanMime,
            'X-Upload-Content-Length': String(sizeBytes),
            Origin: reqOrigin,
          },
          body: JSON.stringify({
            name: cleanName,
            mimeType: cleanMime,
            ...(resolvedFolderId ? { parents: [resolvedFolderId] } : {}),
          }),
        }
      );

      if (!driveInitRes.ok) {
        const errBody = await driveInitRes.text().catch(() => '');
        return NextResponse.json(
          {
            success: false,
            error: `Google Drive refused upload session (${driveInitRes.status}): ${errBody.slice(0, 200)}`,
          },
          { status: 502 }
        );
      }

      const uploadUrl = driveInitRes.headers.get('location') || driveInitRes.headers.get('Location');
      if (!uploadUrl) {
        return NextResponse.json(
          { success: false, error: 'Google Drive did not return a resumable upload session URL.' },
          { status: 502 }
        );
      }

      // Return ONLY the single-use resumable session URI (never accessToken or webhookUrl!)
      return NextResponse.json({
        success: true,
        uploadUrl,
        driveUsedId: selectedDrive?.id || null,
        driveUsedName: selectedDrive?.name || 'Active Drive',
      });
    }

    // -----------------------------------------------------------------------
    // MODE 2: FINALIZE FILE PERMISSIONS AFTER DIRECT BROWSER UPLOAD
    // -----------------------------------------------------------------------
    if (action === 'finalize') {
      const cleanFileId = String(fileId || '').trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(cleanFileId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid Google Drive File ID.' },
          { status: 400 }
        );
      }

      const finRes = await fetch(targetScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'finalizeFile',
          fileId: cleanFileId,
        }),
        redirect: 'follow',
      });
      const finText = await finRes.text();
      let finJson: any = null;
      try {
        finJson = JSON.parse(finText);
      } catch {}

      if (finJson?.success && finJson?.fileUrl) {
        return NextResponse.json({
          ...finJson,
          driveUsedId: selectedDrive?.id || null,
          driveUsedName: selectedDrive?.name || 'Active Drive',
        });
      }

      return NextResponse.json({
        success: true,
        fileId: cleanFileId,
        fileUrl: `https://drive.google.com/file/d/${cleanFileId}/view?usp=sharing`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${cleanFileId}`,
        driveUsedId: selectedDrive?.id || null,
        driveUsedName: selectedDrive?.name || 'Active Drive',
      });
    }

    // -----------------------------------------------------------------------
    // MODE 3: LEGACY SMALL-FILE BASE64 FALLBACK (<= 4 MB)
    // -----------------------------------------------------------------------
    if (!base64 || !fileName) {
      return NextResponse.json(
        { success: false, error: 'File content (base64) and filename are required for upload.' },
        { status: 400 }
      );
    }

    const cleanLegacyName = String(fileName).trim();
    if (!cleanLegacyName.toLowerCase().endsWith('.pdf') && mimeType !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are permitted.' },
        { status: 400 }
      );
    }

    const rawBase64 = String(base64);
    const approxBytes = Math.floor((rawBase64.length * 3) / 4);
    if (approxBytes > 4.5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Legacy base64 upload exceeds 4 MB. Re-deploy updated Apps Script for 500 MB direct upload.' },
        { status: 413 }
      );
    }

    // Verify decoded PDF header starts with %PDF-
    const headBytes = Buffer.from(rawBase64.slice(0, 16), 'base64').toString('ascii');
    if (!headBytes.startsWith('%PDF-')) {
      return NextResponse.json(
        { success: false, error: 'Invalid PDF file content: missing %PDF- header.' },
        { status: 400 }
      );
    }

    const gscriptResponse = await fetch(targetScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        fileName: cleanLegacyName,
        mimeType: mimeType || 'application/pdf',
        base64: rawBase64,
        folderId: targetFolderId,
      }),
      redirect: 'follow',
    });

    const responseText = await gscriptResponse.text();

    if (isGoogleLoginHtml(responseText)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Google Apps Script requires authorization: In your Google Apps Script editor, click "Deploy" -> "Manage deployments" -> Edit (pencil icon) -> Set "Who has access" to "Anyone" -> Click "Deploy".',
        },
        { status: 403 }
      );
    }

    let jsonOutput: any = null;
    try {
      jsonOutput = JSON.parse(responseText);
    } catch {
      const fileIdMatch =
        responseText.match(/["']fileId["']\s*:\s*["']([^"']+)["']/) ||
        responseText.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

      if (fileIdMatch && fileIdMatch[1]) {
        const extractedId = fileIdMatch[1];
        jsonOutput = {
          success: true,
          fileId: extractedId,
          fileUrl: `https://drive.google.com/file/d/${extractedId}/view?usp=sharing`,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${extractedId}`,
        };
      }
    }

    if (jsonOutput && jsonOutput.success && jsonOutput.fileUrl) {
      return NextResponse.json({
        ...jsonOutput,
        driveUsedId: selectedDrive?.id || null,
        driveUsedName: selectedDrive?.name || 'Active Drive',
      });
    }

    if (jsonOutput && jsonOutput.error) {
      return NextResponse.json(
        { success: false, error: `Google Drive Error: ${jsonOutput.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: `Google Apps Script returned unexpected response: ${responseText.slice(0, 300)}`,
      },
      { status: 502 }
    );
  } catch (error: any) {
    console.error('API /upload-drive error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Internal server error while connecting to Google Drive Web App',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const client = getSupabaseClient();
  const state = await loadMultiDriveState(client);

  return NextResponse.json({
    status: 'online',
    configured: state.drives.length > 0,
    totalDrives: state.drives.length,
    maxUploadMb: 500,
    service: 'Google Drive Direct PDF Upload Gateway',
  });
}

export async function DELETE(req: NextRequest) {
  try {
    const adminSession = getAdminSession(req);
    const coordSession = getCoordinatorSession(req);
    if (!adminSession && !coordSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in as Admin or Coordinator.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { fileUrl, filePath, fileId, scriptUrl } = body;
    const candidate = fileUrl || filePath || (fileId ? `gdrive://${fileId}` : '');
    const client = getSupabaseClient();

    if (!adminSession && coordSession) {
      const targetId = extractGoogleDriveFileId(candidate);
      if (!targetId || !client) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Cannot verify document ownership for Drive deletion.' },
          { status: 403 }
        );
      }

      const [notesMatch, pyqsMatch] = await Promise.all([
        client.from('notes').select('year, branch, file_url, file_path').eq('year', coordSession.year),
        client.from('pyqs').select('year, branch, file_url, file_path').eq('year', coordSession.year),
      ]);

      const rows = [...(notesMatch.data || []), ...(pyqsMatch.data || [])];
      const ownsFile = rows.some((r: any) => {
        if (!coordSession.branch || !isBranchMatch(r.branch || '', coordSession.branch)) return false;
        return (
          extractGoogleDriveFileId(r.file_url) === targetId ||
          extractGoogleDriveFileId(r.file_path) === targetId
        );
      });

      if (!ownsFile) {
        return NextResponse.json(
          { success: false, error: 'Forbidden. You cannot delete Google Drive files outside your assigned Year & Branch.' },
          { status: 403 }
        );
      }
    }

    const result = await deleteFileFromGoogleDriveServer(
      candidate,
      client,
      adminSession ? scriptUrl : undefined
    );
    if (!result.attempted && !result.deleted) {
      return NextResponse.json(
        { success: false, error: result.error || 'No valid Google Drive file ID provided.' },
        { status: 400 }
      );
    }
    if (!result.deleted) {
      return NextResponse.json(
        {
          success: false,
          needsScriptUpdate: result.needsScriptUpdate,
          error: result.error || 'Failed to delete file from Google Drive.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Error deleting file from Google Drive.' },
      { status: 500 }
    );
  }
}
