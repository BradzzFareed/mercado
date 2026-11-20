# Mercado Frontend

React 19 + Vite 8 frontend for the Mercado price-forecasting platform.

See the repository root [README](../README.md) for setup, environment variables,
and run instructions.

## Commands

```bash
pnpm install   # first time
pnpm dev       # http://localhost:5173 (proxies /api to :8000)
pnpm lint
pnpm test      # Vitest, node environment (no jsdom)
pnpm build
```

## Notes

- Tailwind v4 is imported first (`src/index.css`), then the legacy design system
  (`src/styles.css`). New screens should prefer Tailwind utilities; existing
  screens still rely on the legacy classes and CSS variables.
- Charts use Chart.js via `react-chartjs-2`, except the sparkline and the
  Philippines dot map, which remain SVG.
- Auth uses Supabase; configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  in `.env` (see `.env.example`).
- Google sign-in needs the Google provider enabled in the Supabase project, with the
  app origin (for example `http://localhost:5173`) in the allowed redirect URLs. The
  button redirects to `window.location.origin`.
- Profile is saved in two places: Supabase `user_metadata` (the source of truth across
  devices) and `localStorage` under `mercado.profile.<userId>`, which paints the drawer
  before auth settles. Saving calls `updateProfile()` and then `supabase.auth.updateUser`.
- Notifications persist on this device only, under `localStorage` key
  `mercado.notifications`. Each record is one `commodity:signal` pair with a
  `new`, `done`, or `deleted` status.
- Unit tests live next to the code as `*.test.js(x)`. Keep them free of DOM APIs: the
  Vitest environment is `node`.
