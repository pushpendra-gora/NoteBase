import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession, getCoordinatorSession, isValidGoogleScriptUrl } from '@/lib/serverAuth';
import { isBranchMatch } from '@/lib/coordinatorService';
import { deleteFileFromGoogleDriveServer, extractGoogleDriveFileId } from '@/lib/serverDrive';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const { scriptUrl, fileName, mimeType, base64, folderId } = body;

    // 1. Determine Google Apps Script Web App URL (only Admin may supply custom scriptUrl fallback):
    // Priority 1: Server environment variables
    // Priority 2: Stored in Supabase admin_credentials table
    // Priority 3: Admin-provided scriptUrl (never Coordinator-provided)
    let targetScriptUrl =
      process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL ||
      process.env.GDRIVE_WEBHOOK_URL ||
      undefined;
    let targetFolderId =
      (adminSession ? folderId : undefined) ||
      process.env.GOOGLE_DRIVE_FOLDER_ID ||
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID ||
      undefined;

    if (!targetScriptUrl) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client
            .from('admin_credentials')
            .select('gdrive_webhook, gdrive_folder_id')
            .eq('id', 'admin')
            .limit(1)
            .single();

          if (data?.gdrive_webhook) {
            targetScriptUrl = data.gdrive_webhook;
            if (!targetFolderId && data.gdrive_folder_id) {
              targetFolderId = data.gdrive_folder_id;
            }
          }
        }
      } catch (dbErr) {
        console.warn('Could not check Supabase for Google Drive webhook:', dbErr);
      }
    }

    if (!targetScriptUrl && adminSession && scriptUrl) {
      targetScriptUrl = scriptUrl;
    }

    if (!targetScriptUrl) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Google Drive Web App URL is not configured. Please paste your Google Apps Script Web App URL in Admin -> Statistics or set GOOGLE_DRIVE_WEBHOOK_URL in Vercel.' 
        },
        { status: 400 }
      );
    }

    if (targetScriptUrl.includes('/edit')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid URL: You copied the Google Apps Script Editor link. Please click "Deploy" -> "Manage Deployments" -> copy the "Web app URL" (ends with /exec).'
        },
        { status: 400 }
      );
    }

    if (targetScriptUrl.endsWith('/dev')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid URL: Your URL ends with /dev (test deployment), which forces Google login. Please click "Deploy" -> "New Deployment" -> select "Web app" -> set "Who has access" to "Anyone" -> Deploy, and copy the URL ending with /exec.'
        },
        { status: 400 }
      );
    }

    if (!isValidGoogleScriptUrl(targetScriptUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid Google Apps Script URL. Only https://script.google.com/ URLs are allowed.'
        },
        { status: 400 }
      );
    }

    if (!base64 || !fileName) {
      return NextResponse.json(
        { success: false, error: 'File content (base64) and filename are required for upload.' },
        { status: 400 }
      );
    }

    // Call Google Apps Script Web App endpoint from the secure server
    const gscriptResponse = await fetch(targetScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        fileName,
        mimeType: mimeType || 'application/pdf',
        base64,
        folderId: targetFolderId,
      }),
      redirect: 'follow',
    });

    const responseText = await gscriptResponse.text();

    // Check if Google Apps Script returned a login screen, passport redirect, or unexpected HTML
    if (
      responseText.includes('accounts.google.com') ||
      responseText.includes('ServiceLogin') ||
      responseText.includes('Sign in - Google Accounts') ||
      responseText.includes('ppConfig') ||
      responseText.includes('<!DOCTYPE') ||
      responseText.includes('<html')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google Apps Script requires authorization: In your Google Apps Script editor, click "Deploy" -> "Manage deployments" -> Edit (pencil icon) -> Set "Who has access" to "Anyone" -> Click "Deploy". (If prompted, click Review Permissions -> Advanced -> Allow).',
        },
        { status: 403 }
      );
    }

    // Try parsing standard JSON output
    let jsonOutput: any = null;
    try {
      jsonOutput = JSON.parse(responseText);
    } catch {
      // If response text has HTML with embedded fileId, extract it cleanly
      const fileIdMatch =
        responseText.match(/["']fileId["']\s*:\s*["']([^"']+)["']/) ||
        responseText.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

      if (fileIdMatch && fileIdMatch[1]) {
        const fileId = fileIdMatch[1];
        jsonOutput = {
          success: true,
          fileId: fileId,
          fileUrl: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        };
      }
    }

    if (jsonOutput && jsonOutput.success && jsonOutput.fileUrl) {
      return NextResponse.json(jsonOutput);
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
  let isConfigured = Boolean(process.env.GOOGLE_DRIVE_WEBHOOK_URL);
  if (!isConfigured) {
    try {
      const client = getSupabaseClient();
      if (client) {
        const { data } = await client
          .from('admin_credentials')
          .select('gdrive_webhook')
          .eq('id', 'admin')
          .limit(1)
          .single();
        if (data?.gdrive_webhook) {
          isConfigured = true;
        }
      }
    } catch {}
  }

  return NextResponse.json({
    status: 'online',
    configured: isConfigured,
    service: 'Google Drive PDF Upload Gateway',
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

    // Coordinators may only delete Drive files belonging to their own Year & Branch
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
