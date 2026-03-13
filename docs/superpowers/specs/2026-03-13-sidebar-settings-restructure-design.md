# Sidebar & Settings Restructure Design

## Summary

Simplify the sidebar by keeping only core navigation items (New Chat, Agents, Cron Jobs, Memory) and moving all configuration/monitoring pages (Skills, Channels, Browser, Logs, System) into an enlarged Settings dialog as separate tabs.

## Motivation

The sidebar currently has 8 navigation items plus New Chat, making it crowded. The core workflow items (chat, agents, cron, memory) deserve prominent sidebar placement, while configuration and monitoring pages are better suited to a Settings dialog accessed on demand.

## Design

### Sidebar (AppSidebar.tsx)

**Before:** 8 nav items (Agents, Cron Jobs, Memory, Skills, Channels, Browser, Logs, System)

**After:** 3 nav items:
- `/agents` — Bot icon — Agents
- `/cron` — CalendarClock icon — Cron Jobs
- `/memory` — Brain icon — Memory

Remove imports: `Puzzle`, `Radio`, `Globe`, `ScrollText` (no longer needed in sidebar).

New Chat button and bottom Settings button remain unchanged.

### Settings Dialog (SettingsDialog.tsx)

**Size change:** `w-[640px] h-[520px]` → `w-[90vw] max-w-5xl h-[85vh]`

**Tab type:** `"general" | "about"` → `"general" | "skills" | "channels" | "browser" | "logs" | "system" | "about"`

**Tab list (7 tabs):**
1. General — existing GeneralPanel
2. Skills — existing Skills page component
3. Channels — existing Channels page component
4. Browser — existing BrowserProfiles page component
5. Logs — existing Logs page component
6. System — existing System page component
7. About — existing AboutPanel

Each tab renders the corresponding page component directly. The page components are self-contained and require no modification.

Tab labels reuse existing i18n keys (`t.nav.skills`, `t.nav.channels`, etc.) for the moved pages.

### Routes (App.tsx)

Remove 5 routes and their imports:
- `/skills` → Skills
- `/channels` → Channels
- `/browser` → BrowserProfiles
- `/logs` → Logs
- `/system` → System

### Files Changed

| File | Change |
|------|--------|
| `web/src/components/layout/AppSidebar.tsx` | Remove 5 nav items, remove unused icon imports |
| `web/src/components/settings/SettingsDialog.tsx` | Enlarge dialog, add 5 tabs, import page components |
| `web/src/App.tsx` | Remove 5 routes and imports |

### No Changes Required

- Page components (Skills, Channels, BrowserProfiles, Logs, System) — used as-is
- i18n translations — reuse existing keys
- API client — no changes
- Backend — no changes

## Edge Cases

- Page components use `flex h-full` layout which will fill the dialog content area naturally
- System page's SSE connection lifecycle is managed by component mount/unmount — works correctly in dialog
- Skills/Channels pages have their own internal list+detail layout — these render fine inside the enlarged dialog
