# Task 16 — Frontend comment cleanup (Cryptalk)

**Agent:** Z.ai Code (comment-cleanup agent)
**Task ID:** 16
**Scope:** Walk `/home/z/my-project/frontend/src/` and clean AI-boilerplate comments in
all `.ts`/`.tsx` files except `components/ui/*` (shadcn/ui library, untouched).

## What changed

Comments only — no code logic, imports, or formatting touched. Patterns removed:

- Multi-line `/** */` JSDoc blocks → 1-line `//` comments (or deleted if obvious).
- Audit tracking tags: `F1`, `F2`, `F3`, `F4`, `F5`, `F6`, `F7`, `F9`, `F12`, `F13`, `X5`, `B2` references all stripped.
- ASCII-art section dividers like `// ─── Types ───────────────────` → short lowercase markers (`// types`, `// encoding helpers`, etc.).
- "AI-sounding" intros (`This component provides…`, `Note that…`, `In order to…`, `It is important to…`) — deleted or rewritten as casual one-liners.
- Numbered step walkthroughs that just restate code (e.g. `// 1. Generate ephemeral keypair`) trimmed to just the step label (`// 1. encrypt the data URL`) when the order is non-obvious, deleted when obvious.
- Obvious comments like `// voice playback`, `// grouped by day`, `// reaction grouped by emoji` removed.
- "Why" comments kept and shortened: stale-closure notes, httponly-cookie auth pattern, React 19 sync-state-during-render, debounced server calls, eviction-on-failure, etc.

## Files cleaned (24 total)

**lib/** (10):
- `api.ts` — `buildUrl` F5 comment block, `apiUploadFile` JSDoc, multipart-boundary note.
- `e2ee.ts` — all function JSDoc; numbered init steps; legacy-plaintext notes.
- `crypto.ts` — section dividers, keypair step numbers, multi-line JSDoc on key-gen / HKDF / verify / safety-number.
- `attachments.ts` — 25-line flow preamble compressed to a 9-line note; cache eviction note kept short.
- `icons.ts` — top-of-file preamble; resolver JSDoc; section dividers.
- `types.ts` — palette/accent/wallpaper section comments lowercased; icons re-export note trimmed.
- `key-store.ts` — function JSDoc trimmed; section divider removed.
- `message-cache.ts` — function JSDoc trimmed; obvious "delete old"/"add new"/"clear all" comments deleted.
- `format.ts` — top-of-file comment lowercased.
- `actions.ts`, `auth.ts`, `utils.ts`, `animated-stickers.ts` — no comments to clean.

**hooks/** (3):
- `use-socket.ts` — X5 socket-auth block, F4 dup-listener audit tag, message/recording/reaction narration comments trimmed.
- `use-mobile.ts` — no comments; left as-is (also a pre-existing lint-error file).
- `use-toast.ts` — multi-line "side effects" comment compressed to one line.

**stores/** (1):
- `chat-store.ts` — F6 presence-Set comments compressed; section markers (`// auth`, `// chats`, `// presence`, etc.) kept as they help navigate the long interface.

**components/chat/** (10):
- `message-item.tsx` — F1 starred-state comment, attachment-resolution JSDoc, custom memo comparator explanation, voice-bubble / delivery-ticks / placeholder JSDoc all trimmed.
- `message-input.tsx` — F3+F9 mic-cleanup comments, E2EE step numbers, dev-fallback / URL-encryption-failure / 413-507 notes compressed.
- `chat-list.tsx` — search-debounce comment, prefetch F12 comment, openChat step comments, F13 silent-swallow note all trimmed.
- `chat-window.tsx` — F7 in-chat-search debounce comment compressed.
- `message-list.tsx` — MessageErrorFallback JSDoc, CSS windowing comment, F2 per-message boundary JSX comment trimmed.
- `new-chat-dialog.tsx` — mount-fresh note kept short; `// first 24 for picker` lowercased; `// fetch chat list item shape` shortened.
- `profile-dialog.tsx`, `forward-dialog.tsx` — `// State initializes fresh on each mount` lowercased.
- `accent-applier.tsx` — single-line function description lowercased.
- `connections-panel.tsx` — TDZ-hoist and async-iife notes trimmed.
- `chat-info-panel.tsx` — Signal-style safety-number note kept short; `// media:` comment shortened.
- `chat-avatar.tsx` — `eager` prop doc compressed to one line.
- `chat-app.tsx`, `auth-screen.tsx`, `sidebar.tsx`, `mobile-nav.tsx`, `settings-panel.tsx`, `animated-sticker.tsx`, `chat-window.tsx` (JSX section markers like `{/* Header */}` left intact — they help reading the JSX).

**components/** (non-chat, 2):
- `error-boundary.tsx` — `fallback?` field JSDoc and class-level JSDoc trimmed.
- `theme-provider.tsx` — no comments, untouched.

**app/** (2):
- `layout.tsx`, `page.tsx` — no comments, untouched.

## Lint result

`cd /home/z/my-project/frontend && bun run lint` → **2 errors, both pre-existing**:

```
src/components/ui/carousel.tsx:98:5   react-hooks/set-state-in-effect  (shadcn/ui — not in scope)
src/hooks/use-mobile.ts:14:5           react-hooks/set-state-in-effect  (pre-existing baseline)
```

No new errors introduced by this task. Verified by greping for `F1|F2|...|F13|X5|B2`, `/**` JSDoc
blocks, and `──` ASCII-art dividers in `src/` — all three return zero matches outside
`components/ui/*`.

## Caveats

1. **Did not touch `components/ui/*`** per task instructions (shadcn/ui library files).
2. **Did not change any code** — only comments. Imports, formatting, and logic identical to the
   pre-task state (verified by `bun run lint` showing only the same 2 baseline errors).
3. **Kept short section markers** (`// types`, `// encoding helpers`, `// auth`, `// chats`, etc.)
   in long files (crypto.ts, chat-store.ts) — they help navigation without restating code.
4. **Kept JSX section markers** like `{/* Header */}`, `{/* Reply preview */}` — short, helpful
   for reading JSX trees, not AI boilerplate.
5. **Kept genuinely useful "why" comments** even when short: httponly-cookie auth, React 19
   sync-during-render, debounce server calls, eviction-on-failure, 25MB backend limit, etc.
6. **`hooks/use-mobile.ts`** has a pre-existing lint error and no comments — left entirely alone.
