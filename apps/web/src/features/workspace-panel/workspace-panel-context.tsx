import type { ReactNode } from "react";
import { createContext, useContext, useRef } from "react";

interface WorkspacePanelContextValue {
  toggleRef: React.MutableRefObject<(() => void) | null>;
}

const WorkspacePanelContext = createContext<WorkspacePanelContextValue | null>(null);

export function WorkspacePanelProvider({ children }: { children: ReactNode }) {
  const toggleRef = useRef<(() => void) | null>(null);
  return (
    <WorkspacePanelContext.Provider value={{ toggleRef }}>
      {children}
    </WorkspacePanelContext.Provider>
  );
}

export function useWorkspacePanelContext() {
  return useContext(WorkspacePanelContext);
}
