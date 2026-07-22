# M6 Deployment and Rollout

## Localhost

1. Copy `backend/.env.example` to `backend/.env` and fill local values.
2. Copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL=http://localhost:5000`.
3. Run `npm run install:all`.
4. Run `npm run dev:backend` and, in another terminal, `npm --prefix frontend run dev`.
5. Set `FRONTEND_URL` in the backend to the exact Vite URL, normally `http://localhost:5173`.

## Render

Use `render.yaml` from the repository root. Because each service already uses its own `rootDir`, do not use `npm --prefix backend start` as the Backend Start Command. The correct command is `npm start`.

Required Backend variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `FRONTEND_URL`. AI is optional and requires all three: `AI_INSIGHT_API_URL`, `AI_INSIGHT_API_KEY`, `AI_INSIGHT_MODEL`. `FRONTEND_URL` may contain a comma-separated allowlist, but must never be left blank in production.

Required Frontend variables: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

For Hygiene Enterprise Excel import, apply `database/P1_HYGIENE_EXCEL_IMPORT.sql` after `P0_PRODUCTION_HARDENING.sql`. This creates audited import batches, source deduplication keys, rollback linkage, and the `general_waste` module.

Authentication uses Backend login plus Secure HttpOnly cookies. Do not store access or refresh tokens in browser local storage. Rotate `SUPABASE_SERVICE_ROLE_KEY` before deployment if it has ever been included in an archive or shared outside Render.

Both service `.npmrc` files must allow lockfile writes. Verify `ws` and `read-excel-file` are present in both `backend/package.json` and `backend/package-lock.json`, then run `npm ci --dry-run` before deploying.

## Database order

For a new project, run these files in order:

1. `database/00_V3_FULL_SETUP_SUPABASE.sql`
2. `database/COMPATIBILITY_PATCH_v3.0.9.sql`
3. `database/AUTH_PROFILE_SYNC_MIGRATION_v3.0.9.sql`
4. `database/M1_METADATA_DRIVEN_CORE.sql`
5. `database/M4_DYNAMIC_ANALYTICS_PERMISSIONS.sql`
6. `database/M5_M6_AI_AND_ROLLOUT.sql`
7. `database/P0_PRODUCTION_HARDENING.sql`

For an existing v3 database, back up Supabase and run the missing files in the same order, ending with `P0_PRODUCTION_HARDENING.sql`.

The Render Blueprint also defines `ckap-automation` as a Cron Job. Render cron schedules use UTC, while reporting months and default entry dates use `Asia/Bangkok`.

## Safe rollout

1. Back up the Supabase project.
2. Apply the migrations to a staging/new Supabase project first.
3. Run the old and new systems in parallel against copied data.
4. Compare totals for all eight existing modules and one newly created module.
5. Owner tests forms, validation, CSV round-trip, Dashboard, Ledger, PDF, PowerPoint, permissions, AI on/off, desktop and mobile.
6. Switch production only after Owner acceptance. This repository does not perform the production switch automatically.
