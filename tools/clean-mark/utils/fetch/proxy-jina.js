const DEFAULT_TIMEOUT_MS = 15 * 1000;

/**
 * Fetch a URL via the Jina AI Reader proxy (https://r.jina.ai/).
 * This service extracts reader-mode markdown from a URL and can bypass
 * simple bot-protection pages that block direct fetching.
 * @param {string} url - The original URL to extract
 * @param {object} options - Fetch options
 * @param {number} options.timeout - Timeout in milliseconds
 * @returns {Promise<string>} - Markdown content extracted by the proxy
 */
export async function fetchViaProxy(url, options = {}) {
	const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
	const proxyUrl = `https://r.jina.ai/${url.replace(/^https?:\/\//, "")}`;

	// r.jina.ai blocks browser-like User-Agents; use minimal headers.
	const proxyHeaders = {
		"User-Agent": "Mozilla/5.0 (compatible; clean-mark/1.0)",
		Accept: "text/plain, text/markdown, */*",
	};

	const response = await fetch(proxyUrl, {
		headers: {
			...proxyHeaders,
			...options.headers,
		},
		signal: options.signal,
	});

	if (!response.ok) {
		const error = new Error(`HTTP ${response.status} (proxy)`);
		error.status = response.status;
		throw error;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const text = await response.text();
		clearTimeout(timeoutId);
		return text;
	} catch (error) {
		clearTimeout(timeoutId);
		throw error;
	}
}
