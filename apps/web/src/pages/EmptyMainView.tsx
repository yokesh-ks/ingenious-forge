/** Shown at `/` once the projects list lives in the sidebar. */
export default function EmptyMainView() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-6">
      <p className="text-sm text-muted-foreground">
        Select a project or open a folder to get started.
      </p>
    </main>
  );
}
