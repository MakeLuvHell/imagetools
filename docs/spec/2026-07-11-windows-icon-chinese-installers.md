# Windows Icon And Chinese Installer Design

## Goal

Use `frontend/assets/icon.svg` as the source artwork for the Image Tools desktop application and make both Windows installer formats use Simplified Chinese installation prompts.

## Scope

- Generate and commit the Tauri icon set from `frontend/assets/icon.svg`.
- Use the generated Windows icon for the application, NSIS installer, and uninstaller.
- Keep the frontend brand icon synchronized with the generated desktop icon.
- Configure the NSIS installer for Simplified Chinese only, without a language selector.
- Configure the WiX/MSI installer for the `zh-CN` locale.
- Add focused tests for the icon source, generated assets, and Windows locale configuration.
- Update release documentation and project knowledge where the packaging contract changes.

## Packaging Design

The source SVG remains at `frontend/assets/icon.svg`. Tauri's pinned CLI generates the platform-specific files under `src-tauri/icons/`, including the multi-resolution Windows ICO and PNG files. Generated assets are committed so local builds and GitHub Actions consume identical files without requiring an extra conversion step during release builds.

`src-tauri/tauri.conf.json` keeps the common bundle icon list and adds explicit Windows settings:

- NSIS uses the generated ICO for installer and uninstaller icons.
- NSIS declares only `SimpChinese` and does not display a language selector.
- WiX declares `zh-CN`, producing a Simplified Chinese MSI installer.

The existing frontend vendor synchronization continues to copy the generated desktop PNG to `frontend/assets/app-icon.png`, so the native shell and in-app branding use the same artwork.

## Release Handling

The published `v0.2.0` tag remains immutable. The icon and localization change is prepared as version `0.2.1` across the npm, Cargo, and Tauri version sources. A new `v0.2.1` release tag can then be built through the existing Windows release workflow.

## Verification

- Validate `tauri.conf.json` against the installed Tauri CLI configuration schema.
- Assert that NSIS uses `SimpChinese`, WiX uses `zh-CN`, and both NSIS icon fields reference the generated ICO.
- Assert that the source SVG and required generated icon files exist.
- Run the focused packaging tests and existing Node/Python test suites.
- Run the frontend vendor synchronization and confirm the in-app icon matches the generated desktop PNG.
- Leave final installer UI verification to the Windows build: open both the NSIS EXE and MSI and confirm their prompts are Simplified Chinese and their displayed icons use the new artwork.

## Error And Compatibility Considerations

- A malformed SVG or failed icon conversion must stop preparation rather than leave a partially updated icon set.
- The NSIS and WiX locale identifiers intentionally differ because each bundler uses its own naming convention.
- No custom installer template is introduced; standard Tauri translations remain responsible for installer wording.
- Linux bundle behavior and development commands remain unchanged.
