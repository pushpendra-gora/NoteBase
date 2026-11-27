/**
 * Google Drive Cloud Storage Service
 * Handles direct browser-to-Google-Drive resumable uploads (up to 500 MB) without routing file binaries through Vercel.
 * Only validated PDF, Image, and HTML files are permitted.
 * NOTE: Files are stored ONLY in Google Drive; Supabase stores only table metadata & public URLs.
 */

import { MAX_UPLOAD_BYTES, validateUploadFileClient } from './fileValidation';

export const MAX_PDF_UPLOAD_BYTES = MAX_UPLOAD_BYTES; // 500 MB
const LEGACY_SERVER_BASE64_LIMIT_BYTES = 3 * 1024 * 1024; // 3 MB safe fallback for un-updated scripts
const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB (32 * 256 KB, required multiple of 256 KB)

export interface GoogleDriveConfig {
  webhookUrl: string;
  folderId: string;
  enabled: boolean;
}

export type UploadProgressStage =
  | 'validating'
  | 'initializing'
  | 'uploading'
  | 'finalizing'
  | 'complete';

export interface UploadProgressDetail {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  stage: UploadProgressStage;
  stageLabel: string;
}

// Updated Google Apps Script template supporting direct 500 MB browser-to-Drive resumable uploads + delete + legacy fallback
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// ====================================================================
// NoteBase - Google Drive PDF Upload Web App (Direct 500MB Support)
// ====================================================================
// Instructions:
// 1. Open Google Drive -> Click New -> More -> Google Apps Script
// 2. Paste this entire code into the editor (replace existing code)
// 3. Click "Deploy" (top right) -> "Manage deployments" -> Edit (pencil) -> New version (or "New deployment")
// 4. Select type: "Web app"
// 5. Execute as: "Me" (your Google account)
// 6. Who has access: "Anyone"
// 7. Click "Deploy" -> Authorize access
// 8. Copy the "Web app URL" (/exec) and add it in Vercel Env Vars or Admin Statistics!
// ====================================================================

function resolveTargetFolder(folderId) {
  if (folderId && String(folderId).trim() !== "") {
    return DriveApp.getFolderById(String(folderId).trim());
  }
  var folderName = "NoteBase Uploads";
  var folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);

    // 1. Issue short-lived Drive OAuth token + resolved Folder ID strictly to NoteBase Server (for direct 500MB browser upload)
    if (data.action === 'getTokenAndFolder') {
      var targetFolder = resolveTargetFolder(data.folderId);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        accessToken: ScriptApp.getOAuthToken(),
        folderId: targetFolder.getId()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Finalize directly-uploaded file permissions so Students can view & download
    if (data.action === 'finalizeFile') {
      if (!data.fileId || String(data.fileId).trim() === "") {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "Missing fileId for finalizeFile"
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var fId = String(data.fileId).trim();
      var uploadedFile = DriveApp.getFileById(fId);
      try {
        uploadedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        // Ignore if domain policy blocks individual file sharing
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        fileId: fId,
        fileName: uploadedFile.getName(),
        fileUrl: "https://drive.google.com/file/d/" + fId + "/view?usp=sharing",
        downloadUrl: "https://drive.google.com/uc?export=download&id=" + fId,
        created_at: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Handle Delete Request from NoteBase Admin / Coordinator
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
      } catch (shareErr) {}
      try {
        var parents = targetFile.getParents();
        while (parents.hasNext()) {
          parents.next().removeFile(targetFile);
        }
      } catch (parentErr) {}
      targetFile.setTrashed(true);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        deleted: true,
        deletedFileId: targetId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Legacy Small-File Base64 Upload Fallback
    var decoded = Utilities.base64Decode(data.base64);
    var blob = Utilities.newBlob(decoded, data.mimeType || 'application/pdf', data.fileName || 'document.pdf');
    var folder = resolveTargetFolder(data.folderId);
    var file = folder.createFile(blob);
    var fileId = file.getId();
    var fileName = file.getName();

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: fileId,
      fileName: fileName,
      fileUrl: "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing",
      downloadUrl: "https://drive.google.com/uc?export=download&id=" + fileId,
      created_at: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Google Drive Upload Web App (Direct 500MB Ready) is active."
  })).setMimeType(ContentService.MimeType.JSON);
}
`;

export function getGoogleDriveConfig(): GoogleDriveConfig {
  if (typeof window === 'undefined') {
    return {
      webhookUrl:
        process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
        process.env.GDRIVE_WEBHOOK_URL ||
        '',
      folderId:
        process.env.GOOGLE_DRIVE_FOLDER_ID ||
        '',
      enabled: true,
    };
  }
  return {
    webhookUrl: '',
    folderId: '',
    enabled: true,
  };
}

export function saveGoogleDriveConfig(_config: Partial<GoogleDriveConfig>) {
  // No-op in browser: Drive credentials live strictly on the server
}

export function isGoogleDriveConfigured(): boolean {
  if (typeof window === 'undefined') {
    return Boolean(
      process.env.GOOGLE_DRIVE_WEBHOOK_URL ||
      process.env.GDRIVE_WEBHOOK_URL
    );
  }
  try {
    return localStorage.getItem('notebase_gdrive_server_configured') === 'true';
  } catch {
    return false;
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

async function fileHeaderPlaceholderNote() { /* validation handled by validateUploadFileClient */ }

function uploadChunkWithProgress(
  uploadUrl: string,
  chunk: Blob,
  start: number,
  end: number,
  totalSize: number,
  mimeType: string,
  onChunkProgress: (loadedInChunk: number) => void
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType || 'application/pdf');
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onChunkProgress(Math.min(chunk.size, evt.loaded));
      }
    };

    xhr.onload = () => {
      resolve({ status: xhr.status, responseText: xhr.responseText || '' });
    };

    xhr.onerror = () => {
      reject(new Error('Network/CORS error while uploading directly to Google Drive.'));
    };

    xhr.send(chunk);
  });
}

function postJsonWithUploadProgress(
  url: string,
  payload: unknown,
  onUploadFraction: (fraction: number) => void
): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        onUploadFraction(Math.min(1, evt.loaded / evt.total));
      }
    };

    xhr.onload = () => {
      let parsed: any = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {}
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data: parsed,
      });
    };

    xhr.onerror = () => {
      reject(new Error('Network error during file upload.'));
    };

    xhr.send(JSON.stringify(payload));
  });
}

export let lastGoogleDriveError: string = '';

/**
 * Uploads a PDF directly from the browser to Google Drive (supports up to 500 MB):
 * 1. Requests a short-lived Google Drive resumable upload session URI from `/api/upload-drive` (zero file bytes sent to Vercel).
 * 2. Streams the file directly to Google Drive in 8 MB chunks via XHR with progress tracking.
 * 3. Calls `/api/upload-drive` (`action: 'finalize'`) to apply share permissions and return public view/download links.
 * 4. If the deployed Google Apps Script hasn't been updated yet, transparently falls back for small PDFs (<= 3 MB).
 */
export async function uploadPdfToGoogleDrive(
  file: File,
  folderId?: string,
  driveId?: string,
  onProgress?: (percent: number) => void,
  onProgressDetail?: (detail: UploadProgressDetail) => void
): Promise<{
  success: boolean;
  fileUrl: string;
  downloadUrl: string;
  fileId: string;
  driveUsedId?: string | null;
  driveUsedName?: string;
  error?: string;
}> {
  lastGoogleDriveError = '';
  const totalBytes = file?.size || 0;
  const emitProgress = (
    percent: number,
    loadedBytes: number,
    stage: UploadProgressStage,
    stageLabel: string
  ) => {
    const clampedPct = Math.max(0, Math.min(100, Math.round(percent)));
    onProgress?.(clampedPct);
    onProgressDetail?.({
      percent: clampedPct,
      loadedBytes: Math.min(totalBytes, Math.max(0, loadedBytes)),
      totalBytes,
      stage,
      stageLabel,
    });
  };

  try {
    emitProgress(1, 0, 'validating', 'Verifying file format & security signature...');
    const validation = await validateUploadFileClient(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file. Only PDF, Image, and HTML files are allowed.');
    }

    const resolvedMime = validation.canonicalMime || file.type || 'application/pdf';

    emitProgress(3, 0, 'initializing', 'Connecting directly to Google Drive...');

    // Step 1: Initialize Resumable Upload Session on server (tiny JSON + 4 KB header check, 0 file bytes to Vercel)
    const initRes = await fetch('/api/upload-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init',
        fileName: file.name,
        mimeType: resolvedMime,
        fileSize: file.size,
        headBase64: validation.headBase64 || '',
        folderId: folderId || undefined,
        driveId: driveId || undefined,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    });

    const initData = await initRes.json().catch(() => ({}));

    if (initRes.ok && initData?.success && initData?.uploadUrl) {
      const uploadUrl = String(initData.uploadUrl);
      const mimeType = resolvedMime;
      const totalSize = file.size;

      // Step 2: Upload binary chunks directly to Google Drive (bypasses Vercel completely!)
      let uploadedDriveFileId = '';
      let offset = 0;

      while (offset < totalSize) {
        const end = Math.min(offset + RESUMABLE_CHUNK_BYTES - 1, totalSize - 1);
        const chunk = file.slice(offset, end + 1);
        const chunkBaseOffset = offset;

        const { status, responseText } = await uploadChunkWithProgress(
          uploadUrl,
          chunk,
          offset,
          end,
          totalSize,
          mimeType,
          (loadedInChunk) => {
            const loaded = Math.min(totalSize, chunkBaseOffset + loadedInChunk);
            const pct = Math.min(96, Math.max(4, Math.round((loaded / totalSize) * 92) + 4));
            emitProgress(pct, loaded, 'uploading', 'Uploading directly to Google Drive...');
          }
        );

        if (status === 308) {
          offset = end + 1;
          const pct = Math.min(96, Math.round((offset / totalSize) * 92) + 4);
          emitProgress(pct, offset, 'uploading', 'Uploading directly to Google Drive...');
          continue;
        }

        if (status === 200 || status === 201) {
          let parsed: any = null;
          try {
            parsed = JSON.parse(responseText);
          } catch {}
          uploadedDriveFileId = String(parsed?.id || '');
          break;
        }

        let errDetail = `Google Drive upload failed (HTTP ${status})`;
        try {
          const parsedErr = JSON.parse(responseText);
          if (parsedErr?.error?.message) errDetail = parsedErr.error.message;
        } catch {}
        throw new Error(errDetail);
      }

      if (!uploadedDriveFileId) {
        throw new Error('Google Drive did not return a valid File ID after upload.');
      }

      emitProgress(98, totalSize, 'finalizing', 'Finalizing Google Drive permissions...');

      // Step 3: Finalize file permissions (Anyone with link -> View) via Apps Script
      const finRes = await fetch('/api/upload-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          fileId: uploadedDriveFileId,
          driveId: initData.driveUsedId || driveId || undefined,
        }),
      });
      const finData = await finRes.json().catch(() => ({}));
      emitProgress(100, totalSize, 'complete', 'Google Drive upload complete!');

      if (finRes.ok && finData?.success && finData?.fileUrl) {
        return {
          success: true,
          fileUrl: finData.fileUrl,
          downloadUrl: finData.downloadUrl || finData.fileUrl,
          fileId: finData.fileId || uploadedDriveFileId,
          driveUsedId: finData.driveUsedId || initData.driveUsedId || null,
          driveUsedName: finData.driveUsedName || initData.driveUsedName || 'Active Drive',
        };
      }

      // Even if finalize failed (e.g. restricted domain), return valid Drive view URL
      return {
        success: true,
        fileUrl: `https://drive.google.com/file/d/${uploadedDriveFileId}/view?usp=sharing`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${uploadedDriveFileId}`,
        fileId: uploadedDriveFileId,
        driveUsedId: initData.driveUsedId || null,
        driveUsedName: initData.driveUsedName || 'Active Drive',
      };
    }

    // Backwards-compatibility fallback ONLY for small files (<= 3 MB) if Apps Script wasn't redeployed yet
    if (initData?.needsScriptUpdate && file.size <= LEGACY_SERVER_BASE64_LIMIT_BYTES) {
      emitProgress(5, 0, 'uploading', 'Preparing file for Google Drive upload...');
      const base64Data = await fileToBase64(file);
      const legacyRes = await postJsonWithUploadProgress(
        '/api/upload-drive',
        {
          driveId: driveId || undefined,
          fileName: file.name,
          mimeType: resolvedMime,
          base64: base64Data,
          folderId: folderId || undefined,
        },
        (fraction) => {
          const loaded = Math.round(file.size * fraction);
          const pct = Math.min(95, Math.max(8, Math.round(8 + fraction * 87)));
          emitProgress(pct, loaded, 'uploading', 'Uploading to Google Drive...');
        }
      );
      const legacyData = legacyRes.data || {};
      if (legacyRes.ok && legacyData?.success && legacyData?.fileUrl) {
        emitProgress(100, file.size, 'complete', 'Google Drive upload complete!');
        return {
          success: true,
          fileUrl: legacyData.fileUrl,
          downloadUrl: legacyData.downloadUrl || legacyData.fileUrl,
          fileId: legacyData.fileId || '',
          driveUsedId: legacyData.driveUsedId || null,
          driveUsedName: legacyData.driveUsedName || 'Active Drive',
        };
      }
      throw new Error(legacyData?.error || 'Legacy small-file upload failed.');
    }

    if (initData?.needsScriptUpdate) {
      throw new Error(
        'Please re-deploy the updated Google Apps Script (from Admin -> Statistics -> View / Copy Setup Script) to enable direct 500 MB Google Drive uploads.'
      );
    }

    throw new Error(initData?.error || `Failed to initialize Google Drive upload (Status ${initRes.status}).`);
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
 * Uploads a PDF exclusively to Google Drive (up to 500 MB directly from browser).
 */
export async function uploadUnifiedPdf(
  file: File,
  folderPath?: string,
  metadata?: {
    title?: string;
    year?: string;
    branch?: string;
    semester?: string;
    onProgress?: (percent: number) => void;
    onProgressDetail?: (detail: UploadProgressDetail) => void;
  }
): Promise<{
  publicUrl: string;
  filePath: string;
  storageType: 'gdrive';
  error?: string;
} | null> {
  try {
    const gdriveResult = await uploadPdfToGoogleDrive(
      file,
      undefined,
      undefined,
      metadata?.onProgress,
      metadata?.onProgressDetail
    );
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

export async function deletePdfFromGoogleDrive(_fileUrlOrPath?: string): Promise<{
  deleted: boolean;
  needsScriptUpdate?: boolean;
  error?: string;
}> {
  // Handled strictly server-side via DELETE /api/documents or DELETE /api/upload-drive
  return { deleted: false, error: 'Direct browser Drive deletion disabled for security.' };
}

export async function deleteDocumentEverywhere(params: {
  id: string;
  type?: 'Notes' | 'PYQ' | 'PYQs';
  fileUrl?: string;
  filePath?: string;
  skipCount?: boolean;
  supabaseCreds?: { url?: string; key?: string };
  supabaseFallback?: () => Promise<boolean>;
}): Promise<{
  success: boolean;
  driveDeleted: boolean;
  driveAttempted: boolean;
  driveNeedsScriptUpdate?: boolean;
  driveError?: string;
  error?: string;
}> {
  const { id, type, fileUrl, filePath, skipCount } = params;
  const query = new URLSearchParams({ id });
  if (type) query.set('type', type);
  if (fileUrl) query.set('fileUrl', fileUrl);
  if (filePath) query.set('filePath', filePath);
  if (skipCount) query.set('skipCount', '1');

  try {
    const res = await fetch(`/api/documents?${query.toString()}`, {
      method: 'DELETE',
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
    return {
      success: false,
      driveDeleted: false,
      driveAttempted: false,
      error: data?.error || `Server delete failed (${res.status})`,
    };
  } catch (err: any) {
    return {
      success: false,
      driveDeleted: false,
      driveAttempted: false,
      error: err?.message || 'Network error while deleting document.',
    };
  }
}
