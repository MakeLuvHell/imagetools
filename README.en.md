# Image Tools

Windows-first desktop workbench for image creation with local sessions, generation history, ordered reference images, and configurable OpenAI Compatible, xAI Imagine, and Gemini Native Image providers.

[Chinese README](README.md) · [User guide](docs/user-guide.md) · [Privacy](docs/privacy.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![Image Tools desktop workbench](tests/ui/codex_windows.spec.js-snapshots/shell-1280x860-dark-chromium-linux.png)

## Scope

Image Tools is a single Tauri/Rust application process. The release contains `Image Tools.exe`; it does not start a local web/API server or include a separate backend process. SQLite metadata and image files remain in a local workspace.

The project does not provide cloud sync, accounts, multi-user hosting, automatic updates, Windows code signing, system credential storage, or a built-in image editor.

## Download and data

Windows x64 releases provide an MSI installer and a Portable ZIP containing only `Image Tools.exe`. Microsoft Edge WebView2 Runtime is required. Release assets are currently unsigned, so Windows may show a SmartScreen prompt. Verify downloaded files against the accompanying `SHA256SUMS` file.

Provider configuration, API keys, prompts, reference images, and generated images are stored locally. When you test a provider, discover models, or generate an image, the relevant API key, prompt, parameters, and selected references are sent directly to the Base URL you configured. Read the [Privacy statement](docs/privacy.md) and your provider's policies before use.

## Development

The repository uses `mise` to pin Node.js, Rust, and Python:

```bash
mise install
mise run install
mise run test
mise run ui-test
python scripts/run_tauri_linux_env.py cargo test --manifest-path src-tauri/Cargo.toml
mise run desktop-check
```

The Windows release workflow builds the MSI and Portable ZIP, validates a single application process and shutdown behavior, verifies upgrade/rollback behavior, then uploads release artifacts with SHA-256 checksums, an SPDX SBOM, and build provenance. Windows release details are documented in [the release guide](docs/releases/github-release.md).

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use the issue templates for bugs, features, and provider compatibility. Security vulnerabilities must be reported privately under [SECURITY.md](SECURITY.md); general support boundaries and self-service checks are in [SUPPORT.md](SUPPORT.md).
