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

## 0. How values in this document are maintained

Most values here mirror state this document does not own - bytes in a file, a field in
`pbiviz.json`, a commit in the history. Every mirrored value is a place the document can
drift from reality while still reading as authoritative, and five such drifts were found
and fixed one at a time before this convention was written down.

So every recorded value must be one of three kinds, and **new values must declare which**:

| Kind | Maintenance | Example |
| --- | --- | --- |
| **Derived** | Do not trust the printed value; regenerate it. The text says how. | The artifact hash and size in section 4.3 |
| **Enforced** | A gate compares it to reality, so it cannot drift silently. | The brand asset and screenshot byte counts in section 2, checked by `npm run submission-audit` |
| **Recorded** | An observation at a stated time or commit. **Never update it** - re-run and add a new stamped entry alongside. | The geometry table in section 3.1, the cold-install proof in section 4.3 |

The failure this prevents is subtle: a *recorded* value edited to match current reality
looks like tidying and destroys the evidence, while a *derived* or *enforced* value left
stale looks authoritative and is wrong. The two mistakes are opposites, so a reader who
cannot tell the kinds apart will make one of them.

Prefer **enforced** over **derived**, and **derived** over **recorded**, for anything that
describes current state. Reserve **recorded** for evidence about a past event, which is the
only kind that must never be refreshed.

State prohibitions against **the act, not a motive or a circumstance**. "Do not update it
when `main` moves" and "do not rewrite it to buy retention" both forbid one path to the
same damage and leave the others open, and the reader who does the damage will almost
always have arrived by a path nobody enumerated - usually tidiness. Write "never update
it" and give the alternative.

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

The byte counts in the table above are **enforced**: `npm run submission-audit` compares
each one against the committed file, so they cannot drift silently from this document.

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
DevTools Protocol. Measured after the fix, at commit `65adf21`:

| Tile | Header | Chart | Alarm table | Escapes the clipped root |
| --- | --- | --- | --- | --- |
| 1284x619 | 33 | 395 | 124 | none |
| 398x298 | 33 | 155 | 110 | none |
| 258x198 | 33 | 92 | 73 | none |
| 180x140 (declared minimum) | 33 | 55 | 52 | none |

These are recorded observations, not current-state values: they say what the probes
returned at `65adf21`. **Never edit them** - not to match a later run, not to correct an
apparent staleness, not for tidiness. They are still descriptive of the shipping visual
because `65adf21` is the last commit that changed any packaged input - verified by
diffing `src/`, `style/`, `capabilities.json` and `pbiviz.json` against `main`. **If a
later change touches those paths, re-run the probes and add a new stamped row set**, so a
regression stays visible as a difference between two measurements.

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
> treat these as the first confounds to isolate - and note that
> `garrett-hamers/powerbi-distribution-chart` commit **`219d22b4`** preserves a state in
> which the same dangling reference is fixed while these same schema and TMDL divergences
> remain, so opening *that* project separates the two causes. `git checkout 219d22b4`
> reconstructs it at any later date.

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
`1.0.1.0` `.pbiviz` has to replace the `1.0.0.0` one.

**What to do:** run a clean `npm run package && npm run release-manifest`, then take the
filename, SHA-256 and byte size from `dist/release-manifest.json`.

Current values, measured 2026-08-05T08:35Z at `main` `4955c420`:

| Field | Value |
| --- | --- |
| Filename | `atlynControlChartA1B2C3D4E5F6G7H8I9J0.1.0.1.0.pbiviz` |
| SHA-256 | `c046a386d98955de6c3326b040187a87b81b0a68cee173cef2b732f5aadd54b0` |
| Size | 27,974 bytes |

#### How to verify that hash later

Check out the commit and re-package. This is the path to use, and it has no expiry:

```text
git checkout <sourceCommit>
npm ci && npm run package && npm run release-manifest
```

Then compare `dist/release-manifest.json` against the recorded hash and size.

**This has been executed, not just described.** Measured 2026-08-05T08:30Z: a fresh
`git clone` at `3c6a2af3`, `npm ci` against an empty npm cache so every tarball came
from the registry, then `npm run package`, produced `c046a386...` / 27,974 bytes.
The same comparison covers cross-environment determinism - the artifact Actions built
for that commit on `ubuntu-latest` with Node 20 hashes identically against Windows 10
with Node 24.11.1, npm 11.6.2 and zlib 1.3.1.

`3c6a2af3` is the commit this test was actually run at, not a stale reference to the
tip - **never update it**, whatever has happened to `main` and however stale it looks.
Re-pointing it would claim the cold install was run somewhere it wasn't. To make the same
claim about a newer commit, run the test against that commit and record it alongside this
one.

Two limits, because evidence about the axes actually varied is narrower than
determinism in general: it says nothing about future npm registry availability, and
nothing about Node versions other than those two.

**Reading a failure matters.** `npm ci` failing is a registry or integrity problem and
says nothing about the artifact - all 999 lockfile entries carry a `resolved` URL and
an `integrity` hash, so a substituted tarball makes the install refuse rather than
silently producing different bytes. Only a *completed* package whose hash differs is
evidence against the recorded value.

#### Why not to verify by downloading a CI artifact

Actions retains artifacts for 90 days from the run that produced them, so a download
based check expires. Once it has, the check fails with *cannot download* rather than
*wrong bytes* - it cannot verify, which is neither a pass nor a real failure.

Two things about that date are easy to get wrong:

- **It applies to a specific artifact.** The one that matters is produced by the run for
  the recorded `sourceCommit`, not the oldest artifact in the repository. The oldest
  usually belongs to a superseded pull-request head that no record references, so its
  expiry measures the lifetime of something nothing depends on.
- **It is escapable, but not by overwriting `sourceCommit`.** The packaged bytes are
  stable across commits that touch no packaged input, so the run for any later commit
  produces the same artifact and can be downloaded long after the original has aged out.
  Measured 2026-08-05T08:35Z: `ef3ff0f8` expires `2026-11-03T01:02:13Z`, while `main`
  `4955c420` expires `2026-11-03T08:33:40Z` for identical bytes.

`sourceCommit` records **where these bytes came from**. That is a historical fact and it
does not perish, so **never rewrite it** - not to buy retention, not to make a check pass,
not for tidiness. Doing so trades a permanent record for a temporary convenience and
leaves the manifest asserting an origin that is false. `release-manifest.mjs` derives it
from `GITHUB_SHA` or `git rev-parse HEAD` at build time, which is exactly the "commit this
was produced at" role, and it is the same class of value as the measurement SHA guarded in
the section above.

That rule is load-bearing rather than tidy, because **no verification here can detect a
rewritten `sourceCommit`.** The rebuild-and-compare procedure above checks out the commit
the manifest names and confirms it produces the recorded bytes. If the field were repointed
at a later commit that also produces those bytes, the rebuild would succeed and the check
would pass - permanently, and more confidently than before, while the recorded origin was
false. Matching bytes establish *equivalence*, not *origin*, and every check available here
tests the former.

So the integrity of the origin claim rests entirely on the field never being edited. A
verification gate that rebuilds at whatever commit the manifest currently names - which is
the natural way to implement one - cannot supply that guarantee and should not be assumed
to.

If a downloadable witness is wanted after the original expires, record it **alongside**
as a separate note - a later commit whose run produces a byte-identical artifact -
naming both commits and the date the equivalence was checked. Establish that equivalence
by repackaging the newer commit and comparing hashes; without it the note would attest
to bytes nobody compared.

None of this is urgent. The horizon advances with every merge, so it binds only if this
repository goes 90 days with no run on `main` **and** nobody records a witness. Either
condition alone is harmless.


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
