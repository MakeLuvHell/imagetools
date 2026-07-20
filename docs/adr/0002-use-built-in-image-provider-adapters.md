# 0002: Use Built-In Image Provider Adapters

## Context

Image Tools currently treats every Provider as OpenAI Images compatible. xAI Imagine and Gemini Native Image differ in authentication, endpoint paths, request parameters, reference-image encoding, model discovery, capabilities, and response parsing. Inferring behavior from a hostname would be fragile, while runtime plugins would add a new loading and permission boundary to the single-process desktop release.

## Decision

Persist an explicit Provider protocol in schema v3 and select one of three built-in Rust adapters: OpenAI Compatible, xAI Imagine, or Gemini Native Image. Adapters normalize requests and results behind one internal interface; the existing generation service retains history, reference ownership, bounded file handling, and safe error responsibilities. Google Imagen and external plugins are outside the v0.4.0 scope.

## Reason

Explicit built-in adapters make wire behavior reviewable and independently testable without weakening the one-process security boundary. Schema v3 gives protocol choice, discovered models, and ordered multi-reference history durable ownership instead of hiding them in URLs or browser state.

