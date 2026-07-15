# Project Overview

## Project Name

Image Tools

## One-Sentence Summary

Windows-first local desktop image creation workbench for OpenAI-compatible image providers, persistent creative sessions, reference-driven iteration, and local result history.

## Target Users

- Individual Windows creators who repeatedly generate and refine images.
- Users of OpenAI-compatible image APIs who need configurable Providers and models.
- Users who prefer the restrained Codex Desktop Windows workflow over a form-heavy dashboard.

## Primary User Goals

- Start describing an image immediately without first naming or persisting a session.
- Iterate in one chronological task stream with prompts, status, errors, and results.
- Reuse parameters and generated results as references without leaving the Composer.
- Keep Provider credentials, generation metadata, and image files local.

## Business Or Personal Goal

Provide a focused desktop workflow for sustained image creation without cloud accounts, synchronization, or a hosted application dependency.

## In Scope

- Tauri Windows desktop shell with a FastAPI sidecar.
- Local Provider CRUD, sessions, generation history, references, and image files.
- Codex Desktop Windows-inspired sidebar, task stream, layered Composer, and device-selectable system/light/dark themes.
- Deterministic unit, API, Playwright, packaging, and desktop smoke verification.

## Out Of Scope

- Codex/OpenAI branding or Codex-only features such as Scheduled, Plugins, and Sites.
- Cloud sync, accounts, multi-user access, automatic updates, or system credential storage.
- A standalone asset library, full image editor, masks, or multi-reference composition.
- A browser-first production product.

## Success Criteria

- New tasks persist only on first valid submission and remain usable after local failures.
- Running, successful, and failed runs appear in one stable task stream.
- Behavior and layouts pass manual light/dark and live system-theme regression tests at `1280x860` and `960x640`.
- Theme changes immediately update web content and the native titlebar, while the selected mode persists on the current device.
- Python, Node, Playwright, packaging, and Tauri checks pass.
- Final Windows WebView2 screenshots confirm content/titlebar synchronization and match the approved Windows visual baseline.

## Current Status

The Codex Desktop Windows-style redesign and three-mode Appearance preference are implemented. Linux Chromium and Cargo provide deterministic layout, behavior, and native API evidence; Windows WebView2 content/titlebar synchronization and screenshot capture remain the final platform-specific fidelity gate.
