import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scriptUrl, fileName, mimeType, base64, folderId } = body;

    // 1. Determine Google Apps Script Web App URL:
    // Priority 1: Server environment variables (GOOGLE_DRIVE_WEBHOOK_URL, NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL, GDRIVE_WEBHOOK_URL)
    // Priority 2: Client provided scriptUrl (from Admin settings)
    // Priority 3: Stored in Supabase admin_credentials table
    let targetScriptUrl = 
      process.env.GOOGLE_DRIVE_WEBHOOK_URL || 
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL || 
      process.env.GDRIVE_WEBHOOK_URL || 
      scriptUrl;
    let targetFolderId = 
      folderId || 
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

    if (!targetScriptUrl) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Google Drive Web App URL is not configured. Please paste your Google Apps Script Web App URL in Admin -> Statistics or set GOOGLE_DRIVE_WEBHOOK_URL in Vercel.' 
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

    // Check if Google Apps Script returned a login screen (indicates Web App permission is not "Anyone")
    if (
      responseText.includes('accounts.google.com') ||
      responseText.includes('ServiceLogin') ||
      responseText.includes('Sign in - Google Accounts')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Google Apps Script requires authorization. In your Google Apps Script editor, click Deploy -> Manage Deployments -> Edit (pencil icon) -> Set "Who has access" to "Anyone", then click Deploy.',
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
