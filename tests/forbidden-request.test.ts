import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(directory: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...sourceFiles(path));
        } else if (path.endsWith(".ts")) {
            files.push(path);
        }
    }
    return files;
}

describe("certification safety contract", () => {
    test("source contains no runtime network or unsafe DOM primitives", () => {
        const source = sourceFiles(join(__dirname, "..", "src"))
            .map((path) => readFileSync(path, "utf8"))
            .join("\n");
        expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|innerHTML|eval)\b/);
        expect(source).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    });

    test("capabilities declare no privileges", () => {
        const capabilities = JSON.parse(readFileSync(join(__dirname, "..", "capabilities.json"), "utf8"));
        expect(capabilities.privileges).toEqual([]);
    });
});
