"""lottie_forge.prompts — system prompt rendering backed by versioned fixtures.

This subpackage owns the **pure** mechanism that turns a versioned
catalogue fixture into a system-prompt string with the catalogue embedded
verbatim and its sha256 logged alongside (MOT-04, D-13, §5.1 #2).

The mechanism has **no LLM dependency** — the agents that consume the
rendered prompt arrive in Phase 6 (RecipePicker). Phase 2 locks down the
template skeleton with its two contractual placeholders
(``{{catalogue_json}}`` / ``{{catalogue_hash}}``) and the pure rendering
function, with assert-by-test that the embedded text equals the bytes
that were hashed and the bytes that were committed.
"""
