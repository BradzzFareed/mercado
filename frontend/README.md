# Mercado Frontend

React 19 + Vite 8 frontend for the Mercado price-forecasting platform.

See the repository root [README](../README.md) for setup, environment variables,
and run instructions.

## Commands

```bash
pnpm install   # first time
pnpm dev       # http://localhost:5173 (proxies /api to :8000)
pnpm lint
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
