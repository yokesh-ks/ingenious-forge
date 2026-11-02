import { ArrowUpIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";

export default function Composer() {
  const [value, setValue] = useState("");

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if (!text) return;
    // Sending to the agent is wired up in a later story; this story only
    // needs the composer to render and accept input.
    setValue("");
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
            disabled={!value.trim()}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
