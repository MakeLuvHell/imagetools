# GPT Image API Frontend Adapter

This document defines how the web UI should map user-facing image generation
controls to the local backend and to OpenAI-compatible GPT Image API requests.
Use it as the contract before expanding the dashboard-style frontend.

Sources of truth:

- OpenAI image generation guide:
  https://developers.openai.com/api/docs/guides/image-generation
- OpenAI API reference / OpenAPI schema:
  https://github.com/openai/openai-openapi/blob/master/openapi.yaml
- Third-party UI reference:
  https://gptimage2-ai.com/zh/dashboard/home

The third-party page is only a UI reference. Parameter names, accepted values,
validation rules, and response handling must come from the OpenAI docs or the
compatible provider's own API documentation.

## Recommended API Surface

For this product's current core version, keep using the Image API instead of
the Responses API.

- `POST /v1/images/generations` for text-to-image.
- `POST /v1/images/edits` for reference-image workflows and mask editing.

The Responses API is better when the product later needs multi-turn image
editing, model-driven tool use, or image generation inside a conversation. It is
not required for the current single-submit generation tool.

## Current Local Backend Contract

### Settings

`GET /api/settings`

Returns public settings. The API key is never returned.

```json
{
  "base_url": "https://api.example.com",
  "api_key": "",
  "api_key_set": true,
  "model": "gpt-image-2"
}
```

`POST /api/settings`

```json
{
  "base_url": "https://api.example.com",
  "api_key": "sk-...",
  "model": "gpt-image-2"
}
```

Rules:

- `base_url` may include `/v1`; the backend normalizes it away.
- Empty `api_key` keeps the previously saved key if one exists.
- Settings are stored server-side in `data/settings.json`.

### Generation

`POST /api/generate`

Content type: `multipart/form-data`

Fields:

| Field | Type | Required | Current meaning |
| --- | --- | --- | --- |
| `prompt` | string | yes | User prompt. |
| `model` | string | no | Overrides saved default model. |
| `width` | integer | no | Output width from frontend ratio/resolution mapping. |
| `height` | integer | no | Output height from frontend ratio/resolution mapping. |
| `quality` | string | no | Upstream render quality. Current values: `auto`, `low`, `medium`, `high`. |
| `count` | integer | no | Number of images for text-to-image. Backend clamps to 1-4. |
| `reference` | file | no | If present, backend uses the edits endpoint. |

Response:

```json
{
  "kind": "text_to_image",
  "model": "gpt-image-2",
  "size": "1024x1024",
  "images": ["/files/images/image_20260615_120000_1_ab12cd.png"]
}
```

`kind` is `text_to_image` without a reference file and `image_to_image` with a
reference file.

## Upstream Image API Mapping

### Text-To-Image

Backend call:

```http
POST {base_url}/v1/images/generations
Content-Type: application/json
Authorization: Bearer <api_key>
```

Payload:

```json
{
  "model": "gpt-image-2",
  "prompt": "A clean product render...",
  "size": "1024x1024",
  "quality": "high",
  "n": 1
}
```

Current backend omits `quality` when it is `auto`.

### Reference Image / Image-To-Image

Backend call:

```http
POST {base_url}/v1/images/edits
Content-Type: multipart/form-data
Authorization: Bearer <api_key>
```

Fields:

| Upstream field | Current source |
| --- | --- |
| `image` | Uploaded `reference` file. |
| `prompt` | Frontend prompt. |
| `model` | Selected model. |
| `size` | Backend builds `WIDTHxHEIGHT`. |
| `quality` | Sent only when not `auto`. |

The official edits endpoint supports multiple input images and masks. The core
version currently sends one reference image and no mask.

## Frontend Field Mapping

Keep the UI language separate from API names. The UI should be understandable
to image creators, while the backend should translate it to API fields.

| UI control | Local form field | Upstream field | Notes |
| --- | --- | --- | --- |
| 提示词 | `prompt` | `prompt` | Required. |
| 模型 | `model` | `model` | Default is saved in settings. |
| 比例 | not sent directly | part of `size` | Aspect ratio only, such as `1:1`, `16:9`. |
| 分辨率/尺寸 | `width`, `height` | `size` | Actual output dimensions. |
| 渲染质量 | `quality` | `quality` | Not resolution. Affects rendering quality, speed, and cost. |
| 张数 | `count` | `n` | Text-to-image only in current backend. |
| 参考图 | `reference` | `image` | Switches backend to `/v1/images/edits`. |

### Ratio

`比例` must only mean canvas shape. It must not include dimensions in the option
label.

Recommended labels:

- `1:1 方图`
- `3:2 横图`
- `2:3 竖图`
- `16:9 宽屏`
- `9:16 竖屏`

### Resolution / Size

`分辨率/尺寸` selects the actual pixel dimensions. For `gpt-image-2`, the
official rules are:

- Maximum edge length is 3840 px.
- Both edges must be multiples of 16 px.
- Long edge to short edge ratio must not exceed 3:1.
- Total pixels must be between 655,360 and 8,294,400.
- Resolutions above 2560x1440 are considered experimental.

Important current gap: the existing frontend maps some widescreen values to
`1820x1024` and `1024x1820`, which are not multiples of 16. Before depending on
those options in production, replace them with valid dimensions such as
`1792x1008`, `1008x1792`, `2048x1152`, and `1152x2048`, or use the official
popular sizes:
`1024x1024`, `1536x1024`, `1024x1536`, `2048x2048`, `2048x1152`,
`3840x2160`, and `2160x3840`.

Recommended core presets:

| Resolution label | 1:1 | 3:2 | 2:3 | 16:9 | 9:16 |
| --- | --- | --- | --- | --- | --- |
| 标准 | `1024x1024` | `1536x1024` | `1024x1536` | `1536x864` | `864x1536` |
| 2K | `2048x2048` | `2048x1360` | `1360x2048` | `2048x1152` | `1152x2048` |
| 4K | optional | optional | optional | `3840x2160` | `2160x3840` |

All custom sizes should pass the same validation before submission.

### Quality

`质量` should be displayed as `渲染质量` to avoid confusion with
`分辨率/尺寸`.

Meaning:

- It maps to upstream `quality`.
- It controls the generation/rendering effort, not the pixel dimensions.
- It can affect detail, latency, and cost.
- For `gpt-image-2`, supported values are `auto`, `low`, `medium`, and `high`.
- `low` is appropriate for quick drafts, thumbnails, and iteration.
- `medium` or `high` is appropriate for final outputs.

Do not describe quality as "1K/2K/4K"; that belongs under size.

## GPT Image Parameters For Future UI

These are useful but should not all be exposed in the first core page.

| Parameter | Endpoint | UI readiness | Notes |
| --- | --- | --- | --- |
| `output_format` | generations, edits | Good next step | `png`, `jpeg`, `webp`. |
| `output_compression` | generations, edits | Advanced | Only useful for `jpeg`/`webp`; 0-100. |
| `background` | generations, edits | Advanced | `auto`, `opaque`, `transparent`; `gpt-image-2` currently does not support transparent background. |
| `moderation` | generations | Advanced/admin | `auto` or `low`; default should remain `auto`. |
| `stream` | generations, edits | Later | Enables partial image updates. |
| `partial_images` | generations, edits | Later | 0-3 partial images; each partial image can add token cost. |
| `mask` | edits | Later | Requires mask upload UX and validation. |
| multiple `image[]` | edits | Later | Enables multi-reference image workflows. |
| `user` | generations, edits | Later/admin | Stable end-user identifier for abuse monitoring. |
| `input_fidelity` | edits | Avoid for GPT Image 2 | For `gpt-image-2`, omit it because image inputs are processed at high fidelity automatically. |

## Response Handling

For GPT image models, OpenAI returns base64 image data. The backend must keep
accepting `b64_json` as the primary response shape.

The current backend also accepts `url` for compatibility with older DALL-E or
OpenAI-compatible providers:

```json
{
  "data": [
    { "b64_json": "..." },
    { "url": "https://..." }
  ]
}
```

Recommended behavior:

- Save upstream images to `data/images/`.
- Return local `/files/...` URLs to the frontend.
- Keep API keys and upstream response internals out of the frontend.
- If the upstream response contains no usable image, show a plain user-facing
  error and keep the raw detail copyable for debugging.

## Error Handling

Current backend wraps upstream failures as `502` with a readable detail string.
That is acceptable for the core version.

Next backend iteration should preserve:

- HTTP status.
- Upstream request ID when present.
- Upstream `error.type` and `error.code`.
- Optional moderation details for logs/support.

Frontend display rules:

- Show concise user-facing error text.
- Keep a "copy error" action for diagnostics.
- Do not expose the saved API key.
- Do not auto-retry user-correctable image errors, especially moderation or
  invalid-size errors.

## UI Direction From The Reference Page

The referenced dashboard is useful for control grouping, not for API truth.

Recommended left-panel structure:

1. Prompt area with clear action and recent-state persistence.
2. Quick presets that set ratio, size, quality, count, and model together.
3. Reference image upload with preview and clear action.
4. Generation controls grouped as:
   - `比例`
   - `分辨率/尺寸`
   - `渲染质量`
   - `张数`
   - `模型`
5. Advanced settings collapsed by default:
   - output format
   - compression
   - background
   - moderation
   - mask / multi-reference later

The result panel should stay focused on generated images, metadata, download,
copy link, and "use as reference" actions.

## Compatibility Notes

Many providers advertise "OpenAI-compatible" image endpoints but differ in
model names, accepted sizes, `quality` values, or response shape.

Adapter rules:

- Always let users configure `base_url` and `model`.
- Keep server-side API key storage.
- Validate dimensions before calling upstream when targeting `gpt-image-2`.
- Treat `b64_json` as primary but support `url` fallback.
- Make optional parameters capability-based. Do not send unsupported fields to
  every provider.
- Keep the frontend terms stable even if model/provider terms differ.

## Next Implementation Checklist

- Replace invalid `1820x1024` and `1024x1820` presets with API-valid multiples
  of 16.
- Add a shared size validator used by preferences, frontend submit, and backend.
- Rename visible `尺寸` label to `分辨率/尺寸`.
- Keep `比例` options free of dimensions.
- Keep `渲染质量` help text visible near the quality selector.
- Add optional `output_format` after the core flow is stable.
- Add multiple references and mask editing only after a clear upload UX exists.
