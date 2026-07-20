import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import "./styles.css";
import { SessionProvider, useSession } from "./session.js";
import { ThemeProvider } from "./theme.js";
import { Login } from "./screens/Login.js";
import { Start } from "./screens/Start.js";
import { Shell } from "./Shell.js";
import { PasskeyProvider } from "./PasskeyPrompt.js";
import { Spinner } from "@mossa/ui";

function BootSplash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
        <div className="grid size-16 place-items-center rounded-3xl bg-primary text-2xl font-black text-primary-foreground">M</div>
        <Spinner />
      </motion.div>
    </div>
  );
}

function App() {
  const { loading, ctx } = useSession();
  const screen = loading ? "boot" : !ctx ? "login" : !ctx.active ? "start" : "shell";
  return (
    <AnimatePresence mode="wait">
      <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        {screen === "boot" && <BootSplash />}
        {screen === "login" && <Login />}
        {screen === "start" && <Start />}
        {screen === "shell" && <PasskeyProvider><Shell /></PasskeyProvider>}
      </motion.div>
    </AnimatePresence>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
