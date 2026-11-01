import Composer from "./components/Composer";
import SessionView from "./components/SessionView";

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <span className="app__badge">local server running</span>
        <h1>
          Ingenious <span>Forge</span>
        </h1>
      </header>
      <main className="app__main">
        <SessionView />
      </main>
      <footer className="app__footer">
        <Composer />
      </footer>
    </div>
  );
}
