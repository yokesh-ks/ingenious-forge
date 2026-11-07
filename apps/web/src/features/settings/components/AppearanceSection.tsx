import { type LucideIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { type ThemePreference, useTheme } from "@/hooks/use-theme";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

/** Picks the theme: a fixed one, or whatever the system uses. */
export default function AppearanceSection() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="grid grid-cols-3 gap-3">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label
          key={value}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-2 py-5 text-sm transition-colors hover:bg-muted/50 has-checked:border-foreground/30 has-checked:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring"
        >
          <input
            type="radio"
            name="theme"
            className="sr-only"
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
          />
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
