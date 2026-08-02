import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const violations = [];
const pbiviz = readJson(join(root, "pbiviz.json"));
const packageJson = readJson(join(root, "package.json"));
const capabilities = readJson(join(root, "capabilities.json"));

const expectedModes = ["individuals", "run", "mr", "xbar", "r", "s", "p", "np", "u", "c"];
const modeValues = capabilities.objects?.chart?.properties?.mode?.type?.enumeration?.map((item) => item.value) ?? [];
if (JSON.stringify(modeValues) !== JSON.stringify(expectedModes)) {
    violations.push(`capabilities mode enumeration does not match source contract: ${modeValues.join(", ")}`);
}
if (pbiviz.visual.guid !== "atlynControlChartA1B2C3D4E5F6G7H8I9J0") {
    violations.push("pbiviz visual GUID changed");
}
if (pbiviz.visual.version !== `${packageJson.version}.0`) {
    violations.push(`pbiviz version ${pbiviz.visual.version} does not match package version ${packageJson.version}`);
}
if (!Array.isArray(capabilities.privileges) || capabilities.privileges.length !== 0) {
    violations.push("capabilities privileges must remain []");
}
for (const requiredFile of ["LICENSE", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md"]) {
    if (!existsSync(join(root, requiredFile))) {
        violations.push(`missing release file: ${requiredFile}`);
    }
}

const generatedMetadataPath = join(root, "dist", "package.json");
if (!existsSync(generatedMetadataPath)) {
    violations.push("dist/package.json is missing; run npm run package first");
} else {
    const generated = readJson(generatedMetadataPath);
    const visual = generated.visual ?? {};
    if (visual.guid !== pbiviz.visual.guid || visual.name !== pbiviz.visual.name) {
        violations.push("generated package visual identity differs from pbiviz.json");
    }
    if (visual.version !== pbiviz.visual.version || generated.version !== pbiviz.visual.version) {
        violations.push("generated package version differs from pbiviz.json");
    }
}

const artifacts = existsSync(join(root, "dist"))
    ? readdirSync(join(root, "dist")).filter((file) => file.endsWith(".pbiviz"))
    : [];
if (artifacts.length !== 1 || !artifacts[0].includes(pbiviz.visual.guid) || !artifacts[0].includes(pbiviz.visual.version)) {
    violations.push("generated .pbiviz artifact does not match the source visual identity and version");
}

if (violations.length > 0) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exit(1);
}

process.stdout.write("Source/package parity audit passed.\n");
