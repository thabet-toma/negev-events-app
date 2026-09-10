---
name: engineering-protocol
description: The team's single working protocol for planning, building, and modifying code. Use it at the START of EVERY task that touches a codebase — designing a new system or subsystem, implementing an approved plan, or making a targeted fix or feature change — and before answering any question that will lead to a code change. It selects the working mode (PLAN / BUILD / SURGICAL), fixes the rules for that mode, and defines the quality gates a task must pass before it can be called done. Applies to planners, implementers, and delivery agents alike; each follows the part of it that its role owns.
---

# Engineering Protocol — منصة مناسبات النقب

One protocol, three modes, five gates. Every agent on this team runs it: the
**planner** who designs and routes, the **implementer** who builds, and the
**delivery** agent who does mechanical tickets and ships.

This is a small codebase (~1,300 lines of server, ~1,500 of frontend, one commit
of history). The protocol exists to keep it small and honest, not to wrap
ceremony around a two-line fix. Where a step below has nothing to bite on, say so
in one line and move on.

## 0. Role adaptation — run the part you own

| Mode | Planner | Implementer | Delivery |
|---|---|---|---|
| A — PLAN | owns it, start to finish | supplies feasibility facts on request | not involved |
| B — BUILD | dispatches, verifies, syncs docs | executes each ticket | executes only the tickets marked mechanical |
| C — SURGICAL | writes the ticket + verifies | executes | executes |
| Gates | enforces, may reject | must satisfy and show evidence | must satisfy and show evidence |

The planner writes no production code. Executors resolve no design questions —
an underspecified ticket is bounced back, unstarted. That is correct behavior,
not a failure; guessing is the failure.

---

## 1. Mode selection

Read the request, pick ONE mode, and announce it in a single line before acting:
`MODE A — PLAN: <why>` / `MODE B — BUILD: <why>` / `MODE C — SURGICAL: <why>`.

- New system, new subsystem, or a request whose shape is not yet decided → **MODE A**
- An approved plan, or an open item in `[ORPHANS & PENDING]` → **MODE B**
- A targeted fix or feature inside code that already exists → **MODE C**

Tie-breakers:
- Root cause unknown → **MODE A** first, even for a one-line-looking bug. You
  cannot make a surgical incision into a diagnosis you do not have.
- Scope grows mid-work beyond what the ticket described → stop, and re-enter
  **MODE A**. Do not silently widen a MODE C change.
- Schema, `migrate.js` / `seed.js`, auth and JWT, the nokoot ledger's ownership
  scoping, uploads, or any `/admin` route → never MODE C by a delivery agent,
  regardless of how small the diff looks.
- **Adding condolences / تعازي support is always MODE A.** It is a new domain
  axis, not a new field — see the domain section of `CLAUDE.md` for what it
  touches.

---

## 1.5 Prior art first — do not reinvent the wheel

Applies to all three modes, before you design anything.

Community-event and invitation platforms have already solved most of what this
product needs — event pages, RSVP, guest lists, reminders, gift and contribution
tracking. Find out how **before** inventing your own answer.

- **Search the live web yourself.** This repo carries no design research at all.
  Memory is not research.
- **Named references:** `munasabatna.com` (the same source we import from — study
  how it presents an invitation) · Evite · Paperless Post · Eventbrite · The Knot ·
  Zola · Facebook Events. Do not stop at the list — whatever else you find that is
  better counts, especially anything serving Arabic, RTL, or Levantine and Gulf
  social-occasion norms.
- **Weigh it against the actual users.** This is a Negev-Bedouin community
  product: clan identity (`family_clan`), town as the primary axis, and the nokoot
  ledger as a real social obligation rather than a gift registry. A Western RSVP
  flow that assumes individually addressed invitations and a closed guest list may
  be the wrong shape here. Say so when it is.
- **Not a reference:** the legacy JSON version of this app
  (`database/negev_events_data.json`, `scripts/import-legacy-json.js`) and the demo
  rows in `src/db/seed.js`. Both exist to migrate data or to fill a dev screen —
  neither is evidence of how anything *should* work. Never cite them to justify a
  design decision.
- **Then exceed it.** Copy the concept, not the limitation. State plainly where
  our answer goes further, and why the professional one was not enough.
- **Report in two lines, not an essay:** what they do · what you took, what you
  rejected, and why.

Skip only for a change with no design content at all (a rename, a typo, a pinned
version bump) — and say that you skipped it.

---

## MODE A — PLAN (produce a plan, then STOP for approval)

Execute in order:

1. **Temporal awareness.** Read the current year/month from the shell. Then look
   up the latest **stable** version of every dependency you intend to add or
   upgrade, in official sources (npm, GitHub releases) as of that date. Pin
   versions. Zero deprecated APIs. One line justifying each choice. Never rely on
   memory for a version number.
   **Adding a dependency is a decision, not a reflex.** This project ships twelve
   runtime packages, no build step, and no frontend framework on purpose. A new
   package must earn its place against "write the twenty lines ourselves", and
   anything that would introduce a build step for `public/` is a MODE A question
   of its own — never a side effect of another ticket.
2. **Flow first.** Draw the user journey (GUI) and/or data flow (API) as a
   sequence of **verifiable goals**. For every screen or endpoint: entry state →
   action → result state → **error state**. Mark every point where the user could
   get stuck and define the escape hatch. Include the moderation path explicitly —
   most public writes land in `pending` and a human decides. **Scope freezes here.**
3. **Surgical architecture.** Keep the existing layering: the route validates, the
   service owns SQL, middleware owns cross-cutting concerns. New shared logic goes
   into `src/utils/` or `src/middleware/` **only** when genuinely reused ≥2 times —
   never abstract single-use code. Cohesive modules over a scatter of micro-files:
   a new domain gets `<domain>.routes.js` + `<domain>.service.js`, matching the
   five pairs that already exist.
4. **Safe logging.** Through `src/utils/logger.js` only, standard levels
   (debug/info/warn/error), no PII — no phone numbers, no PIN, no JWT, no nokoot
   amount tied to a named person. Never on the hot path.
5. **State sync.** Read the project's navigation docs FIRST: `CLAUDE.md` (the
   "أين أبدأ؟" routing table and the invariants), then `README.md` (the full API
   table and Socket.IO event list), then `src/db/schema.sql` — the schema is the
   source of truth for the domain, not any prose. Reconcile your plan against all
   three and note which of them the work will oblige you to update. There is no
   `ARCHITECTURE.md`, no `docs/modules/`, and no generated API index in this repo —
   do not cite or invent them.
6. **Milestones.** Sequence the work as milestones, each with its own verifiable
   goal, assigned tier and executor, and explicit dependencies.

**Output:** a dense technical spec + task tickets + a milestone table. Then **stop
and wait for approval.** Do not begin building.

Tickets live wherever `docs/agents/issue-tracker.md` says — GitHub issues, via
`gh`. Publishing them is a separate, explicit step, never taken as part of
planning.

**Ticket format (every ticket, no exceptions):**

```
TASK-ID:
TIER: T1 mechanical | T2 standard | T3 deep
EXECUTOR:
CONTEXT: exact files + exact doc sections — nothing more
GOAL: one sentence
SUCCESS CRITERIA: binary and observable, with the command that proves it
CONSTRAINTS: what not to touch, style to match, invariants to preserve
OUT OF SCOPE: explicit
DELIVERABLE: files + tests + doc update
ROUTING REASON: one line
```

No Success Criterion → no task. The criterion stands unless you **prove** it
wrong — then replace it, state the proof and the new criterion, and carry on.
Never quietly drop one you failed to meet.

---

## MODE B — BUILD (continuous execution, no check-ins)

Authority to run until done. Per task, loop: **DISPATCH → VERIFY → SYNC DOCS.**

- **Production-ready only.** Zero placeholders, zero TODOs, zero stubbed returns.
  Full error handling. Logging wired in. The one sanctioned exception already in
  the codebase is `/api/ai/*`, which is honest about itself by returning
  `simulated: true` — do not add a second simulated path without that flag and a
  comment saying why.
- **Verify, don't assume.** A traced end-to-end run of the flow, or a case added to
  `test/smoke.test.js`, for every unit — plus proof that previously passing
  features still pass (`npm test`).
- **Flow adherence.** Re-read the approved `[SYSTEM_FLOW]` from the MODE A plan
  before each task. Every line must serve the specified journey; anything else is
  rejected work.
- **Live state sync.** A feature built but not yet wired goes into
  `[ORPHANS & PENDING]` in the plan immediately, and is removed from it on
  completion.
- Reject and re-dispatch any output that fails its Success Criterion. If the same
  criterion fails twice, re-route one tier up — never retry blindly.

Do not stop until `[ORPHANS & PENDING]` is empty and the product is complete.

---

## MODE C — SURGICAL (precise change, zero collateral damage)

**Rules of surgery** (they also apply inside MODE B):

1. **Touch only what must be touched.** No reformatting neighbouring code, no
   rewording old comments, no refactoring working code unless explicitly asked.
2. **Match the existing style exactly**, even where you consider it suboptimal —
   `'use strict'`, CommonJS `require`, a short doc comment per exported function,
   Arabic user-facing messages, and global-state vanilla JS in `public/`.
3. **Clean only your own residue.** Your change orphaned a function or an import →
   remove it. Pre-existing dead code stays.
4. **Smallest correct change wins.** If 50 lines beat 200, write 50.
5. **No feature creep.** Build the ticket's scope and nothing adjacent.

**Protocol:**

1. **Impact analysis.** Read `CLAUDE.md` ("أين أبدأ؟" + invariants) and the API
   table in `README.md` to locate an endpoint; `grep` is the right tool in a repo
   this size. Enumerate the exact affected files, their callers, and the DB objects
   involved. Read every file you will edit before editing it. **A ticket's
   description of the current code is a claim, not a fact** — verify it against the
   real files and say so when it was wrong. State your assumptions in one short
   block **before** touching anything. Research current library behavior if the
   change needs it.
2. **Architectural safety.** DRY — reuse `src/middleware/validate.js`,
   `src/utils/ApiError.js`, `src/db/pool.js` and `src/constants.js` instead of
   writing a second copy of tested logic; a second copy of a rule is a future
   divergence bug. Add logging for the new path.
3. **Goal-driven verification.** Add the case to `test/smoke.test.js` in its
   existing style — the local `test()` and `api()` helpers; there is no test
   framework and no mocking layer. Run it, and confirm it fails **for the stated
   reason**. Make it pass. Then run `npm test` whole — no regression. `npm test`
   needs a live MySQL and applies migrations and seeds against it; if MySQL is not
   available, say so plainly and do not report the task as done. If a test was
   already red before your change, prove it and say so; never silently inherit or
   hide a failure.
4. **State sync.** Update `README.md` (API table, Socket.IO event list, commands,
   security notes) and `CLAUDE.md` immediately when your change made a
   **description** in them untrue — in the file's existing language and format. Do
   not create new doc files to record the change.

Start with impact analysis + assumptions, then go straight to the incision.

---

## 2.5 Justified deviation, and what to do with danger

**Deviate on the *how*.** If you find a better solution than the one specified —
or a capability the market treats as standard and this request forgot — propose
it, build it, and leave a comment saying why it is better. Justified deviation is
required, not tolerated. **Staying silent about a better idea is a failure of the
job**, the same as shipping a bug.

**Do not deviate on the *what*.** The owner's scope is frozen; a better idea that
enlarges it is raised, not built. Propose, get a yes, then build. Silent widening
is the one deviation that is always wrong.

**Danger found in passing.** If you hit something dangerous while working — a
`pin_code` or password hash reaching a response, a nokoot query missing its
`user_id` scope, string-concatenated SQL, an `/admin` route outside
`requireAdmin`, an upload path bypassing the MIME whitelist, a secret about to be
committed, or anything that destroys existing rows:

1. Stop and report it in the same breath you found it, with file and line.
2. Still bleeding (live data being corrupted or leaked right now) → contain it
   inside this change, minimally, and say exactly what you touched.
3. Not bleeding → separate ticket. Do not fold an unrelated repair into an
   unrelated diff.
4. Never leave it unsaid because it was outside the ticket.

**Invariants creativity may never touch** (the full list is in `CLAUDE.md`; these
are the ones that end a task on sight):

- SQL lives only in `src/services/`, only through `src/db/pool.js`, only with `?`
  placeholders — never a concatenated query, and never a DB call from a route.
- Every nokoot query carries `WHERE user_id = ?` in the SQL itself; filtering
  after the fetch is a data leak.
- `pin_code` never leaves the server — users go out through
  `auth.service.publicUser`.
- Errors are `ApiError` thrown inside `asyncHandler`; user-facing messages are in
  Arabic.
- `realtime.emit` fires from the route layer after the service succeeded, never
  from inside a service.
- Town values come from `TOWNS`, fallback coordinates from `TOWN_COORDINATES`.
- `migrate.js` and `seed.js` stay idempotent, and `seed.js` never overwrites an
  existing row.
- `public/` stays buildless vanilla JS with plain CSS — no framework, no bundler,
  no Tailwind, no `import`/`export`.

---

## 3. Quality gates — a task is not done until all five hold

- [ ] **Success Criterion demonstrably met** — actual command output or a traced
      flow, shown. "Tests pass" is not evidence.
- [ ] **No regression** in previously working features — `npm test` run whole
      against a live MySQL, with its real output pasted.
- [ ] **The docs still tell the truth.** There is **no automated freshness guard in
      this repo**, so this check is entirely manual and entirely yours. The
      question is not "does the file still exist" — it is: does any
      **description** in `README.md` (API table, Socket.IO events, commands,
      security notes) or in `CLAUDE.md` (invariants, "أين أبدأ؟", the domain
      section) now describe behaviour your change replaced? Stale prose over a
      valid path is worse than a broken link: the reader believes it.
- [ ] **The user-facing path is walkable end to end** without confusion, in Arabic
      and RTL, and no state is reachable from which the user cannot recover. A
      public submission that silently sits in `pending` with no feedback fails
      this gate.
- [ ] **Prior art was consulted and deviations are justified** — the two lines from
      §1.5 are in the report, every deviation from the ticket carries its reason,
      and anything dangerous you saw was named. An unexamined "I built what it
      said" is not a pass.

A green smoke run is not proof a code path is reachable from the UI, and a freshly
migrated test database is not proof of the production schema: `migrate.js` is
`CREATE TABLE IF NOT EXISTS` only, so a column you add to `schema.sql` will exist
in a new database and be **missing** from the live one until an explicit `ALTER`
runs. Verify the caller and the real schema when either is in play.

---

## 4. What every executor returns

- Files changed, one line each on why.
- Commands run and their **ACTUAL output**.
- Assumptions made — including any ticket claim about existing code that turned
  out to be wrong.
- Prior art consulted (§1.5): what the comparable products do, what you took and
  what you rejected.
- Deviations from the ticket, each with its reason — and any better idea you
  raised but did not build.
- Anything dangerous you found in passing, contained or ticketed.
- Anything left unfinished, and why — scaling the work down is the owner's call,
  never the executor's.
- The doc updates made (`README.md` / `CLAUDE.md`), plus any new
  `[ORPHANS & PENDING]` item.

Outward-facing steps — pushing to a shared branch, deploying, publishing an issue,
running an import against the production database — are never taken on an agent's
own initiative, no matter what a ticket says. They wait for an explicit go from
the owner, per release.

---

## 5. Task brief

<!-- Filled in by the requester. If it is ambiguous, ask before planning. -->
