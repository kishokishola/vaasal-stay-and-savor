# Vaasal Villa Hotel

A luxury villa hotel website for Jaffna, with Supabase-powered room bookings, restaurant menu and staff POS.

## Run locally

Requirements: [Bun](https://bun.sh/) and Node.js 22 or later.

```sh
bun install --frozen-lockfile
bun run dev
```

The app uses the Supabase project configured in `.env`. Do not commit `.env`, a Supabase service-role key, or other private credentials.

## Deploy to GitHub Pages

This repository is configured to deploy as a static single-page app at:

`https://kishokishola.github.io/vaasal-stay-and-savor/`

1. In the GitHub repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. Open **Settings → Secrets and variables → Actions → Variables**, and add:
   - `VITE_SUPABASE_URL` — the Supabase project URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — the Supabase publishable/anon key. This key is public and is restricted by Supabase Row Level Security; never use a service-role key here.
3. In Supabase **Authentication → URL Configuration**, set the site URL to `https://kishokishola.github.io/vaasal-stay-and-savor/` and allow the redirect URL `https://kishokishola.github.io/vaasal-stay-and-savor/**`.
4. Push or merge the changes to the repository's default branch. The **Deploy to GitHub Pages** workflow builds the app and publishes it.

The workflow builds with the repository's GitHub Pages base path, includes a fallback for direct links to app routes, and uses the configured Supabase project for live room, booking, menu and POS data. The first account created in Supabase receives the admin role; the admin can grant staff access from the staff portal.

## Checks

```sh
bun run lint
bun run test
bun run build
```
