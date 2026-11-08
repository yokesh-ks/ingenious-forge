import { CheckIcon, CircleDotIcon, CircleIcon } from "lucide-react";
import type { TodoItem, TodoStatus } from "@/api/types";
import { cn } from "@/lib/utils";

const TODO_STATUS: Record<TodoStatus, { label: string; icon: typeof CheckIcon }> = {
  completed: { label: "Completed", icon: CheckIcon },
  in_progress: { label: "In progress", icon: CircleDotIcon },
  pending: { label: "Pending", icon: CircleIcon },
};

/** The plan a `todo_write` call wrote, each step with its status. */
export default function TodoList({ todos }: { todos: TodoItem[] }) {
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
