# Task 11 — Frontend HIGH/Medium bug-fix pass

**Agent:** Z.ai Code (frontend bugfix agent)
**Task ID:** 11
**Date:** 2025 (run on demand)
**Scope:** Frontend-only fixes for Cryptalk web client (Next.js 16 + React 19 + TS).
**Backend:** NOT touched (socket `identify`-requires-`token` contract already
in place server-side — this task only makes the client speak it).

## Files changed (10)

| File | Fixes |
|------|-------|
| `src/hooks/use-socket.ts` | X5 (token in identify) + F4 (dup disconnect listener) + auth-error handler |
| `src/components/chat/message-item.tsx` | F1 (starred state init+sync) |
| `src/components/error-boundary.tsx` | F2 (export `fallback` prop) |
| `src/components/chat/message-list.tsx` | F2 (per-message boundary) |
| `src/components/chat/message-input.tsx` | F3 (mic cleanup on unmount) + F9 (typing-timer cleanup) |
| `src/lib/api.ts` | F5 (buildUrl dangling separator) |
| `src/stores/chat-store.ts` | F6 (presence Set re-alloc) |
| `src/components/chat/chat-window.tsx` | F7 (in-chat search debounce 250ms) |
| `src/components/chat/chat-list.tsx` | F12 (prefetch stale-chat check) + F13 (silent error swallow) |

## Lint result

`cd /home/z/my-project/frontend && bun run lint` → **0 NEW errors**.
Pre-existing baseline (verified via `git stash` + lint):

```
src/components/chat/connections-panel.tsx
  33:5  error  Cannot access variable before it is declared (`loadData` hoisting)
```

That's the only remaining error and it predates this task.

## TypeScript check

`npx tsc --noEmit` → 24 errors before AND after my changes (all pre-existing
module/type issues: missing `socket.io-client`, `libsodium-wrappers`, lottie,
etc.). No new TS errors introduced.

## Dev server log

`/home/z/my-project/dev.log` last lines: `✓ Compiled in 867ms`. No new
compile errors.

## Per-fix summary

### X5 (socket auth) + F4 (dup listener) — `use-socket.ts`
- Added `readSessionToken()` reading `tc_session` from `document.cookie`.
- `identify` emit now sends `{ token, username }` (userId no longer sent).
- New `auth-error` listener: disconnect, null socket, clear `initialised`,
  `setCurrentUser(null)`, `window.location.assign('/')` for hard reset.
- Deleted the duplicate `socket.on('disconnect', ...)` at the bottom of the
  effect (kept the one next to `connect`).

### F1 (starred sync) — `message-item.tsx`
- `useState(() => !!message.starred)` for initial value.
- `useEffect(() => setStarred(!!message.starred), [message.starred])` for
  follow-up syncs.

### F2 (per-message boundary) — `error-boundary.tsx` + `message-list.tsx`
- `ErrorBoundary` accepts `fallback?: ReactNode`. If set, renders it on
  error; otherwise the original full-screen UI (global boundary unchanged).
- Each `<MessageItem>` wrapped in
  `<ErrorBoundary fallback={<MessageErrorFallback />}>`. Fallback is a
  small dashed muted bubble: "This message couldn't be displayed".

### F3 (mic cleanup) — `message-input.tsx`
- `recordingRef` mirrors `recording` via useEffect.
- Unmount-only `useEffect(() => { return () => {…} }, [])` cleanup: if
  `recordingRef.current`, stop the `MediaRecorder`, stop every track on its
  stream, clear `recordTimer`. Wrapped in try/catch.

### F9 (typing-timer cleanup) — `message-input.tsx`
- Same unmount cleanup also clears `typingTimer.current` (the 2s
  `emitTyping(false)` timeout).

### F5 (buildUrl) — `lib/api.ts`
- `BACKEND_URL` set → `${BACKEND_URL}${path}` (no trailing separator).
- Else (gateway path) → `${path}${sep}XTransformPort=…` (unchanged).

### F6 (presence Set) — `chat-store.ts`
- `setOnlineUserIds`: shallow-equal check before swapping (same size + all
  elements present → no-op).
- `setUserOnline`: no-op if already in desired state.

### F7 (in-chat search debounce) — `chat-window.tsx`
- `runSearch(q)` only sets `searchQuery` (+ clears results when empty).
- New `useEffect([searchQuery, activeChatId])` schedules `searchInChat` in
  a 250ms `setTimeout`; `cancelled` flag guards the async state writes.
- Empty-query branch lives in `runSearch` (not the effect) to avoid
  tripping `react-hooks/set-state-in-effect`.

### F12 (prefetch stale-chat check) — `chat-list.tsx`
- `prefetchChat` captures `chat.id` as `chatId`.
- `switchedAway()` returns `activeChatId !== null && activeChatId !== chatId`.
  (`null` = no chat open, treated as "still here" to preserve hover-prefetch.)
- Checked before every `setMessages` call and after long awaits. Returns
  early if true.

### F13 (silent swallow) — `chat-list.tsx`
- `apiPost('/api/{id}/messages/delivered').catch(() => {})` →
  `.catch((e) => console.warn('mark_delivered failed:', e))`.

## Caveats

1. **X5 cookie-read is browser-only.** `readSessionToken()` returns `''` on
   SSR. The hook only runs client-side (gated on `currentUser`), so this is
   fine.
2. **auth-error forces a full reload.** Soft-reset would also work; reload
   is safest to drop any in-memory state populated under the invalid
   identity.
3. **F12 `null` treated as "still here"** — preserves hover-prefetch UX.
   Stricter reading: change to `a !== chatId`.
4. **F2 fallback minimal** — dashed muted bubble, no avatar/timestamp.
   Matches the task spec.
5. **F3 cleanup avoids setState** — directly stops recorder/tracks/timer
   rather than calling `cancelRecording()` (which would setState after
   unmount). React 19 tolerates post-unmount setState but minimizing work
   on unmount is cleaner.
6. **No new npm packages.** All fixes use existing infra.
7. **Backend & Flutter untouched** — per task constraints.

## Cross-references

- Task 9 (audit) — these are the fixes for findings F1, F2, F3, F4, F5,
  F6, F7, F9, F12, F13, and X5 from the audit worklog.
- Backend B2 (socket `identify` auth hole) — the server-side half of X5
  was already fixed; this task is the client-side half.
