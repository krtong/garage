# Garage Dashboard

This repo hosts the static dashboard for the garage automation system. It is
**public** so GitHub Pages can serve it, but it only contains the Supabase **anon
key**. All writes are protected by Supabase Auth + RLS.

## How it works

- Sign in with your Supabase Auth email/password.
- Read/write the `garage_settings` row in Supabase.
- The scheduler respects the updated settings.

## Security

- The anon key is safe to publish.
- The service role key is **not** in this repo.
- Keep RLS enabled on `garage_settings`.
- Disable public signups in Supabase Auth.

## URL

After Pages is enabled, the dashboard is served at:

```
https://krtong.github.io/garage/
```
