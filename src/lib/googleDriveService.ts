/**
 * Google Drive Cloud Storage Service
 * Handles uploading PDFs exclusively to user's Google Drive via Google Apps Script Web App,
 * generating public shareable URLs, and integrating with Supabase PostgreSQL database.
 * NOTE: PDFs are stored ONLY in Google Drive; Supabase stores only table metadata & URLs.
 */

export interface GoogleDriveConfig {
  webhookUrl: string;
  folderId: string;
  enabled: boolean;
}

const STORAGE_KEYS = {
  URL: 'notehub_gdrive_webhook_url',
  FOLDER: 'notehub_gdrive_folder_id',
  ENABLED: 'notehub_gdrive_enabled',
};

// Default Google Apps Script template for zero-maintenance user setup
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// ====================================================================
// NoteBase - Google Drive PDF Upload Web App
// ====================================================================
// Instructions:
// 1. Open Google Drive -> Click New -> More -> Google Apps Script
// 2. Paste this entire code into the editor (replace existing code)
// 3. Click "Deploy" (top right) -> "New deployment"
// 4. Select type: "Web app"
// 5. Description: "Notes PDF Uploader"
// 6. Execute as: "Me" (your Google account)
// 7. Who has access: "Anyone" (allows upload without login)
// 8. Click "Deploy" -> Authorize access
// 9. Copy the "Web app URL" and paste it in Admin Statistics!
// ====================================================================

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    
    // Decode base64 PDF
    var decoded = Utilities.base64Decode(data.base64);
    var blob = Utilities.newBlob(decoded, data.mimeType || 'application/pdf', data.fileName || 'document.pdf');
    
    // Select or create destination folder
    var folder;
    if (data.folderId && data.folderId.trim() !== "") {
      folder = DriveApp.getFolderById(data.folderId.trim());
    } else {
      var folderName = "College Notes App Uploads";
      var folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
      }
    }
    
    // Create the PDF file in Google Drive
    var file = folder.createFile(blob);
    
    // Make file publicly viewable with link
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var fileId = file.getId();
    // Public view and direct download links
    var publicViewUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
    var directDownloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    
    var output = {
      success: true,
      fileId: fileId,
      fileName: file.getName(),
      fileUrl: publicViewUrl,
      downloadUrl: directDownloadUrl,
      folderName: folder.getName(),
      created_at: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    var errorOutput = {
      success: false,
      error: err.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(errorOutput))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Google Drive Upload Web App is active and ready to receive PDFs."
  })).setMimeType(ContentService.MimeType.JSON);
}
`;

/**
 * Get current Google Drive configuration from localStorage
 */
export function getGoogleDriveConfig(): GoogleDriveConfig {
  const envWebhookUrl = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL || '';
  const envFolderId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID || '';

  if (typeof window === 'undefined') {
    return { webhookUrl: envWebhookUrl, folderId: envFolderId, enabled: Boolean(envWebhookUrl) };
  }
  const webhookUrl = localStorage.getItem(STORAGE_KEYS.URL) || envWebhookUrl;
  const folderId = localStorage.getItem(STORAGE_KEYS.FOLDER) || envFolderId;
  const enabledStr = localStorage.getItem(STORAGE_KEYS.ENABLED);
  const enabled = enabledStr === null ? Boolean(webhookUrl) : enabledStr === 'true';

  return { webhookUrl, folderId, enabled };
}

/**
 * Save Google Drive configuration to localStorage
 */
export function saveGoogleDriveConfig(config: Partial<GoogleDriveConfig>) {
  if (typeof window === 'undefined') return;

  if (config.webhookUrl !== undefined) {
    localStorage.setItem(STORAGE_KEYS.URL, config.webhookUrl.trim());
  }
  if (config.folderId !== undefined) {
    localStorage.setItem(STORAGE_KEYS.FOLDER, config.folderId.trim());
  }
  if (config.enabled !== undefined) {
    localStorage.setItem(STORAGE_KEYS.ENABLED, String(config.enabled));
  }
}

/**
 * Checks if Google Drive upload is properly configured and active
 */
export function isGoogleDriveConfigured(): boolean {
  const { webhookUrl, enabled } = getGoogleDriveConfig();
  return Boolean(enabled && webhookUrl && webhookUrl.startsWith('https://script.google.com/'));
}

/**
 * Converts a File object to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Strip out the data:application/pdf;base64, prefix
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Uploads a PDF to user's Google Drive via the Web App endpoint
 */
export async function uploadPdfToGoogleDrive(
  file: File,
  folderId?: string
): Promise<{
  success: boolean;
  fileUrl: string;
  downloadUrl: string;
  fileId: string;
  error?: string;
}> {
  const { webhookUrl, folderId: savedFolderId } = getGoogleDriveConfig();
  const targetFolderId = folderId || savedFolderId;

  if (!webhookUrl) {
    return {
      success: false,
      fileUrl: '',
      downloadUrl: '',
      fileId: '',
      error: 'Google Drive Web App URL is not configured.',
    };
  }

  try {
    const base64Data = await fileToBase64(file);

    const payload = {
      scriptUrl: webhookUrl,
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      base64: base64Data,
      folderId: targetFolderId || undefined,
    };

    // Use our internal Next.js API route as a proxy to handle CORS and redirects cleanly
    const response = await fetch('/api/upload-drive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error('File exceeds Vercel 4.5MB serverless limit. Please compress the PDF to under 3.5MB.');
      }
      const errText = await response.text();
      throw new Error(`Upload failed with HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Google Drive upload returned unsuccessful status');
    }

    return {
      success: true,
      fileUrl: result.fileUrl,
      downloadUrl: result.downloadUrl || result.fileUrl,
      fileId: result.fileId || '',
    };
  } catch (error: any) {
    console.error('Google Drive Upload Error:', error);
    return {
      success: false,
      fileUrl: '',
      downloadUrl: '',
      fileId: '',
      error: error?.message || 'Failed to upload to Google Drive',
    };
  }
}

/**
 * Uploads a PDF exclusively to Google Drive:
 * Supabase bucket is completely removed; Supabase stores only the document metadata & public fileUrl.
 * All actual PDF binaries are stored strictly in Google Drive.
 */
export async function uploadUnifiedPdf(
  file: File,
  folderPath?: string,
  metadata?: {
    title?: string;
    year?: string;
    branch?: string;
    semester?: string;
  }
): Promise<{
  publicUrl: string;
  filePath: string;
  storageType: 'gdrive';
} | null> {
  // Upload to Google Drive
  if (isGoogleDriveConfigured()) {
    try {
      const gdriveResult = await uploadPdfToGoogleDrive(file);
      if (gdriveResult.success && gdriveResult.fileUrl) {
        return {
          publicUrl: gdriveResult.fileUrl,
          filePath: `gdrive://${gdriveResult.fileId}`,
          storageType: 'gdrive',
        };
      }
      console.error('Google Drive upload error:', gdriveResult.error);
    } catch (gdriveErr) {
      console.error('Google Drive upload exception:', gdriveErr);
    }
  }

  return null;
}
