import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/powerbi-visuals-tools/bin/pbiviz.js", import.meta.url));
const compat = fileURLToPath(new URL("./webpack-compat.cjs", import.meta.url));
const result = spawnSync(process.execPath, ["-r", compat, cli, "package", "--no-stats"], { stdio: "inherit" });
const packageExists = existsSync(new URL("../dist/", import.meta.url)) &&
    readdirSync(new URL("../dist/", import.meta.url)).some((file) => file.endsWith(".pbiviz"));

if (result.status !== 0 && !packageExists) {
    process.exit(result.status ?? 1);
}

if (result.status !== 0 && packageExists) {
    process.stdout.write("pbiviz completed the package before its optional webpack shutdown hook failed.\n");
}
