import { TriangleAlertIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToolButton } from "./pane-parts";

/** The header's warning that an Office file used fonts this computer lacks. */
export default function FontNotice({ fonts }: { fonts: string[] }) {
  if (fonts.length === 0) return null;
  const label = `Missing fonts: ${fonts.length}. Click to view.`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolButton aria-label={label} title={label} className="text-amber-600">
          <TriangleAlertIcon aria-hidden />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-[13px]">
        <h3 className="m-0 text-sm font-medium">Missing fonts</h3>
        <p className="mt-1 mb-2 text-muted-foreground">
          These fonts are unavailable for this preview. Text and layout may differ from the original
          document.
        </p>
        <p className="m-0 text-muted-foreground">Fonts: {fonts.length}</p>
        <ul className="m-0 mt-1 max-h-48 list-none overflow-auto p-0">
          {fonts.map((font) => (
            <li key={font}>{font}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
