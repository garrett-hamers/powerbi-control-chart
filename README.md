# powerbi-control-chart
Atlyn Control Chart Power BI custom visual: auditable statistical process monitoring.

## MVP

Atlyn supports Individuals, Run, MR, Xbar, R, S, P, NP, U, and C charts. Bind
`Time` and `Value`; bind `Denominator` for P/U/NP charts, or for subgroup size in
Xbar/R/S charts, and optionally bind `SubgroupSD`, `Series`, `BaselineGroup`, and
`Tooltips`. Invalid rows, empty times, and non-finite values are omitted with a
visible warning; an all-invalid view is an explicit error state.

Run mode is a conventional median-centered run chart: it intentionally has no
statistical control limits and evaluates only configured shift and trend rules.
P and U values are plotted as normalized rates (`numerator / denominator` and
`count / exposure`), including varying-denominator control limits and tooltips.
The raw numerator/count remains separate from the normalized `plotValue`; control
limits, alarms, specifications, ARIA labels, and alarm-table values use the
normalized plot unit. NP uses a varying-size binomial count chart.
Large categorical results are rendered with a deterministic bounded SVG sample
while the host provides additional segments through `fetchMoreData`; the status
reports both segment completeness and the rendered-point reduction.

Control limits are calculated independently from optional specification limits.
The visual exposes 1/2/3 sigma bands, formula/provenance text, direction semantics,
and deterministic alarms for outside 3 sigma, two-of-three beyond 2 sigma, shifts,
and monotonic trends. Baseline-group changes reset sequences by default; the format
pane can explicitly join sequences across groups.

## Development

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run package
npm run package-reproducibility
npm run audit
npm run certification-audit
npm run source-parity-audit
npm run release-manifest
npm run brand-assets
npm run sample-report
npm run submission-audit
npm run screenshots
```

The readiness audits check the package contract, localized metadata, empty privileges,
source/package identity parity, forbidden runtime network/unsafe-DOM APIs, and the
single current package artifact. Packaging normalizes ZIP entry order, timestamps,
permissions, platform, and compression so two clean runs produce identical bytes;
`package-reproducibility` asserts that those runs are byte-for-byte identical.
`release-manifest.json` records the exact source commit, package filename, and
SHA-256 hash. The package has no privileges, network requests, or external runtime
assets.
This repository does not claim Microsoft certification or real-host validation.

## AppSource submission assets

`docs/partner-center-submission.md` is the submission dossier: every Partner Center
field with its final value, the free-listing decision, and the remaining manual steps.

| Asset | Requirement | File |
| --- | --- | --- |
| Visualization-pane icon | PNG, exactly 20x20 | `assets/icon.png` |
| Partner Center listing logo | PNG, exactly 300x300 | `assets/logo-300x300.png` |
| Listing screenshots | 1-5 PNGs, exactly 1366x768, <= 1024 KB each | `assets/screenshots/` |
| EULA | Required | `EULA.md` |
| Offline sample report | Required, no external connections | `samples/AtlynSample.pbip` |

The icon and the logo are two different Microsoft requirements, not one asset used
twice. Both, plus `assets/icon.svg`, are rendered from a single committed generator
(`npm run brand-assets`, `scripts/build-brand-assets.mjs`) in pure Node, so the audits
can re-render and diff the pixels.

`npm run screenshots` packages the visual, extracts the built bundle and stylesheet out
of the `.pbiviz`, renders it against a mock Power BI host in headless Chrome, and
captures each scene at exactly 1366x768. It never synthesizes an image: with no browser
available it fails and writes nothing.

`npm run sample-report` regenerates `samples/` - a native PBIP project (PBIR report plus
TMDL semantic model) whose data lives in a DAX calculated table, so it opens in Power BI
Desktop with no data source, no credential prompt, and no refresh. The visual is embedded
as a private custom visual rather than resolved from AppSource. Producing the `.pbix`
itself is one manual **File > Save As** in Desktop; see section 4.1 of the dossier.

`npm run submission-audit` re-checks all of the above deterministically and is wired into
CI.
