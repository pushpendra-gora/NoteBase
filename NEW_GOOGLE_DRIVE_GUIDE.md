# NoteBase — New Google Drive Add Karne Ki Complete Guide

Jab aapki purani Google Drive (15 GB ya quota) bhar jaye, tab aap bina kisi data loss ke **kitni bhi nayi Google Drives** (`Drive 2`, `Drive 3`, `Drive 4`, ...) add kar sakte hain.

- **Purani Drives Safe Rahengi:** Students aur Coordinators purani drives me pehle se saved saari PDFs hamesha read, preview, download, aur delete kar payenge.
- **Naye Uploads Sirf Selected Drive Me Jayenge:** Admin jo Drive **"Active Upload Drive"** select karega, sabhi Coordinators aur Admin ke naye uploads sirf usi Drive me jayenge.
- **Coordinator & Student Ko Kuch Pata Nahi Chalega:** Unke liye app bilkul pehle jaisa normal kaam karega.

---

## Step 0: One-Time Supabase SQL Setup (Sirf Pehli Baar)

Supabase Dashboard → **SQL Editor** → **New Query** me ye 2 lines run karein (ya updated `supabase-schema.sql` run karein):

```sql
alter table public.admin_credentials add column if not exists active_drive_id text;
alter table public.admin_credentials add column if not exists gdrive_drives jsonb default '[]'::jsonb;
```

*(Ye command safe hai; pehle se maujood data bilkul delete nahi hoga.)*

---

## Step 1: Naye Google Account Me Apps Script Deploy Karein

1. Apne **naye Google Account** se [Google Drive](https://drive.google.com) open karein.
2. *(Optional)* Ek folder banayein (e.g., `NoteBase Uploads 2`), usko open karein, aur browser URL me `folders/` ke baad likha ID copy kar lein — ye aapka **Folder ID** hoga. (Agar blank chhodenge to script automatically folder bana degi.)
3. Google Drive me **New** → **More** → **Google Apps Script** kholein.
4. Purana saara code delete karke ye code paste karein:

```javascript
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

    // Decode base64 PDF
    var decoded = Utilities.base64Decode(data.base64);
    var blob = Utilities.newBlob(decoded, data.mimeType || 'application/pdf', data.fileName || 'document.pdf');

    var folder;
    if (data.folderId && data.folderId.trim() !== "") {
      folder = DriveApp.getFolderById(data.folderId.trim());
    } else {
      var folderName = "NoteBase Uploads";
      var folders = DriveApp.getFoldersByName(folderName);
      folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    }

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
      downloadUrl: "https://drive.google.com/uc?export=download&id=" + fileId
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
    message: "Google Drive Upload Web App is active."
  })).setMimeType(ContentService.MimeType.JSON);
}
```

5. Top-right **Deploy** → **New deployment** par click karein:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. **Deploy** par click karke permission allow karein (**Advanced → Go to project → Allow**).
7. Jo **Web app URL** mile (jo `https://script.google.com/macros/s/.../exec` jaisi hogi), usko copy karein.

---

## Step 2: Vercel Me New Drive Add Karein (Recommended & Inspect-Safe)

1. Apne **Vercel Dashboard** → Project → **Settings** → **Environment Variables** kholein.
2. **Drive 2** add karne ke liye ye variables add karein *(Purani `GOOGLE_DRIVE_WEBHOOK_URL` ko bilkul DELETE ya CHANGE nahi karna hai!)*:

| Variable Name | Value | Required |
|---|---|---|
| `GOOGLE_DRIVE_2_WEBHOOK_URL` | Nayi Apps Script Web App URL (`.../exec`) | **Yes** |
| `GOOGLE_DRIVE_2_FOLDER_ID` | Nayi Drive ka Folder ID | Optional |
| `GOOGLE_DRIVE_2_NAME` | Jaise `Drive 2` ya `Drive 2 (Backup)` | Optional |

*(Aage jab Drive 2 bhi bhar jaye, to same pattern se `GOOGLE_DRIVE_3_WEBHOOK_URL`, `GOOGLE_DRIVE_3_FOLDER_ID`, `GOOGLE_DRIVE_3_NAME`, phir `GOOGLE_DRIVE_4_...` unlimited add kar sakte hain.)*

3. Variables save karne ke baad Vercel → **Deployments** me ja kar latest deployment par **Redeploy** kar dein.

> **Alternative Instant Method (Bina Redeploy Ke):**
> Admin Panel → **Statistics** → **+ Add New Drive** → **Direct Server Save** tab me ja kar Drive Name, Web App URL, aur Folder ID daal kar save kar sakte hain. Ye server database me save hota hai aur browser inspect me kabhi nahi dikhta.

---

## Step 3: Admin Panel Me Active Upload Drive Select Karein

1. Admin Panel login karke sidebar se **Statistics** kholein.
2. **Registered Google Drives** list me aapki purani `Drive 1 (Primary)` aur nayi `Drive 2` dono dikhengi.
3. Nayi drive par pehle **Test** button daba kar verify kar lein ki test PDF upload ho rahi hai.
4. Ab nayi drive ke saamne **Use for New Uploads** button par click karein.

Bas itna karte hi:
- Nayi drive par **`Active Upload Drive`** badge lag jayega.
- Iske baad koi bhi Coordinator ya Admin jab file upload karega, wo sidha **Drive 2** me save hogi.
- Purani **Drive 1** ki saari files Students aur Coordinators ke liye pehle ki tarah chalti rahengi (aur agar koi purani file delete karega to server automatic sahi Drive se delete kar dega).
