# Desktop API Design

## Authority And Transport

The production call path is:

```text
frontend/app.js
  -> window.ImageToolsDesktopApi.current()
  -> frontend/desktop-api.js
  -> Tauri invoke
  -> Rust commands in src-tauri/src/main.rs and src-tauri/src/workbench/commands.rs
```

There is no production HTTP service of any kind. Browser and Playwright tests inject `__IMAGE_TOOLS_DESKTOP_API_MOCK__`; Node tests inject an `invoke` function into `createDesktopApi`.

## Command Surface

Workbench commands registered by `generate_workbench_handler!`:

| Command | Top-level arguments | Result |
| --- | --- | --- |
| `get_settings` | none | `SettingsDto` |
| `update_settings` | `input` | `SettingsDto` |
| `get_storage_location` | none | `StorageLocationDto` |
| `update_storage_location` | `input` | `StorageLocationDto` |
| `list_providers` | none | `ProviderDto[]` |
| `create_provider` | `input` | `ProviderDto` |
| `get_provider` | `providerId` | `ProviderDto` |
| `update_provider` | `providerId`, `input` | `ProviderDto` |
| `delete_provider` | `providerId` | empty |
| `set_default_provider` | `providerId` | `ProviderDto` |
| `test_provider_connection` | `input` | `ProviderProbeDto` |
| `discover_provider_models` | `input` | `ProviderModelDiscoveryDto` |
| `list_projects` | none | `ProjectDto[]` |
| `create_project` | `input` | `ProjectDto` |
| `update_project` | `projectId`, `input` | `ProjectDto` |
| `delete_project` | `projectId` | empty |
| `list_sessions` | none | `SessionDto[]` |
| `create_session` | `input` | `SessionDto` |
| `get_session` | `sessionId` | `SessionDto` |
| `update_session` | `sessionId`, `input` | `SessionDto` |
| `delete_session` | `sessionId` | empty |
| `set_session_pinned` | `sessionId`, `isPinned` | `SessionDto` |
| `list_session_runs` | `sessionId` | `GenerationRunDto[]` |
| `stage_reference_image` | raw body plus headers | `StagedReferenceDto` |
| `discard_staged_references` | `tokens` | empty |
| `generate_image` | `input` | `GenerateResultDto` |

Shell commands registered in the same combined handler:

| Command | Top-level arguments | Result |
| --- | --- | --- |
| `pick_data_directory` | none | selected path or `null` |
| `save_result_image` | `imageId` | `true` when saved, `false` when canceled |
| `set_app_theme` | `mode` | empty |

Tauri converts top-level Rust snake_case parameter names to camelCase JavaScript arguments. Nested DTOs preserve their serialized snake_case fields. New commands must be added to the combined handler; Tauri has one invoke-handler slot.

## Reference And Generation Contract

Uploaded reference bytes are never placed in JSON or base64 metadata. The adapter invokes:

```javascript
invoke("stage_reference_image", bytes, {
  headers: {
    "x-image-name": encodeURIComponent(name),
    "content-type": type,
  },
});
```

`stage_reference_image` requires a raw invoke body, a valid percent-encoded name, and an accepted PNG, JPEG, or WebP payload up to 25 MiB. It returns a single-use token. Staged files expire after 24 hours.

`generate_image` receives one nested `GenerateInput` with:

```text
session_id, provider_id, prompt, model, width, height, ratio, resolution,
count, quality, output_format, output_compression, background, moderation,
references[]
```

Each ordered `references[]` item contains exactly one `reference_token` or `reference_image_id`; duplicate tokens and IDs are rejected. The compatibility fields `reference_token` and `reference_image_id` still deserialize as one reference for older callers. A persisted image ID is restaged internally; Provider adapters never receive a local media URL. The frontend adapter allowlists metadata fields so raw bytes, base64 data, Data URLs, and arbitrary reference URLs cannot enter generation history.

## Error Contract

Workbench and native-save failures serialize `CommandError`:

```json
{
  "code": "provider.invalid",
  "message": "请检查 Provider 配置。",
  "diagnostic": null
}
```

`code` and `message` are required strings; `diagnostic` is an optional string. `DesktopApiError` accepts only the exact plain-object shape and rebuilds those three fields. JavaScript `Error` instances, strings, extra properties, and malformed objects become the fixed `desktop.invoke_failed` error. Shell theme and picker commands retain their narrow string-error contracts and are handled by their dedicated UI paths.

Provider and settings DTOs never expose the stored secret: `api_key` is always an empty string and `api_key_set` reports whether a key exists. Sending an empty key on update preserves the existing key.

## Media Protocol

Generation and history DTOs expose URLs derived only from the database image ID:

```text
Windows: http://imagetools-media.localhost/image/<id>
Other:   imagetools-media://localhost/image/<id>
```

Only `GET /image/<positive-integer-id>` without a query is accepted. The resolver looks up `images.local_path`, requires a flat `images/<filename>` path, opens it relative to a `cap-std` directory capability, and reads from the same validated handle. Traversal, nested paths, links/reparse escapes, non-files, replacements, unsupported image signatures, and files over 64 MiB are rejected.

Successful responses use byte-derived `image/png`, `image/jpeg`, or `image/webp`, plus `X-Content-Type-Options: nosniff` and `Access-Control-Allow-Origin: *`. The protocol is read-only; saving uses `save_result_image` and a native destination picker.

## Provider Network Boundary

Rust `reqwest` calls only the endpoints defined by the Provider's explicit protocol. OpenAI Compatible uses Images generation/edit, xAI Imagine uses Bearer-authenticated JSON generation/edit, and Gemini Native Image uses `x-goog-api-key` with `generateContent`. Discovery responses are limited to 2 MiB, 256 model IDs, and 200 characters per ID. Generation responses are limited to 192 MiB and each decoded or downloaded result is limited to 64 MiB. Result type and extension derive from the PNG/JPEG/WebP signature rather than response headers or URL suffixes. Adapter errors expose stable safe codes and never include secrets, raw response bodies, or reference Data URLs.
