import { GitBranchPlusIcon, GitCommitHorizontalIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { GitStatus } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface GitActionsProps {
  projectId: string;
  /** The session whose agent drafts commit messages. */
  sessionId: string;
  status: GitStatus | null;
  /** Called after a branch or commit changes the repository. */
  onChanged: () => void;
}

type Panel = "none" | "branch" | "commit";

/** Create a branch, or commit every change with a drafted message. */
export default function GitActions({ projectId, sessionId, status, onChanged }: GitActionsProps) {
  const [panel, setPanel] = useState<Panel>("none");
  const [done, setDone] = useState<string | null>(null);
  const hasChanges = !!status && status.staged + status.changed > 0;

  function close(message?: string) {
    setPanel("none");
    if (message) {
      setDone(message);
      onChanged();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDone(null);
            setPanel(panel === "branch" ? "none" : "branch");
          }}
        >
          <GitBranchPlusIcon aria-hidden /> New branch
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasChanges}
          onClick={() => {
            setDone(null);
            setPanel(panel === "commit" ? "none" : "commit");
          }}
        >
          <GitCommitHorizontalIcon aria-hidden /> Commit
        </Button>
        {done && <span className="text-xs text-muted-foreground">{done}</span>}
      </div>
      {panel === "branch" && (
        <BranchForm projectId={projectId} onDone={close} onCancel={() => close()} />
      )}
      {panel === "commit" && (
        <CommitForm
          projectId={projectId}
          sessionId={sessionId}
          onDone={close}
          onCancel={() => close()}
        />
      )}
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

function BranchForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const status = await api.createBranch(projectId, name.trim());
      onDone(`Switched to ${status.branch ?? name.trim()}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-label="New branch" className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex gap-2">
        <Input
          aria-label="Branch name"
          placeholder="feat/my-change"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy || name.trim() === ""}>
          Create
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <ErrorText message={error} />}
    </form>
  );
}

function CommitForm({
  projectId,
  sessionId,
  onDone,
  onCancel,
}: {
  projectId: string;
  sessionId: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask the agent for a draft when the form opens; the user's own typing
  // wins over a draft that arrives late.
  useEffect(() => {
    let cancelled = false;
    api.draftCommitMessage(sessionId).then(
      (draft) => {
        if (cancelled) return;
        setMessage((current) => current || draft.message);
        setDrafting(false);
      },
      (err: Error) => {
        if (cancelled) return;
        setError(`Could not draft a message: ${err.message}`);
        setDrafting(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const commit = await api.commit(projectId, message);
      onDone(`Committed ${commit.sha}: ${commit.summary}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-label="Commit" className="flex flex-col gap-2" onSubmit={submit}>
      <Textarea
        aria-label="Commit message"
        placeholder={drafting ? "Drafting a message…" : "Describe the change"}
        className="min-h-24 font-mono text-xs"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error && <ErrorText message={error} />}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || message.trim() === ""}>
          Commit changes
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
