const APPROVAL_TARGET_KEYS = ["command", "cmd", "path", "file_path", "filePath", "url"] as const;

/**
 * Some providers (Pi) send a tool's raw JSON arguments as the approval prompt. Show what is being
 * approved instead: the command, the file or the URL, or one "key: value" line per argument.
 */
export function readableApprovalPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("{")) return prompt;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return prompt;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return prompt;
  const args = parsed as Record<string, unknown>;
  for (const key of APPROVAL_TARGET_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}
