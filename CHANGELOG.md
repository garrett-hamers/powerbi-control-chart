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
  9,448 bytes. `scripts/certification-audit.mjs` fails if the entry stops importing the
  stylesheet, and `scripts/audit-submission-assets.mjs` fails if the packaged `content.css`
  is empty, so this cannot silently regress.

### Small-tile layout, unmasked by the packaging fix

Shipping the stylesheet meant `overflow: hidden` and the flex column applied for the first
time, which exposed a layout defect that had never been visible:

- **The accessible alarm table and the legend were clipped out of existence on small
  tiles.** `.atlyn-summary` was `flex: 0 0 auto` and `.atlyn-chart-shell` had a 90px floor,
  while both the summary chips and the legend wrap onto more and more lines as the tile
  narrows. On a 260x200 tile the stack came to 337px of content inside a 198px clipped root,
  so the legend and the whole alarm table were invisible; on a 180x140 tile the chart itself
  never appeared. Every stacked region can now shrink (`min-height: 0`), and the visual sets
  `is-narrow` / `is-short` classes from the host viewport so the decorative legend is dropped
  first and the summary chips second - the chart and the alarm table always survive.
- **`text-overflow: ellipsis` on the title and status bar did nothing**, because it only
  applies to a single line and neither rule set `white-space: nowrap`. At 180px wide the
  title wrapped to three lines and consumed over half the tile height. Both now ellipsise.

Verified in a real browser against the packaged bundle and packaged CSS at 1366x768,
400x300, 260x200, and the declared 180x140 minimum, in LTR and RTL and in high contrast:
nothing escapes the clipped root at any size. `tests/smallTileLayout.test.ts` covers the
regression, and `scripts/probe-variants.mjs` / `scripts/probe-render.mjs` reproduce the
measurements.
- Version raised to `1.0.1.0` because the packaged bytes change; the storefront serves
  version-keyed artifacts and must be re-published.
- Pinned `hono` to `4.12.34` through `overrides` to clear GHSA-8j4g-w8fx-2239, a
  transitive moderate advisory reached through `powerbi-visuals-tools`.

### Enforcement

- New npm scripts `brand-assets`, `sample-report`, `screenshots`, and `submission-audit`,
  with `submission-audit` wired into the existing quality workflow alongside the
  certification, parity, reproducibility, and release-manifest gates.
- Added `.gitattributes` with a global `* text=auto eol=lf` policy so every tracked text
  file is LF in the index *and* in the working tree. Without it a Windows checkout holds
  CRLF while git stores LF, and any hash or byte comparison over a tracked text file
  differs between a local run and the Linux CI checkout. Binary assets are declared
  explicitly and are untouched; the packaged `.pbiviz` SHA-256 is unchanged.
- New Jest suites `tests/submissionAssets.test.ts`, `tests/sampleReport.test.ts`, and
  `tests/smallTileLayout.test.ts`.
- Added `scripts/probe-render.mjs` and `scripts/probe-variants.mjs`, which load the packaged
  bundle and packaged CSS into the mock-host harness and measure real geometry, focus,
  selection, high contrast, and RTL in a headless browser. They are diagnostic tools, not CI
  gates, since they need a local browser.

## Unreleased

- Added MR, Xbar, R, S, and NP chart modes with subgroup validation.
- Kept raw numerator/count values distinct from normalized P/U plot values.
- Hardened chronological ordering, segmented data status, tooltip lifecycles,
  keyboard focus, bounded rendering, and accessible alarm summaries.
- Added release-readiness metadata and source/package parity checks.

## 1.0.0

- Initial Atlyn Control Chart release with Individuals, Run, P, U, and C modes.
