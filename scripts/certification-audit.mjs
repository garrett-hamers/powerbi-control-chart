import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hasPngSignature, readPngHeader } from "./png-utils.mjs";
import { verifyBrandAssets } from "./build-brand-assets.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src");
const forbidden = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\bdocument\.write\s*\(/,
    /\bwindow\.open\s*\(/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bsendBeacon\s*\(/
];

function filesUnder(directory) {
    if (!existsSync(directory)) {
        return [];
    }
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(path) : [path];
    });
}

const violations = [];
for (const file of filesUnder(sourceRoot).filter((path) => /\.(ts|tsx|js|mjs|cjs)$/.test(path))) {
    const content = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
        if (pattern.test(content)) {
            violations.push(`${relative(root, file)} matches ${pattern}`);
        }
    }
}

const capabilities = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf8"));
const pbiviz = JSON.parse(readFileSync(join(root, "pbiviz.json"), "utf8"));
if (!Array.isArray(capabilities.privileges) || capabilities.privileges.length !== 0) {
    violations.push("capabilities.privileges must remain []");
}
if (pbiviz.externalJS !== null) {
    violations.push("pbiviz.externalJS must remain null");
}
for (const requiredRole of ["Time", "Value", "Denominator", "SubgroupSD", "Series", "BaselineGroup", "Tooltips"]) {
    if (!capabilities.dataRoles.some((role) => role.name === requiredRole)) {
        violations.push(`missing implemented data role: ${requiredRole}`);
    }
}
const expectedModes = ["individuals", "run", "mr", "xbar", "r", "s", "p", "np", "u", "c"];
const advertisedModes = capabilities.objects?.chart?.properties?.mode?.type?.enumeration?.map((item) => item.value) ?? [];
if (JSON.stringify(advertisedModes) !== JSON.stringify(expectedModes)) {
    violations.push("advertised chart modes do not match the implemented source contract");
}
for (const releaseFile of ["LICENSE", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md"]) {
    if (!existsSync(join(root, releaseFile))) {
        violations.push(`missing release metadata: ${releaseFile}`);
    }
}

/**
 * The stylesheet only reaches the package when the webpack entry imports it.
 *
 * `pbiviz.json`'s `style` field is metadata: powerbi-visuals-tools wires
 * MiniCssExtractPlugin + css-loader + less-loader to the module graph rooted at
 * `src/visual.ts`, so a Less file nothing imports is never compiled and the packaged
 * resource has no `content.css` at all - a successful build that renders unstyled.
 *
 * This is the source-level guard. `scripts/audit-submission-assets.mjs` additionally
 * asserts the packaged bytes, but it can only run after `npm run package`; this check is
 * order-independent and fails at the root cause.
 */
const stylePath = pbiviz.style ? join(root, pbiviz.style) : undefined;
if (!stylePath || !existsSync(stylePath)) {
    violations.push(`pbiviz.json style "${pbiviz.style}" does not exist`);
} else {
    const styleBytes = readFileSync(stylePath, "utf8").trim().length;
    if (styleBytes < 100) {
        violations.push(`${pbiviz.style} is only ${styleBytes} characters; the visual would ship unstyled`);
    }
    const entry = join(root, "src", "visual.ts");
    const entrySource = existsSync(entry) ? readFileSync(entry, "utf8") : "";
    const importPattern = /import\s+["'][^"']*style\/visual\.less["']/;
    if (!importPattern.test(entrySource)) {
        violations.push(
            `src/visual.ts does not import ${pbiviz.style}; MiniCssExtractPlugin would emit no CSS `
            + "and the packaged visual would have an empty content.css"
        );
    }
}
const brandDrift = verifyBrandAssets(root);
for (const problem of brandDrift) {
    violations.push(problem);
}

/**
 * The in-product visualization-pane icon and the Partner Center listing logo are two
 * different assets with two different required sizes, and this audit previously enforced
 * the listing size on the in-product icon. They are now checked separately.
 *
 * - assets/icon.png must be 20x20:
 *   https://learn.microsoft.com/en-us/power-bi/developer/visuals/visual-project-structure
 * - assets/logo-300x300.png must be 300x300:
 *   https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store
 */
const imageContracts = [
    { relativePath: "assets/icon.png", size: 20, label: "visualization pane icon" },
    { relativePath: "assets/logo-300x300.png", size: 300, label: "Partner Center listing logo" }
];
for (const contract of imageContracts) {
    const target = join(root, contract.relativePath);
    if (!existsSync(target)) {
        violations.push(`missing ${contract.label}: ${contract.relativePath}`);
        continue;
    }
    const image = readFileSync(target);
    if (!hasPngSignature(image)) {
        violations.push(`${contract.relativePath} is not a valid PNG`);
        continue;
    }
    const { width, height } = readPngHeader(image);
    if (width !== contract.size || height !== contract.size) {
        violations.push(
            `${contract.relativePath} must be ${contract.size}x${contract.size}, found ${width}x${height}`
        );
    }
}
if (pbiviz.assets?.icon !== "assets/icon.png") {
    violations.push(`pbiviz.json assets.icon must be "assets/icon.png", found "${pbiviz.assets?.icon}"`);
}
for (const locale of ["en-US", "es-ES", "fr-FR", "de-DE", "ar-SA"]) {
    const resource = join(root, "stringResources", locale, "resources.resjson");
    if (!existsSync(resource)) {
        violations.push(`missing string resource: ${relative(root, resource)}`);
    } else {
        JSON.parse(readFileSync(resource, "utf8"));
    }
}

if (violations.length > 0) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exit(1);
}

process.stdout.write(
    "Certification readiness audit passed: no runtime network/unsafe DOM APIs, privileges are empty, "
    + "localized metadata, release files, a stylesheet that is actually imported into the bundle, "
    + "a 20x20 visualization-pane icon, and a 300x300 Partner Center listing logo are present.\n"
);
