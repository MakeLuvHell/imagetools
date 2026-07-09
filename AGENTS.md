# AGENTS.md

This repository uses an AI-assisted project workflow. For complex features, new projects, architecture changes, non-trivial refactors, or fuzzy non-code artifacts, do not start by writing the final output. First make the work explicit.

## Workflow

1. Grill the idea: clarify users, goals, scope, domain terms, data, edge cases, constraints, and priorities.
2. Create a spec when useful: convert the grilling conversation into `docs/spec/` without clearing context first.
3. Create tickets: split the spec or plan into tracer-bullet tickets with clear blocking edges.
4. Review the plan: check the tickets from product, frontend, backend, data, security, and testing perspectives as relevant.
5. Execute in order: implement one ticket at a time after the ticket breakdown has been reviewed.
6. Verify each ticket: run the narrowest useful test, check, or manual verification before moving on.
7. Preserve learning: update `knowledge/`, `CONTEXT.md`, specs, and ADRs when decisions or lessons are resolved.

## Preferred Skills

If Matt Pocock skills are installed, prefer these entry points over local prompt templates:

- `/grill-me` for general idea and requirement grilling.
- `/grill-with-docs` for existing projects with `CONTEXT.md` and `docs/adr/`.
- `/to-spec` immediately after a grilling session to create a spec from the current conversation.
- `/to-tickets` after a spec or plan is clear to create implementation tickets with dependencies.

If a skill is unavailable, use the fallback prompts in `prompts/`.

## Knowledge First

Before starting implementation, read the relevant files in `knowledge/`, plus `CONTEXT.md` and `docs/adr/` when the work touches domain language or architecture. If a required knowledge file is missing or stale, call that out and suggest the smallest update needed.

Recommended reading order:

1. `knowledge/01-project-overview.md`
2. `knowledge/02-requirements.md`
3. `knowledge/03-tech-stack.md`
4. `knowledge/04-task-list.md`
5. `knowledge/05-review-notes.md`
6. `knowledge/06-api-design.md`
7. `knowledge/07-database-schema.md`
8. `knowledge/08-testing-strategy.md`
9. `knowledge/09-decisions.md`
10. `knowledge/10-lessons-learned.md`

## Prompt Library

Reusable fallback prompts live in `prompts/`. Use them when the matching skill is unavailable or when the project needs a customized version.

## Completion Standard

For each completed task, report:

- What changed
- How it was verified
- Any remaining risk or follow-up
- Which knowledge, context, spec, ticket, or ADR files were updated, if any
