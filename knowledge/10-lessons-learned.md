# Lessons Learned

Use this file to feed project experience back into the knowledge base.

## Useful Patterns

- Keep optimistic generation rows keyed by both session ID and submission ID so late responses cannot mutate another task.
- Reconcile against the server run count before clearing a submitted draft; a transport failure may still have produced a durable failed run.

## Mistakes Or Pitfalls

- Catching only upstream API errors can strand a generation run in `running`; every exception after run creation must finish it as `failed` before propagating.

## Prompts That Worked

- TBD

## Prompts To Avoid

- TBD

## Verification Notes

- `tests/test_generation_history.py` covers successful, upstream-failed, unexpected-failed, and reference-image generation history.

## Reusable Snippets Or Commands

```bash
# TBD
```
