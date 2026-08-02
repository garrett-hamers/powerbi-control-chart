# powerbi-control-chart
Atlyn Control Chart Power BI custom visual: auditable statistical process monitoring.

## MVP

Atlyn supports Individuals, Run, P, U, and C charts. Bind `Time` and `Value`; bind
`Denominator` for P/U charts and optionally bind `Series`, `BaselineGroup`,
and `Tooltips`. Invalid rows are omitted with a visible warning; an
all-invalid view is an explicit error state.

Run mode is a conventional median-centered run chart: it intentionally has no
statistical control limits and evaluates only configured shift and trend rules.
P and U values are plotted as normalized rates (`numerator / denominator` and
`count / exposure`), including varying-denominator control limits and tooltips.
Large categorical results are rendered as partial data while the host provides
additional segments through `fetchMoreData`; the status remains explicit until
the host reports a complete result.

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
npm audit
npm run certification-audit
```

The readiness audit checks the package contract, localized metadata, empty privileges,
and forbidden runtime network/unsafe-DOM APIs. The package has no privileges, network
requests, or external runtime assets.
This repository does not claim Microsoft certification or real-host validation.
