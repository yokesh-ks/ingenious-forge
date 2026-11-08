import {
  BotIcon,
  InfoIcon,
  type LucideIcon,
  SettingsIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordKind } from "../model/build-trajectory";

const TONES: Record<RecordKind, string> = {
  system: "bg-muted text-muted-foreground",
  user: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  context: "bg-green-500/10 text-green-700 dark:text-green-300",
  assistant: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  tool: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

const ICONS: Record<RecordKind, LucideIcon> = {
  system: SettingsIcon,
  user: UserIcon,
  context: InfoIcon,
  assistant: BotIcon,
  tool: WrenchIcon,
};

/** A record's kind as a small upper-case tag, coloured by kind; where its
 * container is narrow the ledger shows only the kind's icon. */
export default function KindBadge({ kind }: { kind: RecordKind }) {
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center justify-center rounded-[3px] px-1.5 text-[10px] font-semibold tracking-wide @max-[620px]:w-[19px] @max-[620px]:px-0",
        TONES[kind],
      )}
    >
      <Icon aria-hidden className="hidden size-[13px] @max-[620px]:block" />
      <span className="@max-[620px]:hidden">{kind.toUpperCase()}</span>
    </span>
  );
}
