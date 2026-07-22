# CKAP v3.2 Test Matrix

| Area | Automated evidence | Deployment acceptance |
| --- | --- | --- |
| Build | Backend syntax/Python compile and Vite production build | Render build succeeds using `npm ci` |
| Authentication | Health, unauthenticated failure, cookie flags, refresh-compatible request flow, logout clearing, login limiter | Login, expiry refresh, logout, reset password |
| Authorization | Global and module permissions fail closed | Viewer/editor/admin/owner role walkthrough |
| Data integrity | CSV validation, dynamic field validation, canonical batch envelope | Constraint migration on a staging copy; invalid and boundary values |
| Reports | Export permission and run-history wiring | Open generated PPTX and verify totals/audit record |
| FM-HY | Parser compilation and permission/config wiring | Known-good PDF, malformed PDF, overwrite and skip modes |
| Time | Thailand midnight/month boundary test | Create data near 00:00 Asia/Bangkok |
| Deployment | Per-service lockfiles and pinned Node runtime | Health check, CORS origin, cron run and logs |
| Hygiene Excel | Buddhist-year conversion, ready/review/reference classification, packaged UI/API and lockfile dependencies | Preview the supplied workbook, commit a staging batch, repeat to verify duplicate skip, then rollback |

Run the complete local gate with:

```bash
npm run check
```

Automated tests reduce regression risk but do not replace staging migration, browser acceptance, backup/restore, load, and recovery exercises.
