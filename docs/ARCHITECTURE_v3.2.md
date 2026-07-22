# CKAP v3.2 Architecture

## Runtime boundaries

- `frontend/` is a Vite React single-page application. Feature pages are loaded lazily to keep the initial bundle independent from reports, charts, and the annual ledger.
- `backend/` is the only trusted API boundary. It validates requests, resolves the authenticated user, applies global and module-level permissions, records audit events, and accesses Supabase with the service role.
- Supabase stores identities and application data. Browser code uses the anonymous key only for password recovery; application sessions are represented by Secure HttpOnly cookies issued by the Backend.
- `database/` contains ordered, repeatable SQL migrations. Apply the base schema first, compatibility migrations second, and `P0_PRODUCTION_HARDENING.sql` last.
- `render.yaml` defines the web API, static frontend, and a scheduled automation runner. The web process does not run duplicate in-memory schedules.

## Request path

1. The browser sends credentials to `POST /api/auth/login`.
2. The Backend rate-limits the attempt, authenticates with Supabase Auth, loads the server-owned profile, and sets HttpOnly access and refresh cookies.
3. Protected routes resolve the cookie, verify the profile is active, then evaluate role, user override, and module permission.
4. Zod schemas and active module metadata validate every write before Supabase is called.
5. Sensitive mutations and report exports add an audit or run-history record.

## Change rules

- Add a database constraint and API validation together; neither layer replaces the other.
- Never derive authorization from browser state or Auth user metadata.
- A new module must be registered in `master_modules`, define fields in `module_fields`, and receive explicit role permissions.
- Keep report and chart aggregation behind permission-filtered Backend endpoints.
- Run `npm run verify` from the repository root before deployment.

