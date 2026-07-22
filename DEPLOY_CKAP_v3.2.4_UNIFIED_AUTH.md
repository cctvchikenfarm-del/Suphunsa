# Deploy CKAP v3.2.4 UNIFIED AUTH

Deploy only this release. Do not reuse an older extracted directory.

## Backend on Render

- Root Directory: `backend`
- Build Command: `npm ci && python3 -m pip install -r requirements.txt`
- Start Command: `npm start`
- Environment:
  - `NODE_ENV=production`
  - `SUPABASE_URL=https://wkjxyusmcoeupcnytjji.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` from the same Supabase project
  - `SUPABASE_ANON_KEY` from the same Supabase project
  - `FRONTEND_URL=https://ckbifrontend.onrender.com`

Use **Clear build cache & deploy**. `/api/health` must report:

```json
{
  "version": "3.2.4-auth-unified",
  "release": "CKAP_v3.2.4_UNIFIED_AUTH",
  "supabase": "configured",
  "auth_key_source": "service-role"
}
```

## Frontend on Render

- Root Directory: `frontend`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- `VITE_API_BASE_URL=https://ckbibackend.onrender.com`

Password recovery no longer reads `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`. It obtains the public Auth configuration from Backend, ensuring reset and login use the same Supabase project.

The login screen must show `v3.2.4 UNIFIED AUTH`.
