# Latest Message Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the newest generation visible when entering a session or sending a prompt, and remove the redundant result continuation action.

**Architecture:** Keep orchestration in `frontend/app.js` and DOM motion in `frontend/ui.js`. Session entry performs an immediate bottom alignment after history renders; prompt handoff coordinates the existing 250ms clone animation with timeline scrolling so the optimistic target finishes in view. Result rendering retains the reference action and removes the combined continuation action.

**Tech Stack:** Vanilla JavaScript, jsdom with Node test runner, Playwright Chromium.

---

### Task 1: Specify Latest-Record Navigation And Result Actions

**Files:**
- Modify: `tests/frontend_ui.test.js`
- Modify: `tests/ui/codex_windows.spec.js`

- [x] **Step 1: Add failing renderer and motion tests**

Assert that successful result figures contain `设为参考图` but not `基于结果继续`. Extend the prompt handoff test with a scroll container whose `scrollTop` must finish at `scrollHeight - clientHeight`.

- [x] **Step 2: Add failing browser navigation tests**

Create enough historical runs to overflow `.timeline`, enter the session, and assert its scroll position is at the bottom. Submit another prompt and assert the optimistic run becomes visible while `.prompt-handoff` is active and the timeline finishes at the bottom.

- [x] **Step 3: Run focused tests and confirm RED**

Run:

```bash
node --test tests/frontend_ui.test.js
npm run test:ui -- tests/ui/codex_windows.spec.js --grep "latest|Telegram|result action"
```

Expected: failures for the absent follow behavior and the still-present continuation button.

### Task 2: Implement Coordinated Follow Behavior

**Files:**
- Modify: `frontend/ui.js`
- Modify: `frontend/app.js`

- [x] **Step 1: Add a direct latest-record helper**

Export a UI helper that sets a scroll container to `Math.max(0, scrollHeight - clientHeight)`. Call it after `loadTimeline(sessionId)` resolves in `selectExistingSession`.

- [x] **Step 2: Coordinate scrolling with prompt handoff**

Pass `.timeline` into `startPromptHandoff`. During normal motion, advance `scrollTop` from its current position to the latest position over the same 250ms duration and easing window as the clone. On reduced motion, missing geometry, cleanup, or animation failure, leave the timeline at the latest position and reveal the real target.

- [x] **Step 3: Remove the redundant continuation action**

Stop rendering `基于结果继续` in `frontend/ui.js` and remove the unused `onContinue` callback from `frontend/app.js`. Keep `设为参考图` and `复制参数` unchanged.

- [x] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
node --test tests/frontend_ui.test.js
npm run test:ui -- tests/ui/codex_windows.spec.js --grep "latest|Telegram|result action|reduced motion|animation failure"
```

Expected: all selected tests pass.

### Task 3: Preserve The Product Decision

**Files:**
- Modify: `knowledge/02-requirements.md`
- Modify: `knowledge/09-decisions.md`
- Modify: `knowledge/10-lessons-learned.md`
- Modify: `docs/spec/2026-07-10-codex-windows-ui.md`

- [x] **Step 1: Update requirements and the existing UI spec**

Record that entering a session aligns to its latest run, accepted submissions follow their optimistic run, backend reconciliation does not cause a second jump, and result actions no longer include the combined continuation command.

- [x] **Step 2: Record the resolved interaction decision**

Add a dated decision and lesson that timeline follow is tied to explicit navigation/submission, while later reconciliation preserves position.

- [x] **Step 3: Run final focused verification**

Run:

```bash
node --test tests/frontend_ui.test.js
npm run test:ui -- tests/ui/codex_windows.spec.js --grep "latest|Telegram|result action|reduced motion|animation failure|historical result references"
git diff --check
```

Expected: focused suites and diff check pass. Do not run the Windows release gate for this focused change.
