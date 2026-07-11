# Interaction Motion And Popover Positioning

## Goal

Make Image Tools interactions feel responsive and composed instead of abrupt, fix the image-parameter menu so it opens next to its trigger, and make the Provider form's Cancel command close the Provider dialog.

## User-Approved Direction

- Use restrained Windows-style motion rather than decorative or elastic animation.
- Anchor the image-parameter menu to the left edge of its trigger.
- Prefer opening anchored menus above the trigger, with automatic fallback below.
- Make Provider Cancel close the complete dialog and restore focus to the element that opened it.

## Scope

- Add a reusable anchored-layer position calculation for Composer popovers.
- Apply it to the image-parameter and reference-image menus.
- Recalculate an open anchored layer when the viewport changes.
- Add coordinated entrance and exit motion for menus and dialogs.
- Add restrained transitions for interactive controls, search, Toast, and newly rendered task content.
- Respect `prefers-reduced-motion: reduce` throughout the interface.
- Correct the Provider Cancel event binding.
- Add unit, DOM, and Playwright coverage for positioning, close behavior, focus restoration, viewport bounds, and reduced-motion behavior.

## Positioning Architecture

`frontend/ui.js` owns a pure position calculation and DOM-facing anchored-layer helpers. The position calculation receives an anchor rectangle, a layer size, viewport size, gap, and viewport padding. It returns a `top` and `left` coordinate plus the resolved vertical placement.

The default placement is `top-start`:

1. Align the layer's left edge with the trigger's left edge.
2. Place the layer 8px above the trigger.
3. If it does not fit above and does fit below, place it 8px below the trigger.
4. Clamp the final coordinates to a 12px viewport inset.

The DOM helper measures the trigger and layer after the layer is made measurable, writes explicit fixed-position `top` and `left` values, and clears conflicting `right` and `bottom` values. Parameter and reference menus use the same helper. The task-header menu remains locally positioned because it already has a stable containing block and correct alignment.

While an anchored layer is open, viewport resize causes a new measurement and position update. Opening another layer closes the previous layer before the next one is positioned.

## Motion Architecture

`frontend/ui.js` owns open and close helpers so visibility, accessibility state, animation state, and focus restoration do not diverge across call sites.

- Popovers: 120ms opacity transition, 4px vertical movement, and scale from 0.985 to 1.
- Dialogs: 160ms opacity transition and scale from 0.985 to 1; backdrop opacity changes with the dialog.
- Hover and pressed controls: 100ms color/background response and a restrained pressed state.
- Search, Toast, and newly rendered task content: 140-160ms opacity and short positional transitions where layout remains stable.

Exit animation completes before a menu becomes hidden or a dialog calls `close()`. Close operations are idempotent so repeated Escape, outside clicks, or rapid trigger clicks cannot leave a layer visible with stale `aria-expanded` state.

When `prefers-reduced-motion: reduce` is active, helpers skip timed animation and CSS removes transitions and keyframes. Positioning, focus, and visibility behavior remain unchanged.

## Provider Cancel Behavior

`#providerCancelBtn` is a dialog-level Cancel command. Clicking it closes `#providerDialog`; it does not reset the editor to a new Provider. The separate Add Provider command remains responsible for clearing and starting a new Provider form.

After the close animation, focus returns to the specific opener, whether the dialog was opened from the sidebar Providers row or the Settings icon. Escape and the close icon use the same close path.

## State And Event Flow

1. A menu trigger requests an anchored layer to open.
2. Existing temporary layers close.
3. The target layer becomes measurable, receives clamped coordinates, and enters its opening state.
4. Keyboard focus moves to the first relevant menu control.
5. Escape, outside click, another trigger, or the same trigger requests close.
6. The helper updates accessibility state, runs the exit motion, hides the layer, and restores focus when required.

Dialog opening and closing follow the same lifecycle while preserving the existing native `<dialog>` focus trap.

## Error And Compatibility Handling

- If the Web Animations API is unavailable, visibility changes complete immediately.
- If the available viewport is smaller than the layer, coordinates clamp to the viewport inset and existing responsive widths prevent horizontal overflow.
- Reopening a layer during its close animation cancels stale close completion so it cannot hide the newly opened state.
- No CSS Anchor Positioning dependency is introduced, preserving compatibility with older Windows WebView2 runtimes.
- Playwright visual helpers continue disabling motion before screenshots, keeping baselines deterministic.

## Verification

- Unit-test top placement, bottom fallback, left/right clamping, and narrow viewport behavior.
- DOM-test menu open/close state and Provider Cancel close/focus restoration.
- Playwright-test parameter and reference menu proximity to their triggers at `1280x860` and `960x640`.
- Resize an open menu and assert it remains inside the viewport and anchored to the trigger.
- Verify Provider Cancel closes the dialog and restores the correct opener.
- Verify reduced-motion mode produces no nonzero interaction animation duration.
- Run existing Python, Node, Playwright, and Cargo checks after focused tests pass.

## Out Of Scope

- Spring physics, page transitions, route transitions, or decorative ambient animation.
- Replacing native `<dialog>` with a custom modal implementation.
- Redesigning Composer controls, Provider fields, or task-stream content.
