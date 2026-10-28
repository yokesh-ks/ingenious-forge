import { fetchUrl } from "./direct.js";
import { fetchViaProxy } from "./proxy-jina.js";

export { fetchUrl, fetchUrlWithMetadata } from "./direct.js";
export { fetchViaProxy } from "./proxy-jina.js";

const DEFAULT_TIMEOUT_MS = 15 * 1000;

/**
 * Determine whether an error indicates a bot-protection / rate-limit block
 * that warrants trying a text-extraction proxy.
 * @param {Error} error - The fetch error
 * @returns {boolean} - Whether a proxy fallback may help
 */
function isBlockedByProtection(error) {
	if (!error) return false;
	const message = error.message ?? "";
	if (message.includes("HTTP 429")) return true;
	if (message.includes("HTTP 403")) return true;
	return false;
}

/**
 * Fetch a URL, falling back to the Jina AI Reader proxy when the direct
 * fetch is blocked by bot protection or rate limiting.
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {number} options.timeout - Timeout in milliseconds
 * @returns {Promise<{text: string, viaProxy: boolean, status: number}>}
 */
export async function fetchUrlResilient(url, options = {}) {
	const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

	try {
		const html = await fetchUrl(url, { timeout });
		return { text: html, viaProxy: false, status: 200 };
	} catch (directError) {
		if (!isBlockedByProtection(directError)) {
			throw directError;
		}

		try {
			const markdown = await fetchViaProxy(url, { timeout });
			return {
				text: markdown,
				viaProxy: true,
				status: 200,
			};
		} catch {
			throw directError;
		}
	}
}
