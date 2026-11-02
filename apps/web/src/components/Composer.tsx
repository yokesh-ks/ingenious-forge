import { ArrowUpIcon } from "lucide-react";
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
  /** True while a turn runs; sending waits until it ends. */
  busy?: boolean;
}

export default function Composer({ onSend, busy = false }: ComposerProps) {
  const [value, setValue] = useState("");
  const canSend = !busy && value.trim() !== "";

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
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            aria-label="Send message"
            className="ml-auto"
            disabled={!canSend}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
