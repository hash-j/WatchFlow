# Part 18J development migration checkpoint

Prepared only. Do not run without separate human approval. Target: `watchflow-dev`, Supabase ref `ckwadpmvxieekjlsfcks`. The only migration permitted is `202610160001_part_18j_same_subject_reauth.sql`. Production is outside this procedure.

## Apply gate

The operator script `scripts/part18j-apply-dev-reauth-migration.mjs` requires the exact branch, linked ref, dev URL, pinned migration file hash, all predecessor migrations in the dev ledger, no other pending local migrations, the old function signature and service-role security contract, the QA User A fixture, both paused QStash schedules, and both disabled GitHub scheduler variables. It stores the currently deployed function definition at ignored path `supabase/.temp/part18j-reauth-previous-function.sql` without printing its text. It then requires `APPROVE_WATCHFLOW_DEV_SAME_SUBJECT_REAUTH_MIGRATION` on a terminal and repeats the mutable checks immediately before application.

The script accepts `SUPABASE_CLI_PATH` for the installed CLI, with a `supabase` PATH fallback. On Windows it resolves the npm `.cmd` shim to its package entry point and launches it with Node without a shell. It requires CLI version `2.121.0` and sets `DO_NOT_TRACK=1` for CLI subprocesses. Application uses `migration up --linked`, with the existing link pinned to watchflow-dev and a repeated sole-pending ledger check immediately before application. It never adds `--include-all` or puts the database password in arguments; `SUPABASE_DB_PASSWORD` is inherited through the child environment. The installed CLI's help lists both `--linked` and `--project-ref`, so the previous failure's cause is not established by help alone. No application execution is part of this update.

`node scripts/part18j-apply-dev-reauth-migration.mjs --precheck-only` performs all live pre-apply assertions and prints a sanitized pass/fail result. It returns before writing the rollback snapshot, requesting approval, applying a migration, or starting integration tests. It reads QStash and GitHub state only.

## Verification and failure

After application, the script checks the dev ledger, exact function metadata and intended subject/sync guards, unchanged QA fixture, paused schedules, and disabled gates. It then runs the nine integration cases in `integration/part18j-same-subject-reauth.integration.test.ts` against disposable development fixtures. The integration gate is enabled only for that child process. No Google OAuth or Calendar call is part of this procedure.

On any failure, stop. The operator re-reads the dev migration ledger and function fingerprint after application errors or failed postchecks. It reports `MIGRATION_APPLY_FAILED_UNCHANGED` only when the target is still pending and the old fingerprint is unchanged; it reports `MIGRATION_APPLY_SUCCEEDED_POSTCHECK_FAILED` when the ledger is applied and the fingerprint changed. Other or unreadable combinations report `MIGRATION_APPLY_STATE_AMBIGUOUS`. Evidence includes only command exit code, a fixed CLI classification, and whether the child command started. Do not infer automatic rollback. Leave QA sync disabled, both schedules paused, and both GitHub gates false; do not reauthorize or run A2. Preserve the sanitized console result and the local rollback snapshot. A retry may reuse that snapshot only when its bytes exactly match the current pinned pre-apply definition plus the existing trailing newline; a mismatch fails closed without overwriting it. Do not print or commit the snapshot.

## Rollback preparation, separate approval required

If rollback is later approved, compare the saved definition fingerprint with the pre-apply checkpoint and inspect the current dev function and ledger. Prepare a **new forward migration** that restores the exact saved `CREATE OR REPLACE FUNCTION` definition and its prior service-role-only EXECUTE grants. Review the diff and run the guarded tests before any deployment. Do not execute this plan now, delete migration history, or edit the Supabase ledger manually. The saved function definition is local evidence; it is not an executable rollback in this task.
