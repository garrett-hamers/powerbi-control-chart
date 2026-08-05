# Atlyn Control Chart - Partner Center submission dossier

This document is the single source of truth for the Microsoft AppSource /
Partner Center listing of the **Atlyn Control Chart** Power BI custom visual.
Every field below records the concrete final value that ships from this
repository.

Microsoft's published requirements for Power BI visual submissions are documented at
<https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store>.

Nothing in this document asserts that the visual has been certified, validated, or
accepted by Microsoft. It records what this repository provides and what the owner
still has to do by hand.

## 1. Package metadata (`pbiviz.json`)

| Partner Center field | Value | Source |
| --- | --- | --- |
| Visual name | `atlynControlChart` | `pbiviz.json` -> `visual.name` |
| Display name | `Atlyn Control Chart` | `pbiviz.json` -> `visual.displayName` |
| GUID (**frozen**) | `atlynControlChartA1B2C3D4E5F6G7H8I9J0` | `pbiviz.json` -> `visual.guid` |
| Version (four-part) | `1.0.1.0` | `pbiviz.json` -> `visual.version` |
| API version | `5.11.1` | `pbiviz.json` -> `apiVersion` |
| Description | "Know when your process actually changed. Atlyn Control Chart plots Individuals, Run, MR, Xbar, R, S, P, NP, U, and C charts with auditable control limits, Nelson-style rule detection, rebaselining, specification limits, and an accessible alarm table - computed entirely offline inside the Power BI sandbox with transparent row-count diagnostics." | `pbiviz.json` -> `visual.description` |
| Support URL | <https://atlyn.io/contact> | `pbiviz.json` -> `visual.supportUrl` |
| Author name | `Atlyn` | `pbiviz.json` -> `author.name` |
| Author email | `atlyn.help@gmail.com` | `pbiviz.json` -> `author.email` |

> **Do not change the GUID.** It is already recorded in the storefront release
> manifest and in published download paths. `scripts/audit-submission-assets.mjs`,
> `scripts/source-parity-audit.mjs`, and `tests/package.test.ts` all pin it.

The previous `author.email` was `support@atlyn.example`. `.example` is reserved by
RFC 2606 and can never receive mail, so it would have failed submission. The
submission audit now rejects any `.example`, `.invalid`, `.test`, or `.localhost`
address, and any GitHub noreply address.

### Package artifact

| Field | Value |
| --- | --- |
| Artifact filename | `atlynControlChartA1B2C3D4E5F6G7H8I9J0.1.0.1.0.pbiviz` |
| Build command | `npm run package` |
| Reproducibility gate | `npm run package-reproducibility` (packages twice, requires identical filename, byte count, and SHA-256) |
| Release manifest | `npm run release-manifest` -> `dist/release-manifest.json` |

Upload the exact `.pbiviz` recorded in `dist/release-manifest.json`. Do not
regenerate it between recording the manifest and uploading.

The version was raised from `1.0.0.0` to `1.0.1.0` because the packaged bytes
change in this release: the visualization-pane icon is now a real 20x20 PNG, and
the compiled stylesheet is now embedded in the package (see section 3). The Atlyn
storefront serves version-keyed artifacts, so it must be re-published with the new
filename and hash.

## 2. Listing assets

| Partner Center field | Requirement | Value in this repository |
| --- | --- | --- |
| Visual icon (in the package) | PNG, exactly 20x20 | `assets/icon.png`, referenced by `pbiviz.json` -> `assets.icon` |
| Logo | PNG, exactly 300x300 | `assets/logo-300x300.png` |
| Screenshots | 1-5 PNGs, exactly 1366x768, each <= 1024 KB | `assets/screenshots/` (3 files, see below) |
| Support URL | https:// | <https://atlyn.io/contact> |
| Privacy policy URL | https:// | <https://atlyn.io/legal/privacy> |
| Terms of use | - | <https://atlyn.io/legal/terms> |
| EULA | A file, or Microsoft's standard contract | `EULA.md` |
| Sample report | `.pbix`, fully offline | Offline project committed at `samples/AtlynSample.pbip`; one manual Desktop **Save As** produces the `.pbix` - see section 4.1 |

### The icon and the logo are two different assets

Microsoft's [visual project structure](https://learn.microsoft.com/en-us/power-bi/developer/visuals/visual-project-structure)
page states the icon "must be a **PNG** file with dimensions 20 pixels by 20
pixels". That is the icon shown in the Power BI visualizations pane. It is
**not** the 300x300 Partner Center listing logo, which is documented separately on
the [publish to Partner Center](https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store)
page.

Before this release this repository shipped a single 300x300 PNG as
`assets/icon.png`, and `scripts/certification-audit.mjs` actively asserted that
wrong size. There was no listing logo at all. Both are now correct and both are
checked separately:

| File | Size | Purpose | Bytes |
| --- | --- | --- | --- |
| `assets/icon.svg` | 64x64 viewBox | Editable vector source | 922 |
| `assets/icon.png` | 20x20 | Visualization-pane icon, embedded in the `.pbiviz` | 272 |
| `assets/logo-300x300.png` | 300x300 | Partner Center listing logo | 3,436 |

All three are emitted by one committed generator, `scripts/build-brand-assets.mjs`
(`npm run brand-assets`), which rasterises a single analytic scene - a centre line
between two control limits, a short run of points, and one point above the upper
control limit - in pure Node with no browser and no npm dependency. The output is
bit-identical on every platform, so `npm run certification-audit` and
`npm run submission-audit` re-render the scene and compare decoded RGBA pixels
against the committed files, failing on any drift.

`powerbi-visuals-tools` does not check the icon: it base64-encodes whatever
`assets.icon` points at and hard-codes `assets: { icon: "assets/icon.png" }` into
the packaged manifest regardless of the source extension. The submission audit
therefore also asserts that the packaged `content.iconBase64` really is a
`data:image/png;base64,...` payload.

### Licensing and pricing - FREE listing (owner-confirmed)

**AppSource listing: Free.**

The visual is published to AppSource as a **free, non-transactable offer**. Do not
configure a paid offer, a price, a trial, or any Partner Center transactability
option.

Monetization happens **only** through the Atlyn storefront subscription at
<https://atlyn.io>, billed through Stripe. That subscription is a separate
commercial relationship between Atlyn and the customer. It is not sold, metered,
enforced, or licensed through Microsoft.

In other words: **AppSource licensing is separate from the Atlyn Stripe
subscription.** The AppSource offer grants the visual itself under `EULA.md` at no
charge; the Atlyn subscription covers the wider Atlyn product and is out of scope
for Partner Center. Nothing in the packaged visual performs a license check, calls
a licensing service, or gates functionality - `capabilities.json` declares no
privileges and the visual makes no network calls at all.

### Screenshots

All three are real renders of the *packaged* visual driven through a mock Power BI
host over the offline sample dataset. They are produced by `npm run screenshots`
(`scripts/capture-screenshots.mjs` + `tools/screenshots/`), which packages the
visual, extracts the bundled JavaScript **and CSS** from the `.pbiviz`, serves the
harness on loopback, and captures each scene over the Chrome DevTools Protocol at
exactly 1366x768. The capture fails loudly if no browser is available, if a scene
renders no points or no centre line, or if a scene that is supposed to show a
signal does not.

| File | Dimensions | Bytes | Shows |
| --- | --- | --- | --- |
| `assets/screenshots/01-individuals-control-limits.png` | 1366x768 | 76,857 | Individuals chart over 36 subgroups: centre line, one and two sigma bands, three-sigma control limits, 9 flagged points, and the printed limit formula |
| `assets/screenshots/02-rule-violations-and-alarm-table.png` | 1366x768 | 91,966 | The same data with a specification limit and the accessible alarm summary table listing each rule, value, limit, and explanation |
| `assets/screenshots/03-attribute-chart-variable-limits.png` | 1366x768 | 89,122 | A P chart over the same days, where the per-subgroup denominator makes the control limits step instead of running flat |

Byte counts are re-verified on every run of `npm run submission-audit`; the
committed sizes above are informational.

### Suggested listing copy

- **Category:** Data visualization / Analytics
- **Industries:** Healthcare, Manufacturing, Financial services, Government
- **Short pitch:** Auditable statistical process control for Power BI - Individuals,
  Run, MR, Xbar, R, S, P, NP, U, and C charts with explainable rule detection and
  an accessible alarm summary.
- **Key differentiator:** Every limit is reproducible and the formula used is printed
  under the chart. Every rule violation is repeated as text with the value, the limit
  it crossed, and a plain-language explanation, so the chart is usable by a screen
  reader and auditable by a reviewer.

## 3. Compliance statements

| Topic | Statement |
| --- | --- |
| Privileges | `capabilities.json` declares `"privileges": []`. |
| Network access | None. `scripts/certification-audit.mjs` and `tests/forbidden-request.test.ts` assert the source contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `eval`, or `new Function`. |
| Unsafe DOM APIs | None. The same audit rejects `innerHTML`, `outerHTML`, `document.write`, `window.open`, `localStorage`, `sessionStorage`, and `sendBeacon`. |
| External assets | None. `pbiviz.json` sets `externalJS: null`. |
| Packaged stylesheet | Present, 9,448 bytes of compiled CSS in `content.css`. `src/visual.ts` imports `./../style/visual.less` so MiniCssExtractPlugin emits it. Before this release that import was missing and the visual shipped **unstyled**: `pbiviz.json`'s `style` field is metadata only and does not pull the Less file into the webpack module graph. `npm run certification-audit` now fails if the entry stops importing it, and `npm run submission-audit` fails if the packaged `content.css` is empty. |
| Small-tile layout | Verified in a real browser at 1366x768, 400x300, 260x200, and the declared 180x140 minimum, in both LTR and RTL and in high contrast. Nothing escapes the visual's clipped root at any of them. See section 3.1. |
| Localization | `stringResources/` ships `en-US`, `ar-SA`, `de-DE`, `es-ES`, and `fr-FR`, key-aligned by test. |
| Accessibility | Keyboard focus and arrow-key point navigation, high-contrast palette support, reduced motion, RTL, ARIA labels per point, and an accessible alarm summary table. |
| Certification status | **Not claimed.** This repository has not been certified or validated by Microsoft. |

### 3.1 Rendered verification of the stylesheet

The stylesheet had never been exercised in a real render before this release, because it
was never packaged. Turning it on is not a no-op: `overflow: hidden` and the flex column
started applying for the first time, which exposed a layout defect at small tile sizes.

`scripts/probe-variants.mjs` and `scripts/probe-render.mjs` load the **packaged** bundle and
its **packaged** CSS into the mock-host harness and measure real geometry over the Chrome
DevTools Protocol. Measured after the fix:

| Tile | Header | Chart | Alarm table | Escapes the clipped root |
| --- | --- | --- | --- | --- |
| 1284x619 | 33 | 395 | 124 | none |
| 398x298 | 33 | 155 | 110 | none |
| 258x198 | 33 | 92 | 73 | none |
| 180x140 (declared minimum) | 33 | 55 | 52 | none |

Before the fix, the 258x198 tile clipped the legend and the **entire accessible alarm
table** out of view, and the 180x140 tile clipped the chart itself. See the CHANGELOG entry
for the root cause.

Also verified in the browser with the stylesheet applied:

- **High contrast** - the host palette is applied inline (`--atlyn-ink: #ffffff`,
  `--atlyn-surface: #000000`), points render as white stroke on black fill, and the
  `.high-contrast` class rules remain as the fallback for a host that reports the flag
  without a palette.
- **RTL** (`ar-SA`) - the root flips to `dir="rtl"` and nothing escapes, in both normal and
  high-contrast palettes.
- **Focus** - focusing a point gives a real 2px outline, does not scroll the clipped root,
  and stays inside the visual's bounds. Arrow-key navigation moves focus between points.
- **The clipped alarm rows are reachable** - `Tab` to a row below the fold scrolls the
  `overflow: auto` alarm panel (not the `overflow: hidden` root) and brings the row fully
  into view with a 3px focus outline.
- **Selection** - a real click applies `.is-selected` and the stylesheet's selected stroke.
- **Reduced motion** - the class zeroes `transition-duration` and `animation-duration`.

There is no `:host` rule in the stylesheet and no screen-reader-only class, so neither the
shadow-root scoping trap nor the "hidden text becomes visible" trap applies here.

## 4. Remaining manual, owner-controlled steps
These cannot be automated from this repository.

### 4.1 Save the offline sample report as `.pbix` (required by Microsoft)

Microsoft requires a sample report that works fully offline with no external
connections. This repository ships that report as a complete Power BI Desktop
**project** at `samples/AtlynSample.pbip`, generated deterministically by
`npm run sample-report` and validated by `npm run submission-audit` and the Jest
suite. It uses only the native, publicly documented PBIP folder format - no
third-party tooling is involved, and in particular nothing here depends on
`pbi-tools`, whose `compile` command throws `MissingMethodException` against
current Power BI Desktop packaging APIs.

A `.pbix` cannot be produced headlessly: its `DataModel` part is a binary Analysis
Services backup image. So the project is committed in the documented text formats
and the owner performs one manual save.

What is already in the project:

- **Report** in the documented PBIR format
  (`AtlynSample.Report/definition/**.json`), with the visual bound to
  `visualType: atlynControlChartA1B2C3D4E5F6G7H8I9J0`, `Day` projected into the
  `Time` grouping role as a raw column, and `Minutes` projected into the `Value`
  measure role as `Sum` - one row per day, so the sum is the observation itself.
  Both keys match a `dataRoles[].name` in `capabilities.json`.
- **Semantic model** in TMDL
  (`AtlynSample.SemanticModel/definition/**.tmdl`) holding all 36 rows in a
  **DAX calculated table** (`partition Observations = calculated` with a
  `DATATABLE(...)` source). A calculated table has no data source object at all -
  no Power Query partition, no shared expression, no `dataSources.tmdl` - so there
  is nothing to authenticate against and nothing to refresh.
- **The visual embedded as a private custom visual** under
  `AtlynSample.Report/CustomVisuals/`, declared through a `CustomVisual` entry in
  `resourcePackages`. `publicCustomVisuals` is deliberately not used, because it
  resolves the visual from the AppSource store and would make the report
  non-offline.
- No `objects` block on the visual: the visual's own defaults already select the
  Individuals mode with the centre line, sigma bands, control limits, and the
  accessible alarm table switched on.

The data is the same emergency-department door-to-doctor scenario used by the
listing screenshots, and it contains a genuine special cause: a spike beyond the
upper control limit on 2026-06-01 followed by a sustained upward drift, which
raises four signals (outside three sigma, two of three beyond two sigma, an
eight-point shift, and a six-point trend).

Steps:

1. In Power BI Desktop, go to **File > Options and settings > Options > Preview
   features** and enable **Power BI Project (.pbip) save option**, **Store reports
   using enhanced metadata format (PBIR)**, and **Store semantic model using TMDL
   format**.
2. Run `npm run package` and then `npm run sample-report` so the embedded visual
   matches the exact build you are submitting. (Both are already committed; re-run
   them only after a version bump.)
3. Open `samples/AtlynSample.pbip`.
4. Confirm the visual renders, the status line reports 36 rows, and the alarm
   summary lists 4 signals.
5. **File > Save As** and choose **Power BI files (\*.pbix)**. Save as
   `samples/AtlynSample.pbix` and commit it. `npm run submission-audit` will then
   report the sample report as present.

> **Verification status.** The project is generated against Microsoft's published
> PBIP, PBIR, and TMDL schemas and is checked structurally by
> `tests/sampleReport.test.ts` and `npm run submission-audit`.
>
> **It was opened in Power BI Desktop 2.150.2102.0 and it failed.** Desktop showed an
> `Issues were found` dialog, fell back to an `Untitled - Power BI Desktop` window title,
> and rendered an empty `Add data to your report` surface. The dialog body could not be
> read, because that surface is a web view that does not expose text to UI Automation.
>
> The cause found and fixed was a **dangling resource reference**: `report.json` declared
> a `SharedResources` resource package pointing at `BaseThemes/CY24SU10.json`, a file this
> project does not contain. `CY24SU10` is a base theme built into Desktop, so
> `themeCollection` may name it, but a `resourcePackages` entry claims it ships as a file
> inside the report. That is provably a defect, it is provably gone, and
> `npm run submission-audit` now resolves every declared reference against the files on
> disk so it cannot recur.
>
> **The project has not been re-opened in Desktop since the fix.** What can be claimed is
> that it is now structurally equivalent to a sibling project that is confirmed to open,
> not that it opens. Step 3 above is therefore still the real-world verification step, and
> it may still fail for a reason the unreadable dialog body would have named.

> **Changes made by alignment rather than by proof.** Alongside the dangling reference,
> the report/page/pagesMetadata schema versions and two TMDL details (the DAX block
> indented four tabs rather than three, and no explicit `dataType` on calculated-table
> columns) were changed to match the sibling project that opens. **These are unproven.**
> They are departures from the only configuration observed to load, which justifies
> aligning them; it does not establish that any of them was causal. If Step 3 still fails,
> treat these as the first confounds to isolate - and note that a sibling repository
> preserved a commit in which the dangling reference is fixed while these remain
> divergent, which would separate the two causes if it is ever opened.

> **Format versions.** `definition.pbir` uses `"version": "4.0"` and
> `definition.pbism` uses `"version": "4.2"` on purpose. Microsoft documents
> `"version": "1.0"` as selecting the *legacy* formats - PBIR-Legacy `report.json`
> for reports and TMSL `model.bim` for semantic models - which this project does
> not use. `4.0` or above is required for the `definition/` folder layout.

### 4.2 Partner Center account and listing

1. Confirm the Partner Center publisher account, publisher display name, and the
   tax and payout profile are complete.
2. Create the Power BI visual offer and upload the exact `.pbiviz` recorded in
   `dist/release-manifest.json`.
3. **Leave the offer FREE.** Do not set a price, a trial, or any transactability
   option - see the licensing subsection in section 2. Monetization is handled
   entirely by the Atlyn Stripe subscription at <https://atlyn.io> and is outside
   Partner Center.
4. Upload `assets/logo-300x300.png` as the logo and the three files in
   `assets/screenshots/` as the listing screenshots.
5. Paste the support URL <https://atlyn.io/contact> and the privacy policy URL
   <https://atlyn.io/legal/privacy>.
6. Attach `EULA.md` as the EULA, or select Microsoft's standard contract.
7. Upload the sample `.pbix` saved in section 4.1.
8. Submit for review.

### 4.3 Re-publish the storefront artifact

The Atlyn storefront serves version-keyed downloads, so after this release the
`1.0.1.0` `.pbiviz` has to replace the `1.0.0.0` one. Take the filename, SHA-256,
and byte size from `dist/release-manifest.json` after a clean
`npm run package && npm run release-manifest`.

### 4.4 Pre-submission link check

Re-confirm immediately before submitting that all three URLs return HTTP 200:

- <https://atlyn.io/legal/privacy>
- <https://atlyn.io/legal/terms>
- <https://atlyn.io/contact>

`https://atlyn.io/privacy`, `https://atlyn.io/support`, and `https://atlyn.io/terms`
return 404 and must not be used.

## 5. Verification commands

```text
npm ci
npm test                      # includes the submission asset and sample report assertions
npm run typecheck
npm run lint
npm run eslint
npm run audit
npm run certification-audit
npm run brand-assets          # re-renders assets/icon.svg, icon.png (20x20), logo-300x300.png
npm run package
npm run package-reproducibility
npm run sample-report         # regenerates samples/ from the built .pbiviz
npm run submission-audit      # deterministic AppSource asset gate
npm run source-parity-audit
npm run release-manifest
npm run screenshots           # re-captures assets/screenshots from the built visual
node scripts/probe-render.mjs    # measures overflow, focus, and selection with the packaged CSS
node scripts/probe-variants.mjs  # measures high contrast, RTL, and small-tile layout
```

`npm run screenshots` and the two probes need a locally installed Chrome, Edge, or
Chromium (or `CHROME_PATH` pointing at one) and Node 22 or newer. They are intentionally
not part of CI; CI validates the committed PNGs and the layout contract in
`tests/smallTileLayout.test.ts` instead.

`npm run sample-report` needs `npm run package` to have run first, because it
embeds the built `.pbiviz` into the project. `npm run submission-audit` regenerates
the project in memory and fails if `samples/` has drifted.
