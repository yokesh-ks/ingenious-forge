#!/usr/bin/env node
/**
 * clean-mark — URL → Markdown converter (CLI)
 *
 * Usage:
 *   node tools/clean-mark/index.js <url> [--title] [--no-links] [--no-clean]
 *
 * Examples:
 *   node tools/clean-mark/index.js https://example.com/article
 *   node tools/clean-mark/index.js https://example.com --title --no-clean
 *
 * Defaults: title omitted, links kept, readability cleaning enabled.
 */

import { processHtml } from "./lib/processor.js";
import { filter } from "./filters/index.js";
import { cleanMarkdown } from "./formatters/index.js";
import { fetchUrlResilient } from "./utils/fetch/index.js";
import { isValidUrl } from "./utils/url.js";

const USAGE =
	"Usage: node index.js <url> [--title] [--no-links] [--no-clean]\n" +
	"  --title    Prepend the page title as a top-level heading (default: off)\n" +
	"  --no-links Strip inline links from the output (default: keep links)\n" +
	"  --no-clean Disable Readability article extraction (default: on)";

function parseArgs(argv) {
	const url = argv.find((arg) => !arg.startsWith("-"));
	const flags = {};
	for (const arg of argv) {
		switch (arg) {
			case "--title":
				flags.title = true;
				break;
			case "--no-title":
				flags.title = false;
				break;
			case "--links":
				flags.links = true;
				break;
			case "--no-links":
				flags.links = false;
				break;
			case "--clean":
				flags.clean = true;
				break;
			case "--no-clean":
				flags.clean = false;
				break;
		}
	}
	return { url, title: flags.title, links: flags.links, clean: flags.clean };
}

async function main() {
	const { url, title, links, clean } = parseArgs(process.argv.slice(2));

	if (!url || !isValidUrl(url)) {
		console.error(USAGE);
		process.exit(1);
	}

	// CLI defaults mirror the API, but title is opt-in via --title.
	const options = {
		inline_title: title === true,
		ignore_links: links === false,
		improve_readability: clean !== false,
	};

	try {
		const { text, viaProxy } = await fetchUrlResilient(url, {
			timeout: 15_000,
		});

		let markdown;
		if (viaProxy) {
			let proxyContent = text;
			// Proxy (r.jina.ai) already returns reader-mode markdown.
			// Extract the title from the "Title: " header line if present.
			let proxyTitle = "";
			const titleMatch = proxyContent.match(/^Title:\s*(.+)$/m);
			if (titleMatch) {
				proxyTitle = titleMatch[1].trim();
				// Strip the Title/URL Source/Published Time header block
				proxyContent = proxyContent.replace(
					/^Title:[^\n]*\n[\s\S]*?^Markdown Content:\s*\n*/im,
					""
				);
			}

			// Apply domain filters + link stripping + cleanup, but skip
			// Readability + turndown since the content is already markdown.
			markdown = filter(url, proxyContent, options.ignore_links);
			markdown = cleanMarkdown(markdown);

			// Prepend title if requested
			if (options.inline_title && proxyTitle) {
				markdown = `# ${proxyTitle}\n${markdown}`;
			}
		} else {
			const { markdown: processed, title: pageTitle } = processHtml(
				url,
				text,
				options
			);
			markdown = processed;
			// processHtml already prepends the title when inline_title is set.
			// pageTitle is available but already handled above.
		}

		process.stdout.write(markdown);
		if (!markdown.endsWith("\n")) {
			process.stdout.write("\n");
		}
	} catch (error) {
		console.error(`Error: ${error.message}`);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(`Fatal: ${error.message}`);
	process.exit(1);
});
