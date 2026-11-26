import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { T, useGT, Var } from "gt-react";
import { useState, useSyncExternalStore } from "react";

import { botEnvironment } from "../../state/bots";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Sheet, SheetHeader, SheetPopup, SheetTitle } from "../ui/sheet";
import { toastManager } from "../ui/toast";
import { BotDetails } from "./BotDetailPage";

export interface BotTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

function failureText(result: unknown, fallback: string): string {
  if (isAtomCommandInterrupted(result as never)) return fallback;
  const error = squashAtomCommandFailure(result as never);
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

// One settings sheet for the whole app, so the header and the sidebar open the same one.
let openSettings: BotTarget | null = null;
const listeners = new Set<() => void>();
function setOpenSettings(next: typeof openSettings) {
  openSettings = next;
  for (const listener of listeners) listener();
}
function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openBotSettings(target: BotTarget) {
  setOpenSettings(target);
}

/** Mounted once in the app shell; shows the settings of whichever bot asked last. */
export function BotSettingsHost() {
  const gt = useGT();
  const target = useSyncExternalStore(subscribeSettings, () => openSettings);
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setOpenSettings(null);
      }}
    >
      <SheetPopup side="right" className="w-[min(94vw,32rem)]">
        <SheetHeader className="sr-only">
          <SheetTitle>{gt("Bot settings")}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {target ? (
            <BotDetails
              key={target.projectId}
              environmentId={target.environmentId}
              projectId={target.projectId}
            />
          ) : null}
        </div>
      </SheetPopup>
    </Sheet>
  );
}

/** Archives the bot's conversation; memory, rules and routines carry over to the next one. */
export function BotStartOverDialog({
  target,
  botName,
  open,
  onOpenChange,
}: {
  readonly target: BotTarget;
  readonly botName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const startOver = useAtomCommand(botEnvironment.startOver, { reportFailure: false });
  const [working, setWorking] = useState(false);

  const run = async () => {
    setWorking(true);
    const result = await startOver({
      environmentId: target.environmentId,
      input: { projectId: target.projectId },
    });
    setWorking(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: gt("Could not start over"),
        description: failureText(result, gt("Try again.")),
      });
      return;
    }
    onOpenChange(false);
    setOpenSettings(null);
    void navigate({ to: "/bots/$projectId", params: { projectId: target.projectId } });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T>
              Start over with <Var>{botName}</Var>?
            </T>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T>
              The current conversation is archived, not deleted. The bot keeps its memory, rules and
              routines.
            </T>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            <T>Cancel</T>
          </AlertDialogClose>
          <Button disabled={working} onClick={() => void run()}>
            <T>Start over</T>
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/** Deleting is final, so the owner types the bot's name, as for deleting a repository. */
export function BotDeleteDialog({
  target,
  botName,
  open,
  onOpenChange,
}: {
  readonly target: BotTarget;
  readonly botName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const deleteBot = useAtomCommand(botEnvironment.deleteBot, { reportFailure: false });
  const bots = useEnvironmentQuery(
    botEnvironment.list({ environmentId: target.environmentId, input: {} }),
  );
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const confirmed = typed.trim() === botName.trim();
  const inputId = `delete-bot-${target.projectId}`;

  const run = async () => {
    if (!confirmed) return;
    setDeleting(true);
    const result = await deleteBot({
      environmentId: target.environmentId,
      input: { projectId: target.projectId },
    });
    setDeleting(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: gt("Could not delete the bot"),
        description: failureText(result, gt("Try again.")),
      });
      return;
    }
    bots.refresh();
    onOpenChange(false);
    setOpenSettings(null);
    toastManager.add({ type: "success", title: gt("{name} was deleted", { name: botName }) });
    void navigate({ to: "/", replace: true });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T>
              Delete <Var>{botName}</Var>?
            </T>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T>
              This deletes the bot and everything it brought: its conversation, memory, rules,
              routines, decisions log and provider sign-in. It cannot be undone.
            </T>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5 px-6">
          <Label htmlFor={inputId}>{gt("Type {name} to confirm", { name: botName })}</Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run();
            }}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            <T>Cancel</T>
          </AlertDialogClose>
          <Button
            variant="destructive"
            disabled={!confirmed || deleting}
            onClick={() => void run()}
          >
            <T>Delete bot</T>
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
