# MovieHub Remote Control PWA — Cloudflare Tunnel (Roman Urdu)

Is version mein Vercel aur Supabase ki zaroorat NAHI. Laptop upload karega; mobile poori queue control kar sakega. Public GitHub mein API keys ya tunnel token kabhi upload mat karna.

## Step 0. Existing uploader safe rakho

Agar current uploader video upload kar raha hai, usko band ya restart na karo. Nayi files GitHub par hone se running upload affect nahi hoti. Upload complete hone ke baad latest GitHub project folder mein `git pull --ff-only origin main` aur `npm.cmd test` chalao.

## Step 1. Cloudflare Tunnel

- https://one.dash.cloudflare.com/ -> Networking -> Tunnels.
- Agar `moviehub-upload-monitor` already hai, NAYA NA BANAO.
- Tunnel name: `moviehub-upload-monitor`.
- Windows amd64 MSI installer (already downloaded) install karo.
- Tunnel page se Windows service install command copy karo; Administrator CMD mein paste karo. Private tunnel token kisi ko na bhejo.
- Cloudflare tunnel **Healthy** hone tak connection check karo. Command: `Get-Service cloudflared` (PowerShell).

## Step 2. Cloudflare Access FIRST

- https://one.dash.cloudflare.com/ -> Access controls -> Applications -> Add an application -> Self-hosted.
- Application name: `MovieHub Upload Remote`
- Hostname: `autoupload.farhanbalouch.com`
- Policy: ALLOW, selector Emails, only your real Gmail. Do not use `Everyone`, `Bypass`, or publicly allow unknown users.
- Login: One-time PIN email.
- From app Additional settings copy **Application Audience (AUD) Tag**. This is not a secret; it identifies the application.
- Find your **team domain** (example `myteam.cloudflareaccess.com`, not account ID). The URL in Access login often shows the team domain.

## Step 3. Laptop private `.env`

In your actual Git-connected V2.2 project folder add:

```dotenv
REMOTE_ENABLED=1
REMOTE_HOST=autoupload.farhanbalouch.com
REMOTE_PORT=8767
REMOTE_ACCESS_TEAM_DOMAIN=YOUR_TEAM.cloudflareaccess.com
REMOTE_ACCESS_AUD=YOUR_APPLICATION_AUD_TAG
REMOTE_ACCESS_EMAIL=YOUR_PRIVATE_GMAIL_ADDRESS
```

Do not change hosting provider keys. Do not post `.env` screenshots. Make sure `.env` is excluded by `.gitignore`.

## Step 4. Start combined uploader + gateway

In VS Code, AFTER finishing the current active transfer:

```powershell
git pull --ff-only origin main
npm.cmd test
npm.cmd start
```

Check terminal logs:
- `MovieHub V2 local uploader running: http://127.0.0.1:8766`
- `Remote gateway bound to 127.0.0.1:8767 ...`

Gateway only starts if `REMOTE_ENABLED=1` and the 4 Access settings are valid. It validates Access JWT signature, issuer, audience, expiry and your email. It does not open a public listening port on your home router.

## Step 5. Cloudflare Tunnel published application route

Only AFTER the Cloudflare Access protection exists and the gateway starts:
- Tunnels -> `moviehub-upload-monitor` -> Routes -> Add route -> Published application.
- Hostname: `autoupload` + `farhanbalouch.com`; path blank.
- Type HTTP; Service URL `http://127.0.0.1:8767` (never 8766).
- Enable `Protect with Access` if available; select the `MovieHub Upload Remote` Access app and confirm its audience.
- Save. Cloudflare creates DNS record for the tunnel if domain is managed there.

Do not route `8766` publicly. It is the unexposed admin server.

## Step 6. Mobile browser/PWA

- On Android Chrome, visit https://autoupload.farhanbalouch.com
- Complete Access login with your own Gmail OTP.
- You should see queued, uploading, completed and failed items. Retry, Hold, Resume, Remove, Priority and Settings controls work like on laptop.
- Chrome menu (three dots) -> **Install app** or **Add to Home Screen**.
- If home-screen install is only a shortcut, the page still works; browser install UI varies.

If laptop is switched off, the remote page cannot control it. An offline page may appear if the service worker has been installed before; Cloudflare may show a tunnel error instead. Without an always-on server/database, laptop power-off and internet outage cannot be reliably distinguished remotely.

## Common problems

- Cloudflare 1033: Tunnel is down, check `Get-Service cloudflared`.
- 502: Tunnel is up but remote gateway is off, check `npm.cmd start` and `.env` settings.
- 403 Access denied: wrong Gmail or Access policy; confirm team domain / audience and approved email.
- `Wrong Host`: Cloudflare service hostname configured incorrectly, or browsing localhost:8767 directly. This is intentional protection.
- `EADDRINUSE 8766/8767`: two app instances are running. Safely stop old process, don't kill active uploads.
- Vercel/Supabase: not required for this Cloudflare setup.

## Security

- Cloudflare Access is not optional for remote controls.
- Only the approved Gmail may control uploads; don't share the link publicly.
- Use Gmail 2FA and a unique Windows password.
- Never expose Cloudflare Tunnel token, provider API keys, JWTs or `.env`.
- All uploads must be for content you own or are authorized to distribute.