import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <main className="fatal">
          <h1>The view could not be loaded.</h1>
          <p>Your saved workspace is preserved.</p>
          <p>{this.state.error}</p>
          <button onClick={() => location.reload()}>Reload Tracework</button>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
