import type { BotRule } from "@t3tools/contracts";

/**
 * Always on for every Bot: actions an unattended agent should never take, however the owner
 * answers. Approval fatigue makes people approve without reading, so these never reach them.
 */
export const BUILT_IN_BOT_RULES: ReadonlyArray<BotRule> = [
  { pattern: "sudo ", kinds: ["command"], label: "Runs as root" },
  { pattern: "rm -rf /", kinds: ["command"], label: "Deletes from the filesystem root" },
  { pattern: "rm -rf ~", kinds: ["command"], label: "Deletes the home folder" },
  { pattern: "| sh", kinds: ["command"], label: "Pipes a download into a shell" },
  { pattern: "| bash", kinds: ["command"], label: "Pipes a download into a shell" },
  { pattern: "git push --force", kinds: ["command"], label: "Force-pushes over history" },
  { pattern: "git push -f", kinds: ["command"], label: "Force-pushes over history" },
  { pattern: "mkfs", kinds: ["command"], label: "Formats a disk" },
  { pattern: "dd if=", kinds: ["command"], label: "Writes raw disk data" },
  { pattern: "chmod -R 777", kinds: ["command"], label: "Opens every permission" },
  { pattern: ".ssh/", label: "Touches SSH keys" },
  { pattern: ".aws/credentials", label: "Touches cloud credentials" },
];

/** The first rule that blocks this request, or null when the owner decides. */
export function matchBotRule(
  rules: ReadonlyArray<BotRule>,
  request: { readonly kind: string; readonly text: string },
): BotRule | null {
  const text = request.text.toLowerCase();
  return (
    rules.find(
      (rule) =>
        (rule.kinds === undefined || rule.kinds.some((kind) => kind === request.kind)) &&
        text.includes(rule.pattern.toLowerCase()),
    ) ?? null
  );
}
