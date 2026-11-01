#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PLATFORM_BINARIES = {
  "darwin-arm64": path.join(__dirname, "platforms", "darwin-arm64", "forge-server"),
  "darwin-x64":   path.join(__dirname, "platforms", "darwin-x64",   "forge-server"),
  "linux-x64":    path.join(__dirname, "platforms", "linux-x64",    "forge-server"),
  "win32-x64":    path.join(__dirname, "platforms", "win32-x64",    "forge-server.exe"),
};

const SUPPORTED_ARCHES = ["arm64", "x64"];

function platformKey() {
  const arch = process.arch;
  if (!SUPPORTED_ARCHES.includes(arch)) {
    console.error(`error: unsupported architecture '${arch}'`);
    console.error("Supported architectures: " + SUPPORTED_ARCHES.join(", "));
    process.exit(1);
  }
  return `${process.platform}-${arch}`;
}

function main() {
  const key = platformKey();
  const bin = PLATFORM_BINARIES[key];

  if (!bin) {
    console.error(`error: no prebuilt binary for platform '${key}'`);
    console.error("Supported: " + Object.keys(PLATFORM_BINARIES).join(", "));
    process.exit(1);
  }

  if (!fs.existsSync(bin)) {
    console.error(`error: binary not found at ${bin}`);
    console.error("The package may be incomplete or this platform binary is missing.");
    process.exit(1);
  }

  try {
    fs.accessSync(bin, fs.constants.X_OK);
  } catch {
    console.error(`error: binary at ${bin} is not executable`);
    process.exit(1);
  }

  // Pass all args through; forge-server accepts --port <n>
  const result = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });

  if (result.error) {
    console.error(`error: failed to start server: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

main();
