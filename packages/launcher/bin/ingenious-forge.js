#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");

const PLATFORM_BINARIES = {
  "darwin-arm64": path.join(__dirname, "platforms", "darwin-arm64", "forge-server"),
  "darwin-x64":   path.join(__dirname, "platforms", "darwin-x64",   "forge-server"),
  "linux-x64":    path.join(__dirname, "platforms", "linux-x64",    "forge-server"),
  "win32-x64":    path.join(__dirname, "platforms", "win32-x64",    "forge-server.exe"),
};

const SUPPORTED_ARCHES = ["arm64", "x64"];

const SERVER_READY_RE = /forge server listening on (https?:\/\/\S+)/i;

function platformKey() {
  const arch = process.arch;
  if (!SUPPORTED_ARCHES.includes(arch)) {
    console.error(`error: unsupported architecture '${arch}'`);
    console.error("Supported architectures: " + SUPPORTED_ARCHES.join(", "));
    process.exit(1);
  }
  return `${process.platform}-${arch}`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let noOpen = false;
  const serverArgs = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--no-open") {
      noOpen = true;
    } else if (args[i] === "--port" && i + 1 < args.length) {
      serverArgs.push(args[i], args[i + 1]);
      i++;
    } else {
      serverArgs.push(args[i]);
    }
  }

  return { noOpen, serverArgs };
}

function openBrowser(url) {
  const opener =
    process.platform === "darwin" ? "open" :
    process.platform === "win32"  ? "start" :
    "xdg-open";

  const args = process.platform === "win32" ? ["", url] : [url];
  execFile(opener, args, { shell: process.platform === "win32" }, (err) => {
    if (err) {
      console.error(`warning: could not open browser: ${err.message}`);
    }
  });
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

  const { noOpen, serverArgs } = parseArgs(process.argv);

  const server = spawn(bin, serverArgs, { stdio: ["inherit", "inherit", "pipe"] });

  let browserOpened = false;
  let stderrBuf = "";

  server.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);

    if (!browserOpened) {
      stderrBuf += text;
      const match = SERVER_READY_RE.exec(stderrBuf);
      if (match) {
        browserOpened = true;
        const url = match[1];
        if (!noOpen) {
          openBrowser(url);
        }
        stderrBuf = "";
      } else if (stderrBuf.length > 4096) {
        // Prevent unbounded growth if the ready line never appears
        stderrBuf = stderrBuf.slice(-512);
      }
    }
  });

  server.on("error", (err) => {
    console.error(`error: failed to start server: ${err.message}`);
    process.exit(1);
  });

  server.on("close", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });

  // Forward signals so Ctrl-C cleanly shuts down the child
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => server.kill(sig));
  }
}

main();
