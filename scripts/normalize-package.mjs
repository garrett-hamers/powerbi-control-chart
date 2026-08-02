import { createHash } from "node:crypto";
import { readFile, rm, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const pbiviz = JSON.parse(await readFile(join(root, "pbiviz.json"), "utf8"));
const expectedArtifact = `${pbiviz.visual.guid}.${pbiviz.visual.version}.pbiviz`;
const artifact = join(dist, expectedArtifact);
const temporary = join(dist, `.${expectedArtifact}.${process.pid}.tmp`);
const fixedDate = new Date("1980-01-01T00:00:00.000Z");
const fixedCompression = {
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
    date: fixedDate,
    createFolders: false,
    unixPermissions: 0o100644,
    dosPermissions: 0
};

const source = await readFile(artifact);
const input = await JSZip.loadAsync(source);
const output = new JSZip();
for (const name of Object.keys(input.files).sort()) {
    const entry = input.files[name];
    const options = {
        ...fixedCompression,
        dir: entry.dir,
        unixPermissions: entry.dir ? 0o40755 : 0o100644,
        dosPermissions: entry.dir ? 0x10 : 0
    };
    if (entry.dir) {
        output.file(name, Buffer.alloc(0), options);
    } else {
        output.file(name, await entry.async("nodebuffer"), options);
    }
}

const normalized = await output.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
    comment: ""
});

await rm(temporary, { force: true });
await writeFile(temporary, normalized);
try {
    await rename(temporary, artifact);
} catch (error) {
    if (process.platform !== "win32" || !["EEXIST", "EPERM"].includes(error.code)) {
        throw error;
    }
    const backup = join(dist, `.${expectedArtifact}.${process.pid}.bak`);
    await rm(backup, { force: true });
    await rename(artifact, backup);
    try {
        await rename(temporary, artifact);
    } finally {
        await rm(backup, { force: true });
    }
}

const hash = createHash("sha256").update(normalized).digest("hex");
process.stdout.write(`Normalized ${expectedArtifact} (${hash})\n`);
