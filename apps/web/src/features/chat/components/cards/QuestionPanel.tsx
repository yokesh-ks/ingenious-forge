import { useId, useState } from "react";
import type { Question, QuestionAnswer } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionCard } from "@/features/session/session-reducer";

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
export default function QuestionPanel({
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
