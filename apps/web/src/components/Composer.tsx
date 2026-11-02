import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";

interface ComposerProps {
  /** Sends the trimmed text; returns false when it could not be sent. */
  onSend: (text: string) => boolean;
  /** True while a turn runs: a message sent now steers it. */
  busy?: boolean;
  /** Stops the running turn. */
  onStop?: () => void;
}

export default function Composer({ onSend, busy = false, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const canSend = value.trim() !== "";

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    if (onSend(value.trim())) setValue("");
  }

  return (
    <form className="mx-auto w-full max-w-3xl" aria-label="Composer" onSubmit={handleSubmit}>
      <InputGroup>
        <InputGroupTextarea
          placeholder="Ask Forge to do something…"
          className="p-3.5"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />
        <InputGroupAddon align="block-end">
          {busy && onStop && (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Stop the agent"
              className="ml-auto"
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
            className={busy && onStop ? undefined : "ml-auto"}
            disabled={!canSend}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
