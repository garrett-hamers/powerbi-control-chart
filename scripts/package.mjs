import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/powerbi-visuals-tools/bin/pbiviz.js", import.meta.url));
const compat = fileURLToPath(new URL("./webpack-compat.cjs", import.meta.url));
const result = spawnSync(process.execPath, ["-r", compat, cli, "package", "--no-stats"], { stdio: "inherit" });
if (result.status !== 0) {
    process.exit(result.status ?? 1);
}
