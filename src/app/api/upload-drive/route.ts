import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scriptUrl, fileName, mimeType, base64, folderId } = body;

    // Use server-side secret environment variable first (never exposed to client),
    // with fallback to custom user-provided URL if configured in admin dashboard.
    const targetScriptUrl = process.env.GOOGLE_DRIVE_WEBHOOK_URL || scriptUrl;
    const targetFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || undefined;

    if (!targetScriptUrl) {
      return NextResponse.json(
        { success: false, error: 'Google Drive Web App URL is not configured on the server. Please set GOOGLE_DRIVE_WEBHOOK_URL in environment variables.' },
        { status: 400 }
      );
    }

    if (!base64 || !fileName) {
      return NextResponse.json(
        { success: false, error: 'File content and filename are required.' },
        { status: 400 }
      );
    }

    // Call Google Apps Script Web App endpoint from the secure server
    const gscriptResponse = await fetch(targetScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    try {
      const jsonOutput = JSON.parse(responseText);
      return NextResponse.json(jsonOutput);
    } catch {
      // If response was not strictly JSON, try to extract file info or report response
      if (responseText.includes('fileUrl') || responseText.includes('drive.google.com')) {
        return NextResponse.json({
          success: true,
          rawResponse: responseText,
        });
      }
      return NextResponse.json(
        {
          success: false,
          error: `Google Apps Script returned non-JSON response: ${responseText.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }
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
  const isConfigured = Boolean(process.env.GOOGLE_DRIVE_WEBHOOK_URL);
  return NextResponse.json({
    status: 'online',
    configured: isConfigured,
    service: 'Google Drive PDF Upload Gateway',
  });
}
