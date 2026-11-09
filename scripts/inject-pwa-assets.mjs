import { readFile, writeFile } from "node:fs/promises";

const serviceWorkerPath = new URL("../dist/service-worker.js", import.meta.url);
const indexHtml = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const assets = [...indexHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
  .map((match) => match[1])
  .filter((path) => path.startsWith("/assets/"));

if (!assets.some((path) => path.endsWith(".js")) || !assets.some((path) => path.endsWith(".css"))) {
  throw new Error("Built application JavaScript or CSS assets were not found for PWA precaching.");
}

const serviceWorker = await readFile(serviceWorkerPath, "utf8");
const placeholder = "const BUILD_ASSETS = [];";
if (!serviceWorker.includes(placeholder)) {
  throw new Error("PWA service worker asset placeholder was not found.");
}

await writeFile(
  serviceWorkerPath,
  serviceWorker.replace(placeholder, `const BUILD_ASSETS = ${JSON.stringify(assets)};`),
);
console.log(`Added ${assets.length} built assets to the PWA precache.`);
