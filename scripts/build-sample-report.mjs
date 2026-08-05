import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";

/**
 * Builds the offline sample report Power BI Desktop project (PBIP + PBIR + TMDL).
 *
 * Microsoft requires an offline sample report for an AppSource submission, but a `.pbix`
 * cannot be produced headlessly: its `DataModel` part is a binary Analysis Services backup
 * image. This generator emits the fully text-based project instead, which Power BI Desktop
 * opens directly and can then be saved as `.pbix` in one step.
 *
 * Everything here is deterministic: identifiers are derived from SHA-256 of fixed seeds and
 * the data comes from the same module that feeds the listing screenshots, so
 * `npm run submission-audit` can regenerate the project and fail on any drift.
 *
 * Schema URLs below are pinned against https://github.com/microsoft/json-schemas.
 */

export const SAMPLE_SLUG = "AtlynSample";
export const SAMPLE_DISPLAY_NAME = "Atlyn Control Chart Sample";
export const SAMPLE_ROOT = "samples";
export const PAGE_DISPLAY_NAME = "Door-to-doctor control chart";
export const VISUAL_TITLE = "Door-to-doctor time - individuals control chart";

export const SCHEMAS = {
    pbip: "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
    platform: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
    reportDefinition:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
    semanticModelDefinition:
        "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
    versionMetadata:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
    report: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.0.0/schema.json",
    pagesMetadata:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    page: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json",
    visualContainer:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json"
};

const reportFolder = `${SAMPLE_SLUG}.Report`;
const semanticModelFolder = `${SAMPLE_SLUG}.SemanticModel`;

const ensure = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const digest = (seed) => createHash("sha256").update(`atlyn-control-chart-sample::${seed}`).digest("hex");

/** Stable 32-character identifier, matching the shape Power BI uses for page/visual names. */
const stableId = (seed) => digest(seed).slice(0, 32);

/** Stable RFC-4122-shaped identifier for logicalId and lineageTag values. */
const stableGuid = (seed) => {
    const hex = digest(seed);
    const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `4${hex.slice(13, 16)}`,
        `${variant}${hex.slice(18, 20)}`,
        hex.slice(20, 32)
    ].join("-");
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const platform = (type) => json({
    $schema: SCHEMAS.platform,
    metadata: { type, displayName: SAMPLE_DISPLAY_NAME },
    config: { version: "2.0", logicalId: stableGuid(`platform:${type}`) }
});

/**
 * Column and measure projections.
 *
 * `Time` is a Grouping role, so it is projected as a raw `Column`. `Value` is a Measure
 * role, so it is projected the way Power BI Desktop itself writes a numeric column dropped
 * into a measure well: `Sum` over one row per day, which is the observation itself.
 * Every key must match a `dataRoles[].name` in capabilities.json.
 */
const columnProjection = (table, column) => ({
    projections: [{
        field: {
            Column: {
                Expression: { SourceRef: { Entity: table } },
                Property: column
            }
        },
        queryRef: `${table}.${column}`,
        nativeQueryRef: column
    }]
});

const sumProjection = (table, column) => ({
    projections: [{
        field: {
            Aggregation: {
                Expression: {
                    Column: {
                        Expression: { SourceRef: { Entity: table } },
                        Property: column
                    }
                },
                Function: 0
            }
        },
        queryRef: `Sum(${table}.${column})`,
        nativeQueryRef: `Sum of ${column}`
    }]
});

const escapeDax = (value) => String(value).replaceAll('"', '""');

/**
 * A DAX calculated table, not a Power Query partition.
 *
 * An M partition would still be a query that the model refreshes, even with a literal
 * `#table(...)` source. A calculated table has no data source object at all, so there is
 * nothing to prompt for credentials and nothing to refresh - which is what Microsoft's
 * "works offline with no external connections" requirement actually asks for.
 */
const buildDataTable = (rows) => {
    const literals = rows.map((row, index) => {
        const separator = index === rows.length - 1 ? "" : ",";
        return `        {"${escapeDax(row.day)}", ${row.minutes.toFixed(1)}, "${escapeDax(row.phase)}", `
            + `${row.patients}, ${row.breaches}}${separator}`;
    });
    return [
        "DATATABLE(",
        '    "Day", STRING,',
        '    "Minutes", DOUBLE,',
        '    "Phase", STRING,',
        '    "Patients", INTEGER,',
        '    "Breaches", INTEGER,',
        "    {",
        ...literals,
        "    }",
        ")"
    ];
};

const COLUMNS = [
    { name: "Day", dataType: "string", summarizeBy: "none", annotation: "Automatic" },
    { name: "Minutes", dataType: "double", summarizeBy: "sum", annotation: "Automatic", formatString: "0.0" },
    { name: "Phase", dataType: "string", summarizeBy: "none", annotation: "Automatic" },
    { name: "Patients", dataType: "int64", summarizeBy: "sum", annotation: "Automatic", formatString: "0" },
    { name: "Breaches", dataType: "int64", summarizeBy: "sum", annotation: "Automatic", formatString: "0" }
];

const buildTable = (tableName, rows) => {
    const indent = "\t\t\t";
    const columns = COLUMNS.flatMap((column) => [
        `\tcolumn ${column.name}`,
        `\t\tdataType: ${column.dataType}`,
        ...(column.formatString ? [`\t\tformatString: ${column.formatString}`] : []),
        "\t\tisNameInferred",
        `\t\tlineageTag: ${stableGuid(`column:${column.name}`)}`,
        `\t\tsummarizeBy: ${column.summarizeBy}`,
        `\t\tsourceColumn: [${column.name}]`,
        "",
        `\t\tannotation SummarizationSetBy = ${column.annotation}`,
        ""
    ]);
    return [
        "/// Offline sample observations used to demonstrate the visual.",
        `table ${tableName}`,
        `\tlineageTag: ${stableGuid(`table:${tableName}`)}`,
        "",
        ...columns,
        `\tpartition ${tableName} = calculated`,
        "\t\tmode: import",
        "\t\tsource =",
        ...buildDataTable(rows).map((line) => `${indent}${line}`),
        ""
    ].join("\n");
};

/** Reads the two files that make a private custom visual render offline. */
const readPackagedVisual = async (root, guid, version) => {
    const artifactPath = path.join(root, "dist", `${guid}.${version}.pbiviz`);
    if (!existsSync(artifactPath)) {
        return undefined;
    }
    const archive = await JSZip.loadAsync(readFileSync(artifactPath));
    const manifest = archive.file("package.json");
    const resource = archive.file(`resources/${guid}.pbiviz.json`);
    ensure(manifest && resource, `Packaged visual at dist/${guid}.${version}.pbiviz is missing expected entries.`);
    return {
        manifest: await manifest.async("string"),
        resource: await resource.async("string")
    };
};

/**
 * @param {{ root?: string, includeCustomVisual?: boolean }} [options]
 * @returns {Promise<Map<string, string>>} posix repo-relative path -> file contents
 */
export async function buildSampleReportFiles(options = {}) {
    const root = options.root ?? process.cwd();
    const includeCustomVisual = options.includeCustomVisual ?? true;

    const pbiviz = JSON.parse(readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const guid = pbiviz.visual.guid;
    const sampleData = await import(pathToFileURL(
        path.join(root, "tools", "screenshots", "sample-data.mjs")
    ).href);
    const rows = sampleData.buildSampleRows();
    const tableName = sampleData.TABLE_NAME;
    ensure(rows.length > 0, "Sample data module produced no rows.");

    const pageId = stableId("page:control-chart");
    const visualId = stableId("visual:control-chart");
    const files = new Map();
    const add = (relativePath, contents) => files.set(relativePath, contents);

    add(`${SAMPLE_ROOT}/${SAMPLE_SLUG}.pbip`, json({
        $schema: SCHEMAS.pbip,
        version: "1.0",
        artifacts: [{ report: { path: reportFolder } }],
        settings: { enableAutoRecovery: true }
    }));

    add(`${SAMPLE_ROOT}/.gitignore`, ["**/.pbi/localSettings.json", "**/.pbi/cache.abf", ""].join("\n"));

    // Semantic model: TMDL, inline literal data only.
    add(`${SAMPLE_ROOT}/${semanticModelFolder}/.platform`, platform("SemanticModel"));
    add(`${SAMPLE_ROOT}/${semanticModelFolder}/definition.pbism`, json({
        $schema: SCHEMAS.semanticModelDefinition,
        version: "4.2",
        settings: { qnaEnabled: false }
    }));
    add(`${SAMPLE_ROOT}/${semanticModelFolder}/definition/database.tmdl`, [
        "database",
        "\tcompatibilityLevel: 1550",
        ""
    ].join("\n"));
    add(`${SAMPLE_ROOT}/${semanticModelFolder}/definition/model.tmdl`, [
        "model Model",
        "\tculture: en-US",
        "\tdefaultPowerBIDataSourceVersion: powerBI_V3",
        "\tsourceQueryCulture: en-US",
        "",
        `ref table ${tableName}`,
        ""
    ].join("\n"));
    add(`${SAMPLE_ROOT}/${semanticModelFolder}/definition/tables/${tableName}.tmdl`, buildTable(tableName, rows));

    // Report: PBIR.
    add(`${SAMPLE_ROOT}/${reportFolder}/.platform`, platform("Report"));
    add(`${SAMPLE_ROOT}/${reportFolder}/definition.pbir`, json({
        $schema: SCHEMAS.reportDefinition,
        version: "4.0",
        datasetReference: { byPath: { path: `../${semanticModelFolder}` } }
    }));
    add(`${SAMPLE_ROOT}/${reportFolder}/definition/version.json`, json({
        $schema: SCHEMAS.versionMetadata,
        version: "2.0.0"
    }));
    add(`${SAMPLE_ROOT}/${reportFolder}/definition/report.json`, json({
        $schema: SCHEMAS.report,
        themeCollection: {
            baseTheme: { name: "CY24SU10", reportVersionAtImport: "5.55", type: "SharedResources" }
        },
        // A CustomVisual resource package embeds the visual in the report. publicCustomVisuals is
        // deliberately absent: it resolves from the AppSource store, which is not offline.
        resourcePackages: [
            {
                name: guid,
                type: "CustomVisual",
                items: [{
                    name: `${guid}.pbiviz.json`,
                    path: `${guid}.pbiviz.json`,
                    type: "CustomVisualMetadata"
                }]
            },
            {
                name: "SharedResources",
                type: "SharedResources",
                items: [{ name: "CY24SU10", path: "BaseThemes/CY24SU10.json", type: "BaseTheme" }]
            }
        ],
        settings: {
            useStylableVisualContainerHeader: true,
            defaultDrillFilterOtherVisuals: true
        }
    }));
    add(`${SAMPLE_ROOT}/${reportFolder}/definition/pages/pages.json`, json({
        $schema: SCHEMAS.pagesMetadata,
        pageOrder: [pageId],
        activePageName: pageId
    }));
    add(`${SAMPLE_ROOT}/${reportFolder}/definition/pages/${pageId}/page.json`, json({
        $schema: SCHEMAS.page,
        name: pageId,
        displayName: PAGE_DISPLAY_NAME,
        displayOption: "FitToPage",
        height: 720,
        width: 1280
    }));
    add(`${SAMPLE_ROOT}/${reportFolder}/definition/pages/${pageId}/visuals/${visualId}/visual.json`, json({
        $schema: SCHEMAS.visualContainer,
        name: visualId,
        position: { x: 40, y: 40, z: 0, height: 620, width: 1200, tabOrder: 0 },
        visual: {
            visualType: guid,
            query: {
                queryState: {
                    Time: columnProjection(tableName, sampleData.TIME_COLUMN),
                    Value: sumProjection(tableName, sampleData.VALUE_COLUMN)
                }
            },
            // No `objects` block: the visual's own defaults already select the Individuals
            // mode with the centre line, sigma bands, control limits, and the accessible alarm
            // table switched on, so there is nothing to override and nothing to get wrong.
            visualContainerObjects: {
                title: [{ properties: { text: { expr: { Literal: { Value: `'${VISUAL_TITLE}'` } } } } }]
            },
            drillFilterOtherVisuals: true
        }
    }));

    if (includeCustomVisual) {
        const packaged = await readPackagedVisual(root, guid, pbiviz.visual.version);
        if (packaged) {
            add(`${SAMPLE_ROOT}/${reportFolder}/CustomVisuals/${guid}/package.json`, packaged.manifest);
            add(`${SAMPLE_ROOT}/${reportFolder}/CustomVisuals/${guid}/resources/${guid}.pbiviz.json`, packaged.resource);
        }
    }

    add(`${SAMPLE_ROOT}/README.md`, [
        "# Atlyn Control Chart offline sample report",
        "",
        `\`${SAMPLE_SLUG}.pbip\` is the Microsoft-required sample report for the AppSource`,
        "submission. It is a Power BI Desktop project stored in the documented PBIR",
        "(report) and TMDL (semantic model) text formats, emitted directly by",
        "`scripts/build-sample-report.mjs` with no third-party tooling.",
        "",
        `- The semantic model holds all ${rows.length} rows in a **DAX calculated table**`,
        "  (`DATATABLE(...)`). There is no Power Query partition and no data source object,",
        "  so there is nothing to authenticate and nothing to refresh.",
        "- The visual is embedded as a private custom visual under",
        `  \`${reportFolder}/CustomVisuals/\`, so the report renders with no AppSource lookup.`,
        "",
        "Regenerate with `npm run package` then `npm run sample-report`.",
        "`npm run submission-audit` fails if the checked-in project drifts from the generator.",
        "",
        "Producing the `.pbix` is one manual step: open the `.pbip` in Power BI Desktop and",
        "**File > Save As** a `.pbix`. See `docs/partner-center-submission.md` section 4.1.",
        ""
    ].join("\n"));

    return files;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    const root = process.cwd();
    const files = await buildSampleReportFiles({ root });
    const target = path.join(root, SAMPLE_ROOT);
    rmSync(target, { recursive: true, force: true });
    for (const [relativePath, contents] of files) {
        const absolute = path.join(root, relativePath);
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, contents, "utf8");
    }
    const embedded = [...files.keys()].some((key) => key.includes("/CustomVisuals/"));
    process.stdout.write(`Wrote ${files.size} file(s) into ${SAMPLE_ROOT}/\n`);
    if (!embedded) {
        process.stderr.write(
            "! The built visual was not found in dist/, so the report has no embedded custom visual.\n"
            + "  Run `npm run package` first, then re-run this script.\n"
        );
    }
}
