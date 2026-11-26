# Preserve JavascriptInterface methods exposed to NoteBase WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keep class com.notebase.student.MainActivity$NoteBaseBridge { *; }
