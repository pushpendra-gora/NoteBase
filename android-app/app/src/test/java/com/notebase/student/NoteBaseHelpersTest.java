package com.notebase.student;

import org.junit.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class NoteBaseHelpersTest {

    @Test
    public void extractGoogleDriveFileId_handlesAllFormats() {
        assertEquals(
                "1AbCDef23_45xYz",
                PdfCacheManager.extractGoogleDriveFileId("gdrive://1AbCDef23_45xYz")
        );
        assertEquals(
                "1AbCDef23_45xYz",
                PdfCacheManager.extractGoogleDriveFileId("https://drive.google.com/file/d/1AbCDef23_45xYz/view?usp=sharing")
        );
        assertEquals(
                "1AbCDef23_45xYz",
                PdfCacheManager.extractGoogleDriveFileId("https://drive.google.com/open?id=1AbCDef23_45xYz")
        );
        assertNull(PdfCacheManager.extractGoogleDriveFileId("https://example.com/notes.pdf"));
    }

    @Test
    public void resolveDirectDownloadUrl_convertsDriveAndKeepsDirectPdf() {
        assertEquals(
                "https://drive.usercontent.google.com/download?id=abc_123&export=download&confirm=t",
                PdfCacheManager.resolveDirectDownloadUrl("https://drive.google.com/file/d/abc_123/preview")
        );
        assertEquals(
                "https://cdn.college.edu/dsa-notes.pdf",
                PdfCacheManager.resolveDirectDownloadUrl("https://cdn.college.edu/dsa-notes.pdf")
        );
    }

    @Test
    public void containsPdfSignature_detectsValidPdfAndRejectsHtml() {
        byte[] validPdf = "%PDF-1.7\n1 0 obj".getBytes(StandardCharsets.US_ASCII);
        byte[] paddedPdf = "  %PDF-1.4\r\n".getBytes(StandardCharsets.US_ASCII);
        byte[] htmlResponse = "<!DOCTYPE html><html>Sign in</html>".getBytes(StandardCharsets.US_ASCII);

        assertTrue(PdfCacheManager.containsPdfSignature(validPdf, validPdf.length));
        assertTrue(PdfCacheManager.containsPdfSignature(paddedPdf, paddedPdf.length));
        assertFalse(PdfCacheManager.containsPdfSignature(htmlResponse, htmlResponse.length));
    }

    @Test
    public void sanitizeDocId_preventsPathTraversal() {
        String clean = PdfCacheManager.sanitizeDocId("../../etc/passwd?a=1");
        assertFalse(clean.contains("/"));
        assertFalse(clean.contains("\\"));
        assertEquals("doc-123_abc", PdfCacheManager.sanitizeDocId("doc-123_abc"));
    }

    @Test
    public void sanitizeDownloadFilename_appendsPdfAndStripsForbiddenChars() {
        assertEquals("DSA_Unit_1.pdf", PdfCacheManager.sanitizeDownloadFilename("DSA:Unit/1"));
        assertEquals("os-pyq-2025.pdf", PdfCacheManager.sanitizeDownloadFilename("os-pyq-2025.PDF").toLowerCase().equals("os-pyq-2025.pdf") ? "os-pyq-2025.pdf" : "");
        assertEquals("NoteBase_Document.pdf", PdfCacheManager.sanitizeDownloadFilename("   "));
    }

    @Test
    public void extractYouTubeVideoId_handlesWatchShortEmbedShortsLive() {
        assertEquals("dQw4w9WgXcQ", MainActivity.extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s"));
        assertEquals("dQw4w9WgXcQ", MainActivity.extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=xyz"));
        assertEquals("dQw4w9WgXcQ", MainActivity.extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"));
        assertEquals("dQw4w9WgXcQ", MainActivity.extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"));
        assertEquals("dQw4w9WgXcQ", MainActivity.extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"));
        assertEquals("dQw4w9WgXcQ", MainActivity.extractYouTubeVideoId("vnd.youtube:dQw4w9WgXcQ"));
        assertNull(MainActivity.extractYouTubeVideoId("https://example.com/not-youtube"));
    }
}
