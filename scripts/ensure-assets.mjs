import { mkdir, writeFile } from "node:fs/promises";

const assets = new URL("../assets/", import.meta.url);
await mkdir(assets, { recursive: true });

// A tiny local icon keeps the package self-contained and avoids external assets.
const icon = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
await writeFile(new URL("icon.png", assets), icon);
