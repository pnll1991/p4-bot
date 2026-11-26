import { cn } from "../../lib/utils";

const PALETTE = ["#f59e0b", "#f97316", "#ec4899", "#22c55e", "#3b82f6", "#a855f7", "#14b8a6"];

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(value);
}

/** A bot's face: a small robot head whose color is stable per bot. */
export function BotAvatar({
  seed,
  name,
  className,
}: {
  readonly seed: string;
  readonly name: string;
  readonly className?: string;
}) {
  const color = PALETTE[hash(seed) % PALETTE.length];
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label={name}
      className={cn("size-10 shrink-0", className)}
    >
      <line x1="20" y1="3" x2="20" y2="9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="3.5" r="2.5" fill={color} />
      <rect x="4" y="9" width="32" height="28" rx="11" fill={color} />
      <ellipse cx="14.5" cy="22" rx="2.2" ry="3" className="fill-black" />
      <ellipse cx="25.5" cy="22" rx="2.2" ry="3" className="fill-black" />
      <ellipse cx="13.8" cy="21" rx="0.7" ry="0.9" className="fill-white" />
      <ellipse cx="24.8" cy="21" rx="0.7" ry="0.9" className="fill-white" />
    </svg>
  );
}
