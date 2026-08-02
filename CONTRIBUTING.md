# Contributing

## Development

Use Node.js 20 or newer and run:

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run eslint
npm run package
npm run audit
npm run certification-audit
npm run source-parity-audit
```

Keep the visual GUID stable, preserve `privileges: []`, and include focused
tests for changes to calculations, host interactions, accessibility, or
packaging. Do not claim Microsoft certification or live Power BI host
validation without evidence.

## Pull requests

Explain the behavioral contract and validation commands in the pull request.
Keep changes focused and do not commit generated secrets or customer data.
