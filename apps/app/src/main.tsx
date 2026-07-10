import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { SessionProvider, useSession } from "./session.js";
import { Login } from "./screens/Login.js";
import { Start } from "./screens/Start.js";
import { Shell } from "./Shell.js";
import { Skeleton } from "@mossa/ui";

function App() {
  const { loading, ctx } = useSession();
  if (loading) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <Skeleton className="h-14" />
        <Skeleton className="h-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!ctx) return <Login />;
  if (!ctx.active) return <Start />;
  return <Shell />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
);
