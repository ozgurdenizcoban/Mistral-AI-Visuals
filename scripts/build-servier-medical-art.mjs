import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const sharpSpecifier = process.env.SHARP_MODULE_PATH
  ? pathToFileURL(path.join(process.env.SHARP_MODULE_PATH, "lib", "index.js")).href
  : "sharp";
const { default: sharp } = await import(sharpSpecifier);

const [rawManifestPath, publicDirectory] = process.argv.slice(2);
if (!rawManifestPath || !publicDirectory) {
  throw new Error("Usage: node build-servier-medical-art.mjs <raw-manifest.json> <public-directory>");
}

const outputRoot = path.resolve(publicDirectory, "medical-art");
if (!outputRoot.endsWith(`${path.sep}medical-art`)) {
  throw new Error(`Refusing unsafe output path: ${outputRoot}`);
}

const rawAssets = JSON.parse(await fs.readFile(rawManifestPath, "utf8"));
await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

const canonicalByHash = new Map();
const assets = [];
let cursor = 0;

async function convertNext() {
  while (cursor < rawAssets.length) {
    const item = rawAssets[cursor++];
    const relativePath = path.posix.join(item.purpose, item.kitSlug, `${item.id}.webp`);
    const destination = path.join(outputRoot, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(destination), { recursive: true });

    const buffer = await sharp(item.rawPath, { limitInputPixels: 80_000_000 })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({ width: 1400, height: 1050, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, alphaQuality: 100, effort: 5 })
      .toBuffer();
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const dedupeKey = `${item.purpose}:${hash}`;
    let publicPath = canonicalByHash.get(dedupeKey);

    if (!publicPath) {
      await fs.writeFile(destination, buffer);
      publicPath = `/medical-art/${relativePath}`;
      canonicalByHash.set(dedupeKey, publicPath);
    }

    assets.push({
      id: item.id,
      purpose: item.purpose,
      kit: item.kit,
      title: item.title,
      slide: item.slide,
      src: publicPath,
      keywords: `${item.kit} ${item.title}`.toLowerCase(),
    });

    if (assets.length % 100 === 0) {
      process.stdout.write(`Converted ${assets.length}/${rawAssets.length}\n`);
    }
  }
}

await Promise.all(Array.from({ length: 4 }, () => convertNext()));
assets.sort((a, b) => a.id.localeCompare(b.id));

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  attribution: "Image provided by Servier Medical Art",
  sourceUrl: "https://smart.servier.com/",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  assets,
};

await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest), "utf8");
const uniqueFiles = new Set(assets.map((asset) => asset.src)).size;
process.stdout.write(`Manifest: ${assets.length} entries, ${uniqueFiles} unique WebP files\n`);
