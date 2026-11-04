# Optional MovieHub website integration (Vercel-safe)

The V2 read-only monitor is a **separate static PWA hosted on GitHub Pages**. Keep that website separate during initial testing.

Once GitHub Pages and Supabase owner authentication are working, an optional **admin-only link** can be placed in the existing MovieHub website's React content admin navigation:

```tsx
<a href="https://YOURUSERNAME.github.io/moviehub-auto-uploader/"
   target="_blank" rel="noopener noreferrer">Open Upload Monitor</a>
```

Guard this link by the existing admin UI if desired, but **security comes from Supabase RLS and owner login**, not from hiding the link. Never add Streamtape/DoodStream keys or agent account credentials to `VITE_` env variables.

The MovieHub website project uses `artifacts/movie-hub/src/App.tsx` and `artifacts/movie-hub/src/pages/ContentAdmin.tsx`; do not replace or modify those files until verified and backed up. Linking does not cause movie uploads to run on Vercel.
