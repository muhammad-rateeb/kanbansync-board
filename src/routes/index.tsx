import { createFileRoute } from '@tanstack/react-router'
import { BlinkClientBoundary } from '@/components/BlinkClientBoundary'
import { KanbanWorkspace, WorkspaceLoading } from '@/components/kanban-workspace'

/**
 * Home route (/). A neutral, FULL-BLEED starting point — no app chrome, no
 * sidebar. Replace this body with your real landing page or app home.
 *
 * Add more pages as files under `src/routes/` (e.g. `src/routes/about.tsx`
 * → /about). The HTML document + providers live once in `__root.tsx`.
 *
 * Building a SaaS / dashboard app? The sidebar shell already exists at
 * `src/routes/app.tsx` with its home at `src/routes/app/index.tsx` (→ /app) — add
 * your pages as files in `src/routes/app/`. Do NOT create a `src/routes/_app.tsx`:
 * a `_`-prefixed layout is PATHLESS, so `_app/index.tsx` resolves to `/` and
 * collides with THIS file (build fails: "Conflicting configuration paths").
 * Dashboard-only product? Keep this file and redirect it to `/app`.
 * Landing pages, marketing sites, content, and games stay full-bleed (default) —
 * delete `src/routes/app.tsx` + `src/routes/app/` if you don't need a dashboard.
 *
 * SEO: set per-page title/description/Open Graph here in `head()`.
 *
 * SSR / routing (this template is server-rendered — TanStack Start):
 * - Routes are files under `src/routes/` that `export const Route =
 *   createFileRoute('/path')({ component })`. NEVER `export default` a route.
 *   Navigate with `Link` from `@tanstack/react-router` (there is no `NavLink`).
 * - Reading Blink auth/SDK state (`blink.auth`), `localStorage`, or `window` at
 *   render CRASHES SSR / hydration-mismatches and ships a blank first page. Wrap
 *   that subtree in `<BlinkClientBoundary fallback={…}>` (from
 *   `@/components/BlinkClientBoundary`) — wrap the whole tree if the entire page
 *   needs the browser. Keep static content outside the boundary. Do NOT use the
 *   route's `ssr: false`: a client-only route in this template hits Start's
 *   server-context `node:async_hooks` path (a throwing browser stub) and ships a
 *   BLANK preview ("AsyncLocalStorage is not a constructor").
 */
export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'KanbanSync — Keep good work moving' },
      { name: 'description', content: 'A calm, collaborative Kanban workspace for keeping projects moving.' },
    ],
  }),
  component: Home,
})

function Home() {
  return (
    <BlinkClientBoundary fallback={<WorkspaceLoading />}>
      <KanbanWorkspace />
    </BlinkClientBoundary>
  )
}
