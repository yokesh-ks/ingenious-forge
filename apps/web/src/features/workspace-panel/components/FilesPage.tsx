import { RefreshCwIcon } from "lucide-react";
import type { WorkspaceTree as Tree } from "../hooks/use-workspace-tree";
import OpenTarget from "./OpenTarget";
import { PaneHeader, PathLabel, ToolButton } from "./pane-parts";
import WorkspaceTree from "./WorkspaceTree";

/** The Workspace files tab: the project's folder and its whole tree. */
export default function FilesPage({
  projectId,
  rootPath,
  tree,
  onOpen,
}: {
  projectId: string;
  rootPath: string;
  tree: Tree;
  onOpen: (path: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-[1_1_auto] flex-col">
      <PaneHeader>
        <PathLabel path={rootPath} />
        <ToolButton aria-label="Reload" title="Reload" onClick={tree.reload}>
          <RefreshCwIcon aria-hidden />
        </ToolButton>
        <OpenTarget projectId={projectId} />
      </PaneHeader>
      <div className="flex min-h-0 min-w-0 flex-[1_1_auto]">
        <WorkspaceTree tree={tree} onOpen={onOpen} />
      </div>
    </div>
  );
}
