# Multi-Protocol Image Providers Design

**Status:** Approved design, pending implementation

**Target release:** v0.4.0

**Date:** 2026-07-20

## Summary

Image Tools will expand from one OpenAI-compatible Images transport to three explicit built-in Provider protocols:

- OpenAI Compatible
- xAI Imagine
- Gemini Native Image

The Rust backend will select a protocol adapter from persisted Provider metadata. Each adapter owns authentication, connectivity checks, model discovery, request mapping, response parsing, and protocol-specific capability validation. The generation service will continue to own session history, staged references, bounded result persistence, image-signature validation, and safe errors.

The same release will expand the Composer and generation contract from one reference image to an ordered list of at most three references. OpenAI-compatible Providers remain limited to one reference unless a later protocol extension defines a stable multi-image contract. xAI and Gemini accept one to three references.

Google Imagen is intentionally deferred. It uses a separate `:predict` protocol and has a different editing/capability surface from Gemini Native Image.

## Sources

The protocol design is based on vendor-owned sources available on 2026-07-20:

- [xAI Imagine REST generation implementation](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-tools/src/implementations/grok_build/image_gen/mod.rs)
- [xAI Imagine REST editing implementation](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-tools/src/implementations/grok_build/image_edit/mod.rs)
- [xAI image protocol](https://github.com/xai-org/xai-proto/blob/main/proto/xai/api/v1/image.proto)
- [xAI Python image SDK](https://github.com/xai-org/xai-sdk-python/blob/main/src/xai_sdk/sync/image.py)
- [Gemini Native Image cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts-js/Image_out.js)
- [Google Imagen REST cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_imagen_rest.ipynb)
- [Google Gen AI SDK image-generation tests](https://github.com/googleapis/python-genai/blob/main/google/genai/tests/models/test_generate_content_image_generation.py)

## Goals

- Preserve existing OpenAI-compatible Provider behavior and existing Provider secrets.
- Add explicit xAI Imagine and Gemini Native Image Provider protocols.
- Support connectivity testing and model discovery from Provider Settings without generating a billable image.
- Persist discovered model IDs and their refresh time for offline selection.
- Support zero to three ordered reference images in Composer drafts and generation requests.
- Keep every outbound Provider call in the in-process Rust backend.
- Normalize Provider results before using the existing bounded download, signature validation, file publication, and history paths.
- Keep Provider API keys backend-only and preserve the exact safe `CommandError` contract.
- Prove schema-v2 to schema-v3 migration and Windows v0.3.0 to v0.4.0 workspace upgrade.

## Non-Goals

- Google Imagen support in v0.4.0.
- Runtime-loaded or third-party Provider plugins.
- Inferring a protocol from a Provider hostname.
- More than three reference images.
- OpenAI-compatible multi-reference editing without a separately specified contract.
- Masks, inpainting controls, control images, or a full image editor.
- Automatic background model refresh.
- Claiming that every ID returned by a model-list endpoint can generate images.
- Silent reference-image compression or quality changes.
- Exposing a local HTTP service or adding another application process.

## Terminology

**Provider protocol** is the explicit wire contract used for authentication, endpoints, model discovery, image generation, image editing, and response parsing. It is not inferred from `base_url`.

**Discovered model** is a model ID returned by a Provider model-list endpoint. Discovery proves availability to the credential, not image-generation capability.

**Recommended model** is a built-in, protocol-specific image model known by this release. Recommended models are presented before discovered models but remain editable.

**Reference list** is the ordered set of zero to three uploaded or persisted result images attached to one generation submission.

## Architecture Decision

The selected approach is a built-in adapter registry. Conditional branches in the current `ProviderClient` were rejected because generation, editing, discovery, authentication, and error parsing would accumulate in one module. A plugin system was rejected because its loading, permission, compatibility, and release-security surface is disproportionate to a local three-protocol desktop application.

The runtime flow becomes:

```text
Composer
  -> GenerateInput
  -> GenerationService
  -> ProviderRepository resolves protocol and secret
  -> AdapterRegistry selects a built-in adapter
  -> NormalizedImageRequest
  -> protocol request/response
  -> NormalizedProviderResponse
  -> existing bounded result and history services
```

The decision is recorded separately in [ADR 0002](../../adr/0002-use-built-in-image-provider-adapters.md).

## Adapter Boundary

Create focused modules under `src-tauri/src/workbench/generation/adapters/`:

```text
mod.rs
normalized.rs
openai.rs
xai.rs
gemini.rs
```

Provider discovery and connection probing live under `src-tauri/src/workbench/providers/discovery.rs` and reuse protocol authentication and bounded JSON helpers without creating a generation run.

The adapter interface has four responsibilities:

```text
capabilities(model) -> ProviderCapabilities
test_connection(context) -> ProviderConnectionResult
discover_models(context) -> ProviderModelDiscoveryResult
generate(context, NormalizedImageRequest) -> NormalizedProviderResponse
```

`NormalizedImageRequest` contains:

```text
prompt
model
count
aspect_ratio
resolution
references[]
openai_options
```

Each normalized reference contains its original name, detected MIME type, and bounded bytes. Provider adapters never receive a local path, staged token, database image ID, or application media URL.

`NormalizedProviderResponse` contains a non-empty list of Provider images represented by either base64 content or a remote URL. The existing result service continues to enforce aggregate response limits, per-image limits, safe redirect rules, PNG/JPEG/WebP signatures, atomic file publication, and database completion.

## Provider Protocols

### OpenAI Compatible

OpenAI Compatible preserves the current contract:

- Bearer authentication.
- `POST /v1/images/generations` with JSON for text-to-image.
- `POST /v1/images/edits` with multipart form data for one reference.
- `data[].b64_json` or `data[].url` response items.
- Existing `size`, `n`, `quality`, `output_format`, `output_compression`, `background`, and `moderation` mapping.
- At most one reference image.

Existing Providers migrate to this protocol and must produce field-for-field equivalent requests and behavior before the new adapters are allowed to add behavior. Multipart boundary bytes are intentionally not treated as stable.

### xAI Imagine

xAI uses Bearer authentication and a base URL whose official default is `https://api.x.ai/v1`.

Text-to-image uses `POST /images/generations` relative to the normalized base URL:

```json
{
  "model": "grok-imagine-image-quality",
  "prompt": "...",
  "n": 1,
  "aspect_ratio": "16:9",
  "resolution": "1k",
  "response_format": "b64_json"
}
```

Reference generation uses `POST /images/edits` with JSON. One reference maps to:

```json
{
  "model": "grok-imagine-image-quality",
  "prompt": "...",
  "n": 1,
  "resolution": "1k",
  "response_format": "b64_json",
  "image": {"url": "data:image/png;base64,..."}
}
```

Two or three references use `images` instead of `image` and include `aspect_ratio`. Each image entry is `{"url": "data:<mime>;base64,<data>"}`. The output parser accepts the documented URL or base64 result forms and normalizes them for the common result service.

Recommended models are:

- `grok-imagine-image`
- `grok-imagine-image-pro`
- `grok-imagine-image-quality`

Image Tools exposes the shared Composer ratios supported by xAI, maps `standard` to `1k`, and maps `medium`/`large` to `2k`. Result count remains limited to the application's existing range of one to four even though the vendor protocol permits a wider range.

### Gemini Native Image

Gemini uses the official default base URL `https://generativelanguage.googleapis.com` and the `x-goog-api-key` header. Generation calls:

```text
POST /v1beta/models/{model}:generateContent
```

Text-to-image request bodies contain one text part and request the image response modality:

```json
{
  "contents": [{"parts": [{"text": "..."}]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

Reference generation appends one to three ordered `inlineData` parts after the text part:

```json
{
  "inlineData": {
    "mimeType": "image/png",
    "data": "<base64>"
  }
}
```

The response parser extracts non-empty `candidates[].content.parts[].inlineData` entries and ignores text or thought parts. A successful HTTP response without an image becomes either `provider.safety_blocked` when safety metadata proves filtering or `provider.invalid_response` otherwise.

Recommended models are:

- `gemini-2.5-flash-image`
- `gemini-3-pro-image`

Gemini Native has no reliable `sampleCount` equivalent, so v0.4.0 fixes its result count to one. The Composer disables the count control while Gemini is selected. `gemini-2.5-flash-image` is fixed to `standard`/`1K`. `gemini-3-pro-image` maps `standard`, `medium`, and `large` to `1K`, `2K`, and `4K`. Unknown custom Gemini models use the conservative `standard`/`1K` capability and do not expose unconfirmed sizes.

## Capabilities

Capabilities are explicit data, not failures discovered after submission. The frontend uses a mirrored pure capability map for immediate control changes, while the Rust adapter remains authoritative and validates every request.

```text
ProviderCapabilities
  max_references
  max_results
  aspect_ratios[]
  resolutions[]
  supports_quality
  supports_output_format
  supports_output_compression
  supports_background
  supports_moderation
```

The v0.4.0 capability matrix is:

| Capability | OpenAI Compatible | xAI Imagine | Gemini Native |
| --- | --- | --- | --- |
| References | 0-1 | 0-3 | 0-3 |
| Results | 1-4 | 1-4 | 1 |
| Aspect ratio | Existing size mapping | Native ratio | `imageConfig.aspectRatio` |
| Resolution | Existing pixel size | `1k` / `2k` | Flash `1K`; Pro `1K` / `2K` / `4K`; unknown `1K` |
| Quality | Supported when sent | Hidden | Hidden |
| Output format/compression | Supported when sent | Hidden | Hidden for Gemini Developer API |
| Background | Supported when sent | Hidden | Hidden |
| Moderation option | Supported when sent | Hidden | Hidden; vendor safety still applies |

Switching Provider preserves fields that map to the new protocol, resets unsupported fields to safe defaults, and never sends hidden stale fields. The actual normalized and provider-specific parameters are snapshotted in `generation_runs.parameters_json`.

## Provider Configuration And Schema v3

Schema v3 adds:

```text
providers.protocol TEXT NOT NULL DEFAULT 'openai_compatible'
providers.models_refreshed_at TEXT NULL

provider_models
  provider_id INTEGER NOT NULL
  model_id TEXT NOT NULL
  discovered_at TEXT NOT NULL
  PRIMARY KEY(provider_id, model_id)

generation_run_references
  generation_run_id INTEGER NOT NULL
  position INTEGER NOT NULL
  local_path TEXT NOT NULL
  filename TEXT NULL
  mime_type TEXT NULL
  PRIMARY KEY(generation_run_id, position)
```

Foreign keys cascade Provider model rows when a Provider is physically deleted and generation reference rows when a run is physically deleted. `generation_runs.reference_image_path` remains for source compatibility and is not reused for new multi-reference writes.

Migration from schema v2 is transactional:

1. Add Provider protocol and model refresh columns.
2. Create `provider_models`.
3. Create `generation_run_references`.
4. Insert position-zero reference rows for non-null legacy `reference_image_path` values.
5. Record migration 3.

Existing Provider rows become `openai_compatible`. Existing API keys, default models, default selection, sessions, runs, and images remain unchanged. A migration failure rolls back all schema-v3 operations.

Provider DTOs add `protocol`, `available_models`, and `models_refreshed_at`. API keys remain redacted as an empty string plus `api_key_set`.

Provider creation and update accept only these protocol IDs:

```text
openai_compatible
xai_images
gemini_native
```

Unknown values fail with `provider.unsupported_protocol`.

## Connectivity And Model Discovery

Add Tauri IPC methods:

```text
test_provider_connection(input)
discover_provider_models(input)
discard_staged_references(tokens)
```

Probe input contains an optional existing Provider ID plus the current editor's protocol, base URL, and API Key. When an existing Provider is identified and the draft key is empty, Rust resolves the stored secret. The stored key is never serialized back to JavaScript.

Connection testing performs a lightweight authenticated model-list request:

- OpenAI Compatible and xAI: `GET /v1/models` after base-URL normalization.
- Gemini: `GET /v1beta/models` with `x-goog-api-key`.

It returns `ok`, elapsed milliseconds, checked timestamp, and a safe message. It does not mutate the Provider, model cache, settings file, generation history, or session timestamps.

Model discovery performs the same bounded authenticated request but parses unique non-empty model IDs. Recommended image models appear first. Other returned IDs are labeled `capability_unconfirmed`; the application does not claim they can generate images.

Discovery supports unsaved Provider drafts. Its result remains in editor state until Save. Saving writes the Provider and replaces its discovered models in one database transaction. Refreshing an existing Provider also replaces the complete model set transactionally. A failed refresh preserves the previous rows and timestamp.

No automatic refresh occurs at startup. Settings shows the last successful refresh time and provides explicit refresh.

## Provider Settings UI

The Provider editor field order is:

```text
Protocol
Name
Base URL
API Key
Default model
Test connection / Fetch available models
Inline probe status
```

Protocol is a select control with OpenAI Compatible, xAI Imagine, and Gemini Native. Selecting a protocol proposes its official Base URL only when the current URL is empty or still equal to the previous protocol's untouched default. User-edited URLs are never silently overwritten.

Default model is an editable control with protocol recommendations, cached discovered models, and custom input. Recommended image models are pinned first. Discovered models without confirmed image capability are visibly marked. Fetching models does not automatically change the default model.

Test and discovery controls have independent pending states. Status appears directly below the controls and reports success, latency, safe failure, and last refresh. A failure does not close the dialog, clear inputs, replace the model list, or expose a raw Provider response.

Provider list rows show a restrained protocol label and the configured default model. Connection state is not shown as a persistent health indicator because a successful probe becomes stale immediately and the application does not monitor Providers in the background.

## Multi-Reference Composer

The Composer replaces the single reference preview with a stable horizontal strip of zero to three items. Each item shows a thumbnail or file icon, filename, remove button, and move-left/move-right icon controls with accessible names and tooltips. Order is the outbound reference order.

Upload accepts multiple PNG, JPEG, or WebP files but stops at three total references. `Set as reference` appends a historical result. Duplicate persisted image IDs and duplicate upload identities are rejected. Reaching the limit shows validation immediately above Composer.

Draft storage changes `referenceSource` to `referenceSources[]`. Parsing continues to accept the old single value and wraps it as a one-item list. Drafts remain isolated by session.

Frontend generation metadata changes to:

```json
{
  "references": [
    {"reference_token": "..."},
    {"reference_image_id": 42}
  ]
}
```

Each entry must contain exactly one source. The Rust DTO continues to deserialize the old top-level `reference_token` and `reference_image_id` for source compatibility, but the new frontend sends only `references`.

Submission snapshots all references before clearing the accepted prompt. Uploaded files stage individually. If later staging or generation preparation fails, the frontend invokes `discard_staged_references` for tokens it owns and keeps the visible reference list. Accepted reference UI clears at the same backend-handoff boundary as the current single-reference behavior.

Rust validates the entire list before consuming any token. It rejects more than three entries, duplicates, mixed fields, missing files, invalid image signatures, and references that exceed the selected protocol capability. Token consumption and run-reference creation converge through one cleanup path so partial preparation cannot leave an active generation or silently omit a reference.

Each local staged image remains limited to 25 MiB. Before outbound serialization, the adapter enforces its vendor request constraints. Oversized references fail explicitly; v0.4.0 does not silently resize, recompress, or change image fidelity.

## Error Contract

New stable safe codes are:

```text
provider.unsupported_protocol
provider.auth_failed
provider.connect_failed
provider.model_list_failed
provider.unsupported_model
provider.unsupported_capability
provider.rate_limited
provider.safety_blocked
provider.invalid_response
reference.too_many
reference.too_large
reference.duplicate
```

Adapters may inspect bounded upstream bodies to classify an error but must not copy raw bodies, API keys, request base64, or sensitive diagnostics into `CommandError`, SQLite, logs, or frontend status. HTTP 401/403 maps to authentication, 429 maps to rate limiting, vendor safety metadata maps to safety blocking, and a successful response without a usable image maps to invalid response unless safety metadata proves filtering.

Connectivity and discovery errors stay in the Provider editor and do not create generation runs. A formal generation creates its durable `running` row before the outbound request and converges to `succeeded` or `failed` under the existing lifecycle rules.

## Security And Resource Limits

- Provider calls remain Rust-only and use Rustls.
- API keys remain stored only in the workspace database and are redacted from DTOs.
- Model discovery responses use a bounded JSON reader and a conservative count/ID-length limit.
- Gemini model IDs are path-encoded instead of concatenated as unchecked path fragments.
- Reference bytes are accepted only through staged tokens or database image IDs.
- xAI/Gemini base64 is constructed only in Rust immediately before the outbound request.
- Reference Data URLs and base64 never enter `parameters_json`, frontend metadata, or logs.
- Remote result downloads keep the existing HTTPS downgrade and redirect limits.
- Provider results remain restricted to PNG, JPEG, and WebP signatures.
- The application remains one process with no listener or external plugin loader.

## Testing Strategy

### State And Database

- Schema-v2 fixture migrates transactionally to v3.
- Existing Providers become OpenAI Compatible without changing secrets or defaults.
- Legacy single-reference paths become position-zero rows exactly once.
- Reopening v3 is idempotent; newer schemas remain rejected.
- Provider models replace transactionally and survive failed refreshes.
- Ordered generation references cascade only with their owning run.

### Adapter Contract

Use mock HTTP servers with exact request assertions for:

- OpenAI request parity for generation and one-reference multipart editing.
- xAI generation, one-reference `image`, multi-reference `images`, ratio, resolution, count, Bearer auth, and URL/base64 responses.
- Gemini endpoint path encoding, API-key header, text/inlineData ordering, response modality, image config, and inlineData extraction.
- 401/403, 429, 5xx, HTML bodies, malformed JSON, empty image results, safety blocks, oversized responses, redirect downgrade, invalid base64, and non-image bytes.
- Connection and discovery requests for all protocols, unique model normalization, recommendations, latency, and cache preservation.

### Reference Lifecycle

- Zero, one, two, and three references preserve order.
- Four references, duplicates, stale tokens, mixed source fields, and unsupported OpenAI multi-reference requests fail before Provider I/O.
- Partial upload staging is discarded on failure.
- Late completion cannot mutate another session or a deleted session.
- Reference bytes and base64 never appear in DTO snapshots or logs.

### Frontend

- Provider protocol normalization, official URL proposal, custom URL preservation, model ordering, and unknown-model labels.
- Independent pending/error/success states for connection testing and model discovery.
- Empty-key edit probes reuse the stored key without exposing it.
- Composer reference append, remove, reorder, limit validation, draft migration, and per-session isolation.
- Capability changes hide unsupported controls and remove stale fields from generation metadata.
- Gemini count is fixed at one; OpenAI/xAI retain one to four.

### Browser And Windows

- Playwright covers complete Provider create/edit/probe/discovery flows and mocked generation for each protocol.
- Playwright covers three-reference upload/result combinations, ordering, errors, prompt handoff, and reconciliation.
- The consolidated source gate runs Node, Playwright, Python/static, Rust, formatting, desktop checks, and diff checks after all protocol tickets are complete.
- The Windows gate builds MSI and single-executable Portable assets, verifies one-process shutdown and media/save behavior, and opens a copied v0.3.0 schema-v2 workspace with v0.4.0.
- Rollback restores the pre-upgrade backup before opening v0.3.0. v0.3.0 must reject schema v3 rather than being tested against a mutated database it cannot understand.

## Delivery Sequence

1. Add schema v3, DTOs, normalized adapter interfaces, and OpenAI parity.
2. Add Provider protocol selection, connection testing, model discovery, and cached model persistence.
3. Add ordered multi-reference state, IPC cleanup, history persistence, and Composer UI while OpenAI remains capped at one reference.
4. Add xAI generation and one-to-three-reference editing.
5. Add Gemini Native generation and one-to-three-reference editing.
6. Update project knowledge, release documentation, schema fixtures, upgrade/restore scripts, and v0.4.0 version metadata.
7. Run the consolidated source gate once all feature tickets pass, then run the Windows v0.4.0 gate without publishing until release is explicitly authorized.

Each sequence item must use focused RED/GREEN tests before advancing. Broad source and Windows gates remain centralized at the end, matching the project's established test cadence.

## Acceptance Criteria

- Existing schema-v2 workspaces migrate to v3 without changing current Provider behavior or secrets.
- Existing OpenAI-compatible Providers continue to generate and edit with their current request contract.
- A user can create or edit xAI and Gemini Providers with an explicit protocol and an editable Base URL.
- Connection testing reports a safe result and latency without saving the draft or creating history.
- Model discovery populates an editable model selector, persists on Save, and preserves old cache on failure.
- A user can attach, order, remove, draft, and submit up to three references.
- xAI and Gemini receive the exact documented reference structure; OpenAI rejects more than one before network I/O.
- Composer controls match Provider capabilities and hidden parameters are absent from requests.
- All successful images pass existing size, redirect, MIME-signature, publication, and media-protocol checks.
- All formal generation failures remain durable and safe; probes do not create runs.
- MSI and Portable remain single-executable, single-process releases and pass v0.3.0-to-v0.4.0 upgrade plus backup-restore rollback verification.
