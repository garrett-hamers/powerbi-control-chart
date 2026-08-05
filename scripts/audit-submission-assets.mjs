import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { hasPngSignature, readPngHeader } from "./png-utils.mjs";
import { verifyBrandAssets } from "./build-brand-assets.mjs";
import { SAMPLE_SLUG, buildSampleReportFiles } from "./build-sample-report.mjs";

/**
 * Deterministic gate for the Microsoft AppSource / Partner Center submission assets.
 *
 * Every rule here maps to a published Partner Center requirement for Power BI visuals:
 * https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store
 *
 * The one requirement this script cannot enforce is the sample .pbix report, which only
 * Power BI Desktop can author. Its status is reported explicitly instead of being faked.
 */

const LOGO_SIZE = 300;
const ICON_SIZE = 20;
const SCREENSHOT_WIDTH = 1366;
const SCREENSHOT_HEIGHT = 768;
const MAX_SCREENSHOT_BYTES = 1024 * 1024;
const MIN_SCREENSHOTS = 1;
const MAX_SCREENSHOTS = 5;
const FROZEN_GUID = "atlynControlChartA1B2C3D4E5F6G7H8I9J0";
const PRIVACY_POLICY_URL = "https://atlyn.io/legal/privacy";
const TERMS_URL = "https://atlyn.io/legal/terms";
const SUPPORT_URL = "https://atlyn.io/contact";
const AUTHOR_EMAIL = "atlyn.help@gmail.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOUR_PART_VERSION = /^\d+\.\d+\.\d+\.\d+$/;
const EXTERNAL_SOURCE_TOKENS = [
    "Sql.Database",
    "Web.Contents",
    "File.Contents",
    "Csv.Document",
    "Excel.Workbook",
    "OData.Feed",
    "Folder.Files",
    "SharePoint",
    "Odbc."
];
const EXTERNAL_URL_PATTERN = /\bhttps?:\/\//;

const root = process.cwd();
const relative = (target) => path.relative(root, target).replaceAll("\\", "/");

const failures = [];
const checks = [];

const check = async (label, assertion) => {
    try {
        const detail = await assertion();
        checks.push(`  PASS  ${label}${detail ? ` - ${detail}` : ""}`);
    } catch (error) {
        failures.push(`${label}: ${error.message}`);
        checks.push(`  FAIL  ${label} - ${error.message}`);
    }
};

const ensure = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const readJson = (target) => JSON.parse(readFileSync(target, "utf8"));

const requireNonEmptyFile = (target, minimumBytes = 1) => {
    const stats = statSync(target);
    ensure(stats.isFile(), `${relative(target)} is not a file.`);
    ensure(stats.size >= minimumBytes, `${relative(target)} is only ${stats.size} bytes.`);
    return stats.size;
};

const pbiviz = readJson(path.join(root, "pbiviz.json"));
const visual = pbiviz.visual ?? {};
const author = pbiviz.author ?? {};

await check("pbiviz.json declares a visual name", () => {
    ensure(typeof visual.name === "string" && visual.name.trim().length > 0, "visual.name is missing.");
    return visual.name;
});

await check("pbiviz.json declares a display name", () => {
    ensure(
        typeof visual.displayName === "string" && visual.displayName.trim().length > 0,
        "visual.displayName is missing."
    );
    return visual.displayName;
});

await check("pbiviz.json keeps the published GUID frozen", () => {
    ensure(
        visual.guid === FROZEN_GUID,
        `visual.guid is "${visual.guid}" but the storefront release manifest records "${FROZEN_GUID}".`
    );
    return visual.guid;
});

await check("pbiviz.json uses a four-part version", () => {
    ensure(
        FOUR_PART_VERSION.test(String(visual.version)),
        `visual.version "${visual.version}" is not in x.x.x.x form.`
    );
    const packageJson = readJson(path.join(root, "package.json"));
    ensure(
        visual.version === `${packageJson.version}.0`,
        `visual.version "${visual.version}" does not match package.json version "${packageJson.version}".`
    );
    return visual.version;
});

await check("pbiviz.json carries a listing description", () => {
    const description = typeof visual.description === "string" ? visual.description.trim() : "";
    ensure(description.length >= 40, "visual.description must be a full sentence of at least 40 characters.");
    ensure(description.length <= 500, `visual.description is ${description.length} characters; keep it under 500.`);
    return `${description.length} characters`;
});

await check("pbiviz.json points supportUrl at the published support page", () => {
    ensure(typeof visual.supportUrl === "string", "visual.supportUrl is missing.");
    ensure(
        visual.supportUrl.startsWith("https://"),
        `visual.supportUrl "${visual.supportUrl}" must start with https://.`
    );
    ensure(
        visual.supportUrl === SUPPORT_URL,
        `visual.supportUrl is "${visual.supportUrl}" but the documented support page is "${SUPPORT_URL}".`
    );
    return visual.supportUrl;
});

await check("pbiviz.json names the author", () => {
    ensure(typeof author.name === "string" && author.name.trim().length > 0, "author.name is missing.");
    return author.name;
});

await check("pbiviz.json carries a reachable author email", () => {
    ensure(
        typeof author.email === "string" && EMAIL_PATTERN.test(author.email),
        `author.email "${author.email}" is not a valid address.`
    );
    // .example, .invalid, .test and .localhost are reserved by RFC 2606 and can never receive mail.
    ensure(
        !/\.(example|invalid|test|localhost)$/i.test(author.email),
        `author.email "${author.email}" uses an RFC 2606 reserved TLD and can never receive mail.`
    );
    ensure(
        !author.email.endsWith("users.noreply.github.com"),
        "author.email must be a monitored mailbox, not a GitHub noreply address."
    );
    ensure(
        author.email === AUTHOR_EMAIL,
        `author.email is "${author.email}" but the documented submission mailbox is "${AUTHOR_EMAIL}".`
    );
    return author.email;
});

await check("privacy policy URL is https", () => {
    ensure(PRIVACY_POLICY_URL.startsWith("https://"), "The privacy policy URL must start with https://.");
    const dossier = readFileSync(path.join(root, "docs", "partner-center-submission.md"), "utf8");
    ensure(dossier.includes(PRIVACY_POLICY_URL), "The submission dossier does not record the privacy policy URL.");
    return PRIVACY_POLICY_URL;
});

await check(`visual icon is a ${ICON_SIZE}x${ICON_SIZE} PNG`, () => {
    // Microsoft documents the visualization-pane icon as "a PNG file with dimensions 20 pixels
    // by 20 pixels". powerbi-visuals-tools does not enforce it, so it is enforced here. This is
    // a different asset from the 300x300 Partner Center listing logo checked below.
    ensure(
        pbiviz.assets?.icon === "assets/icon.png",
        `pbiviz.json assets.icon is "${pbiviz.assets?.icon}"; it must be "assets/icon.png".`
    );
    const iconPath = path.join(root, "assets", "icon.png");
    const bytes = requireNonEmptyFile(iconPath, 64);
    const buffer = readFileSync(iconPath);
    ensure(hasPngSignature(buffer), `${relative(iconPath)} is not a PNG.`);
    const header = readPngHeader(buffer);
    ensure(
        header.width === ICON_SIZE && header.height === ICON_SIZE,
        `${relative(iconPath)} is ${header.width}x${header.height}, expected ${ICON_SIZE}x${ICON_SIZE}.`
    );
    return `${header.width}x${header.height}, ${bytes} bytes`;
});

await check(`Partner Center logo is a ${LOGO_SIZE}x${LOGO_SIZE} PNG`, () => {
    const logoPath = path.join(root, "assets", "logo-300x300.png");
    const bytes = requireNonEmptyFile(logoPath, 512);
    const buffer = readFileSync(logoPath);
    ensure(hasPngSignature(buffer), `${relative(logoPath)} is not a PNG.`);
    const header = readPngHeader(buffer);
    ensure(
        header.width === LOGO_SIZE && header.height === LOGO_SIZE,
        `${relative(logoPath)} is ${header.width}x${header.height}, expected ${LOGO_SIZE}x${LOGO_SIZE}.`
    );
    return `${header.width}x${header.height}, ${bytes} bytes`;
});

await check("brand assets match their deterministic generator", () => {
    const problems = verifyBrandAssets(root);
    ensure(problems.length === 0, problems.join(" "));
    return "assets/icon.svg, assets/icon.png, assets/logo-300x300.png";
});

await check(
    `listing screenshots are ${MIN_SCREENSHOTS}-${MAX_SCREENSHOTS} PNGs at exactly `
    + `${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}`,
    () => {
        const screenshotDirectory = path.join(root, "assets", "screenshots");
        const entries = readdirSync(screenshotDirectory, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .sort();
        const pngs = entries.filter((name) => name.toLowerCase().endsWith(".png"));
        ensure(
            pngs.length === entries.length,
            "assets/screenshots must contain PNG files only; found "
            + `${entries.filter((name) => !pngs.includes(name)).join(", ")}.`
        );
        ensure(
            pngs.length >= MIN_SCREENSHOTS && pngs.length <= MAX_SCREENSHOTS,
            `AppSource accepts ${MIN_SCREENSHOTS}-${MAX_SCREENSHOTS} screenshots; found ${pngs.length}.`
        );

        pngs.forEach((name) => {
            const screenshotPath = path.join(screenshotDirectory, name);
            const buffer = readFileSync(screenshotPath);
            ensure(hasPngSignature(buffer), `${relative(screenshotPath)} is not a PNG.`);
            const header = readPngHeader(buffer);
            ensure(
                header.width === SCREENSHOT_WIDTH && header.height === SCREENSHOT_HEIGHT,
                `${relative(screenshotPath)} is ${header.width}x${header.height}, `
                + `expected ${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}.`
            );
            ensure(
                buffer.length <= MAX_SCREENSHOT_BYTES,
                `${relative(screenshotPath)} is ${buffer.length} bytes, over the ${MAX_SCREENSHOT_BYTES} byte limit.`
            );
        });

        return `${pngs.length} screenshots: ${pngs.join(", ")}`;
    }
);

await check("every committed screenshot corresponds to a declared scene", async () => {
    const { SCENE_IDS } = await import(
        new URL("../tools/screenshots/scenes.mjs", import.meta.url).href
    );
    const committed = readdirSync(path.join(root, "assets", "screenshots"))
        .filter((name) => name.toLowerCase().endsWith(".png"))
        .map((name) => name.replace(/\.png$/i, ""))
        .sort();
    ensure(
        JSON.stringify(committed) === JSON.stringify([...SCENE_IDS].sort()),
        `assets/screenshots holds ${committed.join(", ")} but the harness declares ${SCENE_IDS.join(", ")}.`
    );
    return `${committed.length} scenes`;
});

await check("EULA is present", () => {
    const eulaPath = path.join(root, "EULA.md");
    const bytes = requireNonEmptyFile(eulaPath, 512);
    const contents = readFileSync(eulaPath, "utf8");
    ensure(contents.includes(PRIVACY_POLICY_URL), "EULA.md must link the privacy policy.");
    ensure(contents.includes(SUPPORT_URL), "EULA.md must link the support page.");
    ensure(contents.includes(TERMS_URL), "EULA.md must link the terms of service.");
    return `${bytes} bytes`;
});

await check("submission dossier is present", () => {
    const dossierPath = path.join(root, "docs", "partner-center-submission.md");
    const bytes = requireNonEmptyFile(dossierPath, 512);
    const contents = readFileSync(dossierPath, "utf8");
    [
        FROZEN_GUID,
        SUPPORT_URL,
        PRIVACY_POLICY_URL,
        TERMS_URL,
        AUTHOR_EMAIL,
        "EULA.md",
        "assets/icon.png",
        "assets/logo-300x300.png",
        // The owner-confirmed licensing decision must stay recorded.
        "AppSource listing: Free",
        `samples/${SAMPLE_SLUG}.pbip`
    ].forEach((token) => {
        ensure(contents.includes(token), `docs/partner-center-submission.md is missing "${token}".`);
    });
    return `${bytes} bytes`;
});

await check("offline sample report project matches its deterministic generator", async () => {
    const normalize = (text) => text.replaceAll("\r\n", "\n");
    const expected = await buildSampleReportFiles({ root });
    ensure(expected.size > 0, "Sample report generator produced no files.");

    const packageBuilt = [...expected.keys()].some((key) => key.includes("/CustomVisuals/"));
    const committed = new Map();
    const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(absolute);
            } else if (entry.isFile()) {
                committed.set(relative(absolute), readFileSync(absolute, "utf8"));
            }
        }
    };
    ensure(
        existsSync(path.join(root, "samples")),
        "samples/ is missing; run `npm run package` then `npm run sample-report`."
    );
    walk(path.join(root, "samples"));

    // Without a built package the generator cannot emit the embedded visual, so compare only
    // the files it was able to produce and flag the gap separately.
    const comparable = packageBuilt
        ? [...committed.keys()]
        : [...committed.keys()].filter((key) => !key.includes("/CustomVisuals/"));

    const missing = [...expected.keys()].filter((key) => !committed.has(key));
    ensure(missing.length === 0, `samples/ is missing generated file(s): ${missing.join(", ")}`);

    const unexpected = comparable.filter((key) => !expected.has(key));
    ensure(unexpected.length === 0, `samples/ contains unexpected file(s): ${unexpected.join(", ")}`);

    const drifted = comparable.filter((key) => normalize(committed.get(key)) !== normalize(expected.get(key)));
    ensure(
        drifted.length === 0,
        `samples/ is stale; re-run \`npm run package && npm run sample-report\`. Drifted: ${drifted.join(", ")}`
    );

    const embeddedNote = packageBuilt
        ? "embedded visual verified against dist/"
        : "embedded visual NOT verified (dist/ has no package)";
    return `${comparable.length} of ${committed.size} files compared, ${embeddedNote}`;
});

await check("sample report binds the frozen GUID with declared roles and no external source", () => {
    const capabilities = readJson(path.join(root, "capabilities.json"));
    const roleNames = new Set(capabilities.dataRoles.map((role) => role.name));
    const pagesRoot = path.join(root, "samples", `${SAMPLE_SLUG}.Report`, "definition", "pages");
    const pageIds = readdirSync(pagesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    ensure(pageIds.length === 1, `Expected exactly one report page, found ${pageIds.length}.`);

    const visualsRoot = path.join(pagesRoot, pageIds[0], "visuals");
    const visualIds = readdirSync(visualsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    ensure(visualIds.length === 1, `Expected exactly one visual, found ${visualIds.length}.`);

    const sampleVisual = readJson(path.join(visualsRoot, visualIds[0], "visual.json"));
    ensure(
        sampleVisual.visual.visualType === FROZEN_GUID,
        `Sample report binds "${sampleVisual.visual.visualType}" instead of the frozen GUID.`
    );

    const stateKeys = Object.keys(sampleVisual.visual.query.queryState);
    stateKeys.forEach((key) => ensure(
        roleNames.has(key),
        `queryState key "${key}" is not a capabilities.json data role.`
    ));
    // capabilities.json requires exactly one Time and one Value field.
    ["Time", "Value"].forEach((role) => ensure(
        stateKeys.includes(role),
        `Sample report does not bind the required "${role}" role.`
    ));

    const report = readJson(path.join(root, "samples", `${SAMPLE_SLUG}.Report`, "definition", "report.json"));
    ensure(
        report.publicCustomVisuals === undefined,
        "report.json uses publicCustomVisuals, which resolves from AppSource and is not offline."
    );
    ensure(
        report.resourcePackages?.some((entry) => entry.type === "CustomVisual" && entry.name === FROZEN_GUID),
        "report.json is missing the CustomVisual resource package that embeds the visual."
    );

    const tmdlRoot = path.join(root, "samples", `${SAMPLE_SLUG}.SemanticModel`, "definition");
    const tmdl = readFileSync(path.join(tmdlRoot, "tables", "Observations.tmdl"), "utf8");
    EXTERNAL_SOURCE_TOKENS.forEach((token) => ensure(
        !tmdl.includes(token),
        `Sample report semantic model references an external data source (${token}).`
    ));
    ensure(
        !EXTERNAL_URL_PATTERN.test(tmdl),
        "Sample report semantic model contains a URL, so it is not fully offline."
    );
    ensure(
        tmdl.includes("= calculated") && tmdl.includes("DATATABLE("),
        "Sample report semantic model is not a DAX calculated table."
    );

    const everyTmdl = [
        path.join(tmdlRoot, "database.tmdl"),
        path.join(tmdlRoot, "model.tmdl"),
        path.join(tmdlRoot, "tables", "Observations.tmdl")
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    ensure(
        !/^\s*partition .+ = m$/m.test(everyTmdl),
        "Sample report semantic model still has a Power Query partition, which is a refreshable data source."
    );
    ensure(
        !/^\s*expression /m.test(everyTmdl) && !/^\s*dataSource /m.test(everyTmdl),
        "Sample report semantic model declares a shared expression or data source."
    );

    return `${stateKeys.join(", ")} bound to ${FROZEN_GUID}`;
});

const artifactName = `${visual.guid}.${visual.version}.pbiviz`;
const artifactPath = path.join(root, "dist", artifactName);
await check("packaged visual ships its compiled stylesheet and a PNG icon payload", async () => {
    ensure(existsSync(artifactPath), `dist/${artifactName} is missing; run \`npm run package\` first.`);
    const archive = await JSZip.loadAsync(readFileSync(artifactPath));
    const resource = archive.file(`resources/${visual.guid}.pbiviz.json`);
    ensure(resource, `Packaged visual is missing resources/${visual.guid}.pbiviz.json.`);
    const packaged = JSON.parse(await resource.async("string"));
    ensure(
        typeof packaged.content?.js === "string" && packaged.content.js.length > 0,
        "Packaged visual contains no JavaScript bundle."
    );
    // MiniCssExtractPlugin only emits the stylesheet when src/visual.ts imports the Less entry
    // point. Without it the visual ships unstyled, which is not obvious from a successful build.
    ensure(
        typeof packaged.content?.css === "string" && packaged.content.css.length > 0,
        "Packaged visual has no content.css: src/visual.ts must import \"./../style/visual.less\"."
    );
    ensure(
        String(packaged.content?.iconBase64 ?? "").startsWith("data:image/png;base64,"),
        "Packaged iconBase64 is not a PNG data URI, so the manifest's assets.icon claim is false."
    );
    ensure(
        packaged.visual?.version === visual.version && packaged.visual?.guid === FROZEN_GUID,
        "Packaged visual identity does not match pbiviz.json."
    );
    return `${packaged.content.js.length} bytes JS, ${packaged.content.css.length} bytes CSS`;
});

await check("sample report has no dangling internal references", () => {
    /*
     * Schema validation is not enough here, and that is exactly how this shipped broken.
     * Every file under samples/ validated against its declared $schema while
     * report.json declared a SharedResources package pointing at BaseThemes/CY24SU10.json,
     * a file the project does not contain. The schema constrains shape, not existence, so
     * Desktop failed to open the project with "Issues were found" and fell back to an empty
     * report. This check resolves every declared reference against the files on disk.
     */
    const sampleRoot = path.join(root, "samples");
    const reportRoot = path.join(sampleRoot, `${SAMPLE_SLUG}.Report`);
    const dangling = [];
    const resolved = [];

    const pbip = readJson(path.join(sampleRoot, `${SAMPLE_SLUG}.pbip`));
    for (const artifact of pbip.artifacts ?? []) {
        const target = path.join(sampleRoot, artifact.report.path);
        (existsSync(target) ? resolved : dangling).push(`.pbip artifact "${artifact.report.path}"`);
    }

    const pbir = readJson(path.join(reportRoot, "definition.pbir"));
    const datasetPath = pbir.datasetReference?.byPath?.path;
    (datasetPath && existsSync(path.join(reportRoot, datasetPath)) ? resolved : dangling)
        .push(`.pbir datasetReference "${datasetPath}"`);

    const report = readJson(path.join(reportRoot, "definition", "report.json"));
    for (const pkg of report.resourcePackages ?? []) {
        for (const item of pkg.items ?? []) {
            // A CustomVisual package resolves under CustomVisuals/<name>/resources/.
            const candidates = pkg.type === "CustomVisual"
                ? [path.join(reportRoot, "CustomVisuals", pkg.name, "resources", item.path)]
                : [
                    path.join(reportRoot, "StaticResources", pkg.name, item.path),
                    path.join(reportRoot, "StaticResources", item.path),
                    path.join(reportRoot, pkg.name, item.path),
                    path.join(reportRoot, item.path)
                ];
            const label = `resourcePackage "${pkg.name}" (${pkg.type}) item "${item.path}"`;
            (candidates.some((candidate) => existsSync(candidate)) ? resolved : dangling).push(label);
        }
    }

    const pagesRoot = path.join(reportRoot, "definition", "pages");
    const pages = readJson(path.join(pagesRoot, "pages.json"));
    const pageDirectories = readdirSync(pagesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    for (const id of pages.pageOrder ?? []) {
        (pageDirectories.includes(id) ? resolved : dangling).push(`pages.json pageOrder "${id}"`);
    }
    (pageDirectories.includes(pages.activePageName) ? resolved : dangling)
        .push(`pages.json activePageName "${pages.activePageName}"`);
    for (const directory of pageDirectories) {
        const page = readJson(path.join(pagesRoot, directory, "page.json"));
        (page.name === directory ? resolved : dangling).push(`page.json name "${page.name}"`);
        const visualsRoot = path.join(pagesRoot, directory, "visuals");
        for (const entry of readdirSync(visualsRoot, { withFileTypes: true }).filter((e) => e.isDirectory())) {
            const contained = readJson(path.join(visualsRoot, entry.name, "visual.json"));
            (contained.name === entry.name ? resolved : dangling).push(`visual.json name "${contained.name}"`);
        }
    }

    const modelRoot = path.join(sampleRoot, `${SAMPLE_SLUG}.SemanticModel`, "definition");
    const modelText = readFileSync(path.join(modelRoot, "model.tmdl"), "utf8");
    for (const file of readdirSync(path.join(modelRoot, "tables"))) {
        const table = file.replace(/\.tmdl$/, "");
        (new RegExp(`^ref table ${table}$`, "m").test(modelText) ? resolved : dangling)
            .push(`model.tmdl "ref table ${table}"`);
    }

    ensure(dangling.length === 0, `dangling reference(s): ${dangling.join("; ")}`);
    return `${resolved.length} references resolve`;
});

await check("sample report embeds the current build of the visual", async () => {
    // A stale embedded copy renders an old visual from a project that looks correct.
    const archive = await JSZip.loadAsync(readFileSync(artifactPath));
    const embeddedRoot = path.join(root, "samples", `${SAMPLE_SLUG}.Report`, "CustomVisuals", visual.guid);
    const pairs = [
        [`resources/${visual.guid}.pbiviz.json`, path.join(embeddedRoot, "resources", `${visual.guid}.pbiviz.json`)],
        ["package.json", path.join(embeddedRoot, "package.json")]
    ];
    for (const [entryName, committed] of pairs) {
        const entry = archive.file(entryName);
        ensure(entry, `dist artifact is missing ${entryName}`);
        ensure(existsSync(committed), `sample is missing ${relative(committed)}`);
        const fromDist = await entry.async("string");
        const fromSample = readFileSync(committed, "utf8");
        ensure(
            fromDist === fromSample,
            `${relative(committed)} differs from dist/${artifactName}; re-run \`npm run sample-report\`.`
        );
    }
    return `${pairs.length} embedded file(s) byte-identical to dist/`;
});

const sampleReportPbix = path.join(root, "samples", `${SAMPLE_SLUG}.pbix`);
const sampleReportStatus = existsSync(sampleReportPbix)
    ? `present (samples/${SAMPLE_SLUG}.pbix)`
    : "MISSING";

process.stdout.write("Atlyn Control Chart - AppSource submission asset audit\n");
process.stdout.write(`${checks.join("\n")}\n\n`);
process.stdout.write(`  INFO  Sample .pbix report: ${sampleReportStatus}\n`);
if (sampleReportStatus === "MISSING") {
    process.stdout.write(
        `        The offline project is committed at samples/${SAMPLE_SLUG}.pbip and is validated above.\n`
        + "        A .pbix cannot be produced headlessly - its DataModel part is a binary Analysis\n"
        + "        Services backup image. Open the PBIP in Power BI Desktop once and Save As .pbix;\n"
        + "        see docs/partner-center-submission.md section 4.1.\n"
    );
}

if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} submission asset check(s) failed:\n`);
    failures.forEach((failure) => process.stderr.write(`  - ${failure}\n`));
    process.exit(1);
}

process.stdout.write(`\nAll ${checks.length} submission asset checks passed.\n`);
