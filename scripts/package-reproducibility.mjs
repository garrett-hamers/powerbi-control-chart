import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pbiviz = JSON.parse(readFileSync(join(root, "pbiviz.json"), "utf8"));
const expectedArtifact = `${pbiviz.visual.guid}.${pbiviz.visual.version}.pbiviz`;
const packageCommand = process.platform === "win32"
    ? {
        command: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", "npm run package"]
    }
    : {
        command: "npm",
        args: ["run", "package"]
    };

function packageOnce() {
    const result = spawnSync(packageCommand.command, packageCommand.args, { cwd: root, stdio: "inherit" });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
    const artifacts = readdirSync(join(root, "dist")).filter((file) => file.endsWith(".pbiviz"));
    if (artifacts.length !== 1 || artifacts[0] !== expectedArtifact) {
        process.stderr.write(`expected exactly one package artifact: ${expectedArtifact}\n`);
        process.exit(1);
    }
    const bytes = readFileSync(join(root, "dist", expectedArtifact));
    return {
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex")
    };
}

const first = packageOnce();
const second = packageOnce();
process.stdout.write(`run1=${first.sha256}\nrun2=${second.sha256}\n`);
if (!first.bytes.equals(second.bytes)) {
    process.stderr.write("clean package runs produced different bytes\n");
    process.exit(1);
}
process.stdout.write("Clean package runs are byte-for-byte reproducible.\n");
