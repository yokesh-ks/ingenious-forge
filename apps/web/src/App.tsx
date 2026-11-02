import { ThemeToggle } from "./components/theme-toggle";
import { Link, matchPath, usePath } from "./lib/router";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";

function Page({ path }: { path: string }) {
  if (matchPath("/", path)) return <HomePage />;
  const project = matchPath("/projects/:id", path);
  if (project) return <ProjectPage key={project.id} projectId={project.id} />;
  return (
    <main className="px-4 py-6 text-sm text-muted-foreground">
      Page not found. <Link to="/">Go to your projects.</Link>
    </main>
  );
}

export default function App() {
  const path = usePath();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 px-4 py-3">
        <h1 className="flex-1 text-lg font-bold tracking-tight">
          <Link to="/">
            Ingenious <span className="text-primary">Forge</span>
          </Link>
        </h1>
        <ThemeToggle />
      </header>
      <Page path={path} />
    </div>
  );
}
