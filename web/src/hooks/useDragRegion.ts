import type { MouseEventHandler } from "react"
import { isTauri } from "@/api/transport"

/**
 * Returns an onMouseDown handler that initiates window dragging via Tauri API.
 * Attach to any element to make it a drag handle — no extra DOM needed.
 * Only left-click triggers drag. No-op in web mode.
 */
export function useDragRegion(): { onMouseDown: MouseEventHandler } {
  const onMouseDown: MouseEventHandler = (e) => {
    // Only left click, ignore if clicking interactive elements
    if (!isTauri || e.button !== 0) return
    const tag = (e.target as HTMLElement).closest("button, a, input, select, textarea, [role=button]")
    if (tag) return
    e.preventDefault()
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().startDragging()
    })
  }
  return { onMouseDown }
}
