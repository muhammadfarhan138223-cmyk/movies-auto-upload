# Contributing

Thank you for improving a local-first, privacy-preserving uploader. Open issues/PRs for bugs or adapters only if they comply with the host's terms and content distribution laws. Do not submit videos, pirated samples, API keys or confidential screenshots.

## Testing

Install Node 22+; no npm dependencies are required for the uploader.

```bash
npm test
npm run check
```

Include a mock endpoint test for any provider API parsing or shutdown change. On Windows, manually verify cancellation in a safe environment before enabling unattended shutdown. Note the supported Node version and Windows edition in bug reports.

## Coding guidelines

- Never route video bytes through Vercel or GitHub Pages.
- No hosting/service keys in browser code.
- Keep the local dashboard loopback-only, and the mobile app read-only with Supabase RLS.
- Do not retry a transfer when the remote result is uncertain without host verification.
- Treat automatic shutdown as a high-impact action requiring explicit opt-in, clean queue success and a cancel window.
