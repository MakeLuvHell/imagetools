# 0001: Use A Single-Process Rust Desktop Backend

## Context

Image Tools currently packages FastAPI as a PyInstaller one-file sidecar. The
sidecar creates an additional backend process tree, and killing only the process
started by Tauri can leave the PyInstaller worker alive after the desktop window
closes. The product is desktop-first, requires in-place local data compatibility,
and now requires one installed application executable and one application
process.

## Decision

Move SQLite, storage, Provider, session, generation, and media behavior into the
Rust/Tauri application. The release frontend communicates through capability-
scoped Tauri IPC, stored media is exposed through a narrow read-only custom
protocol, and the release does not expose a loopback UI API. Implement Rust in
parallel with the Python behavior, prove parity, then perform one frontend
cutover and remove the Python sidecar.

## Reason

This removes the child-process lifecycle failure at its source, narrows the
desktop trust boundary, and permits a Windows payload containing only
`Image Tools.exe`. Parallel parity work protects existing schema v1/v2 data and
keeps the migration reviewable. A temporary Rust REST layer would reduce the
first frontend change but require two transport migrations, while embedding
CPython would retain the runtime and packaging complexity that this decision is
intended to remove.
