# FM-HY Import

Access requires `fmhy.import`. The workflow is upload PDF, inspect the parsed preview, select duplicate handling, and confirm insertion into `data_entries`. Every confirmed import writes an Audit Log.

Supported scope is the structured FM-HY PDF layout used by the project. Image-only PDF OCR, machine-learning forecasting, and editing imported rows inside the Import screen are outside M5–M6; corrections continue through Data Entry.

Acceptance check: import a real approved FM-HY sample in staging, confirm the inserted month and module totals, confirm Dashboard updates, verify the role restriction, and inspect `audit_logs`.
