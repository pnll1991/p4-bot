import { T } from "gt-react";
import { cn } from "~/lib/utils";

import { CommandBlock } from "./CommandBlock";

/**
 * Setup steps for another computer: build `t3` from P4 Bot's source, then run `command`. P4 Bot
 * publishes no installer, and the upstream install scripts would install T3 Code instead.
 */
export function InstallT3Commands({
  command,
  className,
}: {
  readonly command: string;
  readonly className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <CommandBlock command="git clone https://github.com/pnll1991/p4-bot && cd p4-bot && vp i && vp run build:desktop" />
      <p className="text-xs text-muted-foreground">
        <T>Then</T>
      </p>
      <CommandBlock command={command} />
      <p className="text-xs text-muted-foreground">
        <T>
          Skip the build if you already have P4 Bot's <code className="font-mono">t3</code>.
          Building needs <code className="font-mono">vp</code> (Vite+).
        </T>
      </p>
    </div>
  );
}
