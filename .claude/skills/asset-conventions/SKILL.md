---
name: asset-conventions
description: Use when adding, renaming, moving, or organizing any file under audits/ in the maintain-audits repo. Enforces the house folder taxonomy, spaced em-dash naming, social ordering numbers, and sample-report docs/pdf pairing for Maintain Audits assets.
---

# Maintain Audits — asset conventions

Apply these whenever a file lands in or moves within `audits/`.

## Folders (by content type)
- `social-content/` — social posts & carousels (PDF), in posting order.
- `brand-assets/` — reusable brand collateral (letterhead, branded backgrounds).
- `team-photos/` — headshots, named by person.
- `sample-reports/` — client-facing sample reports, split into `docs/` (.docx source) + `pdf/` (export).

## Naming
- Separator is a spaced em dash ` — ` (U+2014), never a hyphen.
- Social content: `NN — Title.pdf` (zero-padded order number).
- Sample reports: `Sample Report N — <Audit Type> (Branded).ext`, kept as a matching docx+pdf pair with an identical base name.
- Team photos: `<Name>.pdf`, no number.
- Strip redundant brand prefixes — no `Maintain Audits — ` inside a filename.

## Identify a file before moving it
- `pdftotext "f.pdf" -` → empty output means image-only (a photo → `team-photos/`, or a branded background → `brand-assets/`).
- Page size (pymupdf `fitz`) is a strong hint: 810×810 = square social post, 1440×810 = 16:9 background/slide.

## After any change
Run `/check-assets` (or `python .claude/hooks/check-audit-naming.py`) to confirm the tree still passes. Keep every sample report as a synced docx+pdf pair.
