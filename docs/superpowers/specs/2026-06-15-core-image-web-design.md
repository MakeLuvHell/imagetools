# Core Image Web Design

## Goal

Build a local web tool for image generation with the smallest useful feature set:

- Text-to-image from a prompt.
- Optional reference image upload for image edits.
- Basic generation options: model, size, quality, count.
- API settings stored on the server, not exposed as editable constants in browser code.
- Result preview with download, copy link, and reuse-as-reference actions.

This first version does not include conversations, persistent generation history, an asset center, prompt templates, login, or multi-user features.

## Architecture

Use a small FastAPI backend and a static frontend served by the same process.

- Backend: `FastAPI`, `uvicorn`, `httpx`, `python-multipart`, `pydantic`.
- Frontend: plain `HTML`, `CSS`, and `JavaScript`.
- Runtime URL: `http://127.0.0.1:7860`.

The backend owns all API communication so the API key is not embedded in frontend JavaScript. The frontend sends form data to the backend. The backend calls a compatible OpenAI image API, saves returned images under `data/images`, and returns local file URLs.

## Files

Expected application structure:

```text
backend/
  __init__.py
  main.py
frontend/
  index.html
  styles.css
  app.js
data/
  images/
  uploads/
  settings.json
requirements.txt
README.md
```

`data/` is runtime state and should be ignored by git except for optional placeholder files if needed.

## Backend Design

The backend exposes these routes:

- `GET /`: serve the frontend HTML.
- `GET /static/{path}`: serve static frontend files.
- `GET /files/{path}`: serve generated and uploaded runtime files from `data/`.
- `GET /api/settings`: return current API settings with the key redacted.
- `POST /api/settings`: save API base URL, API key, and default model.
- `POST /api/generate`: accept prompt, options, and optional reference image; return generated image URLs.

Settings are stored in `data/settings.json`:

```json
{
  "base_url": "https://api.example.com",
  "api_key": "sk-...",
  "model": "gpt-image-2"
}
```

The backend normalizes API base URLs by trimming trailing slashes and removing a trailing `/v1`. It calls:

- `POST {base_url}/v1/images/generations` for text-to-image.
- `POST {base_url}/v1/images/edits` when a reference image is uploaded.

The backend accepts image responses that include either `b64_json` or `url`.

## Frontend Design

The page is a single tool surface, not a landing page.

Controls:

- Prompt textarea.
- Reference image picker with a compact preview and clear action.
- Size selector with common ratios.
- Model input/select initialized from settings.
- Quality selector.
- Count selector.
- Generate button with loading state.
- Collapsible or compact API settings panel.

Results:

- Empty state before generation.
- Progress state while generating.
- Error panel with copyable error details.
- Responsive image grid for generated outputs.
- Per-image actions: download, copy link, use as reference.

The visual style should be work-focused and compact: a clean application shell, stable controls, restrained color palette, and no marketing hero.

## Error Handling

Frontend validation:

- Prompt is required.
- API settings must be saved before generation if no API key exists.

Backend validation:

- Reject empty prompts.
- Clamp count to `1..4`.
- Reject missing API base URL or API key.
- Return clear `502` errors for upstream HTTP failures or invalid API responses.

For upstream image URLs, the backend downloads the file and stores a local copy. For base64 responses, it decodes and writes PNG files.

## Testing

Manual verification:

- App starts with `python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860`.
- `GET /api/settings` works before any settings file exists.
- Saving settings creates `data/settings.json`.
- Submitting an empty prompt shows a frontend validation message.
- Backend rejects generation without API settings.
- With a compatible API configured, text-to-image produces local preview URLs.
- With a reference image, the backend uses the edit endpoint.
- Generated images can be downloaded, copied, and reused as reference input.

Automated smoke tests should cover the pure backend helpers where practical:

- base URL normalization.
- settings load/save behavior.
- image response parsing for `b64_json`.

