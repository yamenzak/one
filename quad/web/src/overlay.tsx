/**
 * WHAT INTERRUPTS THE SCREEN, AND ON WHAT TERMS.
 *
 * ⚠️ FOUR SHAPES, CHOSEN BY WHAT THE MOMENT IS — never by taste:
 *
 *   Tray     slides up from the edge. For a TASK inside a screen — pick, edit,
 *            share — where the screen behind is still the subject.
 *   Dialog   holds the middle. For a MOMENT of its own — a form, a result —
 *            where the screen behind stops mattering until this is done.
 *   Confirm  a question with two buttons. For an action that cannot be taken
 *            back; the destructive wording is on the button, not the title.
 *   Menu     actions behind an ellipsis. For the second tier — everything a
 *            row can do that did not earn a place on its face.
 *
 * ⚠️ EVERY OVERLAY IS TRIGGER-COMPOSED. The trigger lives inside the overlay
 * component, which is what makes focus return to it on close — pass the button
 * as `trigger` rather than wiring `isOpen` by hand, and the whole ceremony
 * (focus trap, escape, backdrop, restore) is the library's problem.
 *
 * ⚠️ A NOTICE IS AN OUTCOME, NOT A PLACE. `notice.ok/warn/fail` for the result
 * of something the person just did; never for ambient state (that is the
 * inbox) and never for a refusal a surface can show in place (that is
 * `Trouble`). `NoticeHost` mounts once, in the shell.
 */

import * as React from "react";
import { AlertDialog, Button, Drawer, Dropdown, Label, Modal, Popover, Toast } from "@heroui/react";

/* ------------------------------------------------------------------- tray --- */

export function Tray({ trigger, title, children, actions }: {
  readonly trigger: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
}) {
  return (
    <Drawer>
      {trigger}
      <Drawer.Backdrop>
        <Drawer.Content>
          <Drawer.Dialog>
            <Drawer.Handle />
            <Drawer.Header>
              <Drawer.Heading>{title}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>{children}</Drawer.Body>
            {actions ? <Drawer.Footer>{actions}</Drawer.Footer> : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

/* ----------------------------------------------------------------- dialog --- */

export function Dialog({ trigger, title, children, actions }: {
  readonly trigger: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
}) {
  return (
    <Modal>
      {trigger}
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
            {actions ? <Modal.Footer>{actions}</Modal.Footer> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ---------------------------------------------------------------- confirm --- */

/**
 * ⚠️ THE BUTTON SAYS WHAT IT DOES — "Delete workspace", never "Yes". A person
 * under a modal reads the buttons first; "Yes / No" makes them re-read the
 * question, and a mis-click on this particular dialog is the one that cannot
 * be taken back.
 */
export function Confirm({ trigger, title, children, act, cancel = "Cancel" }: {
  readonly trigger: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly act: {
    readonly label: string;
    readonly onDo: () => void;
    /** `danger` for the irreversible; default for the merely consequential. */
    readonly tone?: "danger" | "primary";
  };
  readonly cancel?: string;
}) {
  return (
    <AlertDialog>
      {trigger}
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{children}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">{cancel}</Button>
              <Button slot="close" variant={act.tone ?? "danger"} onPress={act.onDo}>
                {act.label}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------- menu --- */

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly onDo: () => void;
  readonly disabled?: boolean;
  /** The destructive item sits last, and there is at most one. */
  readonly tone?: "danger";
}

export function Menu({ trigger, items }: {
  readonly trigger: React.ReactNode;
  readonly items: readonly MenuItem[];
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger>{trigger}</Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu>
          {items.map((item) => (
            <Dropdown.Item
              key={item.id}
              id={item.id}
              textValue={item.label}
              isDisabled={item.disabled}
              onAction={item.onDo}
              className={item.tone === "danger" ? "text-danger" : undefined}
            >
              {item.icon}
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/* ------------------------------------------------------------------- peek --- */

/** A small anchored card — a definition, a preview, a "what is this". */
export function Peek({ trigger, title, children }: {
  readonly trigger: React.ReactNode;
  readonly title?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Popover>
      <Popover.Trigger>{trigger}</Popover.Trigger>
      <Popover.Content>
        <Popover.Arrow />
        <Popover.Dialog>
          {title ? <Popover.Heading>{title}</Popover.Heading> : null}
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/* ----------------------------------------------------------------- notice --- */

/**
 * ⚠️ MOUNTED ONCE, IN THE SHELL. Two hosts means every notice appears twice,
 * which reads as a fault in the thing being announced.
 */
export function NoticeHost() {
  return (
    <Toast.Provider placement="top">
      {/* The queue renders its toasts; nothing to declare here. */}
    </Toast.Provider>
  );
}

/**
 * The outcome of something the person just did, in one sentence.
 * `ok` confirms, `warn` qualifies, `fail` reports — and a failure that a
 * surface can show in place belongs there instead, as `Trouble`.
 */
export const notice = {
  ok: (says: string) => { Toast.toast.success(says); },
  warn: (says: string) => { Toast.toast.warning(says); },
  fail: (says: string) => { Toast.toast.danger(says); },
} as const;
