# Install a secure mobile status PWA from anywhere

The remote PWA is read-only. The laptop uploader still handles ALL video bytes and keeps Streamtape/DoodStream API credentials only in its local `.env` file. Do NOT port-forward `8766` or expose localhost over a tunnel.

## 1. Create separate Supabase project (recommended)

Go to https://supabase.com/dashboard → New project. Keeping remote monitor in a separate project from MovieHub prevents conflicts and limits the impact of compromised agent credentials.

Go to **Authentication → Users** and create TWO different confirmed users:

- **Owner**: your real email, signs into the mobile PWA by one-time email link. Copy its `User UID` (UUID).
- **Agent**: separate email address you control, with a strong unique password for laptop automated login. Copy its `User UID`. Do not share the agent password with your mobile app, a public repo or friends.

Supabase dashboard labels may differ. Confirm both users exist in Authentication → Users and email is verified/confirmed. Do **not** use the provider API passwords for these users.

## 2. Create protected snapshot table

In **SQL Editor**, run `supabase/setup.sql` exactly as provided. Then run the ONE-TIME insert below, replacing UUIDs from the Auth users list:

```sql
insert into public.mh_uploader_snapshot (id, owner_id, agent_id)
values (1, 'YOUR_OWNER_USER_UUID'::uuid, 'YOUR_AGENT_USER_UUID'::uuid);
```

If a snapshot row exists already, do not casually overwrite its owner/agent IDs; review roles first.

### Expected RLS

- Anonymous users: cannot SELECT or UPDATE.
- Authenticated owner: can SELECT the single status row; cannot UPDATE.
- Authenticated agent: can SELECT and UPDATE **only payload and updated_at**; cannot change owner_id/agent_id.
- Other authenticated users: cannot SELECT or UPDATE.
- Nobody other than SQL administrator can INSERT or DELETE via REST.

To verify permissions: sign in as owner and agent separately and perform SELECT/UPDATE requests; the owner PATCH must fail and an unrelated user must see zero rows. Review Supabase Database RLS policies and security advisors before production. This package cannot run tests on your Supabase project without access to it.

## 3. Laptop settings (`.env`, PRIVATE)

Go to Project Settings → API Keys and copy the public **publishable key** (`sb_publishable...`, sometimes legacy anon). Project URL is on Project Settings → Data API/API.

Add these to laptop `.env`:

```dotenv
UPLOAD_SYNC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
UPLOAD_SYNC_PUBLISHABLE_KEY=sb_publishable_YOUR_PROJECT_PUBLIC_KEY
UPLOAD_SYNC_AGENT_EMAIL=agent-you-control@example.com
UPLOAD_SYNC_AGENT_PASSWORD=STRONG_AGENT_PASSWORD
```

Do not paste the Supabase secret/service_role key or agent password into the mobile code or GitHub repository.

Restart the laptop uploader (`Ctrl+C` then `npm.cmd start`), click **Test remote sync**. It should show remote status sync succeeded. If it says login error, check agent email confirmation/password. If 403/zero-row, check RLS and the setup table's agent UID. Refreshing the dashboard does not re-read `.env` until restart.

## 4. GitHub Pages deployment (FREE for public repository)

Create a **separate PUBLIC GitHub repository** named e.g. `moviehub-auto-uploader`. Push the V2 source files without `.env`, `data/queue.json`, video files or exported CSV.

In the GitHub repository:

1. Settings → Secrets and variables → Actions → **Variables** → New repository variable.
2. Create `UPLOAD_SUPABASE_URL` with the project URL from Step 3.
3. Create `UPLOAD_SUPABASE_PUBLISHABLE_KEY` with the public publishable key from Step 3. These are **public configuration values**, not provider API secrets.
4. Settings → Pages → Build and deployment → Source **GitHub Actions**.
5. Actions → **Deploy read-only mobile PWA** → Run workflow (or push a commit after configuring variables).
6. Your URL will look like `https://YOUR_GITHUB_USERNAME.github.io/moviehub-auto-uploader/`.

The workflow builds `mobile/config.js` from public repository variables. `mobile/config.js` is git-ignored so it isn't included accidentally in the code checkout. The deployed config is public by design; server-side RLS is the real access boundary.

## 5. Supabase Auth URL allowlist

In Supabase **Authentication → URL Configuration**:

- Site URL: `https://YOUR_GITHUB_USERNAME.github.io/moviehub-auto-uploader/`
- Redirect URLs: add the exact same full HTTPS URL and, if you use a custom domain, that approved HTTPS domain.

Use email login (Magic Link). Some Supabase projects have strict email rate limits; configure custom SMTP if email delivery becomes unreliable. Keep signups closed if you want owner-only access; the PWA requests login for existing users only.

## 6. Install PWA on mobile

Visit the GitHub Pages URL on your phone:

- Android Chrome: Browser menu (⋮) → **Install app** or **Add to Home Screen** (label varies).
- iPhone Safari: Share → **Add to Home Screen**.

Log in as the **owner**. The app shows jobs and recent progress. If the phone is offline, the static app shell may open but live status requires the internet. It shows *Laptop offline / stale* when the last update is older than 2 minutes. It does not control the laptop or cancel an already-scheduled Windows shutdown.

## 7. Safety checklist

- Do not put provider API keys, Supabase agent email/password, service_role or API secrets in any frontend file or repository.
- Protect the laptop and lock Windows when away; `.env` contains host and agent credentials.
- Keep Project RLS enabled and test unauthorized access before sharing the PWA URL.
- Public GitHub Pages URL is safe to share only if the RLS policy is correct: **the source code and app shell are public, but job data is private**.
- Supabase and GitHub availability/quotas are external dependencies. A snapshot on phone is status history, not a guarantee the uploader is still connected.
