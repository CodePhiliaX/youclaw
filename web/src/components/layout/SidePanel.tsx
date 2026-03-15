import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function SidePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-[260px] shrink-0 border-r border-[var(--subtle-border)] flex flex-col",
        className,
      )}
    >
      {children}
    </div>
  );
}
