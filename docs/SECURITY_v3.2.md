# CKAP v3.2 Security Baseline

## Authentication

- Email/password login terminates at the Backend.
- Access and refresh tokens are held in `HttpOnly`, `SameSite=Lax` cookies and use `Secure` in production.
- Login attempts are rate-limited and return a generic failure message.
- Missing profiles are created as `viewer`; user-controlled Auth metadata can never assign a privileged role.
- Only an owner can assign the owner role, and the last active owner cannot be demoted, disabled, or deleted.

## Authorization and data isolation

- Every protected endpoint fails closed when a permission is missing.
- Module permissions are checked for read, create, edit, delete, and export actions.
- Reports, charts, quality scores, FM-HY imports, and client-generated PowerPoint history use the same server-side permission model.
- Aggregate wet-waste access does not expose dog-food and pig-feed components unless both component permissions are present.

## Deployment checklist

- Rotate `SUPABASE_SERVICE_ROLE_KEY` because an earlier archive contained a live `.env` file.
- Never commit or distribute `backend/.env`; configure secrets in Render only.
- Set `FRONTEND_URL` to the exact production origin. Use a comma-separated list only when multiple known origins are required.
- Apply SQL migrations to a backed-up staging database before production.
- Confirm `/api/health`, login, refresh, logout, role assignment, exports, and audit history after deployment.
- Review dependency audit output and application logs before promoting a release.

## Incident response

If a privileged key or session may be exposed: rotate the Supabase service role key, revoke affected Auth sessions, inspect `audit_logs` and `report_runs`, then redeploy with corrected secrets. Do not reuse credentials found in an archive.

