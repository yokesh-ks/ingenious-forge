import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParam } from "@/lib/router";

const VIEWS = ["chat", "trajectory", "statistics"] as const;
type View = (typeof VIEWS)[number];

const LABELS: Record<View, string> = {
  chat: "Chat",
  trajectory: "Trajectory",
  statistics: "Statistics",
};

/** Returns the current view and a setter (URL-persisted). */
export function useSessionView(): [View, (v: View) => void] {
  const [param, setParam] = useQueryParam("view");
  const view: View = VIEWS.includes(param as View) ? (param as View) : "chat";
  return [view, (next) => setParam(next === "chat" ? null : next)];
}

/** The tab triggers row for the session header. */
export function SessionTabsBar() {
  const [view, setView] = useSessionView();
  return (
    <Tabs value={view} onValueChange={(next) => setView(next as View)}>
      <TabsList variant="line">
        {VIEWS.map((v) => (
          <TabsTrigger key={v} value={v}>
            {LABELS[v]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * The session's views: Chat (the default), Trajectory and Statistics. The
 * selected one lives in the URL (`?view=`), so a reload or a shared link
 * opens the same view.
 */
export default function SessionTabs(views: Record<View, ReactNode>) {
  const [view, setView] = useSessionView();
  return (
    <Tabs
      value={view}
      onValueChange={(next) => setView(next as View)}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <TabsList variant="line">
        {VIEWS.map((v) => (
          <TabsTrigger key={v} value={v}>
            {LABELS[v]}
          </TabsTrigger>
        ))}
      </TabsList>
      {VIEWS.map((v) => (
        <TabsContent key={v} value={v} className="flex min-h-0 min-w-0 flex-1">
          {views[v]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
