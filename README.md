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
