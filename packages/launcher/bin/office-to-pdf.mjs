#!/usr/bin/env node
// Converts one Office file to a PDF for the server: office-to-pdf.mjs <in> <out>.
// Prints {"missingFonts": [...]} on success, {"code": "..."} and exit 1 on failure.
import { createConverter } from "@deepseek-ai/libreoffice-kit";

const [inputPath, outputPath] = process.argv.slice(2);

function codeOf(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (/password|encrypted|corrupt|invalid|unsupported|load/.test(text)) return "invalid";
  return "failed";
}

let converter;
try {
  converter = await createConverter({ timeoutMs: 60_000 });
  const result = await converter.render({ inputPath, outputPath });
  process.stdout.write(JSON.stringify({ missingFonts: result.missingFonts ?? [] }));
} catch (error) {
  process.stdout.write(JSON.stringify({ code: codeOf(error) }));
  process.exitCode = 1;
} finally {
  await converter?.dispose();
}
