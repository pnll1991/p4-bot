import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  BarChart3Icon,
  CalendarClockIcon,
  ChevronRightIcon,
  EllipsisIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  MoonIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { setAppearanceMode, useTheme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";
import { botEnvironment } from "../../state/bots";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { T3Wordmark } from "../T3Wordmark";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BotAvatar } from "./BotAvatar";
import { BotDeleteDialog, BotStartOverDialog, openBotSettings } from "./BotDialogs";
import { formatRosterTime, useBotRoster, type BotRosterEntry } from "./useBotRoster";

/**
 * The bot list, laid out like a messenger: pinned bots as faces on top, then the owner's
 * groups, then hidden bots folded away. App-wide places sit in a small footer.
 */
export function BotShellSidebar() {
  const gt = useGT();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { resolvedTheme } = useTheme();
  const nextAppearance = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <BotRoster pathname={pathname} />
      <footer className="flex shrink-0 items-center gap-0.5 border-sidebar-border/70 border-t px-2 py-2">
        <FooterButton
          label={gt("Settings")}
          icon={SettingsIcon}
          onClick={() => void navigate({ to: "/settings" })}
        />
        <FooterButton
          label={gt("Routines")}
          icon={CalendarClockIcon}
          onClick={() => void navigate({ to: "/settings/scheduled-tasks" })}
        />
        <FooterButton
          label={gt("Usage")}
          icon={BarChart3Icon}
          onClick={() => void navigate({ to: "/usage" })}
        />
        <span className="flex-1" />
        <FooterButton
          label={nextAppearance === "dark" ? gt("Switch to dark mode") : gt("Switch to light mode")}
          icon={nextAppearance === "dark" ? MoonIcon : SunIcon}
          onClick={() => setAppearanceMode(nextAppearance)}
        />
      </footer>
    </div>
  );
}

function FooterButton({
  label,
  icon: Icon,
  onClick,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Icon className="size-4" strokeWidth={1.8} />
          </button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

function threadPath(thread: EnvironmentThreadShell): string {
  return `/${encodeURIComponent(thread.environmentId)}/${encodeURIComponent(thread.id)}`;
}

function isOpen(entry: BotRosterEntry, pathname: string): boolean {
  return (
    pathname === `/bots/${entry.bot.projectId}` ||
    entry.threads.some((thread) => pathname === threadPath(thread))
  );
}

function BotRoster({ pathname }: { readonly pathname: string }) {
  const gt = useGT();
  const navigate = useNavigate();
  const { environmentId, entries, loading } = useBotRoster();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const needle = query.trim().toLowerCase();
  const matching =
    needle === ""
      ? entries
      : entries.filter(
          (entry) =>
            entry.bot.name.toLowerCase().includes(needle) ||
            (entry.preview ?? "").toLowerCase().includes(needle),
        );
  const shown = matching.filter((entry) => entry.bot.hidden !== true);
  const hidden = matching.filter((entry) => entry.bot.hidden === true);
  // Searching lists every match in one place; pins and groups are for browsing.
  const pinned = needle === "" ? shown.filter((entry) => entry.bot.pinned === true) : [];
  const listed = needle === "" ? shown.filter((entry) => entry.bot.pinned !== true) : shown;
  const groupNames = [
    ...new Set(entries.flatMap((entry) => (entry.bot.group ? [entry.bot.group] : []))),
  ].toSorted((left, right) => left.localeCompare(right));
  const grouped = groupNames
    .map((name) => ({ name, entries: listed.filter((entry) => entry.bot.group === name) }))
    .filter((group) => group.entries.length > 0);
  const ungrouped = listed.filter((entry) => !entry.bot.group);
  const open = (entry: BotRosterEntry) =>
    void navigate({ to: "/bots/$projectId", params: { projectId: entry.bot.projectId } });

  if (environmentId === null) return <div className="flex-1" />;
  const rowProps = { environmentId, pathname, groupNames, onSelect: open };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-1 px-4">
        <T3Wordmark className="h-4 w-auto text-sidebar-foreground" aria-label="P4 Bot" />
        <span className="ml-1 font-medium text-sidebar-foreground text-sm">
          <T>Bot</T>
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <HeaderIconButton
            label={gt("Search bots")}
            icon={SearchIcon}
            onClick={() => setSearching((value) => !value)}
          />
          <HeaderIconButton
            label={gt("New bot")}
            icon={PlusIcon}
            onClick={() => void navigate({ to: "/bots" })}
          />
        </div>
      </div>
      {searching ? (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                setSearching(false);
              }
            }}
            placeholder={gt("Search bots")}
            className="h-8 w-full rounded-lg bg-sidebar-row-hover px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-3">
        {pinned.length > 0 ? (
          <ul className="grid grid-cols-4 gap-1 px-1 pt-1">
            {pinned.map((entry) => (
              <PinnedBot
                key={entry.bot.projectId}
                entry={entry}
                active={isOpen(entry, pathname)}
                onSelect={() => open(entry)}
              />
            ))}
          </ul>
        ) : null}

        {ungrouped.length > 0 ? (
          <BotSection title={grouped.length > 0 ? gt("Unassigned") : null}>
            {ungrouped.map((entry) => (
              <RosterRow key={entry.bot.projectId} entry={entry} {...rowProps} />
            ))}
          </BotSection>
        ) : null}

        {grouped.map((group) => (
          <BotSection key={group.name} title={group.name}>
            {group.entries.map((entry) => (
              <RosterRow key={entry.bot.projectId} entry={entry} {...rowProps} />
            ))}
          </BotSection>
        ))}

        {hidden.length > 0 ? (
          <div className="flex flex-col">
            <button
              type="button"
              aria-expanded={showHidden}
              onClick={() => setShowHidden((value) => !value)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-left text-muted-foreground text-xs hover:text-sidebar-foreground"
            >
              <ChevronRightIcon className={cn("size-3.5", showHidden && "rotate-90")} />
              <span className="flex-1">
                <T>Hidden bots</T>
              </span>
              <span className="tabular-nums">{hidden.length}</span>
            </button>
            {showHidden ? (
              <ul className="flex flex-col gap-0.5">
                {hidden.map((entry) => (
                  <RosterRow key={entry.bot.projectId} entry={entry} {...rowProps} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {!loading && entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-sm">
            {gt("No bots yet.")}{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-sidebar-foreground"
              onClick={() => void navigate({ to: "/bots" })}
            >
              {gt("Create one")}
            </button>
          </p>
        ) : null}
      </div>
    </>
  );
}

function HeaderIconButton({
  label,
  icon: Icon,
  onClick,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/80 outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Icon className="size-4.5" strokeWidth={1.8} />
          </button>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

function BotSection({
  title,
  children,
}: {
  readonly title: string | null;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-0.5">
      {title ? <h3 className="px-2 pb-0.5 text-muted-foreground text-xs">{title}</h3> : null}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

/** A pinned bot is a face to tap, like a favourite contact. */
function PinnedBot({
  entry,
  active,
  onSelect,
}: {
  readonly entry: BotRosterEntry;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const gt = useGT();
  return (
    <li className="list-none">
      <button
        type="button"
        aria-current={active || undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active ? "bg-sidebar-row-active" : "hover:bg-sidebar-row-hover",
        )}
      >
        <span className="relative">
          <BotAvatar
            seed={entry.bot.providerInstanceId}
            name={entry.bot.name}
            className="size-11"
          />
          {entry.needsYou || (entry.unread && !active) ? (
            <span
              role="img"
              aria-label={entry.needsYou ? gt("Needs you") : gt("Unread")}
              className={cn(
                "absolute -right-px -bottom-px size-2.5 rounded-full ring-2 ring-sidebar",
                entry.needsYou ? "bg-warning" : "bg-primary",
              )}
            />
          ) : null}
        </span>
        <span className="max-w-full truncate text-sidebar-foreground text-xs">
          {entry.bot.name}
        </span>
      </button>
    </li>
  );
}

/** A bot is one conversation, like a contact in a messenger; its row opens that chat. */
function RosterRow({
  environmentId,
  entry,
  pathname,
  groupNames,
  onSelect,
}: {
  readonly environmentId: EnvironmentId;
  readonly entry: BotRosterEntry;
  readonly pathname: string;
  readonly groupNames: ReadonlyArray<string>;
  readonly onSelect: (entry: BotRosterEntry) => void;
}) {
  const gt = useGT();
  const arrange = useAtomCommand(botEnvironment.arrange, { reportFailure: false });
  const bots = useEnvironmentQuery(botEnvironment.list({ environmentId, input: {} }));
  const [dialog, setDialog] = useState<"start-over" | "delete" | "new-group" | null>(null);
  const target = { environmentId, projectId: entry.bot.projectId };
  const active = isOpen(entry, pathname);

  const update = async (changes: {
    readonly group?: string | null;
    readonly pinned?: boolean;
    readonly hidden?: boolean;
  }) => {
    await arrange({ environmentId, input: { projectId: entry.bot.projectId, ...changes } });
    bots.refresh();
  };

  return (
    <li className="group/bot relative list-none">
      <button
        type="button"
        aria-current={active || undefined}
        onClick={() => onSelect(entry)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-2 py-2 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active ? "bg-sidebar-row-active" : "hover:bg-sidebar-row-hover",
        )}
      >
        <span className="relative shrink-0">
          <BotAvatar seed={entry.bot.providerInstanceId} name={entry.bot.name} />
          {entry.needsYou ? (
            <span className="absolute -right-px -bottom-px size-2.5 rounded-full bg-warning ring-2 ring-sidebar" />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-semibold text-sidebar-foreground text-sm">
              {entry.bot.name}
            </span>
            <span className="flex-1" />
            {entry.unread && !active ? (
              <span
                role="img"
                aria-label={gt("Unread")}
                className="size-2 shrink-0 rounded-full bg-primary"
              />
            ) : null}
            {entry.lastActivityAt ? (
              <time
                dateTime={entry.lastActivityAt}
                className="shrink-0 text-muted-foreground text-xs tabular-nums group-hover/bot:opacity-0"
              >
                {formatRosterTime(entry.lastActivityAt)}
              </time>
            ) : null}
          </span>
          <span
            className={cn(
              "truncate text-sm",
              entry.unread && !active ? "text-sidebar-foreground" : "text-muted-foreground",
            )}
          >
            {entry.working ? (
              <span className="italic">{gt("Working…")}</span>
            ) : (
              <>
                {entry.previewIsYours && entry.preview ? `${gt("You")}: ` : ""}
                {entry.preview ?? entry.bot.persona}
              </>
            )}
          </span>
        </span>
      </button>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={gt("Actions for {name}", { name: entry.bot.name })}
              className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-hover/bot:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
            >
              <EllipsisIcon className="size-4" />
            </button>
          }
        />
        <MenuPopup align="end">
          <MenuItem onClick={() => void update({ pinned: entry.bot.pinned !== true })}>
            {entry.bot.pinned ? <PinOffIcon /> : <PinIcon />}
            {entry.bot.pinned ? gt("Unpin") : gt("Pin to top")}
          </MenuItem>
          <MenuSub>
            <MenuSubTrigger>
              <FolderIcon />
              {gt("Move to group")}
            </MenuSubTrigger>
            <MenuSubPopup>
              {groupNames.map((name) => (
                <MenuItem
                  key={name}
                  disabled={entry.bot.group === name}
                  onClick={() => void update({ group: name })}
                >
                  {name}
                </MenuItem>
              ))}
              {groupNames.length > 0 ? <MenuSeparator /> : null}
              <MenuItem onClick={() => setDialog("new-group")}>
                <PlusIcon />
                {gt("New group…")}
              </MenuItem>
              {entry.bot.group ? (
                <MenuItem onClick={() => void update({ group: null })}>
                  {gt("Remove from group")}
                </MenuItem>
              ) : null}
            </MenuSubPopup>
          </MenuSub>
          <MenuItem onClick={() => void update({ hidden: entry.bot.hidden !== true })}>
            {entry.bot.hidden ? <EyeIcon /> : <EyeOffIcon />}
            {entry.bot.hidden ? gt("Show bot") : gt("Hide bot")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => openBotSettings(target)}>
            <SettingsIcon />
            {gt("Bot settings")}
          </MenuItem>
          <MenuItem onClick={() => setDialog("start-over")}>
            <RotateCcwIcon />
            {gt("Start over")}
          </MenuItem>
          <MenuItem variant="destructive" onClick={() => setDialog("delete")}>
            <Trash2Icon />
            {gt("Delete bot")}
          </MenuItem>
        </MenuPopup>
      </Menu>
      <NewGroupDialog
        open={dialog === "new-group"}
        onOpenChange={(open) => setDialog(open ? "new-group" : null)}
        onCreate={(name) => void update({ group: name })}
      />
      <BotStartOverDialog
        target={target}
        botName={entry.bot.name}
        threadIds={entry.threads.map((thread) => thread.id)}
        open={dialog === "start-over"}
        onOpenChange={(open) => setDialog(open ? "start-over" : null)}
      />
      <BotDeleteDialog
        target={target}
        botName={entry.bot.name}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
      />
    </li>
  );
}

/** Groups exist only through the bots in them, so naming one moves this bot into it. */
function NewGroupDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (name: string) => void;
}) {
  const gt = useGT();
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    onCreate(trimmed.slice(0, 60));
    setName("");
    onOpenChange(false);
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T>New group</T>
          </AlertDialogTitle>
        </AlertDialogHeader>
        <div className="px-6">
          <Input
            autoFocus
            value={name}
            placeholder={gt("e.g. Marketing")}
            aria-label={gt("Group name")}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            <T>Cancel</T>
          </AlertDialogClose>
          <Button disabled={name.trim() === ""} onClick={submit}>
            <T>Create group</T>
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
