# Project Overview

## Project Name

Image Tools

## One-Sentence Summary

Windows-first, single-process desktop image creation workbench for OpenAI-compatible image Providers, persistent creative sessions, reference-driven iteration, and local result history.

## Target Users

- Individual Windows creators who repeatedly generate and refine images.
- Users of OpenAI-compatible image APIs who need configurable Providers and models.
- Users who want a local, restrained desktop workflow instead of a hosted account product.

## Primary User Goals

- Start describing an image immediately without first naming or persisting a session.
- Iterate in one chronological task stream with prompts, status, errors, and results.
- Reuse parameters and generated results as references without leaving the Composer.
- Keep Provider credentials, generation metadata, reference images, and results local.
- Close the application and have the complete `Image Tools.exe` process exit.

## Product Boundary

Image Tools is a Tauri 2 desktop application. Bundled vanilla HTML/CSS/JavaScript calls an in-process Rust backend through Tauri IPC. Rust owns SQLite, storage migration, Provider calls, reference staging, generation history, media serving, and native save dialogs. The release exposes no local UI/API service.

In scope:

- Provider, project, session, pinning, generation, reference, result, theme, and workspace-location workflows.
- One application executable in both the installed application payload and Portable ZIP.
- MSI installation and a stable single-file Portable ZIP for Windows x64.
- Deterministic frontend, Rust, desktop, packaging, and Windows lifecycle verification.

Out of scope:

- Cloud sync, accounts, multi-user access, automatic updates, signing, or system credential storage.
- A standalone asset library, full image editor, masks, or multi-reference composition.
- A browser-first production product or an externally callable local API.

## Success Criteria

- New tasks persist only on first valid submission and remain usable after local failures.
- Running, successful, and failed runs appear in one stable task stream.
- Provider keys never return in desktop DTOs.
- Stored media is accessible only by database image ID and accepted image signatures.
- MSI and Portable assets contain only the intended `Image Tools.exe` application executable.
- Closing installed and Portable builds leaves no Image Tools process and no listener.
- Existing schema-v2 workspaces remain readable across the v0.2.3 to v0.3.0 transition.

## Current Status

RB001-RB013 of the single-process Rust migration are implemented. The source, package configuration, documentation, and v0.3.0 release metadata now describe the final architecture. RB014 remains the Windows x64 gate for real MSI/Portable payload, runtime, shutdown, media protocol, and upgrade/rollback compatibility evidence.
