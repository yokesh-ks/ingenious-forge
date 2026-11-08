import {
  CheckIcon,
  CircleDotIcon,
  CircleIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderOpenIcon,
  GlobeIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  SearchIcon,
  SquareTerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { useId, useState } from "react";
import type {
  ApprovalDecision,
  JsonValue,
  Question,
  QuestionAnswer,
  TodoItem,
  TodoStatus,
} from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import DiffView from "@/features/git/components/DiffView";
import type { Approval, QuestionCard, ToolItem } from "@/features/session/session-reducer";
import { cn } from "@/lib/utils";
import { type ToolKind, toolKind } from "../tool-names";

const ANSWERS: Record<ApprovalDecision, string> = {
  approve: "Approved",
  deny: "Denied",
  always_allow: "Always allowed",
};

/** The approval card: the exact command or diff, and the answer buttons. */
function ApprovalPanel({
  approval,
  onAnswer,
}: {
  approval: Approval;
  onAnswer?: (decision: ApprovalDecision) => void;
}) {
  if (approval.status !== "pending") {
    return (
      <p
        className={cn(
          "mb-1.5 text-xs font-medium",
          approval.status === "deny" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {ANSWERS[approval.status]}
      </p>
    );
  }
  const what = approval.kind === "command" ? "Run this command?" : "Apply this edit?";
  return (
    <section
      aria-label="Approval needed"
      className="mb-1.5 flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2"
    >
      <p className="text-xs font-medium">{what}</p>
      {approval.command !== null && (
        <pre className="overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
          {approval.command}
        </pre>
      )}
      {approval.path !== null && (
        <code className="font-mono text-xs text-muted-foreground">{approval.path}</code>
      )}
      {approval.diff !== null && <DiffView diff={approval.diff} />}
      {onAnswer && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onAnswer("approve")}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAnswer("deny")}>
            Deny
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAnswer("always_allow")}>
            Always allow
          </Button>
        </div>
      )}
    </section>
  );
}

/** A question's heading and text, as one line. */
function questionTitle(question: Question): string {
  return question.header ? `${question.header} ${question.question}` : question.question;
}

/** The form for one waiting question card; submits one answer each. */
function QuestionForm({
  questions,
  onSubmit,
}: {
  questions: Question[];
  onSubmit: (answers: QuestionAnswer[]) => void;
}) {
  const base = useId();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const toggle = (id: string, label: string, on: boolean) =>
    setSelected((all) => {
      const current = all[id] ?? [];
      return { ...all, [id]: on ? [...current, label] : current.filter((l) => l !== label) };
    });
  const answers = (): QuestionAnswer[] =>
    questions.map((q) => {
      // Picked in the order the options are listed.
      const picked = q.options
        .map((o) => o.label)
        .filter((label) => (selected[q.id] ?? []).includes(label));
      const text = custom[q.id]?.trim();
      return text ? { id: q.id, selected: picked, custom: text } : { id: q.id, selected: picked };
    });
  const skip = () => onSubmit(questions.map((q) => ({ id: q.id, selected: [] })));

  return (
    <section
      aria-label="Questions"
      className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-2"
    >
      {questions.map((q, qi) => (
        <fieldset key={q.id} aria-label={questionTitle(q)} className="flex flex-col gap-2">
          <legend className="text-xs">
            {q.header && <span className="mr-1 font-semibold">{q.header}</span>}
            <span className="font-medium">{q.question}</span>
          </legend>
          {q.multi_select ? (
            q.options.map((option, oi) => {
              const id = `${base}-${qi}-${oi}`;
              return (
                <div key={option.label} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={(selected[q.id] ?? []).includes(option.label)}
                    onCheckedChange={(on) => toggle(q.id, option.label, on === true)}
                  />
                  <OptionLabel htmlFor={id} label={option.label} description={option.description} />
                </div>
              );
            })
          ) : (
            <RadioGroup
              className="gap-2"
              value={selected[q.id]?.[0] ?? ""}
              onValueChange={(label) => setSelected((all) => ({ ...all, [q.id]: [label] }))}
            >
              {q.options.map((option, oi) => {
                const id = `${base}-${qi}-${oi}`;
                return (
                  <div key={option.label} className="flex items-start gap-2">
                    <RadioGroupItem id={id} value={option.label} className="mt-0.5" />
                    <OptionLabel
                      htmlFor={id}
                      label={option.label}
                      description={option.description}
                    />
                  </div>
                );
              })}
            </RadioGroup>
          )}
          <Textarea
            aria-label="Other answer"
            placeholder="Other answer"
            rows={1}
            className="min-h-8 text-xs"
            value={custom[q.id] ?? ""}
            onChange={(e) => setCustom((all) => ({ ...all, [q.id]: e.target.value }))}
          />
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onSubmit(answers())}>
          Submit answers
        </Button>
        <Button size="sm" variant="ghost" onClick={skip}>
          Skip
        </Button>
      </div>
    </section>
  );
}

function OptionLabel({
  htmlFor,
  label,
  description,
}: {
  htmlFor: string;
  label: string;
  description: string | null;
}) {
  return (
    <div className="flex flex-col text-xs">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
      </label>
      {description && <span className="text-muted-foreground">{description}</span>}
    </div>
  );
}

/** A question card: the form while it waits, then what was answered. */
function QuestionPanel({
  card,
  onSubmit,
}: {
  card: QuestionCard;
  onSubmit?: (answers: QuestionAnswer[]) => void;
}) {
  if (card.status === "pending") {
    if (!onSubmit) {
      return <p className="text-xs text-muted-foreground">Waiting for your answer</p>;
    }
    return <QuestionForm questions={card.questions} onSubmit={onSubmit} />;
  }
  if (card.status === "cancelled" || !card.answers) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <p className="text-muted-foreground">
          This question set was cancelled before answers were submitted.
        </p>
        <ul className="list-disc pl-4">
          {card.questions.map((q) => (
            <li key={q.id}>{q.question}</li>
          ))}
        </ul>
      </div>
    );
  }
  const answers = card.answers;
  return (
    <fieldset aria-label="Questions and answers" className="min-w-0">
      <dl className="flex flex-col gap-1.5 text-xs">
        {card.questions.map((q) => {
          const answer = answers.find((a) => a.id === q.id);
          const parts = [...(answer?.selected ?? []), ...(answer?.custom ? [answer.custom] : [])];
          return (
            <div key={q.id}>
              <dt className="text-muted-foreground">{questionTitle(q)}</dt>
              <dd className="font-medium">{parts.length > 0 ? parts.join(", ") : "Skipped"}</dd>
            </div>
          );
        })}
      </dl>
    </fieldset>
  );
}

const TODO_STATUS: Record<TodoStatus, { label: string; icon: typeof CheckIcon }> = {
  completed: { label: "Completed", icon: CheckIcon },
  in_progress: { label: "In progress", icon: CircleDotIcon },
  pending: { label: "Pending", icon: CircleIcon },
};

/** The plan a `todo_write` call wrote, each step with its status. */
function TodoList({ todos }: { todos: TodoItem[] }) {
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <ul className="flex flex-col gap-0.5">
        {todos.map((todo) => {
          const { label, icon: Icon } = TODO_STATUS[todo.status];
          return (
            <li key={todo.content} className="flex items-center gap-1.5">
              <Icon
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0",
                  todo.status === "completed" ? "text-muted-foreground" : "text-foreground",
                )}
              />
              <span className="sr-only">{label}: </span>
              <span
                className={cn(
                  todo.status === "completed" && "text-muted-foreground line-through",
                  todo.status === "in_progress" && "font-medium",
                )}
              >
                {todo.content}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground">
        {done} of {todos.length} done
      </p>
    </div>
  );
}

const PREVIEW_LINES = 12;

const TOOLS: Partial<Record<ToolKind, { label: string; icon: typeof FileTextIcon }>> = {
  read: { label: "Read", icon: FileTextIcon },
  write: { label: "Write", icon: FilePlusIcon },
  edit: { label: "Edit", icon: PencilIcon },
  list: { label: "List", icon: FolderOpenIcon },
  search: { label: "Search", icon: SearchIcon },
  fetch: { label: "Fetch", icon: GlobeIcon },
  bash: { label: "Shell", icon: SquareTerminalIcon },
  plan: { label: "Todo", icon: ListChecksIcon },
  question: { label: "Question", icon: MessageCircleQuestionIcon },
};

function stringArg(args: JsonValue, key: string): string | null {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const value = args[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

/** A shell command's lines as they stream in, then its exit code. */
function ShellOutput({ tool }: { tool: ToolItem }) {
  const command = stringArg(tool.args, "command");
  const described = stringArg(tool.args, "description") !== null;
  return (
    <>
      {described && command && (
        <pre
          data-testid="shell-command"
          className="mb-1 overflow-x-auto font-mono text-xs text-muted-foreground"
        >
          $ {command}
        </pre>
      )}
      <ShellLines tool={tool} />
    </>
  );
}

function ShellLines({ tool }: { tool: ToolItem }) {
  if (tool.status === "error" && tool.lines.length === 0) {
    return (
      <p data-testid="tool-output" className="text-xs text-destructive">
        {tool.output}
      </p>
    );
  }
  return (
    <>
      {tool.hiddenLines > 0 && (
        <p className="mb-1 text-xs text-muted-foreground">
          … {tool.hiddenLines} earlier lines not shown
        </p>
      )}
      {tool.lines.length > 0 ? (
        <pre
          data-testid="shell-output"
          className="max-h-72 overflow-auto font-mono text-xs leading-relaxed"
        >
          {tool.lines.map((line, i) => (
            <div
              // Lines only append, so their position is stable.
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
              key={i}
              data-stream={line.stream}
              className={cn(line.stream === "stderr" && "text-amber-600 dark:text-amber-400")}
            >
              {line.text}
            </div>
          ))}
        </pre>
      ) : (
        tool.status !== "running" && <p className="text-xs text-muted-foreground">(no output)</p>
      )}
      {tool.status === "running" && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          Running…
        </p>
      )}
      {tool.exitCode !== null && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            tool.exitCode === 0 ? "text-muted-foreground" : "text-destructive",
          )}
        >
          Exit code {tool.exitCode}
        </p>
      )}
    </>
  );
}

/** The file a call works on: `file_path` now, `path` in older sessions. */
function pathArg(args: JsonValue): string | null {
  return stringArg(args, "file_path") ?? stringArg(args, "path");
}

/** A read's lines from its result details, or its text in older sessions. */
function readLines(tool: ToolItem): string[] {
  const meta = tool.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta) && Array.isArray(meta.lines)) {
    return meta.lines.map((line) =>
      line && typeof line === "object" && !Array.isArray(line) && typeof line.text === "string"
        ? line.text
        : "",
    );
  }
  return (tool.output ?? "").split("\n");
}

function ReadPreview({ tool }: { tool: ToolItem }) {
  const lines = readLines(tool);
  const hidden = lines.length - PREVIEW_LINES;
  return (
    <>
      <pre data-testid="tool-output" className="overflow-x-auto font-mono text-xs leading-relaxed">
        {lines.slice(0, PREVIEW_LINES).join("\n")}
      </pre>
      {hidden > 0 && <p className="mt-1 text-xs text-muted-foreground">… {hidden} more lines</p>}
    </>
  );
}

function Listing({ output }: { output: string }) {
  return (
    <ul data-testid="tool-output" className="font-mono text-xs leading-relaxed">
      {output.split("\n").map((entry) => (
        <li key={entry}>{entry}</li>
      ))}
    </ul>
  );
}

function ToolOutput({ tool }: { tool: ToolItem }) {
  const kind = toolKind(tool.name);
  if (kind === "bash") return <ShellOutput tool={tool} />;
  if (tool.status === "running" || tool.output === null) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Running…
      </p>
    );
  }
  if (tool.status === "error") {
    return (
      <p data-testid="tool-output" className="text-xs text-destructive">
        {tool.output}
      </p>
    );
  }
  if (kind === "read") return <ReadPreview tool={tool} />;
  if (kind === "plan" && tool.todos) return <TodoList todos={tool.todos} />;
  if (kind === "list") return <Listing output={tool.output} />;
  return (
    <p data-testid="tool-output" className="text-xs whitespace-pre-wrap">
      {tool.output}
    </p>
  );
}

/** One tool call and its result, shown inline in the session. */
export default function ToolCallCard({
  tool,
  onAnswer,
  onAnswerQuestion,
}: {
  tool: ToolItem;
  /** Answers this call's approval card. */
  onAnswer?: (callId: string, decision: ApprovalDecision) => void;
  /** Answers this call's question card. */
  onAnswerQuestion?: (callId: string, answers: QuestionAnswer[]) => void;
}) {
  const waiting = tool.approval?.status === "pending";
  // A question card replaces the raw result, and a cancelled one is not a
  // tool failure.
  const question = tool.question;
  const failed = tool.status === "error" && !question;
  const kind = toolKind(tool.name);
  const known = TOOLS[kind];
  const Icon = known?.icon ?? WrenchIcon;
  const path =
    kind === "bash"
      ? (stringArg(tool.args, "description") ?? stringArg(tool.args, "command"))
      : kind === "search"
        ? stringArg(tool.args, "pattern")
        : kind === "fetch"
          ? stringArg(tool.args, "url")
          : (pathArg(tool.args) ?? (kind === "list" ? "." : null));

  return (
    <article
      aria-label={`${known?.label ?? tool.name} tool call`}
      className={cn(
        "w-full rounded-lg border bg-card px-3 py-2 text-card-foreground",
        failed && "border-destructive/40",
      )}
    >
      <header className="mb-1.5 flex items-center gap-2 text-sm">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">{known?.label ?? tool.name}</span>
        {path && <code className="truncate font-mono text-xs text-muted-foreground">{path}</code>}
        {failed && <span className="ml-auto text-xs font-medium text-destructive">Failed</span>}
      </header>
      {tool.approval && (
        <ApprovalPanel
          approval={tool.approval}
          onAnswer={onAnswer && ((decision) => onAnswer(tool.callId, decision))}
        />
      )}
      {question && (
        <QuestionPanel
          card={question}
          onSubmit={onAnswerQuestion && ((answers) => onAnswerQuestion(tool.callId, answers))}
        />
      )}
      {!waiting && !question && <ToolOutput tool={tool} />}
    </article>
  );
}
