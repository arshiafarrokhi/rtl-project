import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const buildDirectory = resolve(projectRoot, "build");
const runtimeFiles = [
  "index.html",
  "styles.css",
  "theme-init.js",
  "storage.js",
  "app.js",
  "vendor/phosphor/style.css",
  "vendor/phosphor/Phosphor.woff2",
];

if (
  dirname(buildDirectory) !== projectRoot ||
  basename(buildDirectory) !== "build"
) {
  throw new Error("Refusing to clean an unexpected build directory.");
}

await rm(buildDirectory, { recursive: true, force: true });
await mkdir(buildDirectory, { recursive: true });

await Promise.all(
  runtimeFiles.map(async (fileName) => {
    const destination = resolve(buildDirectory, fileName);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(projectRoot, fileName), destination);
  }),
);

console.log(`Build ready: ${buildDirectory}`);
console.log(`Included: ${runtimeFiles.join(", ")}`);
