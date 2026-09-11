// Builds the design-system package the claude.ai/design converter consumes.
// The app has no library build, so this assembles one under .design-sync/dist:
//   package.json  a named package so the converter treats dist/ as the DS root
//   index.js      barrel over src/components (esbuild bundles the .tsx directly)
//   types/        tsc declaration emit, @/ aliases rewritten to relative paths,
//                 plus an index.d.ts barrel the prop extractor reads
//   overlay.css   src/app/globals.css compiled by Tailwind v4 into static CSS
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(here, "dist");
const comps = resolve(root, "src/components");
const posix = (p) => p.split("\\").join("/");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// -- component files: every .tsx under src/components, in name order.
const files = readdirSync(comps).filter((f) => f.endsWith(".tsx")).sort();

// -- package.json + JS barrel
const rootPkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
writeFileSync(
  join(dist, "package.json"),
  JSON.stringify({ name: rootPkg.name, version: rootPkg.version, private: true, module: "index.js", types: "types/index.d.ts" }, null, 2) + "\n",
);
writeFileSync(
  join(dist, "index.js"),
  files.map((f) => `export * from ${JSON.stringify(posix(relative(dist, join(comps, f))))};`).join("\n") + "\n",
);

// -- declarations
const tsc = resolve(root, "node_modules/typescript/bin/tsc");
try {
  execFileSync(process.execPath, [tsc, "-p", resolve(here, "tsconfig.dts.json")], { stdio: "inherit" });
} catch (e) {
  console.error("build: tsc reported errors (declarations were still emitted)");
}
const typesDir = join(dist, "types");
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
for (const f of walk(typesDir)) {
  if (!f.endsWith(".d.ts")) continue;
  const src = readFileSync(f, "utf8");
  // "@/x" -> path relative to this file inside types/src/
  const out = src.replace(/(["'])@\/([^"']+)\1/g, (_, q, p) => {
    let rel = posix(relative(dirname(f), join(typesDir, "src", p)));
    if (!rel.startsWith(".")) rel = "./" + rel;
    return q + rel + q;
  });
  if (out !== src) writeFileSync(f, out);
}
writeFileSync(
  join(typesDir, "index.d.ts"),
  files.map((f) => `export * from "./src/components/${f.replace(/\.tsx$/, "")}";`).join("\n") + "\n",
);

// -- stylesheet
const cssFrom = resolve(root, "src/app/globals.css");
const cssTo = join(dist, "overlay.css");
const result = await postcss([tailwind({ base: root })]).process(readFileSync(cssFrom, "utf8"), { from: cssFrom, to: cssTo });
// next/font sets these two variables on <html>; outside Next the stylesheet
// has to carry them or every font-family that reads them is discarded.
const fontVars = `:root {
  --font-archivo: "Archivo";
  --font-plex: "IBM Plex Mono";
}
`;
writeFileSync(cssTo, result.css + "\n" + fontVars);

// -- data shapes: the public domain types every data-carrying component takes,
// shipped as a guideline so the design agent can build real race objects.
mkdirSync(join(dist, "docs"), { recursive: true });
const types = readFileSync(resolve(root, "src/lib/model/types.ts"), "utf8");
writeFileSync(
  join(dist, "docs", "data-shapes.md"),
  [
    "# Data shapes",
    "",
    "The objects the race components take (`race`, `meetings`, `s`, `plays`, `r`), verbatim from `src/lib/model/types.ts`. Ratings are benchmark points: a BM64 horse rates about 64, a Group 1 horse 120 plus.",
    "",
    "```ts",
    types.trimEnd(),
    "```",
    "",
  ].join("\n"),
);

console.error(`build: ${files.length} component files, ${result.css.length} bytes of css -> ${dist}`);
