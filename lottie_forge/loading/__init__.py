"""lottie_forge.loading -- fixture loaders for committed reference data.

This subpackage owns every loader that turns a committed fixture (YAML or
JSON) into a validated Pydantic model. The D-02 / D-03 hash regime
(raw committed bytes, LF-normalized before hashing, sha256, verifiable
via ``sha256sum`` outside the factory) lives here too -- the helpers
``normalize_lf`` and ``sha256_hex`` form the **single implementation**
of that regime, and the recipe catalogue loader (plan 02-04) reuses it
for ``catalogue_sha256``.

Member modules:

- :mod:`lottie_forge.loading.style` -- the Phase 2 style spec loader
  (fixture ``fixtures/style-specs/example-style/style.yaml`` + sha256).
"""
