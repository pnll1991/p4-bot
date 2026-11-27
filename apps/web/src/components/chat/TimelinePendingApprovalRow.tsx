import {
  FULL_ACCESS_OVERRIDE_QUESTION,
  fullAccessOverrideExplanation,
  PUSH_HOOKS_APPROVAL_LABEL,
  PUSH_HOOKS_APPROVAL_QUESTION,
} from "@t3tools/client-runtime/state/thread-requests";
import { msg, T, useGT, useMessages } from "gt-react";
import { ShieldIcon } from "lucide-react";
import { memo, use, useState, type ReactNode } from "react";
import { type PendingApproval } from "../../session-logic";
import { InlineButton } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ApprovalText } from "./ApprovalText";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { PushHooksApprovalDetails } from "./PushHooksApprovalDetails";
import { ToolActivityIconView, type WorkEntryIconName } from "./TimelineToolActivityIcon";
import { TimelineRowCtx } from "./timelineRowContext";
import { WorkLogRow } from "./WorkLog";

const APPROVAL_PRESENTATION = {
  command: {
    icon: "terminal",
    label: msg("Command approval"),
    detailLabel: msg("Command", { $context: "noun, shell command awaiting approval" }),
  },
  "file-change": {
    icon: "square-pen",
    label: msg("File change approval"),
    detailLabel: msg("File change"),
  },
  "file-read": { icon: "eye", label: msg("File read approval"), detailLabel: msg("File to read") },
  permission: {
    icon: "wrench",
    label: msg("App permission approval"),
    detailLabel: msg("Permission request"),
  },
  "mcp-elicitation": {
    icon: "hammer",
    label: msg("App access approval"),
    detailLabel: msg("App access request"),
  },
} satisfies Record<
  PendingApproval["requestKind"],
  { icon: WorkEntryIconName; label: string; detailLabel: string }
>;

export const TimelinePendingApprovalRow = memo(function TimelinePendingApprovalRow({
  approval,
}: {
  approval: PendingApproval;
}) {
  const { respondingRequestIds, canOperateThread, onRespondToApproval } = use(TimelineRowCtx);
  const m = useMessages();
  const gt = useGT();
  const presentation = APPROVAL_PRESENTATION[approval.requestKind];
  // P4 Bot's own question reads as the app asking: a plain sentence, then what it names.
  const { pushHooks } = approval;
  const label = pushHooks ? PUSH_HOOKS_APPROVAL_LABEL : presentation.label;
  const canRespond = approval.responseCapability === "live";
  // A tool's argument list can run long; the tool's own row above already names what runs.
  const compact = approval.detailIsArgumentList === true && !pushHooks;
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Bot chats show no tool row above the card, so the card itself says what it would do.
  const heading =
    approval.botMessageTo === undefined
      ? approval.title
      : gt("Message to {name}", {
          name: approval.botMessageTo,
          $context: "a bot asks to send a message to another bot",
        });
  const actions = (separatorBefore: ReactNode) =>
    onRespondToApproval ? (
      <>
        {separatorBefore}
        <ComposerPendingApprovalActions
          presentation="inline"
          requestId={approval.requestId}
          disabled={!canOperateThread}
          isResponding={respondingRequestIds.includes(approval.requestId)}
          canRespond={canRespond}
          options={approval.options}
          onRespondToApproval={onRespondToApproval}
        />
      </>
    ) : null;
  const dot = (
    <span aria-hidden className="text-muted-foreground">
      ·
    </span>
  );
  const goneNotice = (
    <span className="text-warning">
      <T>Provider process is gone. Interrupt or restart the run to respond.</T>
    </span>
  );
  const fullAccessOverride = approval.fullAccessOverride ? (
    <Popover>
      <PopoverTrigger openOnHover render={<InlineButton tone="muted" />}>
        {m(FULL_ACCESS_OVERRIDE_QUESTION)}
      </PopoverTrigger>
      <PopoverPopup
        aria-label={m(FULL_ACCESS_OVERRIDE_QUESTION)}
        tooltipStyle
        side="top"
        className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal"
      >
        {fullAccessOverrideExplanation(approval.fullAccessOverride, m)}
      </PopoverPopup>
    </Popover>
  ) : null;
  const notes = (
    <>
      {approval.appName ? (
        <span className="text-muted-foreground wrap-anywhere">{approval.appName}</span>
      ) : null}
      {approval.reason ? (
        <span className="text-muted-foreground select-text wrap-anywhere">{approval.reason}</span>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <WorkLogRow
        role="group"
        aria-label={m(label)}
        data-v2-item-type="approval_request"
        wrapLabel
        icon={<ShieldIcon aria-hidden className="block size-3.5 shrink-0 text-warning" />}
        label={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {heading ? (
              <>
                <span className="min-w-0 text-foreground wrap-anywhere">{heading}</span>
                {dot}
              </>
            ) : null}
            {canRespond ? actions(null) : goneNotice}
            {dot}
            <InlineButton
              tone="muted"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? <T>Hide details</T> : <T>Details</T>}
            </InlineButton>
            {fullAccessOverride}
          </span>
        }
      >
        {detailsOpen || approval.appName || approval.reason ? (
          <div className="ms-7.5 flex min-w-0 flex-col gap-1 pb-1 text-xs">
            {detailsOpen ? (
              <ApprovalText text={approval.detail ?? ""} label={m(presentation.detailLabel)} />
            ) : null}
            {notes}
          </div>
        ) : null}
      </WorkLogRow>
    );
  }

  return (
    <WorkLogRow
      role="group"
      aria-label={m(label)}
      data-v2-item-type="approval_request"
      wrapLabel
      icon={
        <ToolActivityIconView
          icon={undefined}
          fallbackName={pushHooks ? "terminal" : presentation.icon}
          className="block size-4 shrink-0 stroke-2 text-icon-muted"
          muted
        />
      }
      label={
        pushHooks ? (
          <span className="block min-w-0 text-foreground select-text! wrap-anywhere">
            {m(PUSH_HOOKS_APPROVAL_QUESTION)}
          </span>
        ) : (
          <ApprovalText
            text={approval.detail || m(presentation.label)}
            label={m(presentation.detailLabel)}
          />
        )
      }
    >
      <div className="ms-7.5 flex min-w-0 flex-col gap-1 pb-1 text-xs">
        {pushHooks ? <PushHooksApprovalDetails pushHooks={pushHooks} /> : null}
        {notes}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {canRespond ? (
            <>
              <span className="inline-flex items-center gap-1 text-warning">
                <ShieldIcon aria-hidden className="size-3 shrink-0" />
                <T>Waiting for approval</T>
              </span>
              {actions(dot)}
            </>
          ) : (
            goneNotice
          )}
          {fullAccessOverride}
        </div>
      </div>
    </WorkLogRow>
  );
});
