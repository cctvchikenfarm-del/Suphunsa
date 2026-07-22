# CKAP Development Rules

- Analyze cross-page and data-flow impact before changing code.
- Do not claim Mobile UX passes from source or unit tests alone; verify 360px, 390px, 430px, and Desktop viewports.
- Do not hide layout defects with global horizontal overflow clipping.
- Months whose active report metrics total zero must not be presented as recorded months.
- Category colors must remain consistent across charts, tables, and exports.
- Charts and tables intended for reporting must support PowerPoint-ready export.
- Monthly reporting must use `period_month` as its canonical reporting period.
- Daily averages, actual daily entries, and monthly totals must be interpreted by one shared calculation rule.
- Run frontend tests, backend tests, and the production build before delivery.
- Do not create a ZIP until all required verification passes and the user explicitly requests it.
- Keep package versions, backend VERSION, and RELEASE_ID aligned for a release.
- In Station Summary navigation and report grouping, use the Thai label `ของใช้สิ้นเปลือง` rather than the broader label `สุขอนามัย`.
