# powerbi-control-chart
Atlyn Control Chart Power BI custom visual: auditable statistical process monitoring.

## MVP

Atlyn supports Individuals, Run, P, U, and C charts. Bind `Time` and `Value`; bind
`Denominator` for P/U charts and optionally bind `Series`, `BaselineGroup`,
`SubgroupSD`, and `Tooltips`. Invalid rows are omitted with a visible warning; an
all-invalid view is an explicit error state.

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
```

The package has no privileges, network requests, or external runtime assets.
This repository does not claim Microsoft certification or real-host validation.
