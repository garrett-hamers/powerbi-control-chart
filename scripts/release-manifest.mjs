import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => {
    process.stderr.write(`${message}\n`);
    process.exit(1);
};

if (!existsSync(dist)) {
    fail("dist is missing; run npm run package first");
}

const pbiviz = readJson(join(root, "pbiviz.json"));
const packageJson = readJson(join(root, "package.json"));
const generated = join(dist, "package.json");
if (!existsSync(generated)) {
    fail("dist/package.json is missing; run npm run package first");
}

const generatedPackage = readJson(generated);
const expectedVersion = pbiviz.visual.version;
const generatedVisual = generatedPackage.visual ?? {};
if (
    generatedVisual.guid !== pbiviz.visual.guid ||
    generatedVisual.name !== pbiviz.visual.name ||
    generatedVisual.version !== expectedVersion ||
    generatedPackage.version !== expectedVersion
) {
    fail("generated package metadata does not match pbiviz.json");
}
if (pbiviz.visual.version !== `${packageJson.version}.0`) {
    fail("pbiviz version does not match package.json");
}

const expectedArtifact = `${pbiviz.visual.guid}.${expectedVersion}.pbiviz`;
const artifacts = readdirSync(dist).filter((file) => file.endsWith(".pbiviz"));
if (artifacts.length !== 1 || artifacts[0] !== expectedArtifact) {
    fail(`expected exactly one current package artifact: ${expectedArtifact}`);
}

const artifactPath = join(dist, expectedArtifact);
const sha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
const sourceCommit = process.env.GITHUB_SHA ??
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const manifest = {
    schemaVersion: 1,
    sourceCommit,
    visual: {
        name: pbiviz.visual.name,
        guid: pbiviz.visual.guid,
        version: pbiviz.visual.version,
        apiVersion: pbiviz.apiVersion
    },
    package: {
        filename: expectedArtifact,
        sha256
    },
    contract: {
        privileges: [],
        externalJS: null
    },
    externalValidation: {
        microsoftCertification: false,
        powerBIHostValidation: false
    }
};

const output = join(dist, "release-manifest.json");
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Release manifest written: ${output}\n`);
