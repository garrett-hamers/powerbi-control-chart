import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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

process.stdout.write("Certification readiness audit passed: no runtime network/unsafe DOM APIs, privileges are empty, localized metadata and release files are present.\n");
