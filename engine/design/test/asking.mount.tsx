/**
 * A FLOW WHOSE FIRST QUESTION IS A REQUIRED FIELD.
 *
 * ⚠️ IT HOLDS ITS OWN ANSWERS, WHICH IS WHAT MAKES THE PRESS TESTABLE. `Create`
 * takes `held` and `at` as props and reports changes upward — so a fixture that
 * passed constants would draw a form no typing changes and a Next that can never
 * be satisfied, which is a picture of the flow rather than the flow.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Create, type Answers } from "../src/rendered/create.js";
import { Page } from "../src/frame/page.js";
import { field } from "@engine/kernel";

const TAKES = {
  name: field.text({ label: "Name", required: true, holds: "none" }),
  brand: field.text({ label: "Brand", holds: "none" }),
};

const STORY = {
  writes: "thing.register",
  asks: [
    { id: "named", ask: "What is it called?", takes: ["name"], says: { as: "{name}" } },
    { id: "branded", ask: "Who makes it?", takes: ["brand"] },
  ],
};

function Asking() {
  const [at, setAt] = React.useState("named");
  const [held, setHeld] = React.useState<Answers>({});
  return (
    <Create
      story={STORY as never}
      takes={TAKES}
      at={at}
      onGo={setAt}
      title="Add a thing"
      does={{ label: "Add it", op: "thing.register", onDo: () => undefined }}
      held={held}
      onSet={(name, value) => { setHeld((was) => ({ ...was, [name]: value })); }}
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement)
  .render(<Page hue="oklch(0.79 0.16 68)"><Asking /></Page>);
