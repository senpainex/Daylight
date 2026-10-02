import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "www");
const webFiles = [
  "mobile.css",
  "mobile-auth.css",
  "mobile-ai.css",
  "conferbot.css",
  "mobile.js",
  "mobile-auth.js",
  "mobile-ai.js",
  "sw.js",
  "manifest.webmanifest",
  "daylight-icon.svg",
  "firebase-config.json",
  "privacy.html",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
let mobileHtml = await readFile(path.join(root, "mobile.html"), "utf8");
mobileHtml = mobileHtml.replace('href="index.html"', 'href="https://senpainex.github.io/Daylight/"');
await writeFile(path.join(output, "index.html"), mobileHtml);
await writeFile(path.join(output, "mobile.html"), mobileHtml);
await cp(path.join(root, "firebase-config.json"), path.join(output, "firebase-config.json"));
for (const file of webFiles) {
  if (file === "firebase-config.json") continue;
  await cp(path.join(root, file), path.join(output, file));
}
console.log(`Prepared ${webFiles.length + 1} Daylight Pocket web assets in www/`);
