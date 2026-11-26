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

    // Handle Delete Request from NoteBase Admin / Coordinator
    if (data.action === 'delete') {
      if (!data.fileId || String(data.fileId).trim() === "") {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "Missing fileId for deletion"
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var targetId = String(data.fileId).trim();
      var targetFile = DriveApp.getFileById(targetId);
      try {
        targetFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      } catch (shareErr) {
        // Ignore if sharing permissions cannot be updated
      }
      try {
        var parents = targetFile.getParents();
        while (parents.hasNext()) {
          parents.next().removeFile(targetFile);
        }
      } catch (parentErr) {
        // Ignore if parent removal is restricted
      }
      targetFile.setTrashed(true);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        deleted: true,
        deletedFileId: targetId
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Decode base64 PDF
    var decoded = Utilities.base64Decode(data.base64);
    var blob = Utilities.newBlob(decoded, data.mimeType || 'application/pdf', data.fileName || 'document.pdf');
    
    // Select or create destination folder
    var folder;
    if (data.folderId && data.folderId.trim() !== "") {
      folder = DriveApp.getFolderById(data.folderId.trim());
    } else {
      var folderName = "NoteBase Uploads";
      var folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
      }
    }
    
    // Create the PDF file in Google Drive
    var file = folder.createFile(blob);
    var fileId = file.getId();
    var fileName = file.getName();
    
    // Try to make file viewable with link (ignore error if restricted by Google Account settings)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Ignore: folder-level sharing or direct Drive view will work
    }
    
    // Public view and direct download links
    var publicViewUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
    var directDownloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    
    var output = {
      success: true,
      fileId: fileId,
      fileName: fileName,
      fileUrl: publicViewUrl,
      downloadUrl: directDownloadUrl,
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
 * Get current Google Drive configuration from localStorage or environment
 */
export function getGoogleDriveConfig(): GoogleDriveConfig {
  if (typeof window === 'undefined') {
    return {
      webhookUrl:
        process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
        process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL ||
        '',
      folderId:
        process.env.GOOGLE_DRIVE_FOLDER_ID ||
        process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID ||
        '',
      enabled: true,
    };
  }
  const envWebhook = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL || '';
  const envFolder = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID || '';
  const webhookUrl = localStorage.getItem(STORAGE_KEYS.URL) || envWebhook;
  const folderId = localStorage.getItem(STORAGE_KEYS.FOLDER) || envFolder;
  const enabledStr = localStorage.getItem(STORAGE_KEYS.ENABLED);
  const enabled = enabledStr === null ? true : enabledStr === 'true';

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
 * Checks if Google Drive upload is properly configured and active.
 */
export function isGoogleDriveConfigured(): boolean {
  if (typeof window === 'undefined') {
    return Boolean(
      process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL ||
      process.env.GDRIVE_WEBHOOK_URL
    );
  }
  const customUrl = localStorage.getItem(STORAGE_KEYS.URL);
  if (customUrl && customUrl.startsWith('https://script.google.com/')) {
    const enabledStr = localStorage.getItem(STORAGE_KEYS.ENABLED);
    return enabledStr !== 'false';
  }
  if (process.env.NEXT_PUBLIC_GOOGLE_DRIVE_WEBHOOK_URL) {
    return true;
  }
  return localStorage.getItem('notebase_gdrive_server_configured') === 'true';
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

export let lastGoogleDriveError: string = '';

/**
 * Uploads a PDF to Google Drive:
 * 1. If admin configured a custom Webhook URL in dashboard localStorage, tries direct browser upload.
 * 2. Otherwise calls secure server endpoint `/api/upload-drive` which holds GOOGLE_DRIVE_WEBHOOK_URL server-only!
 * (Zero webhook secrets exposed to client bundle!)
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
  lastGoogleDriveError = '';
  const { webhookUrl, folderId: savedFolderId } = getGoogleDriveConfig();
  const targetFolderId = folderId || savedFolderId;

  try {
    const base64Data = await fileToBase64(file);

    const payload = {
      scriptUrl: webhookUrl || undefined,
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      base64: base64Data,
      folderId: targetFolderId || undefined,
    };

    let response: Response;

    // Secure server gateway routes through Next.js server with fallback to direct
    try {
      response = await fetch('/api/upload-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (serverErr) {
      if (webhookUrl && webhookUrl.startsWith('https://script.google.com/')) {
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
        });
      } else {
        throw serverErr;
      }
    }

    const responseText = await response.text();
    let result: any = null;
    try {
      result = JSON.parse(responseText);
    } catch {
      // Check if response contains direct drive links
      const match = responseText.match(/https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        result = {
          success: true,
          fileId: match[1],
          fileUrl: `https://drive.google.com/file/d/${match[1]}/view?usp=sharing`,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${match[1]}`,
        };
      }
    }

    if (!response.ok || !result || !result.success) {
      const errMsg = result?.error || `Upload failed (Status ${response.status}): ${responseText.slice(0, 150)}`;
      lastGoogleDriveError = errMsg;
      throw new Error(errMsg);
    }

    return {
      success: true,
      fileUrl: result.fileUrl,
      downloadUrl: result.downloadUrl || result.fileUrl,
      fileId: result.fileId || '',
    };
  } catch (error: any) {
    const msg = error?.message || 'Failed to upload to Google Drive';
    lastGoogleDriveError = msg;
    console.error('Google Drive Upload Error:', msg);
    return {
      success: false,
      fileUrl: '',
      downloadUrl: '',
      fileId: '',
      error: msg,
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
  try {
    const gdriveResult = await uploadPdfToGoogleDrive(file);
    if (gdriveResult.success && gdriveResult.fileUrl) {
      return {
        publicUrl: gdriveResult.fileUrl,
        filePath: `gdrive://${gdriveResult.fileId}`,
        storageType: 'gdrive',
      };
    }
    lastGoogleDriveError = gdriveResult.error || 'Failed to upload to Google Drive';
    console.error('Google Drive upload error:', lastGoogleDriveError);
  } catch (gdriveErr: any) {
    lastGoogleDriveError = gdriveErr?.message || 'Google Drive upload exception';
    console.error('Google Drive upload exception:', lastGoogleDriveError);
  }

  return null;
}

export async function deletePdfFromGoogleDrive(fileUrlOrPath?: string): Promise<{
  deleted: boolean;
  needsScriptUpdate?: boolean;
  error?: string;
}> {
  if (!fileUrlOrPath) return { deleted: false };
  const fileIdMatch =
    fileUrlOrPath.match(/^gdrive:\/\/([a-zA-Z0-9_-]+)/) ||
    fileUrlOrPath.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    fileUrlOrPath.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const fileId = fileIdMatch?.[1];
  if (!fileId) return { deleted: false };

  const { webhookUrl } = getGoogleDriveConfig();
  if (!webhookUrl) return { deleted: false, error: 'Google Drive Web App URL missing' };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', fileId }),
    });
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (parsed?.success && (parsed.deleted || parsed.deletedFileId)) {
      return { deleted: true };
    }
    const errStr = String(parsed?.error || '');
    return {
      deleted: false,
      needsScriptUpdate: errStr.includes('base64') || errStr.includes('Invalid argument'),
      error: errStr || 'Google Drive delete rejected',
    };
  } catch {
    // Fallback when Google Apps Script 302 redirect triggers browser CORS error after executing doPost
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', fileId }),
      });
      return { deleted: true };
    } catch (err: any) {
      return { deleted: false, error: err?.message || 'Drive delete network error' };
    }
  }
}

export async function deleteDocumentEverywhere(params: {
  id: string;
  type?: 'Notes' | 'PYQ' | 'PYQs';
  fileUrl?: string;
  filePath?: string;
  supabaseCreds?: { url?: string; key?: string };
  supabaseFallback?: () => Promise<boolean>;
}): Promise<{
  success: boolean;
  driveDeleted: boolean;
  driveAttempted: boolean;
  driveNeedsScriptUpdate?: boolean;
  driveError?: string;
}> {
  const { id, type, fileUrl, filePath, supabaseCreds, supabaseFallback } = params;
  const headers: Record<string, string> = {};
  if (supabaseCreds?.url && supabaseCreds?.key) {
    headers['x-supabase-url'] = supabaseCreds.url;
    headers['x-supabase-key'] = supabaseCreds.key;
  }
  const driveCfg = getGoogleDriveConfig();
  if (driveCfg.webhookUrl) {
    headers['x-gdrive-webhook'] = driveCfg.webhookUrl;
  }

  const query = new URLSearchParams({ id });
  if (type) query.set('type', type);
  if (fileUrl) query.set('fileUrl', fileUrl);
  if (filePath) query.set('filePath', filePath);

  try {
    const res = await fetch(`/api/documents?${query.toString()}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json();
    if (res.ok && data?.success) {
      return {
        success: true,
        driveDeleted: Boolean(data.driveDeleted),
        driveAttempted: Boolean(data.driveAttempted),
        driveNeedsScriptUpdate: Boolean(data.driveNeedsScriptUpdate),
        driveError: data.driveError,
      };
    }
  } catch {
    // Fall through to client fallback
  }

  const driveFallback = await deletePdfFromGoogleDrive(fileUrl || filePath);
  const dbFallbackOk = supabaseFallback ? await supabaseFallback() : false;
  return {
    success: dbFallbackOk,
    driveDeleted: driveFallback.deleted,
    driveAttempted: Boolean(fileUrl || filePath),
    driveNeedsScriptUpdate: driveFallback.needsScriptUpdate,
    driveError: driveFallback.error,
  };
}
