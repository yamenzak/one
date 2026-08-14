/**
 * THE HUB'S OWN FURNITURE — three pieces, and no fourth without a reason.
 *
 * ⚠️ NOTHING HERE RESTYLES A COMPONENT (D7). These are arrangements: where a
 * card sits on a page, which of the library's statuses a refusal maps to. The
 * moment one of them sets a colour or a radius it becomes a screen a workspace's
 * branding does not reach, and nobody finds out until somebody with a strong
 * brand asks why one page still looks like ours.
 */

import { Alert, Card, Spinner } from "@heroui/react";
import type { Problem, Tone } from "@quad/kernel";
import { TYPE } from "@quad/web";

/**
 * ⚠️ OUR TONE, THEIR STATUS NAME — the same bridge `colorFor` is for `Chip`. A
 * screen naming a library status directly has to be revisited the day the
 * library renames one, and there are a lot of screens.
 */
const STATUS: Readonly<Record<Tone, "default" | "accent" | "success" | "warning" | "danger">> = {
  neutral: "default", info: "accent", success: "success", warning: "warning", danger: "danger",
};

/**
 * A refusal, in the words the platform chose.
 *
 * ⚠️ THE SENTENCE IS THE PLATFORM'S, NOT OURS. Every problem carries a title
 * written for the person reading it and, where there is something to do, what to
 * do — so a screen that invented its own copy from a status code would be a
 * screen saying something the rest of the product does not.
 */
export function Refusal({ problem }: { readonly problem: Problem }) {
  return (
    <Alert status={STATUS[problem.tone]}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{problem.title}</Alert.Title>
        {problem.detail ? <Alert.Description>{problem.detail}</Alert.Description> : null}
        {/* ⚠️ The one thing somebody is asked to quote. Without it every support
            conversation starts with "it said something went wrong". */}
        {problem.ref ? <Alert.Description>Reference: {problem.ref}</Alert.Description> : null}
      </Alert.Content>
    </Alert>
  );
}

/**
 * ⚠️ WAITING IS SAID, NOT IMPLIED BY AN EMPTY PAGE. A blank screen and a screen
 * with nothing on it are the same picture, and the person cannot tell which one
 * they are looking at.
 */
export function Waiting({ what }: { readonly what: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12" role="status">
      <Spinner size="sm" />
      <span className={TYPE.note}>{what}</span>
    </div>
  );
}

/** One column, centred, with room to breathe. Placement, nothing else. */
export function Sheet(
  { title, lead, children }: {
    readonly title: string;
    readonly lead?: string;
    readonly children: React.ReactNode;
  },
) {
  return (
    <Card className="w-full max-w-lg">
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {lead ? <Card.Description>{lead}</Card.Description> : null}
      </Card.Header>
      <Card.Content>
        <div className="flex flex-col gap-4">{children}</div>
      </Card.Content>
    </Card>
  );
}
