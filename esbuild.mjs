import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "dist/extension.js",
  external: ["vscode"],
  sourcemap: true,
  minify: false,
};

if (process.argv.includes("--watch")) {
  const builder = await context(options);
  await builder.watch();
  console.log("Forge extension is watching for changes.");
} else {
  await build(options);
  console.log("Forge extension compiled to dist/extension.js.");
}