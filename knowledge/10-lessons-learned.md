# Lessons Learned

Use this file to feed project experience back into the knowledge base.

## Useful Patterns

- Keep optimistic generation rows keyed by both session ID and submission ID so late responses cannot mutate another task.
- Reconcile against the server run count before clearing a submitted draft; a transport failure may still have produced a durable failed run.

## Mistakes Or Pitfalls

- Catching only upstream API errors can strand a generation run in `running`; every exception after run creation must finish it as `failed` before propagating.
- Playwright's downloaded Chromium still needs host NSS/NSPR libraries. On sudo-restricted Linux, download `libnspr4` and `libnss3` into a user-space sysroot and launch tests with its `LD_LIBRARY_PATH`.

## Prompts That Worked

- TBD

## Prompts To Avoid

- TBD

## Verification Notes

- `tests/test_generation_history.py` covers successful, upstream-failed, unexpected-failed, and reference-image generation history.
- Playwright uses isolated API mocks, rejects external origins, waits for fonts, and verifies light/dark layouts at `1280x860` and `960x640`.

## Reusable Snippets Or Commands

```bash
# TBD
```
