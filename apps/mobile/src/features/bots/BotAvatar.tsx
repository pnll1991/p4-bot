import Svg, { Circle, Ellipse, Line, Rect } from "react-native-svg";

// Same palette and hash as the web BotAvatar, so a bot has one color on every surface.
const PALETTE = ["#f59e0b", "#f97316", "#ec4899", "#22c55e", "#3b82f6", "#a855f7", "#14b8a6"];
const EYE = "#111111";
const GLINT = "#ffffff";

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
  size = 40,
}: {
  readonly seed: string;
  readonly name: string;
  readonly size?: number;
}) {
  const color = PALETTE[hash(seed) % PALETTE.length];
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityLabel={name}>
      <Line x1="20" y1="3" x2="20" y2="9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="20" cy="3.5" r="2.5" fill={color} />
      <Rect x="4" y="9" width="32" height="28" rx="11" fill={color} />
      <Ellipse cx="14.5" cy="22" rx="2.2" ry="3" fill={EYE} />
      <Ellipse cx="25.5" cy="22" rx="2.2" ry="3" fill={EYE} />
      <Ellipse cx="13.8" cy="21" rx="0.7" ry="0.9" fill={GLINT} />
      <Ellipse cx="24.8" cy="21" rx="0.7" ry="0.9" fill={GLINT} />
    </Svg>
  );
}
