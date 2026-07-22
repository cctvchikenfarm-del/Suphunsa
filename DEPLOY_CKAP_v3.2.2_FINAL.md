# Deploy CKAP v3.2.2 FINAL

Use only the folder named `CKAP_v3.2.2_FINAL`. Do not start Backend from an older extracted folder.

## Render Backend

- Root Directory: `backend`
- Build Command: `npm ci && python3 -m pip install -r requirements.txt`
- Start Command: `npm start`
- Required variables: `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `FRONTEND_URL`

Choose **Clear build cache & deploy**. The build log must show `ckap-backend@3.2.2`.

Verify:

```text
https://ckbibackend.onrender.com/api/health
```

Expected identifiers:

```json
{"version":"3.2.2-final","release":"CKAP_v3.2.2_FINAL","supabase":"configured","dependencies":{"ws":true,"read_excel_file":true}}
```

If the health endpoint shows another version, Render is connected to the wrong repository, branch, root directory, or commit. Do not continue with Frontend deployment until the identifiers match.

## Render Frontend

- Root Directory: `frontend`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Required variables: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

After deployment, the Login screen must show `v3.2.2 FINAL`.

## Database

Apply migrations in the order documented in `BUILD_CHECK.md`. Hygiene Excel Import additionally requires `database/P1_HYGIENE_EXCEL_IMPORT.sql`.
