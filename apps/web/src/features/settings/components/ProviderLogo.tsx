import { SparklesIcon } from "lucide-react";
import { PROVIDER_LOGOS } from "../logos/provider-logos";

/** A provider's logo in the text colour, so it works in both themes. A provider
 * the user added has none, and gets a generic mark. */
export default function ProviderLogo({ provider }: { provider: string }) {
  const paths = PROVIDER_LOGOS[provider];
  if (!paths) return <SparklesIcon aria-hidden="true" className="size-5 shrink-0" />;
  return (
    <svg
      aria-hidden="true"
      data-provider-logo={provider}
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-5 shrink-0"
    >
      {paths.map((path) => (
        <path key={path.d} {...path} />
      ))}
    </svg>
  );
}
