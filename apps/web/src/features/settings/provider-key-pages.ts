/** Where to get an API key for each built-in provider, by provider id. */
export const PROVIDER_KEY_PAGES: Record<string, string> = {
  anthropic: "https://platform.claude.com/settings/keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  google: "https://aistudio.google.com/apikey",
  nvidia: "https://build.nvidia.com/settings/api-keys",
  openai: "https://platform.openai.com/api-keys",
  openrouter: "https://openrouter.ai/settings/keys",
  vercel: "https://vercel.com/docs/ai-gateway/authentication-and-byok",
};
