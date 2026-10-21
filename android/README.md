# EduVault Secure Android Viewer

A minimal Android WebView host for the **existing deployed EduVault website**.
It does not rebuild the app, duplicate the backend, or embed any privileged key.
It exists for one reason: ordinary Android Chrome cannot block the operating
system's screenshot or screen-recording function, while an app that owns the
window can set `FLAG_SECURE`.

The Vite/React site remains independently deployable to Vercel. This host loads
that deployed site over HTTPS, so web updates do not require a new APK.

## How it protects content

`MainActivity` sets:

```java
getWindow().setFlags(
    WindowManager.LayoutParams.FLAG_SECURE,
    WindowManager.LayoutParams.FLAG_SECURE
);
```

before the WebView is created and before any URL is loaded, and re-asserts it on
every resume.

On supported devices this makes:

- system screenshots blank (no image saved),
- the window absent/black in MediaProjection screen recordings and screen
  sharing,
- the recent-apps thumbnail blank (plus `setRecentsScreenshotEnabled(false)` on
  Android 13+).

It also declares `HIDE_OVERLAY_WINDOWS` (Android 12+) against overlay/tapjacking
attacks.

## What it does not protect

- A **second camera** photographing the screen.
- **Rooted or custom-ROM** devices that deliberately strip `FLAG_SECURE`.
- Ordinary **Chrome**. A website cannot set this flag. Chrome, Chrome Custom
  Tabs and Trusted Web Activities run in Chrome's process, so this host cannot
  apply the flag to them.
- Android 11 and lower: Android's own documentation says `FLAG_SECURE` covers
  about 70% of devices reliably for some capture/overlay scenarios. Test the
  devices you actually support.

## Deployment URL

The production URL is configured in:

```
app/src/main/res/values/strings.xml
```

```xml
<string name="eduvault_url" translatable="false">https://edu-vaults-od9q.vercel.app/</string>
```

It was verified over HTTPS (HTTP 200, correct EduVault title, no redirect). If
you move to another domain, update this one line and rebuild. The app refuses to
start while a `YOUR-EDUVAULT` placeholder is present.

Navigation policy:

- the configured host (and its `www.`/apex variant) loads **inside** the secure
  WebView, preserving the Supabase session;
- other `https:` links, `mailto:` and `tel:` open in the system browser/app;
- `http:`, `intent:`, `file:`, `content:`, `data:`, `javascript:` and `blob:`
  main-frame navigations are refused;
- certificate errors are cancelled, never bypassed;
- downloads from the WebView are blocked.

## Prerequisites (Windows)

- JDK 17
- Android Studio (includes the Android SDK), or the Android command-line tools
- Android SDK Platform 35, Build-Tools 35.0.0, Platform-Tools
- An Android 7.0+ phone with USB debugging enabled

Shortest install path on a machine with `winget`:

```powershell
winget install --id Microsoft.OpenJDK.17 -e
winget install --id Google.AndroidStudio -e
```

Then in Android Studio: **SDK Manager → SDK Platforms** install
**Android 15 (API 35)**, and under **SDK Tools** install **Android SDK
Build-Tools 35.0.0** and **Android SDK Platform-Tools**.

If `ANDROID_HOME` is not set, point it at the SDK (normally
`%LOCALAPPDATA%\Android\Sdk`).

Command-line alternative once `sdkmanager` is available:

```powershell
sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"
```

## Build

From this `android/` directory:

```powershell
.\gradlew.bat assembleDebug
```

The debug APK is written to:

```
app\build\outputs\apk\debug\app-debug.apk
```

You can also open the `android/` folder in Android Studio and press **Run**.

If Gradle reports `SDK location not found`, create `android/local.properties`
(Android Studio does this automatically):

```properties
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

`local.properties` is git-ignored.

## Install and test on a real phone

Enable **Developer options → USB debugging**, connect the phone, then:

```powershell
adb devices
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Run this checklist on the actual device:

1. Log in through the host; confirm the account is entitled.
2. Open protected material and navigate pages, zoom, search, and fullscreen.
3. Press **Power + Volume Down**. Expected: Android reports that the screenshot
   is blocked (or the saved image is blank); nothing readable in Gallery.
4. Start the system screen recorder and record ~15 seconds. Expected: the
   EduVault window is black in the recording; other apps record normally.
5. Open Recents. Expected: blank EduVault thumbnail.
6. Try copy, print, and download. Expected: copy/download blocked by the host or
   the site's existing reader controls; the WebView has no print UI.
7. Test an external link (e.g. WhatsApp). Expected: opens outside the secure
   WebView.
8. Log out. Expected: the site's login page, session cleared.
9. Toggle airplane mode and relaunch. Expected: the native error screen with
   Retry, not a blank page.

A successful TypeScript/Vite build says nothing about screenshot protection.
Only the on-device tests above do.

## Distribution

The debug APK is for testing only. For students, create a release keystore,
build `assembleRelease`, and distribute through Google Play, managed Google Play,
or your MDM. Never commit the keystore or its passwords (both are ignored).

Because the host loads the deployed site, normal web releases keep flowing to
the app without an APK update. APK updates are only needed when this host's
native behaviour changes.

## Verification status

The production URL was verified over the network: `HTTP/2 200`, correct EduVault
title, and no redirect to another host.

This project was authored in an environment with **no JDK, no Android SDK, no
Gradle, and no adb/device**. It has therefore **not been compiled or tested on a
phone** here. The website build and TypeScript checks are independent and were
run separately.
