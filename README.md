# 🎬 MovieHub Auto Uploader V2.2

**Free, local-first, sequential batch video uploader for files you have permission to distribute.**

Windows laptop handles uploads directly to provider APIs; optional, passwordless **read-only mobile PWA** shows a private snapshot from anywhere via Supabase. Files and host API credentials never pass through Vercel, GitHub Pages, or the mobile website.

> **Status:** local streaming tests and safety-path unit tests pass. The earlier V1 agent was live-tested with the owner's Streamtape and DoodStream accounts. **V2.2 FileMoon/StreamWish live provider uploads, real Windows shutdown, Supabase Auth/RLS and remote PWA installation require testing in your own environment.** Provider URLs and availability can change. This is not a guarantee of permanent functionality.

## Features

- Local Windows app at `http://127.0.0.1:8766`, zero npm dependencies; Node.js 22+ required
- Add a folder (including a USB drive), optionally recursively through 4 directory levels, up to 1,000 supported videos
- Streamtape, DoodStream, FileMoon, and StreamWish; choose any subset; one job per `(file path, size, modified time, provider)`
- One video transfer at a time, streaming file chunks rather than loading 1GB into RAM
- Persistent JSON queue in `data/queue.json`, crash/uncertain transfer review, and manual retries
- Preserve provider file codes and alternate response URLs; replace a broken result link with an account-verified URL
- CSV export, success/failed/pending states, pause **after** current file
- Optional explicit Auto Shutdown switch with Windows 60–600 second cancellation window; **only if all jobs succeed**
- Separate mobile GitHub Pages PWA with Supabase Auth magic links and PostgreSQL Row Level Security
- No local IP / port forwarding, no public uploader API, no Vercel Functions or server-side video processing

## Quick start — Windows

1. Download/extract this ZIP to an ordinary Windows folder. **Keep your previous V1 folder as backup. Stop V1 first (`Ctrl+C` in its terminal), because only one app can use port 8766.**
2. Open the V2 folder in VS Code.
3. Copy `.env.example` to `.env`; fill `STREAMTAPE_LOGIN`, `STREAMTAPE_KEY`, `DOODSTREAM_KEY` and, if desired, `FILEMOON_API_TOKEN` and `STREAMWISH_API_KEY`. **Never share or commit `.env`**.
4. If migrating from V1 instead, run in the V2 terminal:

   ```powershell
   node scripts/migrate-from-v1.mjs "C:\Users\Lenovo\Documents\MovieHub_Auto_Uploader_V1\MovieHub_Auto_Uploader"
   ```

   Verify the path before running. It copies existing `.env` and queue data without overwriting your V2 files.
5. Run tests: `npm.cmd test` (uses `.cmd` to bypass PowerShell's blocked `npm.ps1` script).
6. Run: `npm.cmd start` — or double click `START_WINDOWS.cmd`. Visit `http://127.0.0.1:8766`.
7. Add one small authorized test video folder, choose a provider, click **Add folder to queue**, then **Start uploading**. Verify upload in the provider account.

**Don't move an external drive during uploads.** The local API listens on `127.0.0.1` only, deliberately not on the public internet.

## Buttons

| Control | What it actually does |
|---|---|
| Add folder to queue | Scans video files; adds each missing file+host job. Repeated scan of unchanged files adds 0. |
| Streamtape / DoodStream | Choose where new jobs will upload; doesn't modify existing jobs. |
| Start uploading | Runs pending jobs automatically one by one. |
| Pause after current | Finishes current video, stops before next. **Does not shut down Windows.** |
| Clear completed | Removes completed records locally, **not files on the host**; can allow re-queuing the same file. Export CSV first. |
| Export CSV | Downloads results. Keep file private if filenames are private. |
| Verify & retry | Only for failed/review jobs, after checking host for duplicates. |
| Set working link | On a completed job, paste the correct HTTPS link from host account; old result stored as alternative. |
| Auto Shutdown setting | After explicit enable, schedules Windows shutdown **only** when a newly run batch completes *all* jobs successfully. |
| Cancel scheduled shutdown | Calls `shutdown.exe /a`, disables the setting. |
| Test remote sync | Sends a small, read-only status snapshot via authenticated agent account (requires setup). |

## Overnight uploading: exact behavior

- Keep laptop plugged into a safe charger, on a hard ventilated surface; disable Windows sleep while plugged in. Screen can go dark. Do not leave a device with overheating, swelling or charger problems unattended.
- Starting 60 jobs does not promise 60 completed in one night. Upload capacity depends on connection upload Mbps and provider processing.
- If **any** job becomes `failed` or `review`, automatic Windows shutdown will **not** run. Resolve those jobs manually before another successful batch.
- Auto shutdown requires a **one-time explicit enable/confirmation** (no new permission prompt at completion). Windows uses its own countdown (`shutdown.exe /s /t N`); cancel locally with dashboard or `shutdown /a` before the countdown ends. **Unsaved work in other apps can be lost.**
- On power loss / app restart, any interrupted in-flight upload is marked `review`, not retried automatically, because the provider might already have accepted it. Pending jobs remain persisted; click Start after restarting.

## Private full-control mobile PWA — no Vercel / Supabase

**New optional mode:** Secure Cloudflare Tunnel + Cloudflare Access at `https://autoupload.farhanbalouch.com`. Mobile browser/PWA can inspect queue progress, failures and control Pause/Start, Hold/Resume, Retry, priority, Remove, and shutdown settings. The upload engine stays localhost-only. A separate gateway on `127.0.0.1:8767` validates **Cloudflare Access JWT signature, audience, team issuer, expiry, and the owner's email** before proxying approved requests to `127.0.0.1:8766`. It remains **disabled unless `REMOTE_ENABLED=1`** with all private .env settings present.

**Setup:** [Cloudflare Remote Control — Roman Urdu](docs/CLOUDFLARE_REMOTE_CONTROL.md). Only create the Tunnel published hostname **after Access is configured**, and route it to **8767, never 8766**. No manual port forwarding. This is independent of the older, optional Supabase **read-only** mode; its GitHub Pages workflow no longer runs automatically on commits.

Cloudflare Tunnel requires the laptop, connection, and upload server to be online. Without external state storage, the browser may only show an offline page or a Cloudflare error when the laptop is off, not an authoritative last progress snapshot.

## Legacy read-only mobile PWA via Supabase (optional)

A hosted PWA is **separate from the localhost uploader**. The laptop authenticates as a dedicated **agent user** and writes small snapshots to a Supabase table. A separately authenticated **owner user** can read those snapshots; RLS prevents other logged-in users from viewing them.

Follow [MOBILE_SETUP.md](docs/MOBILE_SETUP.md) for the one-time setup, then host `mobile/` on free public GitHub Pages using the included Actions workflow. Install PWA from Chrome/Safari. Browser offline cache covers the app shell, **not real-time uploads**. When the laptop shuts down, the last snapshot becomes stale after 2 minutes.

The PWA is **read-only**, not a remote control: it cannot start/stop uploads or cancel Windows shutdown. Cancel shutdown from the laptop.

## API details and limits

Provider APIs are documented here: [Streamtape](https://streamtape.com/api), [DoodStream](https://doodstream.com/api-docs), FileMoon, StreamWish. New providers require their own API credentials and live verification. Credentials are read only by `src/config.mjs` on the laptop, from the ignored `.env` file. API response URLs may be broken or short-lived; use host account's **Get Link** and the **Set working link** button. Successful API response does not guarantee playable media everywhere.

Local queue is deduplicated by exact file path, file size, modified time, and provider. It is not a content-hash-based deduplicator. If files are moved/modified, they may count as new. 15 minutes of non-FileMoon inactivity (30 minutes for FileMoon) triggers a transfer abort and manual review; HTTP uploads are not guaranteed resumable at byte offsets.

### Folder structure

```text
MovieHub_Auto_Uploader_V2/
├── src/                 # Local agent, queue, host adapters, sync, Windows shutdown
├── public/              # Private localhost controls
├── mobile/              # Public static PWA shell (NO secrets)
│   ├── config.example.js
│   ├── manifest.webmanifest, sw.js, app.js, style.css
│   └── icons/
├── supabase/setup.sql   # Single-owner, single-agent RLS
├── scripts/             # Migrate V1, generate public mobile config
├── tests/               # Local/mock upload and safety tests
├── docs/                # Setup, security and Roman Urdu guides
├── .github/workflows/   # Static GitHub Pages deployment
├── .env.example         # Local ONLY template; no real keys
└── START_WINDOWS.cmd
```

## Running tests

```powershell
npm.cmd test
npm.cmd run check
```

Tests use local/mock servers. **No remote streaming, actual OS shutdown, Supabase deployment, or GitHub Pages publish is executed by these tests.** Do a safe real-world verification before enabling unattended uploads.

## Public GitHub release

Create a **new public GitHub repository** for this project rather than adding its code to your existing private MovieHub movie website repo. Push only the source (the `.gitignore` excludes `.env`, `data/queue.json`, `mobile/config.js`). To publish the PWA, configure the **public** Supabase URL and publishable key as repository variables, then enable GitHub Pages → GitHub Actions; see mobile guide.

Before making the repo public, check with `git status` and `git ls-files` that no credentials, local queue logs, real movie files, CSV exports or screenshots are being committed. Never include copyrighted movies or host login secrets in the GitHub repository.

## Support and security

See [SECURITY.md](docs/SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md). Report bugs with redacted logs (never API credentials). This is provided AS IS and does not bypass provider terms or content licensing laws.

License: MIT for the code in this V2 package.

### Optional existing MovieHub website link

After you deploy the separate mobile PWA, [moviehub-integration/README.md](moviehub-integration/README.md) shows how to link to it from your original MovieHub admin without adding any heavy Vercel Function calls. The production MovieHub website is not modified automatically by this ZIP.

## V2.2 — Safe queue editing controls

- **Move to top:** moves a pending job ahead of all other pending jobs; does not interrupt the current upload.
- **Hold:** excludes one pending job from automatic processing. **Resume job:** returns held to pending. **Start uploading** resumes the global queue after Pause after current.
- **Remove:** deletes only a pending/held queue record; never deletes the original video file and never stops an active upload.
- **Remove pending from this folder:** recursively matches the path input and deletes only pending/held queue entries after preview and confirmation. Use a specific folder path; choosing a drive root (e.g. `D:\\`) targets all pending/held videos on that drive.
- **Auto Shutdown safety:** if the queue is edited while an upload is running, that run will not schedule Windows auto shutdown. Start another fully successful batch if you still want shutdown.

**Roman Urdu controls guide:** [QUEUE_CONTROLS_ROMAN_URDU.md](docs/QUEUE_CONTROLS_ROMAN_URDU.md). **GitHub push guide:** [GITHUB_PUSH_ROMAN_URDU.md](docs/GITHUB_PUSH_ROMAN_URDU.md).
