# Deployment Plan — YouTube Desktop App

**Remote:** `https://github.com/aki-seven/ytdesktop.git`

---

## Step 1: Fix error codes bug

**File:** `src/main/integrations/companion-server/api-shared/errors.ts`
**Lines 16-17:**
```ts
// Change these two lines:
  "YOUTUBE_MUSIC_UNVAILABLE",
  "YOUTUBE_MUSIC_TIME_OUT"
// To:
  "YOUTUBE_UNVAILABLE",
  "YOUTUBE_TIME_OUT"
```
This fixes a bug where the `errorCodes` array didn't match the actual error definitions on lines 32-33.

---

## Step 2: Add `dist/` to `.gitignore`

**File:** `.gitignore`
**After line 88** (before `# Vite`):
```
# TypeScript compilation output
dist/
```

---

## Step 3: Set version to 1.0.0

**File:** `package.json`
**Line 4:**
```json
"version": "2.0.11"  →  "version": "1.0.0"
```

---

## Step 4: Add `repository` field to `package.json`

**File:** `package.json`
**After line 7** (`"private": true,`):
```json
"repository": {
  "type": "git",
  "url": "https://github.com/aki-seven/ytdesktop.git"
},
```

---

## Step 5: Fix YTM comments in `src/main/index.ts`

| Line | Old | New |
|------|-----|-----|
| 1051 | `// Attach events to ytm view` | `// Attach events to yt view` |
| 1056 | ``log.info(`Blocking YTM View navigation to ${event.url}`)`` | ``log.info(`Blocking ytView navigation to ${event.url}`)`` |
| 1065 | ``log.info(`Blocking YTM View redirect to ${event.url}`)`` | ``log.info(`Blocking ytView redirect to ${event.url}`)`` |
| 1582 | `// Handle ytm view ipc` | `// Handle yt view ipc` |
| 1618 | `// ytm state mapping definitions` | `// yt state mapping definitions` |
| 1625 | `// ytm state flow` | `// yt state flow` |

---

## Step 6: Remove `.git` and init fresh

```powershell
# From D:\Aki\CODING\YT-Desktop\ytdesktop
Remove-Item -Recurse -Force .git
git init
git add .
git commit -m "Initial commit"
```

---

## Step 7: Push to new repo

```powershell
git remote add origin https://github.com/aki-seven/ytdesktop.git
git push -u origin main
```

---

## Step 8: After push — set GitHub Actions Variables

Go to GitHub repo → Settings → Secrets and variables → Actions → Variables:

| Variable | Value |
|----------|-------|
| `YTD_UPDATE_FEED_OWNER` | `aki-seven` |
| `YTD_UPDATE_FEED_REPOSITORY` | `ytdesktop` |

---

## Step 9: Tag a release (when ready)

```powershell
git tag v1.0.0
git push origin v1.0.0
```

This triggers the `publish.yml` workflow, which builds and publishes to GitHub Releases.

---

## Note
`src/renderer/windows/settings/Settings.vue:534` — "From the contributions of YTMDesktop Team." — **left as-is per request**.
