# Configurable Data Directory

## Goal

Allow desktop users to choose where Image Tools stores durable local data, including session history, generation metadata, generated images, uploaded references, and compatibility settings.

## User-Approved Behavior

- Users select a new data root from Settings.
- They can choose whether to copy existing data into the new location.
- Changing the location takes effect only after an application restart.
- Migration copies data rather than moving it.
- The prior location remains intact after a successful copy so the user has a recovery path.

## Scope

- Show the active data root and a data-location command in the existing Settings/Provider dialog.
- Accept an absolute folder path and validate that it is writable before scheduling the change.
- Let users opt into copying existing data.
- Persist the pending or active selection outside the movable data root.
- On the next desktop startup, copy selected durable data before the workbench opens, then activate the new root.
- Preserve the existing default path when no custom directory is configured.
- Expose storage status through a local backend API for the UI and testing.

## Storage Model

The default desktop data root remains Tauri's `app_data_dir`:

```text
%APPDATA%\com.imagetools.desktop\
```

The movable payload contains:

```text
workbench.sqlite3
images\
uploads\
settings.json
```

The bootstrap configuration is stored separately in Tauri's `app_local_data_dir`:

```text
%LOCALAPPDATA%\com.imagetools.desktop\storage-location.json
```

This stable file is never copied as part of migration. It lets a new backend process resolve the chosen data root before it initializes SQLite.

## Backend Lifecycle

The desktop shell passes two values to the sidecar:

- `IMAGE_TOOLS_DATA_DIR`: the normal Tauri application data root.
- `IMAGE_TOOLS_CONFIG_DIR`: the stable bootstrap configuration directory.

At startup, the backend reads `storage-location.json` from `IMAGE_TOOLS_CONFIG_DIR`.

1. With no file or no active custom path, it uses `IMAGE_TOOLS_DATA_DIR`.
2. With a pending migration, it validates the source and destination, copies the payload into the destination, then marks the destination active.
3. With an active custom path, it validates and uses that directory.
4. If a configured custom directory is unavailable, startup fails with a clear local error instead of silently creating a different history store.

Migration uses SQLite's backup API for `workbench.sqlite3` and regular recursive copies for `images`, `uploads`, and `settings.json`. Existing destination files are not overwritten. A partial copy remains recoverable; the bootstrap configuration remains pending until all steps succeed.

## Settings Flow

The existing Settings action opens the Provider dialog with a dedicated local-storage section. It shows the active path, an editable absolute destination path, a migration checkbox, and an apply command.

Applying a valid change persists a pending selection and shows a restart-required confirmation. It does not switch the running backend. Cancelling leaves the active data root and pending selection unchanged.

The web development entry supports typing a path. Native folder browsing is deferred because the static HTTP frontend does not currently expose a Tauri dialog bridge.

## API

```text
GET  /api/storage-location
POST /api/storage-location
```

The GET response returns the active root, default root, optional pending root, and whether the active root is custom.

The POST payload contains an absolute `data_dir` and `migrate_existing` boolean. It validates the destination, writes the pending bootstrap configuration, and returns `restart_required: true`. It never copies files during the currently running process.

## Error Handling

- Reject relative paths, files, inaccessible locations, and the bootstrap configuration directory itself.
- Reject a destination nested inside the current data root or vice versa.
- Reject non-empty destinations when migration is requested, preventing accidental merges.
- Keep the current active configuration unchanged if validation or pending-configuration writes fail.
- Return Chinese user-facing API errors suitable for the Settings dialog.

## Verification

- Unit-test bootstrap configuration parsing, path validation, pending migration, SQLite backup, recursive copy, and idempotent startup resolution.
- API-test storage status and scheduling validation without changing the active runtime path.
- DOM-test the Settings section and submit behavior.
- Playwright-test error display and restart-required confirmation with mocked storage API responses.
- Run Python, Node, Playwright, Cargo, and desktop development checks.

## Out Of Scope

- Deleting the former directory automatically.
- Cloud sync or multi-device data sharing.
- Changing data roots without restarting the sidecar.
- A native Windows folder-picker bridge in this iteration.
