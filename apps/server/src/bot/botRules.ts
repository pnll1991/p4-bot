import type { BotRule } from "@t3tools/contracts";

/**
 * Always on for every Bot: actions an unattended agent should never take, however the owner
 * answers. Approval fatigue makes people approve without reading, so these never reach them.
 * They catch the common spellings of each action, not every way a shell can express it.
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
  { pattern: ".ssh", label: "Touches SSH keys" },
  { pattern: ".aws/credentials", label: "Touches cloud credentials" },
];

/** Lowercased, quotes and escapes dropped, whitespace collapsed, no spaces around operators. */
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/["'`\\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ?([|;&<>]) ?/g, "$1");

const PREFIX_COMMANDS = new Set(["sudo", "doas", "env", "command", "exec", "nohup", "time"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const HOME_ALIASES = new Set(["$home", "${home}"]);

/**
 * The risky commands in normalized text, rewritten to the one spelling the built-in rules name:
 * `rm -r -f`, `rm --recursive --force` and `rm -fr` become `rm -rf`, a force flag anywhere in a
 * `git push` becomes `git push --force`, and a pipe into `/bin/bash` becomes `|bash`.
 */
const canonicalCommands = (normalized: string): ReadonlyArray<string> => {
  const found: Array<string> = [];
  const parts = normalized.split(/([;&|\n]|\$\()/);
  for (let index = 0; index < parts.length; index += 2) {
    const tokens = (parts[index] ?? "").trim().split(" ").filter(Boolean);
    while (
      tokens.length > 0 &&
      (PREFIX_COMMANDS.has(tokens[0]!) || /^[a-z_][a-z0-9_]*=/.test(tokens[0]!))
    ) {
      tokens.shift();
    }
    const command = tokens[0]?.split("/").at(-1);
    const args = tokens.slice(1);
    if (parts[index - 1] === "|" && command !== undefined && SHELLS.has(command)) {
      found.push(`|${command}`);
    }
    if (command === "rm") {
      const flags = args.filter((arg) => arg.startsWith("-"));
      const recursive = flags.some((flag) => flag === "--recursive" || /^-[a-z]*r/.test(flag));
      const force = flags.some((flag) => flag === "--force" || /^-[a-z]*f/.test(flag));
      if (recursive && force) {
        const targets = args
          .filter((arg) => !arg.startsWith("-"))
          .map((arg) => (HOME_ALIASES.has(arg) ? "~" : arg));
        found.push(`rm -rf ${targets.join(" ")}`);
      }
    }
    if (
      command === "git" &&
      args[0] === "push" &&
      args.some((arg) => arg === "-f" || arg.startsWith("--force") || arg.startsWith("+"))
    ) {
      found.push("git push --force");
    }
  }
  return found;
};

const WORD = /[a-z0-9_]/;

/** True when the pattern is whole words: "sudo " never matches "pseudo", nor "|sh" "|shasum". */
const includesAsWords = (haystack: string, pattern: string): boolean => {
  const checkStart = WORD.test(pattern[0] ?? "");
  const checkEnd = WORD.test(pattern.at(-1) ?? "");
  for (let at = haystack.indexOf(pattern); at !== -1; at = haystack.indexOf(pattern, at + 1)) {
    const before = haystack[at - 1];
    const after = haystack[at + pattern.length];
    const startOk = !checkStart || before === undefined || !WORD.test(before);
    const endOk = !checkEnd || after === undefined || !WORD.test(after);
    if (startOk && endOk) return true;
  }
  return false;
};

const appliesTo = (rule: BotRule, kind: string) =>
  rule.kinds === undefined || rule.kinds.some((ruleKind) => ruleKind === kind);

/**
 * The first rule that blocks this request, or null when the owner decides. Built-in rules match
 * whole words; the owner's rules match anywhere, as "Block actions containing…" says.
 */
export function matchBotRule(
  ownRules: ReadonlyArray<BotRule>,
  request: { readonly kind: string; readonly text: string },
): BotRule | null {
  const normalized = normalize(request.text);
  const haystack = [normalized, ...canonicalCommands(normalized)].join("\n");
  return (
    BUILT_IN_BOT_RULES.find(
      (rule) => appliesTo(rule, request.kind) && includesAsWords(haystack, normalize(rule.pattern)),
    ) ??
    ownRules.find(
      (rule) => appliesTo(rule, request.kind) && haystack.includes(normalize(rule.pattern)),
    ) ??
    null
  );
}
