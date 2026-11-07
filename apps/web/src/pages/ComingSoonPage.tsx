/** Placeholder for an app section that has nothing behind it yet (PRD §6.2 App navigation). */
export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-6 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </main>
  );
}
