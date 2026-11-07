import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { matchSlashCommands } from "@/lib/slash-commands";

interface ComposerProps {
  /** Sends the trimmed text; returns false when it could not be sent. */
  onSend: (text: string) => boolean;
  /** True while a turn runs: a message sent now steers it. */
  busy?: boolean;
  /** Stops the running turn. */
  onStop?: () => void;
  /** Focus the message box when the composer appears. */
  focusOnMount?: boolean;
  /** Controls at the left of the box's bottom row. */
  startControls?: ReactNode;
  /** Controls at the right of the box's bottom row, before the send button. */
  endControls?: ReactNode;
}

export default function Composer({
  onSend,
  busy = false,
  onStop,
  focusOnMount = false,
  startControls,
  endControls,
}: ComposerProps) {
  const [value, setValue] = useState("");
  /** The text the slash-command menu was dismissed for with Escape. */
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const commands = dismissedFor === value ? [] : matchSlashCommands(value);

  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);
  const canSend = value.trim() !== "";

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    if (onSend(value.trim())) setValue("");
  }

  function complete(name: string) {
    setValue(`/${name}`);
    input.current?.focus();
  }

  /** Fills the first suggested command; false when the text is already it. */
  function completeFirst(): boolean {
    const first = commands[0];
    if (!first || value === `/${first.name}`) return false;
    complete(first.name);
    return true;
  }

  return (
    <form
      className="relative mx-auto w-full max-w-3xl"
      aria-label="Composer"
      onSubmit={handleSubmit}
    >
      {commands.length > 0 && (
        <div
          id="slash-commands"
          role="listbox"
          aria-label="Slash commands"
          className="absolute bottom-full left-0 mb-2 w-full max-w-sm overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {commands.map((command, index) => (
            <div
              key={command.name}
              role="option"
              aria-selected={index === 0}
              tabIndex={-1}
              className="flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => complete(command.name)}
              onKeyDown={(event) => {
                if (event.key === "Enter") complete(command.name);
              }}
            >
              <span className="font-mono">/{command.name}</span>
              <span className="text-muted-foreground">{command.description}</span>
            </div>
          ))}
        </div>
      )}
      <InputGroup>
        <InputGroupTextarea
          ref={input}
          placeholder="Ask Forge to do something…"
          className="p-3.5"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-controls={commands.length > 0 ? "slash-commands" : undefined}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && commands.length > 0) {
              event.preventDefault();
              setDismissedFor(value);
            } else if (event.key === "Tab" && !event.shiftKey && commands.length > 0) {
              event.preventDefault();
              completeFirst();
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!completeFirst()) handleSubmit();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          {startControls}
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {endControls}
            {busy && onStop && (
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Stop the agent"
                onClick={onStop}
              >
                <SquareIcon />
              </InputGroupButton>
            )}
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              aria-label="Send message"
              disabled={!canSend}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
