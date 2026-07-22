# CKAP v3.2 Production Build Check

Run from the repository root:

```bash
npm --prefix backend ci --dry-run
npm --prefix frontend ci --dry-run
npm run verify
```

Expected result:

- Backend syntax check passes.
- Backend metadata AI tests pass.
- Frontend stabilization and dynamic-module tests pass.
- Vite production build completes.
- Backend and Frontend each contain their own `package-lock.json`, so Render `npm ci` is reproducible.
- Backend lockfile contains direct `ws` and `read-excel-file` dependencies; service `.npmrc` files must not disable lockfile generation.
- Hygiene Excel parser classifies ready, review and reference rows before any database write.
- Login uses Backend-issued HttpOnly cookies and does not store tokens in `localStorage`.
- No `.env` file is committed or included in a release archive.

Database migration order for an existing Supabase project:

1. `database/M1_METADATA_DRIVEN_CORE.sql`
2. `database/M4_DYNAMIC_ANALYTICS_PERMISSIONS.sql`
3. `database/M5_M6_AI_AND_ROLLOUT.sql`
4. `database/P0_PRODUCTION_HARDENING.sql`
5. `database/P1_HYGIENE_EXCEL_IMPORT.sql`

After migrations, sign out and sign in again so the permission list is refreshed.
