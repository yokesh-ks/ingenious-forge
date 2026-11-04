/** A folder (with children) or a file in the workspace file tree. */
export interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

/** Nests `/`-separated paths into folders; folders first, then by name. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((name, i) => {
      const isFile = i === parts.length - 1;
      const children = node.children ?? [];
      node.children = children;
      let next = children.find((c) => c.name === name && (c.children === undefined) === isFile);
      if (!next) {
        next = { name, path: parts.slice(0, i + 1).join("/") };
        if (!isFile) next.children = [];
        children.push(next);
      }
      node = next;
    });
  }
  sortTree(root.children ?? []);
  return root.children ?? [];
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    const folders = Number(b.children !== undefined) - Number(a.children !== undefined);
    return folders || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });
  for (const node of nodes) if (node.children) sortTree(node.children);
}

/** The paths containing `query`, ignoring case; all of them when blank. */
export function filterFiles(paths: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return paths;
  return paths.filter((p) => p.toLowerCase().includes(q));
}
