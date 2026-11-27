const APPROVAL_TARGET_KEYS = ["command", "cmd", "path", "file_path", "filePath", "url"] as const;

/**
 * Some providers (Pi) send a tool's raw JSON arguments as the approval prompt. Show what is being
 * approved instead: the command, the file or the URL, or one "key: value" line per argument.
 */
export function readableApprovalPrompt(prompt: string): string {
  return readApprovalPrompt(prompt).text;
}

/** `argumentList` is set when no command, file or URL was found and `text` lists every argument. */
export function readApprovalPrompt(prompt: string): { text: string; argumentList: boolean } {
  const asIs = { text: prompt, argumentList: false };
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("{")) return asIs;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return asIs;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return asIs;
  const args = parsed as Record<string, unknown>;
  for (const key of APPROVAL_TARGET_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim() !== "")
      return { text: value, argumentList: false };
  }
  const text = Object.entries(args)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
  return { text, argumentList: true };
}

/**
 * The bot a `p4_bot_message` approval writes to. The provider titles it with the raw tool name
 * (Pi: "Allow mcp__t3-code__p4_bot_message?"), so the card names the recipient instead.
 */
export function botMessageRecipient(
  title: string | null | undefined,
  prompt: string,
): string | null {
  if (title == null || !/(?:^|[^a-z0-9_]|__)p4_bot_message(?![a-z0-9_])/.test(title)) return null;
  try {
    const args: unknown = JSON.parse(prompt.trim());
    if (typeof args !== "object" || args === null || !("to" in args)) return null;
    return typeof args.to === "string" && args.to.trim() !== "" ? args.to.trim() : null;
  } catch {
    return null;
  }
}

/** The provider's title without MCP server prefixes: "Allow mcp__t3-code__x?" reads "Allow x?". */
export function readableApprovalTitle(title: string): string {
  return title.replace(/\bmcp__[^\s_]+(?:_[^\s_]+)*?__/g, "");
}
