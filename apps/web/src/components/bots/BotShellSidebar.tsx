import { useLocation, useNavigate } from "@tanstack/react-router";
import { T, useGT } from "gt-react";
import {
  BarChart3Icon,
  CalendarClockIcon,
  MessageCircleIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  SunIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { setAppearanceMode, useTheme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";
import { T3Wordmark } from "../T3Wordmark";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { BotAvatar } from "./BotAvatar";
import { formatRosterTime, useBotRoster, type BotRosterEntry } from "./useBotRoster";

/** A rail of places beside the bot roster; each bot lists its own chats. */
export function BotShellSidebar() {
  const gt = useGT();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { resolvedTheme } = useTheme();
  const nextAppearance = resolvedTheme === "dark" ? "light" : "dark";

  const isUnder = (base: string) => pathname === base || pathname.startsWith(`${base}/`);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <nav
        aria-label={gt("Main")}
        className="flex h-full w-14 shrink-0 flex-col items-center gap-1.5 pt-3 pb-3"
      >
        <RailButton
          label={gt("Bots")}
          icon={MessageCircleIcon}
          active={pathname.startsWith("/bots") || !pathname.startsWith("/settings")}
          onClick={() => void navigate({ to: "/" })}
        />
        <RailButton
          label={gt("Routines")}
          icon={CalendarClockIcon}
          active={isUnder("/settings/scheduled-tasks")}
          onClick={() => void navigate({ to: "/settings/scheduled-tasks" })}
        />
        <RailButton
          label={gt("Usage")}
          icon={BarChart3Icon}
          active={isUnder("/usage")}
          onClick={() => void navigate({ to: "/usage" })}
        />
        <div className="mt-auto flex flex-col items-center gap-1.5">
          <RailButton
            label={
              nextAppearance === "dark" ? gt("Switch to dark mode") : gt("Switch to light mode")
            }
            icon={nextAppearance === "dark" ? MoonIcon : SunIcon}
            onClick={() => setAppearanceMode(nextAppearance)}
          />
          <RailButton
            label={gt("Settings")}
            icon={SettingsIcon}
            active={isUnder("/settings") && !isUnder("/settings/scheduled-tasks")}
            onClick={() => void navigate({ to: "/settings" })}
          />
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 py-2 pr-2">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sidebar-border/70 bg-sidebar">
          <BotRoster pathname={pathname} />
        </div>
      </div>
    </div>
  );
}

function RailButton({
  label,
  icon: Icon,
  active = false,
  onClick,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly active?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-current={active || undefined}
            onClick={onClick}
            className={cn(
              "flex size-10 cursor-pointer items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active
                ? "bg-sidebar text-sidebar-foreground shadow-xs ring-1 ring-sidebar-border/70"
                : "text-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2 : 1.7} />
          </button>
        }
      />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

function BotRoster({ pathname }: { readonly pathname: string }) {
  const gt = useGT();
  const navigate = useNavigate();
  const { entries, loading } = useBotRoster();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const needle = query.trim().toLowerCase();
  const visible =
    needle === ""
      ? entries
      : entries.filter(
          (entry) =>
            entry.bot.name.toLowerCase().includes(needle) ||
            (entry.preview ?? "").toLowerCase().includes(needle),
        );

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-1 px-4">
        <T3Wordmark className="h-4 w-auto text-sidebar-foreground" aria-label="P4 Bot" />
        <span className="ml-1 font-medium text-sidebar-foreground text-sm">
          <T>Bot</T>
        </span>
        <div className="ml-auto flex items-center">
          <PanelIconButton
            label={gt("Search bots")}
            icon={SearchIcon}
            onClick={() => setSearching((open) => !open)}
          />
          <PanelIconButton
            label={gt("New bot")}
            icon={SquarePenIcon}
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
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {visible.map((entry) => (
          <RosterRow
            key={entry.bot.projectId}
            entry={entry}
            pathname={pathname}
            onSelect={() =>
              void navigate({
                to: "/bots/$projectId",
                params: { projectId: entry.bot.projectId },
              })
            }
          />
        ))}
        {!loading && entries.length === 0 ? (
          <li className="list-none px-2 py-6 text-center text-muted-foreground text-sm">
            {gt("No bots yet.")}{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-sidebar-foreground"
              onClick={() => void navigate({ to: "/bots" })}
            >
              {gt("Create one")}
            </button>
          </li>
        ) : null}
      </ul>
    </>
  );
}

function PanelIconButton({
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

function threadPath(thread: EnvironmentThreadShell): string {
  return `/${encodeURIComponent(thread.environmentId)}/${encodeURIComponent(thread.id)}`;
}

/** A bot is one conversation, like a contact in a messenger; its row opens that chat. */
function RosterRow({
  entry,
  pathname,
  onSelect,
}: {
  readonly entry: BotRosterEntry;
  readonly pathname: string;
  readonly onSelect: () => void;
}) {
  const gt = useGT();
  const active =
    pathname === `/bots/${entry.bot.projectId}` ||
    entry.threads.some((thread) => pathname === threadPath(thread));
  return (
    <li className="list-none">
      <button
        type="button"
        aria-current={active || undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
                className="shrink-0 text-muted-foreground text-xs tabular-nums"
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
    </li>
  );
}
