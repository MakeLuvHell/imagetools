# Multi-Protocol Image Providers Implementation Plan

> Execute tickets in dependency order. Use focused tests for each ticket and run broad source/Windows gates only after all feature tickets are complete.

**Goal:** Ship v0.4.0 with explicit OpenAI Compatible, xAI Imagine, and Gemini Native Image protocols, Provider connectivity/model discovery, and ordered multi-reference generation while preserving v0.3.0 workspaces and OpenAI behavior.

**Source design:** `docs/superpowers/specs/2026-07-20-multi-protocol-image-providers-design.md`

**Architecture:** Persist a Provider protocol and select a built-in Rust adapter through a registry. Adapters map normalized generation requests and normalized results; the generation service retains reference resolution, bounded file handling, run lifecycle, and history ownership. The frontend mirrors capability data only for immediate control behavior; Rust remains authoritative.

**Release constraints:** Keep one Rust/Tauri process, no local listener, no runtime plugins, no API keys or reference bytes in frontend/history/logs, no silent reference recompression, and no Google Imagen in v0.4.0.

## Dependency Graph

```text
MP001 schema/contracts + OpenAI adapter parity
  -> MP002 Provider probe and discovery
  -> MP003 frontend Provider settings and capabilities
  -> MP004 ordered multi-reference lifecycle
       -> MP005 xAI adapter
       -> MP006 Gemini adapter
            -> MP007 release/docs/consolidated gates
```

MP005 and MP006 both depend on MP004 but do not depend on each other.

## MP001: Schema v3, Protocol Contracts, And OpenAI Adapter Parity

**Status:** Done

**Files:**
- Modify `src-tauri/src/workbench/database/schema.rs`
- Modify `src-tauri/src/workbench/database/providers.rs`
- Modify `src-tauri/src/workbench/models.rs`
- Modify `src-tauri/src/workbench/providers.rs`
- Create `src-tauri/src/workbench/generation/adapters/mod.rs`
- Create `src-tauri/src/workbench/generation/adapters/normalized.rs`
- Create `src-tauri/src/workbench/generation/adapters/openai.rs`
- Modify `src-tauri/src/workbench/generation/mod.rs`
- Retire or narrow `src-tauri/src/workbench/generation/client.rs`
- Update `tests/fixtures/backend-contracts/schema-v2.sql` only if the migration fixture contract requires it

### Build

- Add a transactional schema-v2 to schema-v3 migration with `providers.protocol`, `providers.models_refreshed_at`, `provider_models`, and `generation_run_references`.
- Backfill legacy non-null `reference_image_path` values into position zero without changing the legacy column.
- Add protocol validation, DTO fields, internal Provider context, normalized request/result types, capability types, and safe error codes.
- Introduce the adapter registry and move current OpenAI generation/edit mapping behind it.
- Preserve current OpenAI URL normalization, bearer authentication, JSON/multipart fields, response parsing, download handling, and run lifecycle.

### Focused verification

- Start with failing Rust tests for v2 migration/backfill, transaction rollback, Provider defaults/redaction, unsupported protocol, normalized validation, and OpenAI request parity.
- Run the narrow schema, Provider, adapter, and existing generation test modules only.

### Acceptance

- Existing Provider rows become `openai_compatible` without secret/default changes.
- Existing OpenAI-compatible generation tests remain behaviorally equivalent.
- Schema reports v3 only after every migration operation succeeds.
- API keys, base64 references, and raw upstream bodies are absent from public DTO/error snapshots.

## MP002: Provider Connectivity And Model Discovery Backend

**Status:** Done

**Blocked by:** MP001

**Files:**
- Create `src-tauri/src/workbench/providers/discovery.rs` (or convert `providers.rs` into a module with equivalent ownership)
- Modify `src-tauri/src/workbench/providers.rs`
- Modify `src-tauri/src/workbench/database/providers.rs`
- Modify `src-tauri/src/workbench/models.rs`
- Modify `src-tauri/src/workbench/commands.rs`
- Modify `src-tauri/src/main.rs`
- Modify `frontend/desktop-api.js`

### Build

- Add `test_provider_connection` and `discover_provider_models` IPC contracts for saved and unsaved Provider drafts.
- Resolve a stored secret only when an existing Provider ID is supplied and the draft key is empty.
- Implement bounded authenticated model-list requests for OpenAI/xAI (`GET /v1/models`) and Gemini (`GET /v1beta/models`).
- Normalize, deduplicate, bound, and label model IDs; place recommended models first.
- Persist successful discovery and `models_refreshed_at` transactionally on Provider save/refresh; preserve the prior cache after failures.
- Keep connectivity tests read-only and prevent probe/discovery calls from creating runs or changing session timestamps.

### Focused verification

- Start with failing Rust request/response tests using local mock HTTP servers and repository transaction tests.
- Add desktop API mapping/error tests and run only those Node tests.

### Acceptance

- Probe and discovery use the draft protocol/base URL/key without leaking credentials.
- 401/403, 429, network failure, malformed/oversized JSON, and empty lists return stable safe errors.
- Successful discovery returns recommendations plus unique discovered IDs and persists only as specified.

## MP003: Provider Settings UI And Capability-Driven Composer

**Status:** In progress

**Blocked by:** MP002

**Files:**
- Modify `frontend/index.html`
- Modify `frontend/styles.css`
- Modify `frontend/workbench.js`
- Modify `frontend/app.js`
- Modify `frontend/desktop-api.js`
- Modify `tests/frontend_workbench.test.js`
- Modify `tests/frontend_desktop_api.test.js`
- Modify `tests/frontend_ui_contract.test.js`
- Modify `tests/ui/helpers.js`
- Modify `tests/ui/codex_windows.spec.js`

### Build

- Add the explicit protocol selector, guarded official-URL proposal, editable model control, independent Test/Fetch actions, pending states, and inline safe status.
- Show recommended models before cached discovered models and mark unconfirmed models without claiming image support.
- Mirror the Rust capability matrix in a pure frontend function and dynamically constrain references, count, ratios, resolutions, and OpenAI-only advanced options.
- On Provider changes preserve supported values, reset unsupported values to safe defaults, and exclude hidden stale fields from generation payloads.
- Keep the existing responsive settings dialog proportions and restrained visual language.

### Focused verification

- Start with failing pure tests for protocol normalization, URL proposal guards, model ordering, capability projection, and payload pruning.
- Run targeted Node tests and the Provider dialog Playwright cases at 960x640 and 1280x860 in light/dark themes.

### Acceptance

- Probe/fetch failures remain in the dialog and do not erase fields or cached models.
- Gemini count is fixed at one; Flash exposes 1K; Pro exposes 1K/2K/4K; unknown Gemini models expose only 1K.
- xAI exposes only supported shared parameters; OpenAI retains current controls.

## MP004: Ordered Multi-Reference State, IPC, And History

**Status:** Pending

**Blocked by:** MP003

**Files:**
- Modify `src-tauri/src/workbench/models.rs`
- Modify `src-tauri/src/workbench/database/history.rs`
- Modify `src-tauri/src/workbench/generation/files.rs`
- Modify `src-tauri/src/workbench/generation/mod.rs`
- Modify `src-tauri/src/workbench/commands.rs`
- Modify `src-tauri/src/main.rs`
- Modify `frontend/index.html`
- Modify `frontend/styles.css`
- Modify `frontend/workbench.js`
- Modify `frontend/app.js`
- Modify `frontend/desktop-api.js`
- Modify focused Rust, Node, and Playwright tests

### Build

- Add new ordered `references[]` metadata while accepting legacy single token/image-ID fields for deserialization compatibility.
- Validate the entire reference list before consuming tokens: source exclusivity, count, duplicates, existence, signature, byte size, and protocol capability.
- Resolve references into bounded normalized bytes and record immutable ordered run-reference snapshots.
- Add `discard_staged_references(tokens)` and converge all partial preparation failures through one cleanup path.
- Replace single-reference draft/UI state with up to three ordered thumbnails, multi-upload, remove, and accessible move-left/move-right controls.
- Parse legacy drafts into a one-item list; keep session drafts isolated; append historical results and reject duplicates.

### Focused verification

- Start with failing Rust tests for legacy/new DTOs, ordering, duplicates, atomic token consumption, cleanup, and history round-trips.
- Add failing pure frontend tests for draft migration/reorder/deduplication and payload construction, then targeted Composer Playwright coverage.

### Acceptance

- OpenAI rejects more than one reference before outbound I/O; xAI/Gemini accept at most three.
- A failed second/third stage or generation preparation leaves no owned staged-token leak and does not silently omit a reference.
- Timeline reload returns ordered reference metadata while legacy histories remain readable.

## MP005: xAI Imagine Adapter

**Status:** Pending

**Blocked by:** MP004

**Files:**
- Create `src-tauri/src/workbench/generation/adapters/xai.rs`
- Modify adapter registry/capability tests

### Build

- Implement Bearer-authenticated generation and edit JSON requests at `/images/generations` and `/images/edits` relative to normalized `https://api.x.ai/v1` semantics.
- Map one reference to `image`, multiple ordered references to `images`, using Rust-built bounded Data URLs.
- Map application ratios/resolutions/counts exactly as specified and normalize URL/base64 result forms.
- Classify authentication, rate limit, safety, unsupported capability, malformed result, and transport failures without returning raw bodies.

### Focused verification

- Start with failing mock-server contract tests for no/one/three references, field omission, order, auth headers, result forms, and safe errors.

### Acceptance

- Outbound bodies match the approved xAI contract and never enter history/logs/errors.
- Existing common result validation and atomic publication remain the only result persistence path.

## MP006: Gemini Native Image Adapter

**Status:** Pending

**Blocked by:** MP004

**Files:**
- Create `src-tauri/src/workbench/generation/adapters/gemini.rs`
- Modify adapter registry/capability tests

### Build

- Implement `POST /v1beta/models/{encoded_model}:generateContent` with `x-goog-api-key`.
- Map the prompt followed by zero to three ordered `inlineData` parts and request only IMAGE modality.
- Apply model-aware 1K/2K/4K and aspect-ratio mapping; enforce count one.
- Extract non-empty image inline data while ignoring text/thought parts; distinguish proven safety blocks from invalid successful responses.
- Path-encode model IDs and keep all reference base64 inside the Rust request boundary.

### Focused verification

- Start with failing mock-server contract tests for encoded paths, auth, prompt/reference order, model sizing, mixed parts, safety blocks, malformed data, and safe errors.

### Acceptance

- Gemini Flash, Pro, and unknown-model behavior matches the approved capability matrix.
- A 2xx response without a usable image never creates a successful run.

## MP007: v0.4.0 Integration, Upgrade Safety, Documentation, And Gates

**Status:** Pending

**Blocked by:** MP002, MP003, MP004, MP005, MP006

**Files:**
- Modify `src-tauri/tauri.conf.json`
- Modify version-bearing package/Cargo files as required
- Modify `.github/workflows/windows-release.yml` only if v0.4.0 asset logic requires it
- Modify `scripts/prepare_windows_upgrade_fixture.py`
- Modify `scripts/verify_windows_upgrade_rollback.ps1`
- Modify `README.md`
- Create `docs/releases/v0.4.0.md`
- Update `CONTEXT.md` and relevant `knowledge/*.md`
- Update this plan/ticket statuses

### Build

- Set v0.4.0 versions and document protocols, model discovery semantics, reference limits, upgrade backup, and rollback restore requirement.
- Extend the v0.3.0 workspace fixture/gate to prove schema-v2 to v3 migration, Provider secret/default retention, legacy reference backfill, and usable histories.
- Preserve the release contract: MSI plus portable ZIP containing one `Image Tools.exe`, one running application process, no listener, and clean shutdown.

### Consolidated verification

- Run formatting/lint/static checks and the complete Rust and Node suites once all feature tickets pass.
- Run focused Playwright interaction/visual checks, updating snapshots only for intentional approved UI changes.
- Push the implementation branch before triggering the Windows release gate if the workflow requires the remote commit.
- Run the Windows v0.4.0 gate once: build MSI and portable asset, install/launch/exit verification, process/listener inspection, and v0.3.0 upgrade/rollback fixture verification.
- Do not create or mutate a tag/Release unless separately authorized.

### Acceptance

- All three protocols generate through one-process Rust adapters and share bounded result persistence.
- Provider probe/discovery and ordered references work from the packaged Windows application.
- The v0.3.0 upgrade preserves data; rollback documentation requires restoring the pre-upgrade backup.
- Source and Windows gates pass with captured evidence.

## Plan Review

### Product and frontend

- Protocol choice is explicit; no hostname inference or misleading health state.
- Unsupported controls disappear or disable before submission, but backend validation remains authoritative.
- Discovery communicates availability rather than image capability.
- Ordered references remain visible, reorderable, and bounded without layout shifts.

### Backend and data

- OpenAI parity precedes new protocol behavior.
- Migration is additive, transactional, backfilled, and keeps the legacy column for compatibility.
- Provider model replacement and refresh timestamp share one transaction.
- Run creation/completion and token cleanup retain one convergence path.

### Security and resources

- Secrets resolve only in Rust; public DTOs remain redacted.
- Model JSON, reference bytes, result bytes, redirects, item counts, and identifiers are bounded.
- Vendor raw bodies and Data URLs cannot reach errors, logs, parameters, or SQLite.
- No new process, listener, plugin loader, or downgrade redirect is introduced.

### Testing and release

- Every ticket begins with the narrowest failing contract test and ends with focused evidence.
- Broad Linux/source and Windows gates are deferred until MP007, per release policy.
- Upgrade and rollback are tested as data lifecycle behavior, not only as schema-number checks.
