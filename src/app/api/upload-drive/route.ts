import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scriptUrl, fileName, mimeType, base64, folderId } = body;

    if (!scriptUrl) {
      return NextResponse.json(
        { success: false, error: 'Google Apps Script Web App URL is required.' },
        { status: 400 }
      );
    }

    if (!base64 || !fileName) {
      return NextResponse.json(
        { success: false, error: 'File content and filename are required.' },
        { status: 400 }
      );
    }

    // Call user's Google Apps Script Web App endpoint with follow redirects
    const gscriptResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName,
        mimeType: mimeType || 'application/pdf',
        base64,
        folderId: folderId || undefined,
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
  return NextResponse.json({
    status: 'online',
    service: 'Google Drive PDF Upload Gateway',
  });
}
