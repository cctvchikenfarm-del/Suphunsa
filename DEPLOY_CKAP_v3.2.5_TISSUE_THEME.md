# Deploy CKAP v3.2.5 TISSUE + THEME

This release includes unified authentication, audited Tissue Excel import, and owner-only visual theme cards.

## Database

Apply all previous migrations, then run:

`database/P2_TISSUE_EXCEL_IMPORT.sql`

This extends `import_batches` with `tissue_excel` and aligns the three Tissue master categories.

## Backend Render service

- Root Directory: `backend`
- Build: `npm ci && python3 -m pip install -r requirements.txt`
- Start: `npm start`
- Keep the v3.2.4 unified-auth environment variables, including `SUPABASE_ANON_KEY`.
- Use **Clear build cache & deploy**.

Health must report `3.2.5-tissue-theme` and `CKAP_v3.2.5_TISSUE_THEME`.

## Frontend Render static site

- Root Directory: `frontend`
- Build: `npm ci && npm run build`
- Publish Directory: `dist`
- `VITE_API_BASE_URL=https://ckbibackend.onrender.com`
- Use **Clear build cache & deploy**.

The login screen must show `v3.2.5 TISSUE + THEME`.
