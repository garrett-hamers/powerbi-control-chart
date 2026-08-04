# Changelog

## 1.0.1.0

### AppSource / Partner Center submission

- Added the Microsoft-required listing assets: `EULA.md`, three 1366x768 listing
  screenshots under `assets/screenshots/`, a 300x300 `assets/logo-300x300.png`, and
  `docs/partner-center-submission.md` recording every Partner Center field, the
  free-listing decision, and the remaining owner-controlled manual steps.
- Added `samples/AtlynSample.pbip`, an offline PBIP sample report (PBIR report plus
  TMDL semantic model) whose 36 rows live in a DAX calculated table, so it opens with
  no data source, no credential prompt, and no refresh. The built visual is embedded as
  a private custom visual rather than resolved from the AppSource store.
- Corrected the package metadata: `author.email` is now `atlyn.help@gmail.com`
  (`support@atlyn.example` used an RFC 2606 reserved TLD and could never receive mail),
  `supportUrl` points at `https://atlyn.io/contact`, and the description is listing copy.

### Icon correction

- **`assets/icon.png` is now 20x20.** It previously shipped at 300x300, which is the
  Partner Center listing logo size, not the visualization-pane icon size Microsoft
  documents. The 300x300 image now lives separately at `assets/logo-300x300.png`.
- `scripts/certification-audit.mjs` asserted the wrong 300x300 contract on
  `assets/icon.png`; it now enforces 20x20 for the icon and 300x300 for the logo as two
  distinct checks, and `tests/package.test.ts` no longer pins the old expectation.
- Both images and `assets/icon.svg` are emitted from one committed generator,
  `scripts/build-brand-assets.mjs`, which rasterises a single SPC motif in pure Node.
  The audits re-render it and compare decoded pixels, so the assets cannot drift.

### Packaging fix

- `src/visual.ts` now imports `./../style/visual.less`. `pbiviz.json`'s `style` field is
  metadata only: it does not pull the Less file into the webpack module graph, so
  MiniCssExtractPlugin emitted nothing and every published package shipped with no
  `content.css` at all and rendered unstyled inside Power BI. The packaged CSS is now
  7,772 bytes. `scripts/certification-audit.mjs` fails if the entry stops importing the
  stylesheet, and `scripts/audit-submission-assets.mjs` fails if the packaged `content.css`
  is empty, so this cannot silently regress.
- Version raised to `1.0.1.0` because the packaged bytes change; the storefront serves
  version-keyed artifacts and must be re-published.
- Pinned `hono` to `4.12.34` through `overrides` to clear GHSA-8j4g-w8fx-2239, a
  transitive moderate advisory reached through `powerbi-visuals-tools`.

### Enforcement

- New npm scripts `brand-assets`, `sample-report`, `screenshots`, and `submission-audit`,
  with `submission-audit` wired into the existing quality workflow alongside the
  certification, parity, reproducibility, and release-manifest gates.
- New Jest suites `tests/submissionAssets.test.ts` and `tests/sampleReport.test.ts`.

## Unreleased

- Added MR, Xbar, R, S, and NP chart modes with subgroup validation.
- Kept raw numerator/count values distinct from normalized P/U plot values.
- Hardened chronological ordering, segmented data status, tooltip lifecycles,
  keyboard focus, bounded rendering, and accessible alarm summaries.
- Added release-readiness metadata and source/package parity checks.

## 1.0.0

- Initial Atlyn Control Chart release with Individuals, Run, P, U, and C modes.
