# Deploy CKAP v3.2.3 AUTH FIX

Deploy only this release. Do not reuse an extracted v3.2.0-v3.2.2 directory.

## Backend on Render

- Root Directory: `backend`
- Build Command: `npm ci && python3 -m pip install -r requirements.txt`
- Start Command: `npm start`
- Required environment variables: `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must belong to the same Supabase project.
- `FRONTEND_URL` must be `https://ckbifrontend.onrender.com` without a trailing slash.

Use **Clear build cache & deploy**. Then open `/api/health`. It must contain:

```json
{
  "version": "3.2.3-final",
  "release": "CKAP_v3.2.3_AUTH_FIX",
  "supabase": "configured",
  "auth_key_source": "service-role"
}
```

If `auth_key_source` is not `service-role`, the backend environment is incomplete. If login returns 401 after this exact health response, the Supabase Auth email/password combination is incorrect. A not-confirmed, banned, or server-key problem now returns its own actionable message instead of a misleading 401.

## Frontend on Render

- Root Directory: `frontend`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- `VITE_API_BASE_URL=https://ckbibackend.onrender.com`

The login screen must show `v3.2.3 AUTH FIX`.
