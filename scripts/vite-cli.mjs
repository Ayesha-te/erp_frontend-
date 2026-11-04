#!/usr/bin/env node

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.env.CI ??= "true";

if (process.stdin && typeof process.stdin.off !== "function") {
  process.stdin.off = process.stdin.removeListener.bind(process.stdin);
}

if (typeof process.off !== "function") {
  process.off = process.removeListener.bind(process);
}

const require = createRequire(import.meta.url);
const vitePackagePath = require.resolve("vite/package.json");
const viteCliPath = resolve(dirname(vitePackagePath), "bin/vite.js");

await import(pathToFileURL(viteCliPath).href);
