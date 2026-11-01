import { useState, type FormEvent } from "react";

export default function Composer() {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Sending to the agent is wired up in a later story; this story only
    // needs the composer to render and accept input.
    setValue("");
  }

  return (
    <form className="composer" aria-label="Composer" onSubmit={handleSubmit}>
      <input
        className="composer__input"
        type="text"
        placeholder="Ask Forge to do something…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button className="composer__send" type="submit">
        Send
      </button>
    </form>
  );
}
