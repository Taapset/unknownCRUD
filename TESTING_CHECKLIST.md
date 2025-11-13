# TESTING_CHECKLIST

## Backend – Authentication & Session Management (`backend_py/app.py`)

- **Preconditions / Environment Setup**:
  - [ ] Run the FastAPI app via `uvicorn main:app` with `DATA_ROOT` pointing to a writable temp directory so `_users.json`, `logs/`, and `library/*` can be created automatically (settings.py).
  - [ ] Seed at least one admin user (via `scripts/init-production.py` or by editing `_users.json`) so approval workflows can be exercised.
  - [ ] Place the API behind nginx or a TLS terminator when validating cookie attributes, because `SESSION_COOKIE_PARAMS["secure"]` is `False` by default in code and must be overridden in production.
- **What Needs To Be Tested**:
  - [ ] `/auth/csrf`, `/auth/register`, `/auth/login`, `/auth/logout`, `/me`, and the in-memory `sessions` map that binds cookies to user ids (backend_py/app.py:308-363).
  - [ ] Propagation of the `session_id` cookie across browser + Axios requests, including the CSRF refresh logic that frontend interceptors trigger on 403s.
  - [ ] Behavior of unapproved accounts (register flow always sets `approved=False` and login must reject them until an admin flips the flag).
- **Functional Test Cases**:
  - [ ] Registering a new user lowers the email, SHA256-hashes the password, stores roles, and leaves `approved=False`. Confirm `_users.json` is appended exactly once and no duplicate sessions are created.
  - [ ] Logging in with an approved user returns an `AuthResponse`, sets `session_id`, and populates `sessions[session_id]=user.id`. Validate `/me` returns the same payload when the cookie is sent.
  - [ ] Logout removes the session id from the dict and instructs the browser to delete the cookie (even if it already expired). Follow up `/me` should now 401.
  - [ ] `/auth/csrf` issues a token that the frontend caches. Verify that state-changing calls include the token header and that the backend does not accidentally rotate it mid-session.
  - [ ] Simulate multiple concurrent logins to ensure each session gets its own cookie and that manual deletion of `_users.json` entries while sessions exist causes `/me` to reject the user, as implemented.
- **Edge Cases**:
  - [ ] Registering with email case differences still triggers the 409 conflict because `get_user_by_email` lowercases during comparison.
  - [ ] Restarting the API invalidates all `sessions` (they are in-memory). The frontend must gracefully prompt for login when `/me` suddenly 401s.
  - [ ] Update tests should account for the lack of OTP support even though the request payload accepts `otp`; ensure the server ignores the field instead of crashing.
- **Error / Negative Scenarios**:
  - [ ] Duplicate register attempts return 409; assert that `_users.json` is unchanged.
  - [ ] Logging in with a wrong password or with an unapproved account returns 401 or 403 respectively; verify no cookie is set.
  - [ ] Accessing `/me` or any protected route with a missing/invalid cookie yields 401 `{"detail":"Not authenticated"}` or `{"detail":"Invalid session"}` and should never leak user data.
- **Integration Dependencies**:
  - [ ] `storage.load_users()`/`save_users()` perform full-file rewrites. Tests should simulate concurrent modifications (e.g., two register actions) to ensure the last write wins deterministically.
  - [ ] CSRF behavior must be exercised end-to-end with the frontend `apiClient` interceptor to ensure the 403 retry logic (frontend/src/lib/apiClient.ts) actually triggers.
- **Security & Validation Checks**:
  - [ ] Confirm `SESSION_COOKIE_NAME` is flagged `httponly` and `samesite=lax`, and that CI/deploy scripts override `secure=True` when behind HTTPS (nginx.conf + systemd.service).
  - [ ] Ensure SHA256 hashing without salt is an accepted trade-off (otherwise raise a finding); regression tests should detect if plaintext passwords accidentally get written.
  - [ ] Verify that stale or forged session ids are rejected immediately and that logout truly evicts entries from `sessions`.

## Backend – Admin User Management & Analytics (`backend_py/app.py`)

- **Preconditions / Environment Setup**:
  - [ ] Authenticate as a user whose `roles` include `platform_admin` (the default admin produced by `scripts/init-production.py` works).
  - [ ] Populate DATA_ROOT with at least one work/verse so analytics have non-zero numbers.
- **What Needs To Be Tested**:
  - [ ] CRUD endpoints under `/admin/users`, the password change flow, and `/admin/analytics` (app.py:363-511).
  - [ ] Admin-only guards—non-admins must see 403 on every admin path.
- **Functional Test Cases**:
  - [ ] `GET /admin/users` returns all stored users, including unapproved submitters. Confirm `enabled` is reported as `True` even though it is not persisted in the model.
  - [ ] `POST /admin/users` creates a user with provided roles and approval flags. Verify SHA256 hashing and that duplicate emails are blocked.
  - [ ] `PUT /admin/users/{id}` updates email (with uniqueness enforcement), password (when provided), roles, and approval flag. Assert partial updates work and unspecified fields stay untouched.
  - [ ] `DELETE /admin/users/{id}` removes the user unless it matches the caller’s id (which must raise 400).
  - [ ] `POST /admin/change-password` enforces the current password, hashes the new one, and allows immediate login with the new secret.
  - [ ] `/admin/analytics` iterates through every work/verse/commentary. Validate counts and status aggregation against actual files under DATA_ROOT.
- **Edge Cases**:
  - [ ] Editing a user without supplying `password` should leave the previous hash intact—verify by attempting to log in with both old and new passwords.
  - [ ] Changing email case should not permit duplicates (email stored lower-case).
  - [ ] Analytics should gracefully handle empty data roots (no exception when `list_work_ids()` returns `[]`).
- **Error / Negative Scenarios**:
  - [ ] Non-admin hitting any `/admin/*` path must receive 403.
  - [ ] Updating, deleting, or approving a nonexistent `user_id` should return 404 without mutating `_users.json`.
  - [ ] `POST /admin/change-password` with an incorrect current password should 400 with a descriptive message.
- **Integration Dependencies**:
  - [ ] `storage.load_users()` performs a full read/modify/write cycle; concurrency tests should simulate two admins editing simultaneously.
  - [ ] Analytics depends on `storage.list_verses()`/`list_commentary()`. Missing or malformed JSON files must not crash the endpoint.
- **Security & Validation Checks**:
  - [ ] Ensure only admins can approve submitters; SMEs or reviewers must not be able to escalate privileges.
  - [ ] Confirm password hashes are never returned in API responses.
  - [ ] Review logs (not implemented) for admin actions should be considered; tests should at least verify sensitive responses exclude secrets.

## Backend – Works CRUD & Metadata (`backend_py/app.py`, `backend_py/storage.py`)

- **Preconditions / Environment Setup**:
  - [ ] Log in as an SME or admin (is_sme returns true for either) before hitting POST/PUT/DELETE.
  - [ ] Prepare sample `WorkUpdateRequest` payloads that include structure, source editions, and policy to exercise full schema validation.
- **What Needs To Be Tested**:
  - [ ] `GET /works`, `GET /works/{id}`, `POST /works`, `PUT /works/{id}`, `DELETE /works/{id}`.
  - [ ] `storage.save_work`, `storage.delete_work`, and the tombstone/trash behavior for entire works.
- **Functional Test Cases**:
  - [ ] Listing works returns summaries sorted by work_id (storage.list_work_ids + load_work). Verify titles and lang arrays are intact.
  - [ ] `GET /works/{id}` returns the saved work or 404 if missing.
  - [ ] Creating a work writes `work.json`, prevents overwrite if the directory already exists, and enforces `work_id` uniqueness.
  - [ ] Updating a work requires the path param to match `payload.work_id`; tests should catch any mismatches raising 400.
  - [ ] Deleting a work moves the entire directory to `data/trash/works/<id>` and writes a tombstone describing original vs trashed paths (storage.delete_work).
- **Edge Cases**:
  - [ ] `WorkUpdateRequest` inherits from `Work`, so partial updates are impossible. Tests should verify that omitting fields causes Pydantic validation errors, guiding API consumers to send full objects.
  - [ ] Very large `langs` arrays or missing `source_editions` should be accepted and preserved.
  - [ ] Re-creating a deleted work should start fresh even if a tombstone is present.
- **Error / Negative Scenarios**:
  - [ ] Non-SME users should receive 403 on write endpoints.
  - [ ] `POST /works` with an existing `work_id` must return 409.
  - [ ] `DELETE /works/{id}` with a nonexistent id should 404 without creating trash directories.
- **Integration Dependencies**:
  - [ ] File permissions in DATA_ROOT must allow the API process (www-data in production) to create directories.
  - [ ] Deleting a work should not orphan verse/commentary logs; tests should check whether `/logs/review` retains entries referencing deleted work_ids.
- **Security & Validation Checks**:
  - [ ] Ensure only SME/admin roles can mutate works; future tests should fail if unauthorized accounts slip through due to missing role checks.
  - [ ] Validate that path traversal is impossible (work_id sanitized by being used as directory name).
  - [ ] After deletion, confirm no sensitive files remain world-readable outside of trash.

## Backend – Verses, Segments & File Storage (`backend_py/app.py`, `backend_py/storage.py`)

- **Preconditions / Environment Setup**:
  - [ ] Create at least one work with canonical language and source editions before exercising verse endpoints.
  - [ ] Authenticated user is required; SME-only logic is not currently enforced but tests should assert the intended restriction.
- **What Needs To Be Tested**:
  - [ ] `GET /works/{work_id}/verses` (with pagination), `GET /works/{work_id}/verses/{verse_id}`, `POST`/`PUT`/`DELETE` verse endpoints, manual-number uniqueness enforcement, `_normalize_verse_model`, and storage helpers (`generate_verse_id`, `manual_number_exists`, `delete_verse`).
- **Functional Test Cases**:
  - [ ] Listing verses returns paged results with `items`, `total`, and `next` cursor (offset/limit). Verify ordering by `order` and that the normalization adds every fallback language to `texts` and `segments`.
  - [ ] Creating a verse auto-generates `verse_id`/`order`, copies the SME’s email into `meta.entered_by`, normalizes languages per `_expected_languages`, and enforces manual-number uniqueness (409 on duplicates).
  - [ ] Updating a verse allows replacing texts, tags, origin, segments, and merging metadata. Confirm language normalization still runs after updates.
  - [ ] Deleting a verse relocates its JSON file under `trash/verses` and records a tombstone referencing the actor email.
  - [ ] Storage helpers increment suffixes correctly (e.g., V0001, V0001a after manual inserts) and handle sparse numbering.
- **Edge Cases**:
  - [ ] Creating a verse without explicit segments should still serialize empty arrays for every fallback language; tests should diff the stored JSON.
  - [ ] Ensure `origin` is required before approval but optional at creation; if empty, `_validate_ready_for_approval` will later block approval.
  - [ ] Frontend sends `attachments`, but the backend `Verse` model does not define that field. Tests must catch that the backend silently drops attachments so the team can decide whether to extend the schema or strip the field client-side.
- **Error / Negative Scenarios**:
  - [ ] Manual-number duplication during creation or update returns 409; verify the `detail` string matches `"duplicate manual number"` as used by the UI.
  - [ ] Requesting a nonexistent verse returns 404 whether the work or verse id is wrong.
  - [ ] Attempting to delete an already-deleted verse should be idempotent (storage.delete_verse just returns if the file no longer exists).
- **Integration Dependencies**:
  - [ ] `DATA_ROOT` must be writable; addition/removal of JSON files should trigger watchers if running in production (e.g., backup scripts).
  - [ ] Review endpoints rely on verses having canonical text and origin; verse tests should set up data accordingly to avoid approval failures.
- **Security & Validation Checks**:
  - [ ] Add regression tests ensuring only SME/reviewer roles can create or mutate verses, since the current code only checks authentication.
  - [ ] Validate that arbitrary keys injected into the payload are rejected by Pydantic (extra=forbid), preventing schema poisoning.
  - [ ] Ensure `verse_id` path parameters are sanitized to prevent directory traversal (storage.verse_path simply concatenates strings).

## Backend – Commentary Lifecycle (`backend_py/app.py`, `backend_py/storage.py`)

- **Preconditions / Environment Setup**:
  - [ ] Seed at least one verse per work to attach commentary to; note that commentary files are nested under `commentary/<verse_id>/`.
  - [ ] Authenticate as any user (no role gates yet) before invoking commentary endpoints.
- **What Needs To Be Tested**:
  - [ ] `GET /works/{work_id}/commentary/{commentary_id}`, `GET /works/{work_id}/verses/{verse_id}/commentary`, `POST`/`PUT`/`DELETE` commentary endpoints, and storage helpers `list_commentary`, `list_commentary_for_verse`, `generate_commentary_id`, `delete_commentary`.
- **Functional Test Cases**:
  - [ ] Listing commentary for a verse returns both items whose `verse_id` matches and items whose `targets` include the verse id.
  - [ ] Creating commentary auto-generates ids like `C-<WORK>-<VERSE>-0001`, seeds default authenticity/priority blocks, and sets targets to the verse.
  - [ ] Updating commentary allows editing texts, speaker, source, genre, tags, and merges review status if provided.
  - [ ] Deleting commentary moves files to trash and logs a tombstone referencing the actor.
  - [ ] `generate_commentary_id` should increment indexes even if intermediate files were deleted (`COMMENTARY_ID_PATTERN` ensures numbers ascend).
- **Edge Cases**:
  - [ ] Commentary without `verse_id` (work-level commentary) should still be retrievable; ensure endpoints handle the `"work"` directory branch.
  - [ ] Extremely large `texts` dictionaries should remain intact (no trimming).
  - [ ] When duplicating commentary via the frontend, verify the backend accepts identical payloads multiple times as long as targets differ.
- **Error / Negative Scenarios**:
  - [ ] Accessing commentary for a nonexistent work or verse returns 404, as does fetching a commentary id that does not exist anywhere in the directory tree.
  - [ ] Attempting to create commentary for a missing verse must 404 before writing files.
  - [ ] Update/delete calls without proper authentication should reject the request.
- **Integration Dependencies**:
  - [ ] File layout for commentary uses nested directories; tests must ensure `storage.list_commentary` handles both verse-specific and work-wide entries.
  - [ ] Review workflows share the same `Commentary` objects; ensure tests coordinate commentary review after creation.
- **Security & Validation Checks**:
  - [ ] Enforce role-based auth on commentary mutations (currently any authenticated user can call them); regression tests should surface this gap.
  - [ ] Ensure only valid ids matching `COMMENTARY_ID_PATTERN` are accepted to prevent path traversal.
  - [ ] Validate that tags and metadata cannot contain executable markup (since JSON is later exported).

## Backend – Review Workflow & Audit Logging (`backend_py/app.py`, `backend_py/storage.py`)

- **Preconditions / Environment Setup**:
  - [ ] Prepare verses with canonical text and origin to pass `_validate_ready_for_approval`.
  - [ ] Ensure `logs/review/` directory is writable for JSONL log creation.
- **What Needs To Be Tested**:
  - [ ] Verse review endpoints (`/review/verse/{id}/approve|reject|flag|lock`), commentary review endpoints, `_transition_review`, `_validate_ready_for_approval`, and `storage.append_review_log`.
- **Functional Test Cases**:
  - [ ] Approving a verse/enforces canonical text + origin, appends a `ReviewHistoryEntry`, changes state, persists the verse, and appends a log line with `kind="verse"`.
  - [ ] Rejecting requires issues; confirm the payload is stored both in the history entry and review log.
  - [ ] Flagging and locking transitions should not wipe existing history; verify log entries record `action` `"flag"` or `"lock"`.
  - [ ] Commentary review endpoints parallel verse behavior; ensure approving/flagging commentary works even when verse_id is null (work-level commentary).
  - [ ] The log file for the current UTC date (`logs/review/YYYY-MM-DD.jsonl`) should contain JSON lines with actor, action, from/to states, and issues arrays.
- **Edge Cases**:
  - [ ] Multiple transitions in rapid succession should append multiple history entries and log lines; verify ordering matches call order.
  - [ ] `_validate_ready_for_approval` must reject verses missing canonical text or origin before changing state; tests should assert a 422.
  - [ ] Locking an already locked verse should still append history, demonstrating idempotency decisions.
- **Error / Negative Scenarios**:
  - [ ] Attempting to approve a verse lacking canonical text/origin should raise 422 with human-readable detail.
  - [ ] Review endpoints currently only check authentication; tests should fail (highlight) when non-reviewer roles call them, prompting the team to add role checks.
  - [ ] Log file permissions issues should raise errors; tests should simulate unwritable directories to ensure graceful failure.
- **Integration Dependencies**:
  - [ ] History serialization relies on timezone-aware datetimes; confirm exported ISO strings keep the `Z` or timezone offset as expected.
  - [ ] `storage.append_review_log` is append-only; tests should check that daily log files are rotated correctly and no data is lost when the process restarts midday.
- **Security & Validation Checks**:
  - [ ] Add tests to enforce that only reviewers/SMEs/admins can hit review endpoints (currently missing). UI already hides buttons (`App.tsx`), but API-level enforcement is required.
  - [ ] Ensure log files do not grow unbounded—operational tests should monitor disk usage and rotation strategies.
  - [ ] Validate that rejection issues scrub sensitive data before logging/exporting.

## Backend – Export & Build Outputs (`backend_py/app.py`)

- **Preconditions / Environment Setup**:
  - [ ] Populate a work with multiple verses and commentary so merged/clean/train exports have meaningful data.
  - [ ] Confirm the API process can write to `data/<work_id>/{build,export}` directories.
- **What Needs To Be Tested**:
  - [ ] `/build/merge`, `/export/clean`, `/export/train`, `/sme/export/work/{id}`, `/sme/export/work/{id}/verse/{id}`, `/sme/export/all`, and helper functions `_merge_payload`, `_clean_payload`, `_training_lines`, `_clean_verse_bundle`, `_clean_full_library`.
- **Functional Test Cases**:
  - [ ] `build_merge` writes `<work>.all.json` containing full work/verses/commentary data with review metadata intact.
  - [ ] `export_clean` strips review info, history, authenticity, and priority from both verses and commentary before writing `<work>.clean.json`.
  - [ ] `export_train` emits JSONL lines with per-language verse/commentary entries; ensure newline-separated formatting is correct and no blank lines occur.
  - [ ] SME export endpoints honor the `format` query param and enforce SME-only access; verify `ExportFormat.CLEAN` vs `MERGED`.
  - [ ] `/sme/export/work/{work_id}/verse/{verse_id}` returns bundled verse + commentary object with cleaning applied.
- **Edge Cases**:
  - [ ] Works without commentary should still produce valid exports with empty arrays.
  - [ ] `ExportFormat` defaults to CLEAN; sending unknown values should 422.
  - [ ] `_clean_full_library` must skip works whose directories were deleted mid-run without aborting the entire export.
- **Error / Negative Scenarios**:
  - [ ] Requesting exports for nonexistent work/verse returns 404.
  - [ ] Insufficient file permissions should raise errors; tests should simulate read-only directories and verify the API surfaces a useful message.
  - [ ] Non-SME callers of SME export endpoints must receive 403.
- **Integration Dependencies**:
  - [ ] Export outputs should be consumed by downstream tooling; tests can parse generated JSON/JSONL to ensure schema stability.
  - [ ] Synchronous file writes might block; load testing should verify these endpoints don’t starve the event loop.
- **Security & Validation Checks**:
  - [ ] Clean exports must remove reviewer identity metadata (meta.entered_by, review.history) to avoid leaking PII.
  - [ ] Validate that exported files are not world-writable on the server (deployment scripts should set 640 or similar).
  - [ ] Ensure SSE/HTTP caching does not expose internal directories (nginx.conf handles static routes; tests should confirm).

## Backend – SME Analytics, Pending Reviews & Bulk Operations (`backend_py/app.py`)

- **Preconditions / Environment Setup**:
  - [ ] Seed works with a mix of verse states (draft/review_pending/flagged/approved) and commentary entries.
  - [ ] Log in as a user with `sme` or admin role.
- **What Needs To Be Tested**:
  - [ ] `/sme/analytics`, `/sme/pending-reviews`, `/sme/bulk-action`, `/sme/segments`, `/sme/work-summary/{id}` (app.py:1076-1290).
- **Functional Test Cases**:
  - [ ] Analytics endpoint counts pending reviews, approvals/rejections performed by the caller (based on review history actor), flagged items, per-work status breakdowns, and lists recent actions limited to 20 items sorted by timestamp.
  - [ ] Pending reviews should list both verses and commentary (with work titles, states, tags, last_updated) and respect the `work_id` filter + `limit`.
  - [ ] Bulk action endpoint should approve/reject/flag/rollback batches of verse ids, validate canonical text/origin on approval, and return arrays of success/failure with error strings.
  - [ ] `/sme/segments` updates segments for a verse, appends a `segment_update` history entry, saves, and logs.
  - [ ] `/sme/work-summary` returns counts for verse/commentary states plus total counts for UI dashboards.
- **Edge Cases**:
  - [ ] Bulk rollback should revert to the previous state found in history (or default to draft). Tests should create multi-step histories to verify correct selection.
  - [ ] Pending reviews should gracefully handle items with empty history (no `last_updated`).
  - [ ] Updating segments with new languages not in `expected` should still store them (verse model allows arbitrary keys).
- **Error / Negative Scenarios**:
  - [ ] SME endpoints must 403 for non-SME accounts.
  - [ ] Bulk action requests referencing missing work or verse ids should append entries to the `failed` array; confirm exceptions per verse do not abort the whole batch.
  - [ ] `/sme/segments` should 404 when either work or verse is missing.
- **Integration Dependencies**:
  - [ ] Analytics iterates through every work/verse/commentary; ensure tests cover performance when thousands of files exist.
  - [ ] Bulk actions rely on `storage.append_review_log`; verify logs include actor + action for each verse.
- **Security & Validation Checks**:
  - [ ] Bulk rejection without issues currently passes the `issues` list as provided; tests should enforce that rejections supply at least one issue for accountability.
  - [ ] Ensure segment updates are limited to SMEs; UI already enforces this but API-level tests should confirm.
  - [ ] Validate pending review data does not leak sensitive `texts` to unauthorized parties (only SMEs should fetch).

## Backend – File-Based Storage & Data Integrity (`backend_py/storage.py`, `backend_py/settings.py`)

- **Preconditions / Environment Setup**:
  - [ ] Set `DATA_ROOT` to a temp directory and ensure tests clean up after themselves (storage functions create directories automatically).
  - [ ] On production-like systems, run tests as the `www-data` user to validate permissions.
- **What Needs To Be Tested**:
  - [ ] Settings resolution for DATA_ROOT, JSON read/write helpers, tombstone creation, `delete_work/verse/commentary`, id generators, and review log writer.
- **Functional Test Cases**:
  - [ ] `settings.DATA_ROOT` should honor the `DATA_ROOT` env var or fall back to `<project>/data/library`, creating directories eagerly.
  - [ ] JSON read/write use UTF-8 and `ensure_ascii=False`; confirm non-ASCII text (Bengali in seed_data) survives roundtrips.
  - [ ] Tombstones capture `type`, `work_id`, `id`, `deleted_at`, `actor`, and relative source/destination paths.
  - [ ] `append_review_log` creates one JSONL file per day and appends newline-delimited JSON objects.
- **Edge Cases**:
  - [ ] `generate_verse_id` must handle gaps in numbering and suffix cycling; tests should create verse ids up to 26 suffixes to ensure wrap-around logic maintains uniqueness.
  - [ ] Deleting works/verses/commentary should be idempotent—subsequent deletes do nothing and do not raise.
  - [ ] `read_json` should raise helpful exceptions when files are corrupted; tests can inject malformed JSON to confirm behavior.
- **Error / Negative Scenarios**:
  - [ ] Attempting to delete a work that does not exist must raise FileNotFoundError so API can translate to 404.
  - [ ] Failing to write tombstone (due to permissions) should bubble up; tests should simulate read-only directories.
  - [ ] Review log writes should fail loudly if disk is full (operational tests).
- **Integration Dependencies**:
  - [ ] Data layout is consumed by exports, analytics, and UI. Regression tests should ensure reorganizing directories (e.g., `TRASH_DIR`) does not break other modules.
  - [ ] Scripts (`seed_data.py`, `init-production.py`) depend on the same helpers; storage tests underpin script reliability.
- **Security & Validation Checks**:
  - [ ] Validate that tombstone directories do not leak PII (only actor email). Consider encrypting logs if necessary.
  - [ ] Ensure file permissions inherited from deployment scripts (`chmod -R 755`) do not expose `_users.json`; tests should flag if world-readable.
  - [ ] Confirm there is no possibility of path traversal via work_id/verse_id/commentary_id because filenames are directly concatenated.

## Tooling, Deployment & Scripts (root scripts, GitHub Actions, Ops assets)

- **Preconditions / Environment Setup**:
  - [ ] Have Python 3.9+, Node 18+, npm, and PowerShell available when running local scripts.
  - [ ] Provision a staging VPS (matching setup-vps.sh) with SSH access for end-to-end deployment rehearsals.
- **What Needs To Be Tested**:
  - [ ] `scripts/seed_data.py` + `Makefile dev-seed`, `scripts/dev_seed.ps1`, `scripts/init-production.py`, `deploy.sh`, `cleanup-for-deployment.bat`, `deploy-local.bat`, `setup-vps.sh`, `.github/workflows/deploy.yml`, nginx + systemd units.
- **Functional Test Cases**:
  - [ ] Running `make dev-seed` (or `dev_seed.ps1`) populates DATA_ROOT with sample work/verses/commentary and leaves existing data untouched if already present.
  - [ ] `init-production.py` creates a default admin only when `_users.json` is empty; rerunning should detect existing users and exit without overwriting.
  - [ ] `deploy.sh` (and the GitHub Actions workflow) performs backup, builds frontend, rsyncs backend/frontend, sets permissions, seeds data, reloads systemd/nginx, and verifies `/health`. Tests should walk through success + rollback scenarios.
  - [ ] `cleanup-for-deployment.bat` removes local artifacts (env, data, stale JS) but must never delete tracked files (verify the exclusion list).
  - [ ] `deploy-local.bat` builds a zip excluding `node_modules`, envs, and `.git`; decompressing on a clean host then running `deploy.sh` should succeed.
  - [ ] `setup-vps.sh` must be idempotent and leave firewall/service state predictable.
  - [ ] nginx config proxies `/api/` to 8000, caches static assets, and rewrites SPA routes; systemd unit loads `.env.production` and sets DATA_ROOT.
- **Edge Cases**:
  - [ ] `seed_data.py` contains non-ASCII characters; ensure Windows PowerShell and Linux shells both handle encoding.
  - [ ] GitHub Actions script should handle missing `GITHUB_TOKEN` (falls back to secrets) and roll back if `npm build` fails.
  - [ ] `deploy.sh` uses unusual Unicode characters in echo statements (likely encoding artifacts). Tests should ensure the script still runs under bash with `set -e`.
- **Error / Negative Scenarios**:
  - [ ] If rsync or pip install fails mid-deploy, verify rollback restores the previous `/var/www/html`.
  - [ ] When `_users.json` contains invalid JSON, `init-production.py` should either fix or error with actionable output.
  - [ ] `cleanup-for-deployment.bat` must not silently fail when directories are missing; ensure it surfaces errors for locked files.
- **Integration Dependencies**:
  - [ ] Deployment expects systemd service named `unknown-crud` and nginx site `unknown-crud`. Tests should confirm the GitHub workflow copies `systemd.service`/`nginx.conf` and reload services.
  - [ ] OPS scripts rely on apt packages (python3, nodejs, rsync). Validate `setup-vps.sh` installs versions compatible with the codebase.
- **Security & Validation Checks**:
  - [ ] Default admin password (`admin123`) is insecure—deployment tests must ensure operators rotate it immediately (documented in init-production output).
  - [ ] Verify secrets (SSH key, tokens) in GitHub Actions are referenced from `secrets.*` and never echoed.
  - [ ] Ensure deployed directories are owned by `www-data` and have minimal permissions (scripts currently set 755/775; tighten if needed).

## Frontend – Auth, Routing & Shared Infrastructure (`frontend/src/App.tsx`, `context/AuthContext.tsx`, `components/AuthModal.tsx`, `components/HomePage.tsx`, `lib/apiClient.ts`, `hooks/useAutosave.ts`)

- **Preconditions / Environment Setup**:
  - [ ] Configure `.env.development` with `VITE_API_BASE` pointing to the running FastAPI server.
  - [ ] Clear `localStorage` between tests to validate hydrate logic in `AuthContext`.
- **What Needs To Be Tested**:
  - [ ] Auth context lifecycle (hydrate from localStorage, login, register, logout, refresh).
  - [ ] AuthModal UX (login vs register tabs, password validation, admin/SME portal shortcuts).
  - [ ] App routing: main editor (`/`), admin portal (`/admin`), SME dashboard (`/sme`), fallback route.
  - [ ] Axios client behavior: CSRF fetching, retries, error formatting, `withCredentials`.
  - [ ] HomePage hero actions open AuthModal and respect responsive layout.
  - [ ] `useAutosave` hook respects `enabled` flag and cleans intervals on unmount.
- **Functional Test Cases**:
  - [ ] `AuthContext` hydrates from stored `auth_user` without hitting `/me`, but still refreshes once if nothing stored. Verify login updates localStorage and logout clears it even if backend request fails.
  - [ ] AuthModal enforces password length on register, shows notice about admin approval, and closes/clears state on cancel. Buttons to go to `/admin` or `/sme` should navigate and close the modal.
  - [ ] Navigating to `/admin` or `/sme` while already logged in with proper roles bypasses secondary login screens; otherwise `AdminLoginPage`/`SMELoginPage` display forms and enforce role checks.
  - [ ] Axios client adds `x-csrf-token` to non-GET requests, caches the token, refreshes on 403 once, and surfaces `formatError` strings for arrays/objects.
  - [ ] `useAutosave` triggers saves every 30s only when `dirty && !isSaving`, and clears the interval when dependencies change or component unmounts.
- **Edge Cases**:
  - [ ] Stale `auth_user` in localStorage should be removed if `/me` later reports 401; ensure `refresh()` covers that scenario.
  - [ ] AuthModal register flow should handle network errors gracefully and keep the modal open with specific error text.
  - [ ] Axios error formatter should handle responses with `detail` arrays, nested messages, or missing responses (network errors).
  - [ ] `useAutosave` must not run on the server during SSR (hook references `window`).
- **Error / Negative Scenarios**:
  - [ ] Provide incorrect credentials in AuthModal and confirm errors surface and no localStorage writes occur.
  - [ ] Force the API to return a 403 to verify the Axios interceptor retries exactly once; second failure should propagate error to the caller.
  - [ ] Attempt to reach `/admin` or `/sme` while not logged in; expect HomePage (AppContent returns `<HomePage />` when `!user`).
- **Integration Dependencies**:
  - [ ] Auth context relies on backend cookie auth, so Cypress-type tests must run with the API server available over the configured base URL.
  - [ ] `useAutosave` interacts with `handleSave`; integration tests should stub the API to validate throttling.
- **Security & Validation Checks**:
  - [ ] Ensure auth state is never stored in query params or cookies from the frontend side—only the backend sets `session_id`.
  - [ ] Confirm AuthModal prevents registering weak passwords (<8 chars) in the UI before hitting the backend.
  - [ ] Verify admin/SME portal shortcuts cannot be abused to bypass login (routes still confirm roles server-side).

## Frontend – Main Verse Editor Experience (`frontend/src/App.tsx`, `components/HeaderBar.tsx`, `components/VerseNavigator.tsx`, `components/CommandPalette.tsx`)

- **Preconditions / Environment Setup**:
  - [ ] Seed works/verses via backend before launching the frontend so list/search features have data to display.
  - [ ] Mock network errors to validate banner and connection states (`pingConnection` polls `/health` every 20s).
- **What Needs To Be Tested**:
  - [ ] Loading works list, selecting work, fetching verses, viewing verse details, creating new drafts, autosave vs manual save, Save & Next flow, validation banner, command palette, connection chip, responsive header controls, logout.
- **Functional Test Cases**:
  - [ ] On initial load, `fetchWorks` populates the dropdown and selects the first work; `loadVerseList` fetches paginated data with search term persisted.
  - [ ] Selecting a verse loads details plus commentary, populating all tabs with normalized languages (including fallback ones).
  - [ ] Clicking “New” in `VerseNavigator` builds an initial draft with canonical language, required languages, default origin from the first source edition, empty tags, and review requirements.
  - [ ] HeaderBar buttons: Save triggers PUT/POST and displays “Saved <time>”, Save & Next clones the draft with manual number incremented, Validate displays warnings based on missing canonical text/origin/manual number, Jump to Verse opens the command palette.
  - [ ] Command palette opens with ⌘/Ctrl+K, supports arrow navigation + Enter selection, ESC close, and shows top 20 results filtered by search term.
  - [ ] ConnectionChip transitions through “Checking” → “Connected”/“Offline” based on `/health`.
  - [ ] Logout calls `useAuth.logout`, clears user state, and surfaces success/failure banners.
- **Edge Cases**:
  - [ ] Manual numbers that are not numeric should remain unchanged when hitting Save & Next (incrementManualNumber returns original if parseInt fails).
  - [ ] Searching with diacritics or empty string should behave consistently (empty string resets query).
  - [ ] Autosave should not trigger while `isSaving` is true; tests should toggle `dirty` while a save is in flight.
  - [ ] Ensure `verseDraft.meta.entered_by` is preserved on updates and not overwritten by other users.
- **Error / Negative Scenarios**:
  - [ ] Simulate API failures on save to ensure `errorMessage` and `bannerMessage` show actionable text and `dirty` stays true.
  - [ ] Attempt review actions without selecting a verse; UI should banner “Select a verse before performing review actions.”
  - [ ] Remove canonical text or origin and try to approve; UI should block approval even before the backend rejects it.
- **Integration Dependencies**:
  - [ ] Save actions rely on backend endpoints; integration/UI tests must spy on Axios to assert payload structure (texts trimmed, segments sanitized, attachments included).
  - [ ] Commentary creation flows depend on `CommentaryTab`; hooking tests should verify new entries appear without full page reload.
- **Security & Validation Checks**:
  - [ ] UI prevents reviewers from approving their own verses by checking `meta.entered_by`. Tests should ensure the logic holds even if meta is missing or casing differs.
  - [ ] Ensure keyboard shortcuts (Cmd+S, etc.) can’t trigger unintended browser behaviors; intercept default events where necessary.
  - [ ] Confirm command palette does not leak verses from other works (filter uses `selectedWorkId`).

## Frontend – Editor Tabs & Data Entry Components (`frontend/src/components/EditorTabs.tsx`, `VerseTab.tsx`)

- **Preconditions / Environment Setup**:
  - [ ] Provide `workDetail` with multiple languages and source editions to exercise all tab states.
  - [ ] Populate verse history entries for HistoryTab previews.
- **What Needs To Be Tested**:
  - [ ] `VerseTab` language validation + preferred language persistence, tag input behavior.
  - [ ] `TranslationsTab` length counters, `SegmentsTab` splitting/merging/reordering/inserting/removing segments.
  - [ ] `OriginTab` CRUD UI linked to edition list.
  - [ ] `CommentaryTab` creation, tag management, duplication prompt, loading states.
  - [ ] `ReviewTab` preview display, issue capture, button enablement, severity selector.
  - [ ] `HistoryTab` timeline formatting, `PreviewTab` fallback language order, `AttachmentsTab` add/update/remove.
- **Functional Test Cases**:
  - [ ] `VerseTab` should persist a preferred editing language per work via `localStorage`. Adding/removing languages should show/hide editors, and invalid characters per regex (LANGUAGE_RULES) must raise validation text.
  - [ ] Tag input adds tags on Enter/Comma/Tab, removes via button, and uses backspace to delete last tag when empty.
  - [ ] `SegmentsTab` split button divides a segment by newline or punctuation, merge/reorder/insertion functions mutate arrays, and removing last segment should update state.
  - [ ] `OriginTab` adds blank entries, populates edition dropdown from `source_editions`, and allows numeric editing plus removal.
  - [ ] `CommentaryTab` prevents creation unless a verse is selected, trims text, resets form on success, shows spinner when loading, and Duplicate flows prompt for target verse id before POSTing.
  - [ ] `ReviewTab` preview cards show canonical + translation texts, validation warnings list all missing requirements, issue builder enforces at least problem text before enabling Reject, and button enablement respects `canApprove/canReject/canFlag/canLock` + `isProcessing`.
  - [ ] `PreviewTab` orders languages by `[canonical, en, or, hi, as, ...others]` and hides empty texts; commentary preview collapses/expands per entry.
  - [ ] `AttachmentsTab` allows adding blank attachment rows, editing labels/urls/notes, and removing entries.
- **Edge Cases**:
  - [ ] `VerseTab` should auto-create blank entries for new languages introduced via work configuration mid-session.
  - [ ] `SegmentsTab` splitting segments containing newline + punctuation should not drop fragments; tests should cover both cases.
  - [ ] `CommentaryTab` duplication prompt should handle invalid target ids (UI can surface backend 404).
  - [ ] `ReviewTab` issues list should reset after a reject action completes.
- **Error / Negative Scenarios**:
  - [ ] Attempt to add commentary while API is down; ensure errors appear and `isCreating` resets.
  - [ ] Remove all origin entries and try to approve; validation should block even if backend would have caught it later.
  - [ ] Attachments with invalid URLs should still be stored but flagged for manual review; tests should note absence of client-side validation.
- **Integration Dependencies**:
  - [ ] Each tab depends on `workDetail` (languages, editions). Tests should mock context to ensure tabs behave when those lists are empty.
  - [ ] `ReviewTab` triggers `onApprove/onReject/...`; integration tests should stub these handlers to assert payloads derived from issue builder.
- **Security & Validation Checks**:
  - [ ] Ensure commentary duplication cannot be hijacked to write to arbitrary verse ids (UI prompt should sanitize input; backend enforces path).
  - [ ] Validate preview tabs do not render HTML (texts inserted as plain strings).
  - [ ] Confirm attachments UI disallows script injection (escape user input when rendering).

## Frontend – SME Dashboard & Tools (`frontend/src/components/SMEDashboard.tsx`, `SME*` components)

- **Preconditions / Environment Setup**:
  - [ ] Seed backend with multiple works and verses in different states to populate tabs.
  - [ ] Log in as SME or admin and navigate to `/sme`.
- **What Needs To Be Tested**:
  - [ ] SMEDashboard tab navigation (overview, pending, works, bulk, delete, books, editor, exports), data fetching, state filters, bulk selection, delete flows.
  - [ ] SME-specific managers: `SMEWorkManager`, `WorkFormModal`, `SMEBookManager`, `BookDetails`, `CreateBookModal`, `CreateVerseModal`, `SMEVerseManager`, `SMEVerseEditor`, `SMEExportManager`, `SMELoginPage`.
- **Functional Test Cases**:
  - [ ] Overview tab shows metrics cards, per-work progress, and recent activity limited to 10 display rows; scrolling on mobile should work using horizontal overflow wrappers.
  - [ ] Pending tab filters by work + state, displays mixed verse/commentary items, supports action buttons (Approve/Flag/Reject) per row, and clicking a verse row opens `SMEVerseEditor`.
  - [ ] Bulk tab requires selecting a work, toggling checkboxes for verse ids, selecting an action (approve/reject/flag/rollback), optional issues field, and hitting Execute. Button should disable when selection or action is missing.
  - [ ] Delete tab filters verses by manual number / verse id, refreshes list, shows state + preview text, and calls DELETE endpoint with confirmation. Status banner should summarize deletion.
  - [ ] SMEWorkManager lists works, allows creating new ones (WorkFormModal), editing existing (prefilled data), and deleting with confirmation. WorkDetails view displays metadata, source editions, policy.
  - [ ] WorkFormModal handles dynamic language toggles, adding/removing source editions, adding policy entries via prompt, and editing structure fields.
  - [ ] SMEBookManager lists books, shows details, allows launching CreateVerseModal per work, and opens SMEVerseEditor for specific verse edits.
  - [ ] SMEVerseManager provides a SME-targeted version of the verse editor with Save/Save & Next, search, autosave, and review actions mirroring the main editor but limited to SME roles.
  - [ ] SMEVerseEditor modal supports tabs (content, segments, review, history), tag management, segment editing, review actions (approve/reject/flag/lock) with issue textarea required for reject, and close/save buttons.
  - [ ] SMEExportManager auto-selects the first work, loads all verse ids (using pagination loop), allows downloading entire book, single verse, or all data as clean JSON via Blob downloads, and shows info/error banners.
- **Edge Cases**:
  - [ ] Pending tab should handle large datasets by respecting the `limit` query; UI can paginate client-side if necessary.
  - [ ] Bulk rollback should map to the correct previous state even after multiple transitions.
  - [ ] Delete tab status banners should persist until dismissed; ensure repeated deletes update the table without requiring manual refresh.
  - [ ] WorkFormModal prompts (add policy) should be tested for canceling/out-of-focus behavior.
  - [ ] SMEVerseEditor review action drop-down only enables Save button when action selected and (for reject) issues filled.
  - [ ] SMEExportManager’s looping fetch must detect when the backend returns the same offset (to avoid infinite loops).
- **Error / Negative Scenarios**:
  - [ ] Hitting SME tabs as a non-SME (e.g., authenticated submitter) should show the access denied message defined in each component.
  - [ ] Simulate API failures for analytics/pending/bulk; UI should set `error` state, keep spinners manageable, and avoid crashing.
  - [ ] Work delete confirmation should cancel when user clicks “Cancel”; ensure no API call occurs.
- **Integration Dependencies**:
  - [ ] All SME tabs depend on backend SME endpoints; integration tests should stub Axios to verify correct parameters (`work_id`, `verse_ids`, filter query strings).
  - [ ] SMEVerseEditor reuses the same review endpoints as the main editor; ensure shared throttling/state does not conflict.
- **Security & Validation Checks**:
  - [ ] Confirm SME UI never exposes data to non-SME users (guard components render “Access Denied”).
  - [ ] Bulk operations should require explicit confirmation if many verses are targeted; consider adding an “Are you sure?” prompt in future tests.
  - [ ] Export downloads should call `URL.revokeObjectURL` after completion to avoid leaking blob URLs; tests should ensure cleanup occurs.

## Frontend – Admin Portal (`frontend/src/components/AdminPage.tsx`, `AdminLoginPage.tsx`)

- **Preconditions / Environment Setup**:
  - [ ] Ensure backend admin endpoints are accessible and at least one pending user exists to test approval flows.
  - [ ] Log in with admin credentials or use AdminLoginPage to obtain them.
- **What Needs To Be Tested**:
  - [ ] Admin login gating, tab toggle between Users and Analytics, user table actions (approve, edit, delete), create user form, password change modal, analytics visualization.
- **Functional Test Cases**:
  - [ ] AdminLoginPage only allows users with `platform_admin` or `admin` roles to proceed; non-admin logins should display “Access denied”.
  - [ ] User list renders email, roles, approval/enabled flags, created dates (null for now). Approve button should call `/admin/users/{id}` with roles + `approved=true`.
  - [ ] Create/Edit forms allow toggling roles, enabling/disabling, and optional password entry. Submitting should close modals, refresh list, and handle API errors gracefully.
  - [ ] Delete button confirms via `window.confirm` and deletes the user on acceptance; ensure current admin cannot delete themselves (UI should surface backend error).
  - [ ] PasswordChangeForm enforces matching new passwords and length≥8 before sending request.
  - [ ] Analytics tab displays cards + status breakdown using `/admin/analytics`; ensure skeleton states render when data is loading.
- **Edge Cases**:
  - [ ] Editing a user without changing password should leave password field blank and not send `password`—verify form logic does so.
  - [ ] Approve button shows spinner text `"Approving…"` per user; ensures component-level state resets after completion.
  - [ ] Creating users with duplicate emails should display backend error messages inline.
- **Error / Negative Scenarios**:
  - [ ] API failure for user list/analytics should surface `error` banner at top and keep UI usable.
  - [ ] Attempting to approve a user twice should not re-trigger backend updates; UI should remain consistent.
  - [ ] Closing modals mid-request should cancel network calls? (Currently no cancellation; tests should confirm UI handles eventual responses).
- **Integration Dependencies**:
  - [ ] Admin UI depends entirely on `/admin/*` endpoints; integration tests should mock Axios to assert payload structure (especially `roles` arrays, booleans).
  - [ ] `onLogout` prop currently just clears adminUser state; tests should ensure hitting “Logout” returns to AdminLoginPage.
- **Security & Validation Checks**:
  - [ ] Ensure forms do not allow creation of users without roles (UI defaults to `["submitter"]`).
  - [ ] Confirm admin-only components guard themselves even if someone manually navigates via URL (App’s AdminRoute check + server enforcement).
  - [ ] Validate analytics view does not expose sensitive data beyond counts.

## Regression Suite & Cross-Cutting Scenarios

- **Preconditions / Environment Setup**:
  - [ ] Establish repeatable environments (CI pipeline and local docker/devcontainers) with deterministic DATA_ROOT.
  - [ ] Capture baseline snapshots of JSON data for diff-based regression.
- **What Needs To Be Tested**:
  - [ ] Full-stack regressions, interplay between backend review logs and exports, concurrency between autosave and manual save, data seeding and deployment automation, existing pytest suite.
- **Recommended Regression Tests**:
  - [ ] Run `pytest backend_py/tests/test_e2e.py` on every change; extend the suite to cover SME/admin endpoints, commentary flows, and export/clean outputs.
  - [ ] Execute `npm run build` (and ideally component/UI tests via Playwright/Cypress) for the frontend, ensuring tree-shaking and type-checking succeed.
  - [ ] End-to-end workflow: register submitter → admin approves → submitter creates verse → reviewer/SME approves → SME bulk actions/export. Validate review logs + exports capture the final state.
  - [ ] Autosave vs manual save: simulate editing text while autosave triggers, ensure dirty flag resets appropriately and no duplicate verses are created.
  - [ ] Review logs vs exports: after approving/rejecting, run `export_clean` and confirm review metadata is scrubbed yet textual changes remain.
  - [ ] SME bulk actions vs per-verse actions: ensure running both sequentially keeps history consistent (no missing states).
  - [ ] Delete work/verse/commentary then run exports to confirm deleted items aren’t included but tombstones/logs remain intact.
  - [ ] Run `scripts/seed_data.py`, `scripts/init-production.py`, and `deploy.sh` in a CI-like environment to catch encoding/perms regressions early.
  - [ ] Verify the GitHub Actions deployment pipeline by running it against a staging VPS; test rollback by forcing a failure mid-script.
  - [ ] Performance smoke tests for `/sme/analytics` + `/sme/pending-reviews` on thousands of verses to ensure response times stay acceptable.
- **Integration Dependencies**:
  - [ ] CI should spin up both backend and frontend, seeded with sample data, so UI tests can run against realistic APIs.
  - [ ] Regression harness should archive logs (`logs/review/*.jsonl`, nginx/systemd logs) for triage when tests fail.
- **Security & Validation Checks**:
  - [ ] Incorporate static analysis (e.g., Bandit) for backend and linting (ESLint) for frontend to catch insecure patterns automatically.
  - [ ] Pen-test session handling (session fixation, CSRF) at least once per release, since security relies on coordinated backend/frontend behavior.
  - [ ] Validate deployment artifacts (nginx/systemd configs) each release to ensure TLS cert paths, service names, and environment variables remain correct.

## Backend – Works CRUD & Metadata (`backend_py/app.py`, `backend_py/storage.py`)

- **Preconditions / Environment Setup**:
  - [ ] Log in as an SME or admin (is_sme returns true for either) before hitting POST/PUT/DELETE.
  - [ ] Prepare sample `WorkUpdateRequest` payloads that include structure, source editions, and policy to exercise full schema validation.
- **What Needs To Be Tested**:
  - [ ] `GET /works`, `GET /works/{id}`, `POST /works`, `PUT /works/{id}`, `DELETE /works/{id}`.
  - [ ] `storage.save_work`, `storage.delete_work`, and the tombstone/trash behavior for entire works.
- **Functional Test Cases**:
  - [ ] Listing works returns summaries sorted by work_id (storage.list_work_ids + load_work). Verify titles and lang arrays are intact.
  - [ ] `GET /works/{id}` returns the saved work or 404 if missing.
  - [ ] Creating a work writes `work.json`, prevents overwrite if the directory already exists, and enforces `work_id` uniqueness.
  - [ ] Updating a work requires the path param to match `payload.work_id`; tests should catch any mismatches raising 400.
  - [ ] Deleting a work moves the entire directory to `data/trash/works/<id>` and writes a tombstone describing original vs trashed paths (storage.delete_work).
- **Edge Cases**:
  - [ ] `WorkUpdateRequest` inherits from `Work`, so partial updates are impossible. Tests should verify that omitting fields causes Pydantic validation errors, guiding API consumers to send full objects.
  - [ ] Very large `langs` arrays or missing `source_editions` should be accepted and preserved.
  - [ ] Re-creating a deleted work should start fresh even if a tombstone is present.
- **Error / Negative Scenarios**:
  - [ ] Non-SME users should receive 403 on write endpoints.
  - [ ] `POST /works` with an existing `work_id` must return 409.
  - [ ] `DELETE /works/{id}` with a nonexistent id should 404 without creating trash directories.
- **Integration Dependencies**:
  - [ ] File permissions in DATA_ROOT must allow the API process (www-data in production) to create directories.
  - [ ] Deleting a work should not orphan verse/commentary logs; tests should check whether `/logs/review` retains entries referencing deleted work_ids.
- **Security & Validation Checks**:
  - [ ] Ensure only SME/admin roles can mutate works; future tests should fail if unauthorized accounts slip through due to missing role checks.
  - [ ] Validate that path traversal is impossible (work_id sanitized by being used as directory name).
  - [ ] After deletion, confirm no sensitive files remain world-readable outside of trash.

## Backend – Verses, Segments & File Storage (`backend_py/app.py`, `backend_py/storage.py`)

- **Preconditions / Environment Setup**:
  - [ ] Create at least one work with canonical language and source editions before exercising verse endpoints.
  - [ ] Authenticated user is required; SME-only logic is not currently enforced but tests should assert the intended restriction.
- **What Needs To Be Tested**:

  - [ ] `GET /works/{work_id}/verses` (with pagination), `GET /works/{work_id}/verses/{verse_id}`, `POST`/`PUT`/`DELETE` verse endpoints, manual-number uniqueness enforcement, `_normalize_verse_model`, and storage helpers (`generate_verse_id`, `manual_number_exists`, `delete_verse`).
- **Functional Test Cases**:
  - [ ] Listing verses returns paged results with `items`, `total`, and `next` cursor (offset/limit). Verify ordering by `order` and that the normalization adds every fallback language to `texts` and `segments`.
  - [ ] Creating a verse auto-generates `verse_id`/`order`, copies the SME’s email into `meta.entered_by`, normalizes languages per `_expected_languages`, and enforces manual-number uniqueness (409 on duplicates).
  - [ ] Updating a verse allows replacing texts, tags, origin, segments, and merging metadata. Confirm language normalization still runs after updates.
  - [ ] Deleting a verse relocates its JSON file under `trash/verses` and records a tombstone referencing the actor email.
  - [ ] Storage helpers increment suffixes correctly (e.g., V0001, V0001a after manual inserts) and handle sparse numbering.
- **Edge Cases**:
  - [ ] Creating a verse without explicit segments should still serialize empty arrays for every fallback language; tests should diff the stored JSON.
  - [ ] Ensure `origin` is required before approval but optional at creation; if empty, `_validate_ready_for_approval` will later block approval.
  - [ ] Frontend sends `attachments`, but the backend `Verse` model does not define that field. Tests must catch that the backend silently drops attachments so the team can decide whether to extend the schema or strip the field client-side.
- **Error / Negative Scenarios**:
  - [ ] Manual-number duplication during creation or update returns 409; verify the `detail` string matches `"duplicate manual number"` as used by the UI.
  - [ ] Requesting a nonexistent verse returns 404 whether the work or verse id is wrong.
  - [ ] Attempting to delete an already-deleted verse should be idempotent (storage.delete_verse just returns if the file no longer exists).
- **Integration Dependencies**:
  - [ ] `DATA_ROOT` must be writable; addition/removal of JSON files should trigger watchers if running in production (e.g., backup scripts).
  - [ ] Review endpoints rely on verses having canonical text and origin; verse tests should set up data accordingly to avoid approval failures.
- **Security & Validation Checks**:
  - [ ] Add regression tests ensuring only SME/reviewer roles can create or mutate verses, since the current code only checks authentication.
  - [ ] Validate that arbitrary keys injected into the payload are rejected by Pydantic (extra=forbid), preventing schema poisoning.
  - [ ] Ensure `verse_id` path parameters are sanitized to prevent directory traversal (storage.verse_path simply concatenates strings).

...(truncated for brevity)...

