import type { TurnRecord } from "@/features/session/session-reducer";

/** The last line of a failed turn: why it failed, with the error code. */
export default function FailureRow({ failure }: { failure: NonNullable<TurnRecord["failure"]> }) {
  return (
    <div role="alert" className="flex items-start gap-2 text-sm">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-red-500" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-destructive">This turn failed</span>{" "}
        <span className="text-muted-foreground">{failure.message}</span>
      </p>
      {failure.code && (
        <code className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {failure.code}
        </code>
      )}
    </div>
  );
}
