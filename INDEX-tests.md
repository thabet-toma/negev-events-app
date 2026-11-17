# ملحق الاختبارات — منصة مناسبات النقب

> **مولَّد من `server/scripts/build-index.js` — لا تحرّره بيدك؛ شغّل `npm run index:build`.**
> ملحق `INDEX.md`: كل حالة `await test(` في ملفَي الاختبار، مرتّبة بالملف ثم السطر.

## حالات الاختبار — 1448

`npm test` يشغّل `web-dom` ثم `smoke`؛ `smoke` يحتاج MySQL حيّة، وكل حالة معرَّفة داخل ملفها.

| الحالة | file:line |
|---|---|
| `GET /health reports the database is up` | `server/test/smoke.test.js:237` |
| `GET /api/events returns approved events with reaction counts` | `server/test/smoke.test.js:243` |
| `GET /api/events returns all events by default, while ?upcoming=1 filters to upcoming only` | `server/test/smoke.test.js:250` |
| `GET /api/events?town= filters by town` | `server/test/smoke.test.js:261` |
| `GET /api/events?search= matches Arabic text` | `server/test/smoke.test.js:266` |
| `GET /api/stories exposes isLive` | `server/test/smoke.test.js:271` |
| `GET /api/map/events returns Waze links` | `server/test/smoke.test.js:277` |
| `GET /api/towns lists towns and per-town stats` | `server/test/smoke.test.js:283` |
| `GET /api/towns carries a map centre for every real town, and none for القرى والتجمعات (#20 step 6)` | `server/test/smoke.test.js:289` |
| `GET /api/app/version announces the mobile release` | `server/test/smoke.test.js:301` |
| `POST /api/check-collision detects a booked date` | `server/test/smoke.test.js:310` |
| `POST /api/check-collision rejects a malformed date` | `server/test/smoke.test.js:316` |
| `GET /api/events/calendar counts a multi-day event on every day it covers, and leaves out link_only, unapproved and scheduled ones (تذكرة #175)` | `server/test/smoke.test.js:391` |
| `GET /api/events/calendar honours X-App-Version like the feed: a legacy client never counts a type it cannot render (تذكرة #175)` | `server/test/smoke.test.js:407` |
| `GET /api/events/calendar?region_id= narrows to that governorate, and its absence counts every governorate (تذكرة #175)` | `server/test/smoke.test.js:422` |
| `GET /api/events/calendar rejects a malformed month with an Arabic 400, and answers a month with nothing in it with an empty list (تذكرة #175)` | `server/test/smoke.test.js:449` |
| `A day the calendar counts is exactly what `?date_from=&date_to=` returns for it — one condition, two readings (تذكرة #175)` | `server/test/smoke.test.js:461` |
| `GET /api/events/:id/calendar.ics serves a valid iCalendar file for an approved public event (تذكرة #176)` | `server/test/smoke.test.js:492` |
| `calendar.ics SUMMARY is the event page's own headline — groom_name when there are no honorees (تذكرة #176)` | `server/test/smoke.test.js:529` |
| `calendar.ics carries the page's time texts in DESCRIPTION, and invents none when nothing was written (تذكرة #176)` | `server/test/smoke.test.js:554` |
| `calendar.ics is 404 for a pending, rejected, link_only, scheduled or missing event — the public visibility gate itself (تذكرة #176)` | `server/test/smoke.test.js:586` |
| `the share page /e/:id never mentions calendar.ics (ADR-0006, تذكرة #176)` | `server/test/smoke.test.js:603` |
| `GET /api/events/trending orders by the summed signals, and every one of the four kinds counts (تذكرة #177)` | `server/test/smoke.test.js:724` |
| `GET /api/events/trending counts a signal by its own timestamp: five reactions older than the window leave their event out, today's one brings its event in (تذكرة #177)` | `server/test/smoke.test.js:753` |
| `GET /api/events/trending honours the public gate and keeps funerals out by tone: a funeral loud with reactions, link_only, pending and a scheduled event all stay out even when they beat the only visible row (تذكرة #177)` | `server/test/smoke.test.js:778` |
| `GET /api/events/trending?region_id= narrows to that governorate, and a malformed one is an Arabic 400 (تذكرة #177)` | `server/test/smoke.test.js:795` |
| `GET /api/events/trending with no header and no region_id takes the account's governorate, and all_regions=1 widens it (تذكرة #177)` | `server/test/smoke.test.js:816` |
| `GET /api/events/trending returns at most six rows, and the seventh weakest is the one left out (تذكرة #177)` | `server/test/smoke.test.js:845` |
| `GET /api/events/trending honours X-App-Version like the feed: a legacy client never sees a type it cannot render (تذكرة #177)` | `server/test/smoke.test.js:868` |
| `POST /api/auth/register creates an account` | `server/test/smoke.test.js:902` |
| `POST /api/auth/register rejects a duplicate phone` | `server/test/smoke.test.js:911` |
| `POST /api/auth/login rejects a wrong PIN` | `server/test/smoke.test.js:918` |
| `POST /api/auth/login succeeds with the right PIN` | `server/test/smoke.test.js:925` |
| `The register and login calls above each wrote a server-side analytics row for this user (issue #44) — no extra requests needed, just reading what already happened` | `server/test/smoke.test.js:933` |
| `An anonymous request is counted per IP and reports RATE_LIMIT_MAX as its ceiling` | `server/test/smoke.test.js:952` |
| `A signed-in request is counted per user and reports the larger RATE_LIMIT_USER_MAX ceiling` | `server/test/smoke.test.js:957` |
| `A garbage bearer token is anonymous again — it keeps the per-IP ceiling` | `server/test/smoke.test.js:963` |
| `authenticatedUserId reads a real token, and answers null for anything unusable` | `server/test/smoke.test.js:968` |
| `GET /api/nokoot without a token is rejected` | `server/test/smoke.test.js:980` |
| `POST /api/nokoot stores a ledger entry` | `server/test/smoke.test.js:985` |
| `GET /api/nokoot returns totals and analytics` | `server/test/smoke.test.js:994` |
| `DELETE /api/nokoot/:id removes the entry` | `server/test/smoke.test.js:1000` |
| `POST /api/admin/login rejects a wrong PIN` | `server/test/smoke.test.js:1006` |
| `POST /api/admin/login rejects a non-admin account` | `server/test/smoke.test.js:1013` |
| `POST /api/admin/login succeeds for the super admin` | `server/test/smoke.test.js:1020` |
| `GET /api/admin/stats is closed to a normal user` | `server/test/smoke.test.js:1028` |
| `GET /api/admin/stats returns counters for an admin` | `server/test/smoke.test.js:1033` |
| `POST /api/admin/broadcast is accepted` | `server/test/smoke.test.js:1039` |
| `GET /api/occasion-types returns the five seeded types ordered by position, عرس first` | `server/test/smoke.test.js:1049` |
| `عزا carries zero reactions while عرس carries all five` | `server/test/smoke.test.js:1058` |
| `Seed a plain admin directly via the DB (no API creates that role)` | `server/test/smoke.test.js:1085` |
| `A plain admin is rejected (403) on all four occasion-type admin routes` | `server/test/smoke.test.js:1098` |
| `A super_admin passes GET /api/admin/occasion-types and gets the unpublished-type notice` | `server/test/smoke.test.js:1109` |
| `Creating a type from the admin panel appears immediately in the public list — no deploy, no migration` | `server/test/smoke.test.js:1117` |
| `Creating a type without honorees/town/event_date visible is rejected` | `server/test/smoke.test.js:1135` |
| `Creating a type with a field_key outside the master set is rejected` | `server/test/smoke.test.js:1145` |
| `A type with an event attached cannot be deleted — refused and disabled instead` | `server/test/smoke.test.js:1157` |
| `A type with no events is deleted outright` | `server/test/smoke.test.js:1189` |
| `Hiding a field on عرس hides it from the type config but does not touch existing event data` | `server/test/smoke.test.js:1195` |
| `GET /api/occasion-types يحمل messages لكل نوع مزروع — بذرة، بالشكل العام بلا أعلام إدارة، ولا نصّ في الكود` | `server/test/smoke.test.js:1236` |
| `السوبر أدمن وحده يدير الرسائل — أدمن البلدة يُردّ 403 على القراءة والإضافة والتعديل` | `server/test/smoke.test.js:1265` |
| `إضافة رسالة وإطفاؤها: تظهر في الإدارة وفي الردّ العام، ويغيب المطفأ عن العميل وحده` | `server/test/smoke.test.js:1282` |
| `تفصيل المناسبة: congratulations_count وinterested_count يصلان إلا ما أطفأه النوع، ولا شيء منهما على العزاء` | `server/test/smoke.test.js:1328` |
| `A legacy-shaped event row is backfilled to عرس with one event_honorees row` | `server/test/smoke.test.js:1401` |
| `Running the migration twice does not duplicate occasion types, honorees or people` | `server/test/smoke.test.js:1424` |
| `إعادة الترحيل لا تكرّر رسائل الأنواع المزروعة — البذرة تُكتب في نوع بلا رسالة واحدة فقط` | `server/test/smoke.test.js:1443` |
| `A default poster belongs to the occasion type: عرس gets one, عزا gets none` | `server/test/smoke.test.js:1476` |
| `Publishing with five honorees, then searching by the fifth name, returns the event exactly once` | `server/test/smoke.test.js:1502` |
| `groom_name is filled with the first honoree by position, written in the same transaction` | `server/test/smoke.test.js:1523` |
| `A wedding without a second honoree (bride) is accepted — the second name is optional` | `server/test/smoke.test.js:1530` |
| `A funeral (عزا) without event_end_date is rejected with an Arabic message` | `server/test/smoke.test.js:1540` |
| `The rejection message names the field by its label in this type — المتوفَّى, not العريس` | `server/test/smoke.test.js:1555` |
| `A wedding (عرس) without event_end_date is accepted — only عزا requires it` | `server/test/smoke.test.js:1570` |
| `A field hidden for this type (youth_party_date on عزا) is silently ignored, not rejected` | `server/test/smoke.test.js:1580` |
| `The default title generated for a funeral contains no festive wording` | `server/test/smoke.test.js:1600` |
| `Publishing with two extra days out of date order stores them and returns them sorted by day_date` | `server/test/smoke.test.js:1612` |
| `A multipart publish with extra_days[0][name] bracket keys stores the day` | `server/test/smoke.test.js:1639` |
| `An extra day with a name but no date is rejected with اليوم 1 in the message` | `server/test/smoke.test.js:1665` |
| `More than ten non-blank extra days is rejected` | `server/test/smoke.test.js:1674` |
| `PATCH extra_days replaces the list, an empty list clears it, and an absent key leaves it untouched` | `server/test/smoke.test.js:1687` |
| `Saving the days back exactly as GET returned them is a no-op — two stations on one date at different times (تذكرة #176)` | `server/test/smoke.test.js:1737` |
| `A type where extra_days is hidden ignores posted days instead of rejecting them` | `server/test/smoke.test.js:1784` |
| `GET /api/events list rows carry extra_days` | `server/test/smoke.test.js:1825` |
| `An approved event whose main date has passed is still upcoming — and mapped — while an extra day is ahead` | `server/test/smoke.test.js:1837` |
| `?date_from/?date_to find an event by an extra day or a youth party earlier than its event_date` | `server/test/smoke.test.js:1871` |
| `Set up: an approved wedding with two extra days for the extra-days edit tests` | `server/test/smoke.test.js:1916` |
| `Re-dating one extra day is critical: the event returns to pending and one extra_days amendment row is logged` | `server/test/smoke.test.js:1932` |
| `Renaming one extra day is cosmetic: the event stays approved and the amendment row is cosmetic` | `server/test/smoke.test.js:1973` |
| `Resubmitting the identical extra-days list rewrites no rows and logs no new amendment row` | `server/test/smoke.test.js:1995` |
| `Swapping which named day sits on which date is critical: the event returns to pending and the amendment row is critical` | `server/test/smoke.test.js:2026` |
| `An event whose date has passed is absent from the list and present in the archive` | `server/test/smoke.test.js:2057` |
| `A عزا that started yesterday and spans today is still shown — COALESCE(event_end_date, event_date), not event_date alone` | `server/test/smoke.test.js:2074` |
| `?date_from=/?date_to= return the events on those days — a past day too, and a spanning عزا by overlap` | `server/test/smoke.test.js:2095` |
| `Default page size is 30, and the hard ceiling on ?limit= is enforced` | `server/test/smoke.test.js:2118` |
| `?page= returns a different page than page 1` | `server/test/smoke.test.js:2126` |
| `?occasion_type_id= filters on the server, not the client` | `server/test/smoke.test.js:2133` |
| `congratulations_count is always present (zero when there are none), and latest_congratulation is null` | `server/test/smoke.test.js:2139` |
| `Three تعازي on a عزا (which premoderates) are created pending, with sender_name taken from the account` | `server/test/smoke.test.js:2152` |
| `The admin approves all three; only then does the count/preview reflect them, without duplicating the row` | `server/test/smoke.test.js:2174` |
| `The congratulations counter/preview disappear from the card when show_congratulations_count is off, and return when it is back on` | `server/test/smoke.test.js:2190` |
| `A request with no X-App-Version header only sees weddings from GET /api/events` | `server/test/smoke.test.js:2215` |
| `A request with no X-App-Version header only sees weddings from GET /api/map/events` | `server/test/smoke.test.js:2221` |
| `Reordering the type tabs does not change what a legacy client receives` | `server/test/smoke.test.js:2228` |
| `An occasion type carries an explicit tone, and a renamed label never changes it` | `server/test/smoke.test.js:2249` |
| `An unknown tone is rejected with an Arabic message` | `server/test/smoke.test.js:2273` |
| `A type created from the panel is not sent to already-published clients` | `server/test/smoke.test.js:2291` |
| `A request with a modern X-App-Version header sees every occasion type` | `server/test/smoke.test.js:2312` |
| `A legacy client requesting the details of an unsupported occasion type gets 404 with the fixed Arabic message` | `server/test/smoke.test.js:2318` |
| `A modern client requesting the same event passes through` | `server/test/smoke.test.js:2324` |
| `Explicit list columns still include every field a legacy client reads: groom_name, title, family_clan, dinner_time` | `server/test/smoke.test.js:2329` |
| `Set up: a logged-in user publishes an event (used for the edit-permission tests below)` | `server/test/smoke.test.js:2342` |
| `The owner can edit their own event` | `server/test/smoke.test.js:2350` |
| `A non-owner is rejected with 403` | `server/test/smoke.test.js:2359` |
| `An admin can edit any event, including one it does not own` | `server/test/smoke.test.js:2372` |
| `An orphaned event (created_by IS NULL) can only be edited by an admin` | `server/test/smoke.test.js:2381` |
| `A cosmetic edit (title) keeps an approved event approved` | `server/test/smoke.test.js:2398` |
| `A critical edit (event_date) sends an approved event back to pending` | `server/test/smoke.test.js:2409` |
| `A critical edit (location_name) sends an approved event back to pending` | `server/test/smoke.test.js:2419` |
| `GET /api/my-events returns what this user published, across all statuses` | `server/test/smoke.test.js:2430` |
| `Ownership transfer works for an admin, and is rejected for anyone else` | `server/test/smoke.test.js:2436` |
| `Set up: user publishes and admin approves a wedding for amendment-log tests` | `server/test/smoke.test.js:2459` |
| `A cosmetic edit is logged and the event stays approved` | `server/test/smoke.test.js:2472` |
| `A critical edit produces a pending amendment row and sends the event back to pending` | `server/test/smoke.test.js:2488` |
| `Editing two fields in one request produces two amendment rows` | `server/test/smoke.test.js:2503` |
| `Resubmitting the same value produces no new amendment row and no status change` | `server/test/smoke.test.js:2514` |
| `Approving the event resolves every pending amendment row` | `server/test/smoke.test.js:2527` |
| `An admin reads the amendment log` | `server/test/smoke.test.js:2545` |
| `The owner reads their own event amendment log` | `server/test/smoke.test.js:2551` |
| `A non-owner is rejected from reading the amendment log` | `server/test/smoke.test.js:2557` |
| `The public cannot read the amendment log at all` | `server/test/smoke.test.js:2567` |
| `Set up: an approved wedding with a pin and two honorees` | `server/test/smoke.test.js:2579` |
| `Re-sending an unchanged pin as a number with fewer decimals is not an edit — approved stays approved, no amendment` | `server/test/smoke.test.js:2598` |
| `Changing only the second honoree's name stays approved and logs one cosmetic 'honorees' amendment` | `server/test/smoke.test.js:2622` |
| `Re-sending the identical honorees is not an edit — no new amendment and no row rewrite` | `server/test/smoke.test.js:2660` |
| `Set up: an approved عزا, whose type hides youth_party_date` | `server/test/smoke.test.js:2690` |
| `PATCHing a field the type hides is silently ignored, while a visible field in the same request still applies` | `server/test/smoke.test.js:2706` |
| `Set up: an approved wedding for the multipart list-field edits` | `server/test/smoke.test.js:2727` |
| `A multipart PATCH sending honorees as a JSON string replaces the names` | `server/test/smoke.test.js:2739` |
| `A multipart PATCH sending extra_days as a JSON string stores the day` | `server/test/smoke.test.js:2756` |
| `A multipart PATCH with a malformed JSON list string is rejected with the existing Arabic message` | `server/test/smoke.test.js:2772` |
| `Set up: two funerals published in the same town on the same day` | `server/test/smoke.test.js:2800` |
| `عزا checking against an overlapping عزا in the same town produces no warning (funerals never collision-check)` | `server/test/smoke.test.js:2828` |
| `Checking a عرس against an existing عزا in the same town warns of a collision` | `server/test/smoke.test.js:2841` |
| `Set up: a funeral spanning four days` | `server/test/smoke.test.js:2851` |
| `A عرس on day two of a four-day عزا is detected — range intersection, not date equality` | `server/test/smoke.test.js:2866` |
| `A عرس does not collide with a عرس in a different town on the same day` | `server/test/smoke.test.js:2874` |
| `Set up: a wedding published on a free day` | `server/test/smoke.test.js:2889` |
| `Changing the date to a day now booked by a عزا produces a fresh collision warning not seen at creation` | `server/test/smoke.test.js:2902` |
| `The legacy check-collision shape (date + town only, no occasion_type_id) still works` | `server/test/smoke.test.js:2914` |
| `Migration moves a row still carrying the old placeholder coordinates` | `server/test/smoke.test.js:2935` |
| `Migration does not touch a row with a human-chosen coordinate` | `server/test/smoke.test.js:2944` |
| `Migration drops the pin for a 'القرى والتجمعات' row carrying the old placeholder` | `server/test/smoke.test.js:2953` |
| `Running the migration twice is safe and converges to the same result` | `server/test/smoke.test.js:2962` |
| `Publishing under 'القرى والتجمعات' with no village_id is rejected (case 9)` | `server/test/smoke.test.js:2983` |
| `A legacy row under 'القرى والتجمعات' with a NULL village_id and no requested name — inserted directly, since no publish path can produce one any more — still gets no pin` | `server/test/smoke.test.js:2996` |
| `An event published in a village inherits that village's coordinates and gets a real pin (case 11)` | `server/test/smoke.test.js:3010` |
| `Editing an event to a different village moves its pin as well as its village` | `server/test/smoke.test.js:3042` |
| `Publishing under the catch-all with only a typed requested_village_name succeeds, gets no invented pin, and the moderation queue returns the name` | `server/test/smoke.test.js:3083` |
| `requested_village_name outside the catch-all town is rejected` | `server/test/smoke.test.js:3115` |
| `village_id and requested_village_name together are rejected` | `server/test/smoke.test.js:3129` |
| `A typed name that is already an active village links to it silently and inherits its pin` | `server/test/smoke.test.js:3144` |
| `POST /api/admin/events/:id/promote-village: plain admin 403; super_admin links every event that asked for the name, with exactly one village; a second promote reuses (and re-activates) it` | `server/test/smoke.test.js:3176` |
| `A poster uploads and comes back as an absolute URL, not a relative one` | `server/test/smoke.test.js:3263` |
| `PATCH replaces a poster from an uploaded file, not only from a URL` | `server/test/smoke.test.js:3277` |
| `A multipart PATCH uploading a poster the type hides is ignored, while a visible change in the same request still applies` | `server/test/smoke.test.js:3305` |
| `A JSON PATCH still works now that the route carries multer — the old path must not regress` | `server/test/smoke.test.js:3356` |
| `A poster and an artist image upload together — three file fields are now allowed, not two` | `server/test/smoke.test.js:3375` |
| `A file whose type is not on the allowlist is rejected with a message that names what IS accepted` | `server/test/smoke.test.js:3392` |
| `A file sent under an unknown field name is rejected rather than silently stored` | `server/test/smoke.test.js:3402` |
| `A pin inside the chosen town gets no location_warning on publish` | `server/test/smoke.test.js:3415` |
| `A pin nearer another town gets a location_warning, but publishes with the chosen town untouched (no rejection, no auto-correction)` | `server/test/smoke.test.js:3432` |
| `The same mismatch is re-detected on an edit that moves the pin further from the chosen town` | `server/test/smoke.test.js:3454` |
| `An edit that does not touch latitude/longitude/town carries no location_warning` | `server/test/smoke.test.js:3464` |
| `A publish that leaves dinner_time blank stores no time at all — not a forced 8:00` | `server/test/smoke.test.js:3474` |
| `An edit may clear dinner_time — an emptied field is a real change, not a fallback to the old value` | `server/test/smoke.test.js:3486` |
| `An explicit but out-of-range latitude is rejected with an Arabic message` | `server/test/smoke.test.js:3510` |
| `An explicit, non-numeric longitude is rejected the same way` | `server/test/smoke.test.js:3519` |
| `Publishing with no coordinates at all is still accepted, falling back to the town centre as before` | `server/test/smoke.test.js:3527` |
| `A relative sticker URL comes back absolute, like every other media column` | `server/test/smoke.test.js:3540` |
| `POST /api/events without a token is rejected (publishing now requires an account)` | `server/test/smoke.test.js:3569` |
| `A logged-in (non-admin) submission lands in the pending queue` | `server/test/smoke.test.js:3575` |
| `A pending event is hidden from the public list` | `server/test/smoke.test.js:3585` |
| `An admin submission publishes immediately` | `server/test/smoke.test.js:3590` |
| `An unknown town is rejected` | `server/test/smoke.test.js:3604` |
| `GET /api/towns returns exactly the pre-table town list and centres, in the same order (TWN-1)` | `server/test/smoke.test.js:3615` |
| `A town added to the towns table is listed and publishable with no deploy; disabling it withdraws both (TWN-1)` | `server/test/smoke.test.js:3625` |
| `Re-running migrate never duplicates towns nor resurrects one the super_admin deleted (TWN-1)` | `server/test/smoke.test.js:3664` |
| `GET /api/towns carries the regions key: النقب with its centre and every seeded town, while towns[] stays unchanged (TWN-2)` | `server/test/smoke.test.js:3688` |
| `Publishing with town = the region name is accepted, gets no fallback pin, and never warns about a nearer town (TWN-2)` | `server/test/smoke.test.js:3701` |
| `Resolving a pinless region-level event to a real town gives it that town's centre; an existing pin is never overwritten (TWN-2)` | `server/test/smoke.test.js:3722` |
| `migrate moves every legacy 'غير محدد' town onto the region, and leaves real towns alone (TWN-2)` | `server/test/smoke.test.js:3746` |
| `munasabatna-insert files an invitation with no known town under the region, still pending and pinless (TWN-2)` | `server/test/smoke.test.js:3766` |
| `A super_admin may hand a local admin the region itself, and that admin then sees the region-level queue; a made-up name is still refused (TWN-2)` | `server/test/smoke.test.js:3784` |
| `GET /api/towns keeps regions active-only with is_active and real counts, moves a stopped governorate to regions_soon as {id,name}, and still publishes only into the active name (#127)` | `server/test/smoke.test.js:3833` |
| `Town management is super_admin only — a plain admin gets 403 on every /admin/towns and /admin/regions path (TWN-3)` | `server/test/smoke.test.js:3934` |
| `GET /api/admin/towns lists the region with every town, its event count, and the villages catch-all marked locked (TWN-3)` | `server/test/smoke.test.js:3958` |
| `Adding a town validates coordinates, refuses spelling-variant duplicates, the reserved sentinel and a region name (TWN-3)` | `server/test/smoke.test.js:3969` |
| `A new town lands last; renaming is allowed until something stores its name, then refused; delete disables a used town and removes an unused one (TWN-3)` | `server/test/smoke.test.js:3986` |
| `The villages catch-all can be reordered but never renamed, disabled, moved, given a centre or deleted (TWN-3)` | `server/test/smoke.test.js:4037` |
| `PUT /api/admin/towns/order rewrites the order the public list follows, and refuses a partial list (TWN-3)` | `server/test/smoke.test.js:4050` |
| `PATCH /api/admin/regions/:id edits the map centre/zoom, refuses an out-of-range zoom, and refuses renaming a region events are filed under (TWN-3)` | `server/test/smoke.test.js:4067` |
| `PATCH /api/admin/events/:id/status approves the event` | `server/test/smoke.test.js:4088` |
| `Reactions and congratulations attach to the event` | `server/test/smoke.test.js:4098` |
| `An invalid reaction type is rejected` | `server/test/smoke.test.js:4110` |
| `DELETE /api/admin/events/:id cascades to child rows` | `server/test/smoke.test.js:4117` |
| `An unknown API route returns 404 JSON` | `server/test/smoke.test.js:4124` |
| `POST /api/events/:id/congratulate without a token is rejected` | `server/test/smoke.test.js:4135` |
| `Set up: a regular (non-admin) user publishes a عزا, the admin approves the event itself` | `server/test/smoke.test.js:4144` |
| `A تعزية on this عزا is created pending, with no injected festive badge, sender_name from the account` | `server/test/smoke.test.js:4168` |
| `The public (no token) does not see the pending تعزية` | `server/test/smoke.test.js:4182` |
| `The sender sees their own pending تعزية; a different logged-in visitor does not` | `server/test/smoke.test.js:4187` |
| `A non-owner, non-admin is rejected (403) from approving, deleting, or reading the moderation queue` | `server/test/smoke.test.js:4195` |
| `GET .../congratulations rejects an unknown ?status= filter` | `server/test/smoke.test.js:4210` |
| `The owner approves the pending تعزية — no admin involved — and it is now publicly visible` | `server/test/smoke.test.js:4215` |
| `A second تعزية is approved by an admin instead of the owner` | `server/test/smoke.test.js:4226` |
| `The owner can also reject a pending تعزية — it becomes hidden, not shown publicly` | `server/test/smoke.test.js:4239` |
| `The same owner also publishes an approved عرس — ownership is not type-bound` | `server/test/smoke.test.js:4257` |
| `A congratulation on this عرس publishes immediately — no premoderation outside عزا` | `server/test/smoke.test.js:4270` |
| `The owner (a non-admin) deletes it — an ownership right, not an admin-only power, even in a type that never premoderates` | `server/test/smoke.test.js:4282` |
| `Set up: a fresh, never-reviewed (auto-approved) congratulation to report` | `server/test/smoke.test.js:4296` |
| `Set up: ${CONGRATULATION_REPORT_THRESHOLD} distinct reporter accounts` | `server/test/smoke.test.js:4311` |
| `Reports under the threshold do not hide the message` | `server/test/smoke.test.js:4317` |
| `The same person reporting twice is rejected (409) and does not double the count` | `server/test/smoke.test.js:4331` |
| `The report that crosses the threshold auto-hides the message` | `server/test/smoke.test.js:4339` |
| `DELETE /api/admin/comments/:id is gone (case 19) — the hard-delete route was removed, the row is not` | `server/test/smoke.test.js:4358` |
| `Set up: an owner publishes an approved wedding for the reminder/announcement/notification tests` | `server/test/smoke.test.js:4383` |
| `POST/DELETE .../remind toggles "ذكّرني", and re-pressing an active reminder does not duplicate the row` | `server/test/smoke.test.js:4400` |
| `followers_count shows on a عرس event and disappears when show_followers_count is off — by the flag, not the type name` | `server/test/smoke.test.js:4422` |
| `عزا is seeded with show_followers_count off, so it never carries followers_count — one death is never compared to another` | `server/test/smoke.test.js:4449` |
| `is_reminded is true for the following user, false for a stranger, and false/absent for a guest` | `server/test/smoke.test.js:4473` |
| `GET /api/my-reminders returns what this user is following` | `server/test/smoke.test.js:4484` |
| `Set up: an admin publishes an upcoming and an already-ended wedding, and the follower follows both` | `server/test/smoke.test.js:4498` |
| `PATCH /api/events/:id/remind mutes without unfollowing; a non-boolean is 400 and an event not in the list is 404` | `server/test/smoke.test.js:4517` |
| `A muted follower is excluded from the reminder schedule and from an owner's cosmetic edit, while an unmuted follower still hears both` | `server/test/smoke.test.js:4561` |
| `POST /api/events/:id/remind on a pending event is a 404 and writes no row` | `server/test/smoke.test.js:4586` |
| `GET /api/my-reminders shapes «قائمتي»: counts, under_review_count, span strings, a bucket, upcoming before ended` | `server/test/smoke.test.js:4604` |
| `under_review_count carries the same legacy filter as the list itself` | `server/test/smoke.test.js:4643` |
| `myListBucket places every day in exactly one bucket, boundaries included` | `server/test/smoke.test.js:4680` |
| `date_change appears only for an announcement published after the row was saved` | `server/test/smoke.test.js:4696` |
| `DELETE /api/my-reminders?scope=ended clears only this user's ended rows; another scope is 400` | `server/test/smoke.test.js:4721` |
| `Set up: the owner also reminds their own event — tests self-exclusion even when editor is both owner and follower` | `server/test/smoke.test.js:4746` |
| `A critical event_date edit produces no live announcement until an admin approves it` | `server/test/smoke.test.js:4751` |
| `Approving that edit publishes the announcement, naming the old and new date` | `server/test/smoke.test.js:4763` |
| `The follower is notified; the owner who edited it themself is not, even though they also follow it` | `server/test/smoke.test.js:4804` |
| `A second critical date edit — this time by an admin, not the owner — supersedes the first announcement; both rows stay in the table` | `server/test/smoke.test.js:4836` |
| `This time both the follower and the owner (neither of them the editor) are notified` | `server/test/smoke.test.js:4861` |
| `GET /api/notifications returns only this user's own rows, and PATCH marks one read` | `server/test/smoke.test.js:4875` |
| `A user cannot read or mark-read another user's notification — secrecy at the query itself` | `server/test/smoke.test.js:4897` |
| `A cosmetic edit publishes no announcement, but tells each follower once — never the stranger, and a second edit the same day refreshes that one row` | `server/test/smoke.test.js:4908` |
| `A critical edit that is NOT a date change (location) is approved normally, never publishes a date announcement, but does notify as a venue change (issue #85, story 6)` | `server/test/smoke.test.js:4940` |
| `An announcement about an occasion type a legacy client cannot render never reaches it` | `server/test/smoke.test.js:4983` |
| `views_count stays a bare counter — repeated views by different identities never write a per-viewer row, and no such table exists` | `server/test/smoke.test.js:5017` |
| `The live announcement disappears once its event's (new) date has passed` | `server/test/smoke.test.js:5045` |
| `Set up: a followed wedding 4 days away, and a followed funeral 4 days away (notify_countdown off)` | `server/test/smoke.test.js:5092` |
| `A follower of an event 4 days away gets exactly one event_soon row` | `server/test/smoke.test.js:5123` |
| `The countdown body never names a date` | `server/test/smoke.test.js:5134` |
| `An occasion type with notify_countdown = 0 produces NO countdown row, for any offset` | `server/test/smoke.test.js:5143` |
| `Running the scheduler pass twice for the same day produces ONE row, not two` | `server/test/smoke.test.js:5151` |
| `Set up: an owner publishes an approved wedding for the venue-change notification test` | `server/test/smoke.test.js:5168` |
| `A venue change notifies followers; the user who made the change is not notified` | `server/test/smoke.test.js:5190` |
| `Approval notifies the publisher` | `server/test/smoke.test.js:5252` |
| `Rejection notifies the publisher and carries the reason` | `server/test/smoke.test.js:5275` |
| `Set up: a publisher owns a funeral with two pending تعازي awaiting review` | `server/test/smoke.test.js:5308` |
| `The moderation digest is ONE row carrying a count, not one row per message` | `server/test/smoke.test.js:5341` |
| `Set up: capUser follows four unrelated events at four countdown offsets, and owns+follows a fifth at 0 days` | `server/test/smoke.test.js:5366` |
| `The daily cap holds at three scheduled notifications, but an own-event one still arrives once the cap is spent` | `server/test/smoke.test.js:5414` |
| `A venue change still arrives for this same user even though the daily cap is already spent` | `server/test/smoke.test.js:5434` |
| `Exempt (own-event) event_soon rows must not be COUNTED by the cap — three of them must never block a fourth, unrelated one (issue #85 review, FIX 2)` | `server/test/smoke.test.js:5464` |
| `Notification preferences: «مناسبة جديدة» is on by default, can be turned off, and only a boolean is accepted` | `server/test/smoke.test.js:5542` |
| `A first approval tells everyone who kept «مناسبة جديدة» on — never the publisher or whoever turned it off — and asks the publisher to strengthen the event` | `server/test/smoke.test.js:5558` |
| `Rejecting and re-approving never announces the same event twice, and keeps its first approval time` | `server/test/smoke.test.js:5584` |
| `From the fourth new event of a day, each user gets ONE digest that updates in place and turns unread again` | `server/test/smoke.test.js:5598` |
| `«مناسبة جديدة» تصل أهل المحافظة ومن بلا محافظة ولا تصل محافظة أخرى — صفوفاً ودفعاً (#161)` | `server/test/smoke.test.js:5639` |
| `عدّاد «مناسبة جديدة» اليومي بمحافظة المناسبة: أول اعتماد في محافظة أخرى فرديّ لا ملخّص، ودفعه لا يستهلكه غيرها (#161)` | `server/test/smoke.test.js:5755` |
| `من بلا محافظة يتلقّى ملخّصاً مستقلاً لكل محافظة بعددها الصحيح ودفعةً واحدة لكل منهما — لا صفّاً واحداً يُكتب فوقه (#161)` | `server/test/smoke.test.js:5838` |
| `A followed event 2 days out reads «باقي يومين», the countdown's own idiom` | `server/test/smoke.test.js:5906` |
| `The second «قوّي مناسبتك» arrives once, two days after the first, while something is still missing` | `server/test/smoke.test.js:5920` |
| `A solemn occasion (عزا) is never asked to «strengthen» itself` | `server/test/smoke.test.js:5935` |
| `The admin event list names who published each event` | `server/test/smoke.test.js:5953` |
| `Activity log: who did what to which event — filterable, super admin only, and a deleted event stays readable` | `server/test/smoke.test.js:5962` |
| `start() re-arms itself with a fresh, zone-aware setTimeout every cycle — never a fixed-length setInterval` | `server/test/smoke.test.js:6011` |
| `The next run lands on 09:00 Asia/Jerusalem wall-clock across the next real DST boundary, not merely 24h later` | `server/test/smoke.test.js:6064` |
| `GET /api/reminders/schedule returns the remaining offsets for a followed event and nothing for an unfollowed one` | `server/test/smoke.test.js:6121` |
| `shouldDropSubscription: pure decision, no network — drops only on 404/410, keeps on 429/413/5xx/success` | `server/test/smoke.test.js:6169` |
| `GET /api/notifications/vapid-public-key returns null with no VAPID keys configured, and never carries a private key` | `server/test/smoke.test.js:6179` |
| `POST /api/notifications/subscribe is refused with an Arabic message (not a 500) when no VAPID keys are configured, and writes no row` | `server/test/smoke.test.js:6187` |
| `A notification row is still written normally with no VAPID keys configured (push failure never blocks persistence)` | `server/test/smoke.test.js:6200` |
| `Set up two users for push subscription storage/isolation tests` | `server/test/smoke.test.js:6236` |
| `Subscribing stores exactly one row per device; re-subscribing the same device is idempotent, not a duplicate; the endpoint never appears in the response` | `server/test/smoke.test.js:6241` |
| `A malformed subscription body is rejected with 400 in Arabic before ever reaching storage` | `server/test/smoke.test.js:6263` |
| `An over-length endpoint is rejected with 400, never silently truncated and stored (issue #85 review, FIX 1)` | `server/test/smoke.test.js:6277` |
| `A non-URL, and a non-https, endpoint are both rejected with 400 — a capability URL that is not even a URL is not worth storing` | `server/test/smoke.test.js:6303` |
| `DELETE /api/notifications/subscribe also rejects an over-length endpoint with 400 (shares the same validation)` | `server/test/smoke.test.js:6322` |
| `A user cannot see or remove another user's subscription, and unsubscribing an already-gone endpoint is not an error` | `server/test/smoke.test.js:6331` |
| `A 429 with a short Retry-After triggers exactly one retry, and sendToUser itself returns without waiting for it (issue #85 review, FIX 2) — no real network call` | `server/test/smoke.test.js:6358` |
| `A 429 whose Retry-After exceeds the retry ceiling is NOT retried, and still keeps the row` | `server/test/smoke.test.js:6402` |
| `Deleting a user deletes their push subscriptions (story 21, FK ON DELETE CASCADE)` | `server/test/smoke.test.js:6436` |
| `Admin creates a plain (non-ad) story` | `server/test/smoke.test.js:6465` |
| `A regular user is rejected (403) from every /api/admin/stories route` | `server/test/smoke.test.js:6476` |
| `An ad story with no advertiser_name is rejected with an Arabic message` | `server/test/smoke.test.js:6489` |
| `An ad story with advertiser_name is accepted and carries the ad fields` | `server/test/smoke.test.js:6499` |
| `A story link must be http(s); a video platform and CTA are stored and returned` | `server/test/smoke.test.js:6511` |
| `The studio previews a YouTube link as a real 1080×1920 card without uploading it` | `server/test/smoke.test.js:6542` |
| `Publishing a studio story uploads the generated poster, stores the link/CTA, and deletes the asset with the story` | `server/test/smoke.test.js:6574` |
| `Publishing a studio story validates the placement before any Cloudinary upload or database write (#173)` | `server/test/smoke.test.js:6641` |
| `Turning an existing story into an ad without an advertiser_name is rejected the same way on PATCH` | `server/test/smoke.test.js:6674` |
| `The four ready-made expiry presets come from the server` | `server/test/smoke.test.js:6683` |
| `An expired story is excluded from GET /api/stories; a not-yet-expired one and a never-expiring one both remain` | `server/test/smoke.test.js:6691` |
| `An invalid expires_at is rejected instead of silently becoming null` | `server/test/smoke.test.js:6719` |
| `Set up: two registered viewers from two different towns` | `server/test/smoke.test.js:6737` |
| `A registered viewer watching the same story twice today is counted once` | `server/test/smoke.test.js:6751` |
| `An anonymous viewer watching with the same device_id twice today is counted once` | `server/test/smoke.test.js:6762` |
| `A view with no token and no device_id is rejected` | `server/test/smoke.test.js:6772` |
| `A second, different registered viewer is counted as a third distinct view/viewer overall` | `server/test/smoke.test.js:6778` |
| `Town breakdown reports one count per registered viewer's town, and a bucket for the anonymous device view` | `server/test/smoke.test.js:6786` |
| `Clicks are counted, and CPM/eCPM/frequency never appear in the metrics response` | `server/test/smoke.test.js:6794` |
| `A report is recorded once per person; a second report from the same person is rejected` | `server/test/smoke.test.js:6805` |
| `Reporting a story requires a login` | `server/test/smoke.test.js:6812` |
| `With no entry_promo_story_id the entry card is the first active story, source "auto"` | `server/test/smoke.test.js:6823` |
| `Pinning a story id returns that story from the entry card with source "pinned"` | `server/test/smoke.test.js:6834` |
| `Clearing entry_promo_story_id with an empty string returns the entry card to auto` | `server/test/smoke.test.js:6852` |
| `A pinned story that is then deleted leaves the entry card on auto, without an error` | `server/test/smoke.test.js:6864` |
| `A non-numeric entry_promo_story_id is rejected with an Arabic 400, and a town-scoped admin is refused (403)` | `server/test/smoke.test.js:6890` |
| `With no active story the entry card is disabled, and every story's expiry is restored afterwards` | `server/test/smoke.test.js:6919` |
| `Placement (#173): no X-App-Version receives bar stories only; a modern header receives all three` | `server/test/smoke.test.js:6938` |
| `Placement (#173): the entry card never hands a legacy client a pinned carousel or feed story` | `server/test/smoke.test.js:6985` |
| `Placement (#173): an unknown placement is refused with 400 and an Arabic message, and nothing is stored` | `server/test/smoke.test.js:7031` |
| `Placement (#173): null and empty placements fall back to bar, and an update moves the story between positions` | `server/test/smoke.test.js:7073` |
| `Placement (#173): views and clicks are recorded for carousel and feed stories exactly as for bar ones` | `server/test/smoke.test.js:7100` |
| `Set up: a town-scoped admin, assigned to رهط via the super_admin's towns API` | `server/test/smoke.test.js:7155` |
| `Set up: one pending event inside the scoped admin's town, one outside it` | `server/test/smoke.test.js:7177` |
| `Case 1: a town-scoped admin approves an event in their own town — 200` | `server/test/smoke.test.js:7195` |
| `Case 2: the same admin gets 404, not 403, for an event outside their towns` | `server/test/smoke.test.js:7202` |
| `Case 3: GET /admin/events never returns the out-of-scope event to the scoped admin` | `server/test/smoke.test.js:7209` |
| `Case 4: GET /admin/stats counts only the scoped admin's own town — matches a direct DB count for رهط exactly` | `server/test/smoke.test.js:7214` |
| `Case 5: GET /admin/users is closed (403) to a plain admin — super_admin only now` | `server/test/smoke.test.js:7220` |
| `Case 6: a super_admin passes every one of cases 1-5 — no town restriction, and /admin/users stays open to it` | `server/test/smoke.test.js:7225` |
| `Case 7: an admin with zero admin_towns rows sees nothing and can approve nothing — fail closed` | `server/test/smoke.test.js:7247` |
| `GET /admin/me reports the caller's own towns, and an admin with none gets an empty list` | `server/test/smoke.test.js:7281` |
| `Case 8: an admin publishing in their own town is approved immediately; the same admin publishing outside it lands pending, never rejected` | `server/test/smoke.test.js:7296` |
| `A super_admin's broadcast lands with scope_town = NULL and reaches a user in any town` | `server/test/smoke.test.js:7336` |
| `A town admin's broadcast produces one row per own town and reaches only those users` | `server/test/smoke.test.js:7356` |
| `A user in another town does NOT see a town-scoped broadcast` | `server/test/smoke.test.js:7371` |
| `A town admin naming a town outside their scope gets 404, and writes zero rows` | `server/test/smoke.test.js:7376` |
| `An admin with no assigned towns is refused and writes zero rows` | `server/test/smoke.test.js:7388` |
| `An expired broadcast is absent from the live read and present in the notification centre` | `server/test/smoke.test.js:7402` |
| `A «بلا شريط» broadcast (expires_at = NULL) never appears in the live read` | `server/test/smoke.test.js:7425` |
| `Dismissing hides a broadcast from the live read for that user only, moves it to read in their centre, and it stays there` | `server/test/smoke.test.js:7441` |
| `Dismissing a broadcast outside the caller's scope is 404` | `server/test/smoke.test.js:7468` |
| `POST /api/notifications/read-all marks every personal notification and broadcast read, deletes nothing, and touches no one else` | `server/test/smoke.test.js:7473` |
| `A user created AFTER the broadcast still sees it — proves no fan-out` | `server/test/smoke.test.js:7508` |
| `The centre hides a broadcast published before the account registered, and keeps a newer one` | `server/test/smoke.test.js:7566` |
| `A broadcast that expired more than 30 days ago drops out of the centre; one expired 10 days ago stays` | `server/test/smoke.test.js:7596` |
| `GET /api/broadcasts/live is unchanged by the centre limits: only live broadcasts, even anonymously` | `server/test/smoke.test.js:7614` |
| `An invalid tone is rejected in Arabic` | `server/test/smoke.test.js:7631` |
| `A past expires_at is rejected in Arabic` | `server/test/smoke.test.js:7640` |
| `An expires_at too far in the future is rejected` | `server/test/smoke.test.js:7649` |
| `A non-super admin gets 404, not 403, on PATCH /admin/users/:id/role` | `server/test/smoke.test.js:7686` |
| `super_admin is never grantable through this endpoint` | `server/test/smoke.test.js:7693` |
| `Promotion reaches admin and nothing higher, and the response never carries pin_code` | `server/test/smoke.test.js:7700` |
| `Promoting an already-admin user is rejected, not silently repeated` | `server/test/smoke.test.js:7716` |
| `Demoting clears admin_towns in the same transaction` | `server/test/smoke.test.js:7723` |
| `Demoting a plain user (never an admin) is rejected` | `server/test/smoke.test.js:7743` |
| `Self-demotion is refused` | `server/test/smoke.test.js:7750` |
| `The last remaining super_admin cannot be demoted` | `server/test/smoke.test.js:7758` |
| `admin.demote is logged only for a successful commit, never for a rejected attempt` | `server/test/smoke.test.js:7777` |
| `Case 10: sending village_id together with a non-catch-all town is rejected` | `server/test/smoke.test.js:7811` |
| `Case 12: GET /api/towns with no X-App-Version returns the towns array unchanged, element by element, plus the new villages key, each row carrying its real region_id` | `server/test/smoke.test.js:7825` |
| `Case 13: artist_name sent on a عزا publish is silently ignored — not stored, not rejected` | `server/test/smoke.test.js:7897` |
| `Case 14: artist_name sent on a عرس publish is stored and comes back in GET /api/events` | `server/test/smoke.test.js:7920` |
| `Set up: a super_admin creates a service category` | `server/test/smoke.test.js:7944` |
| `Case 17: an admin-created provider needs no consent fields — the server records the consent itself` | `server/test/smoke.test.js:7953` |
| `Case 18: an admin holding only رهط cannot create a provider for {رهط, حورة} — containment` | `server/test/smoke.test.js:7975` |
| `Set up: a super_admin creates a real provider with a phone number` | `server/test/smoke.test.js:7993` |
| `Case 15: GET /api/services/providers carries no phone key on any row` | `server/test/smoke.test.js:8010` |
| `Case 16: GET /api/services/providers/:id carries phone` | `server/test/smoke.test.js:8018` |
| `Optional phone: an admin creates a provider with no phone — 201, stored as NULL` | `server/test/smoke.test.js:8025` |
| `Optional phone: a present but invalid phone is still rejected (400), and nothing is written` | `server/test/smoke.test.js:8036` |
| `Optional phone: the detail returns phone: null; the list has no phone key and has_phone tells the two apart` | `server/test/smoke.test.js:8048` |
| `Optional phone: PATCH sets the number, leaves it alone when the key is absent, and clears it with an empty string` | `server/test/smoke.test.js:8062` |
| `Category attributes: creating a category with custom attributes saves and returns them` | `server/test/smoke.test.js:8093` |
| `Category attributes: GET /api/services/categories returns attributes for active categories` | `server/test/smoke.test.js:8113` |
| `Provider specs & estimates: creating a provider with package estimate and attributes` | `server/test/smoke.test.js:8124` |
| `Provider specs & estimates: GET /api/services/providers carries specs, price_estimate_desc, price_type, and strictly NO phone` | `server/test/smoke.test.js:8146` |
| `Provider search: ?search= filters by name, description, and specs` | `server/test/smoke.test.js:8158` |
| `Provider specs & estimates: GET /api/services/providers/:id carries full details including phone` | `server/test/smoke.test.js:8166` |
| `Set up: an owner publishes an approved event in the scoped admin's town, and a well-wisher congratulates it` | `server/test/smoke.test.js:8189` |
| `Case 20: a town-scoped admin hides the comment — status becomes hidden, moderated_by is set to that admin` | `server/test/smoke.test.js:8218` |
| `Case 21: the event owner cannot lift the block the admin placed` | `server/test/smoke.test.js:8230` |
| `Set up: an approved wedding whose honoree name and clan carry HTML metacharacters` | `server/test/smoke.test.js:8368` |
| `GET /e/:id on an approved event returns 200 HTML with absolute og:title/og:image/og:url` | `server/test/smoke.test.js:8384` |
| `User text comes back escaped — in the page body AND inside content="…"` | `server/test/smoke.test.js:8396` |
| `The preview leads with the occasion type, not the free-text title` | `server/test/smoke.test.js:8422` |
| `og:image points at the generated card, and og:image:width/height declare its real 1200×1200 size` | `server/test/smoke.test.js:8428` |
| `GET /e/:id/card.jpg on the approved event is a real 1200×1200 JPEG` | `server/test/smoke.test.js:8439` |
| `Set up: مناسبة عزا معتمدة بلا ملصق (نوعها لا يحمل default_poster_url) لفحوص صورة التنزيل` | `server/test/smoke.test.js:8469` |
| `GET /e/:id/download.png: PNG بعرض المصدر وارتفاعه + ارتفاع الشريط، بترويسة تنزيل` | `server/test/smoke.test.js:8486` |
| `رمز QR على الشريط يطابق مصفوفة الوحدات لرابط الصفحة المطلق — وحدةً بوحدة` | `server/test/smoke.test.js:8508` |
| `صورة التنزيل الثانية تُخدَم من كاش الخادم ولا تُعاد رسمها` | `server/test/smoke.test.js:8539` |
| `مصدر التنزيل يتبع الملصق حين لا بطاقة أساسية: العرض والارتفاع مقاس الملصق نفسه` | `server/test/smoke.test.js:8554` |
| `THE SIZE GUARD: a card built from a real (non-trivial) poster still stays under the WhatsApp preview limit` | `server/test/smoke.test.js:8573` |
| `The footer mark/text sit clear of the decorative frame — lowest drawn content stays ≥12px above the companion rule` | `server/test/smoke.test.js:8591` |
| `A second request for the same card is served from cache, not re-rendered` | `server/test/smoke.test.js:8628` |
| `The Content-Security-Policy header is present on the share route, with a font source and still no script source` | `server/test/smoke.test.js:8640` |
| `The Cairo woff2 files are actually served by the assets route with the woff2 content type` | `server/test/smoke.test.js:8655` |
| `Both download buttons are present, and the secondary one points at the site root rather than the APK` | `server/test/smoke.test.js:8664` |
| `صفحة /e/:id تحمل زرّ «نزّل الصورة» إلى /e/:id/download.png — لا إلى صورة أخرى (#182)` | `server/test/smoke.test.js:8677` |
| `The three-reason strip is present` | `server/test/smoke.test.js:8688` |
| `The page contains no <script tag at all` | `server/test/smoke.test.js:8695` |
| `No date, venue, or phone value leaks anywhere in the response for an event that has all three set` | `server/test/smoke.test.js:8700` |
| `Editing the event produces a different card, and the old cached one is evicted` | `server/test/smoke.test.js:8722` |
| `Set up: a pending (not yet approved) wedding` | `server/test/smoke.test.js:8751` |
| `GET /e/:id on a pending event, a non-existent id, and a non-numeric id all 404 with an identical body` | `server/test/smoke.test.js:8761` |
| `GET /e/:id/card.jpg on a pending event, a non-existent id, and a non-numeric id all 404` | `server/test/smoke.test.js:8773` |
| `GET /e/:id/download.png على مناسبة معلّقة أو معرّف مفقود/غير رقمي ⇒ 404 الموحّدة نفسها، لا صورة ولا 403` | `server/test/smoke.test.js:8782` |
| `Set up: an approved wedding whose date has already passed` | `server/test/smoke.test.js:8802` |
| `GET /e/:id on an expired approved event is still 200 and shows the «انتهت» marker` | `server/test/smoke.test.js:8812` |
| `Set up: a poster-less عزا (solemn tone, no default_poster_url either)` | `server/test/smoke.test.js:8819` |
| `The festive share page carries «أعراسنا» in og:site_name, the description, and the footer` | `server/test/smoke.test.js:8836` |
| `A solemn-tone event with no poster renders a real card in the solemn palette, not the festive one` | `server/test/smoke.test.js:8848` |
| `Both palettes expose a wordmark, and the generated card renders for each tone` | `server/test/smoke.test.js:8869` |
| `The solemn (condolence) share page never carries «أعراسنا» anywhere, and still carries «مناسبات النقب»` | `server/test/smoke.test.js:8884` |
| `Set up: an approved event for the share/download analytics tests below` | `server/test/smoke.test.js:8904` |
| `A name from the closed list is accepted, and a row is actually written` | `server/test/smoke.test.js:8914` |
| `A name outside the closed list is rejected with an Arabic message` | `server/test/smoke.test.js:8927` |
| `A count-only name (share_page_viewed) sent WITH a token and a device_id still writes a row whose user_id and device_id are both NULL` | `server/test/smoke.test.js:8935` |
| `The tighter analytics rate limit actually returns a rejection when exceeded` | `server/test/smoke.test.js:8950` |
| `The analytics_events table has no event_id, ip, or user_agent column at all — the direct, permanent test of the governing rule` | `server/test/smoke.test.js:8961` |
| `Exercising the nokoot (دفتر النقوط) routes writes ZERO analytics rows — the private ledger is not an exception` | `server/test/smoke.test.js:8970` |
| `GET /e/:id/download 302-redirects to the APK url and records app_download_clicked with the event's town` | `server/test/smoke.test.js:8985` |
| `GET /e/:id/download still redirects and records for a non-existent id — just with no content_town` | `server/test/smoke.test.js:9007` |
| `A row older than the retention window loses its identity on fold and survives as a daily counter; running the fold twice does not double-count` | `server/test/smoke.test.js:9021` |
| `Set up: two fresh users for the privacy tests below, each with a pre-existing identified analytics row (standing in for the register-time row a real sign-up would have written)` | `server/test/smoke.test.js:9081` |
| `PATCH /api/auth/me opts a user out of behavioural analytics, and GET /api/auth/me reflects it — neither response carries pin_code` | `server/test/smoke.test.js:9097` |
| `an expired or tampered token is 401 (sign in again), never 403 — 403 stays "not allowed"` | `server/test/smoke.test.js:9112` |
| `GET /api/auth/me renews a plain user's token (a working one), and never an admin's` | `server/test/smoke.test.js:9129` |
| `An opted-out signed-in user triggers an identified analytics event ⇒ zero rows written for them — not an anonymised one` | `server/test/smoke.test.js:9147` |
| `Opting out changes nothing about the ability to use the app — a normal authenticated action still succeeds` | `server/test/smoke.test.js:9164` |
| `POST /api/privacy/analytics-erasure erases only the caller's own analytics rows — another user's rows are untouched` | `server/test/smoke.test.js:9173` |
| `Deleting an account removes its analytics rows too — the FK cascade, not a separate code path` | `server/test/smoke.test.js:9194` |
| `POST /api/privacy/requests queues a formal request and states a deadline` | `server/test/smoke.test.js:9204` |
| `POST /api/privacy/requests rejects an unknown request type` | `server/test/smoke.test.js:9217` |
| `A town-scoped admin gets 403 on both the analytics read and the privacy request queue — super_admin only, never a town admin` | `server/test/smoke.test.js:9225` |
| `A super_admin gets 200 on both, sees the queued request, and can close it` | `server/test/smoke.test.js:9233` |
| `DELETE /api/account — no PIN is 400, a wrong PIN is 401, the right PIN is 200; an already-issued token stops answering with data afterwards` | `server/test/smoke.test.js:9257` |
| `POST /api/privacy/deletion-request is public, folds Arabic-Indic digits and spaces, answers identically for a registered number, an unknown one and a duplicate, and queues exactly one erasure request` | `server/test/smoke.test.js:9286` |
| `DELETE /api/admin/users/:id — a super_admin deletes another account, its queue row goes with it (CASCADE), deleting itself is refused, and an unknown id is 404` | `server/test/smoke.test.js:9344` |
| `An old public request neither blocks the owner from filing a verified one nor gets promoted to verified` | `server/test/smoke.test.js:9387` |
| `The scheduled daily pass deletes a user whose VERIFIED erasure request passed the 30-day deadline — and leaves the fresh, the access-only and the already-closed requests untouched; a second run is safe` | `server/test/smoke.test.js:9429` |
| `executeErasureRequest refuses a fresh request when called directly — it re-proves eligibility, not just existence` | `server/test/smoke.test.js:9523` |
| `A close committed after the job’s pending pre-read but held under a row lock makes the atomic eligibility check prevent the deletion` | `server/test/smoke.test.js:9555` |
| `deleting your own account deletes your profile photo from Cloudinary, not just the row that pointed at it` | `server/test/smoke.test.js:9652` |
| `a super_admin deleting an account from the panel deletes its profile photo too` | `server/test/smoke.test.js:9685` |
| `GET /api/admin/analytics/users/:id (issue #44, user story 45) — a super_admin reads one user's own rows, isolated from another user's, with no event id of any kind, and pagination that behaves` | `server/test/smoke.test.js:9720` |
| `GET /api/admin/analytics/overview, devices, and devices/:deviceId/log — super_admin tracks all viewers and devices while town admins are refused` | `server/test/smoke.test.js:9781` |
| `GET /api/privacy/notice is public, names every event in the closed list in Arabic, and leaks no code identifiers` | `server/test/smoke.test.js:9858` |
| `GET /api/settings/public answers cleanly before any setting was ever saved, and exposes nothing but the support number, the default audio and the providers layout` | `server/test/smoke.test.js:9883` |
| `A plain (town-scoped) admin is refused on both GET and PUT /api/admin/settings — super_admin only` | `server/test/smoke.test.js:9894` |
| `PUT /api/admin/settings rejects an invalid WhatsApp number with an Arabic message` | `server/test/smoke.test.js:9904` |
| `PUT /api/admin/settings rejects a key outside the code-owned whitelist` | `server/test/smoke.test.js:9912` |
| `A super_admin saves the support number, local and international forms normalise to the same canonical value, and it reads back on both the admin and public routes` | `server/test/smoke.test.js:9919` |
| `A super_admin clears a previously-saved support number with an explicit empty value — it goes back to null everywhere, and an absent key leaves it untouched` | `server/test/smoke.test.js:9942` |
| `رسالة الترحيب: لا صفّ بعد ← الافتراضية من الخادم في home_welcome، لا null ولا نصّ في العميل` | `server/test/smoke.test.js:10002` |
| `رسالة الترحيب: العنوان والنصّ المخصّصان يُحفَظان بـPUT /api/admin/settings ويصلان العامة، والعنوان الفارغ يبقى ""` | `server/test/smoke.test.js:10011` |
| `رسالة الترحيب: نصّ فارغ محفوظ يُخفي البطاقة — home_welcome: null لا افتراضية` | `server/test/smoke.test.js:10037` |
| `providers_display: a super_admin saves «cards» and every client reads it back from the public route; a town-scoped admin is refused (403) and changes nothing` | `server/test/smoke.test.js:10068` |
| `providers_display: an unknown value is rejected with an Arabic 400 and the saved choice stays` | `server/test/smoke.test.js:10091` |
| `providers_display: clearing it with an explicit empty value returns the public route to the default «compact»` | `server/test/smoke.test.js:10104` |
| `providers_display: a stale value in the table also reads as «compact» — the fallback lives in the service, not in a client` | `server/test/smoke.test.js:10114` |
| `POST and DELETE /api/admin/settings/default-audio refuse a plain user and a town-scoped admin — super_admin only` | `server/test/smoke.test.js:10137` |
| `POST /api/admin/settings/default-audio rejects a missing file, and a non-audio file under the audio field` | `server/test/smoke.test.js:10149` |
| `A super_admin uploads the default audio — it is stored relative and comes back absolute on the admin and public routes` | `server/test/smoke.test.js:10160` |
| `PUT /api/admin/settings refuses the default audio as free text — it can only be set by upload` | `server/test/smoke.test.js:10181` |
| `DELETE /api/admin/settings/default-audio clears it back to null on the public route` | `server/test/smoke.test.js:10194` |
| `GET /api/live answers cleanly before anything is ever saved` | `server/test/smoke.test.js:10210` |
| `A plain (town-scoped) admin is refused on PUT for the live keys — super_admin only` | `server/test/smoke.test.js:10219` |
| `PUT /api/admin/settings rejects a non-https stream URL` | `server/test/smoke.test.js:10226` |
| `PUT /api/admin/settings rejects a stream URL whose host has no dot, and a value that is not a URL at all` | `server/test/smoke.test.js:10234` |
| `Any https platform is accepted now — a non-TikTok host is no longer refused` | `server/test/smoke.test.js:10245` |
| `A stream URL carrying embedded credentials is rejected with an Arabic message — the displayed link is a phishing shape` | `server/test/smoke.test.js:10254` |
| `A stream URL carrying a newline is stored normalised, never as the raw string that was validated` | `server/test/smoke.test.js:10262` |
| `A super_admin saves a valid channel URL — it reads back on both the admin route and GET /api/live` | `server/test/smoke.test.js:10276` |
| `Saving a live title without an until is rejected with an Arabic message, and nothing is saved` | `server/test/smoke.test.js:10289` |
| `Saving a live title with a FUTURE until marks the live active, falling back to the profile url` | `server/test/smoke.test.js:10302` |
| `A distinct live_stream_url overrides the profile url in live.url, and a TikTok link is simply non-embeddable` | `server/test/smoke.test.js:10317` |
| `Saving a PAST until keeps the live present but inactive` | `server/test/smoke.test.js:10328` |
| `Clearing the title and until brings live back to null` | `server/test/smoke.test.js:10340` |
| `GET /api/settings/public still returns exactly its three keys after the live settings were saved` | `server/test/smoke.test.js:10350` |
| `With no channel and no live saved, /live, /live/card.jpg and /live/go all 404` | `server/test/smoke.test.js:10364` |
| `Set up: a permanent channel link only, no live` | `server/test/smoke.test.js:10373` |
| `/live with a channel link only renders the channel headline and no «مباشر الآن»` | `server/test/smoke.test.js:10380` |
| `/live/go redirects to the profile url when there is no active live` | `server/test/smoke.test.js:10388` |
| `Set up: an ACTIVE live (future until, its own live url)` | `server/test/smoke.test.js:10394` |
| `/live with an active live shows the topic as the headline, in og:title, and with the «مباشر الآن» badge` | `server/test/smoke.test.js:10407` |
| `/live/go redirects to the live url while active` | `server/test/smoke.test.js:10423` |
| `Set up: the same live, now EXPIRED (until moved to the past)` | `server/test/smoke.test.js:10429` |
| `/live with an EXPIRED live falls back to the channel state — no stale topic, no stale badge` | `server/test/smoke.test.js:10437` |
| `/live/go redirects to the profile url once the live has expired` | `server/test/smoke.test.js:10448` |
| `A topic carrying an injection attempt renders escaped — the raw <img never appears in the page body` | `server/test/smoke.test.js:10454` |
| `/live/card.jpg is a real, non-empty JPEG, and a different topic produces a different cached file` | `server/test/smoke.test.js:10478` |
| `/live/download 302-redirects to the APK url and records app_download_clicked with no content_town` | `server/test/smoke.test.js:10499` |
| `Both new analytics event names (tiktok_page_viewed, tiktok_click_through) are accepted by analytics.service.js and stay count-only` | `server/test/smoke.test.js:10511` |
| `A youtube.com/live/<id> stream link is saved and GET /api/live derives its youtube-nocookie embed_url` | `server/test/smoke.test.js:10537` |
| `GET /api/live keeps its original shape for published APKs: profile_url and live.{title,until,url,active}` | `server/test/smoke.test.js:10556` |
| `toEmbedUrl derives youtu.be, watch?v= (www and m.), embed/, and /channel/UC… links correctly` | `server/test/smoke.test.js:10566` |
| `toEmbedUrl returns null for an @handle, TikTok, Facebook, a malformed id, and garbage` | `server/test/smoke.test.js:10580` |
| `A TikTok stream link saves fine but GET /api/live answers embed_url: null (a plain link)` | `server/test/smoke.test.js:10595` |
| `Migration renames tiktok_profile_url to live_channel_url, and running migrate twice in a row is safe` | `server/test/smoke.test.js:10607` |
| `The rename never overwrites a value already saved under the new key` | `server/test/smoke.test.js:10624` |
| `jerusalemDateString returns the Asia/Jerusalem date, not the UTC one, at 22:30Z (summer and winter)` | `server/test/smoke.test.js:10637` |
| `PUT /api/admin/live/episodes/<today> without a token → 401, from a town admin → 403` | `server/test/smoke.test.js:10678` |
| `A poll with fewer than two or more than four options is refused with 400` | `server/test/smoke.test.js:10688` |
| `A poll question without options, options without a question, a blank option, and a bad date are refused with 400` | `server/test/smoke.test.js:10698` |
| `A super_admin creates today's episode → 200 with the saved episode` | `server/test/smoke.test.js:10711` |
| `Set up: yesterday with no poll, and two days ago with a poll (past dates are allowed)` | `server/test/smoke.test.js:10723` |
| `GET /api/live/hub (anonymous): today has its poll without results, previous is the latest earlier day WITH a poll` | `server/test/smoke.test.js:10738` |
| `POST vote without a token → 401` | `server/test/smoke.test.js:10758` |
| `POST vote with an out-of-range or non-integer option_index → 400; on an unknown episode → 404` | `server/test/smoke.test.js:10763` |
| `POST vote on an earlier day's episode → 400 «هذا النقاش مغلق»` | `server/test/smoke.test.js:10774` |
| `The first vote → 200 with results; a second vote by the same account → 409` | `server/test/smoke.test.js:10786` |
| `GET /api/live/hub shows today's results to the voter, and still hides them from a signed-in non-voter` | `server/test/smoke.test.js:10805` |
| `After a vote, changing the poll options → 409; changing only the topic → 200` | `server/test/smoke.test.js:10816` |
| `GET /api/admin/live/episodes lists the recent episodes newest first with vote_count, super_admin only` | `server/test/smoke.test.js:10833` |
| `DELETE /api/admin/live/episodes/:id removes the episode and its votes; an unknown id → 404` | `server/test/smoke.test.js:10844` |
| `A vote emits live_poll_<episodeId> with { results, total_votes } only — never my_vote` | `server/test/smoke.test.js:10894` |
| `PUT /api/admin/settings with only the WhatsApp number emits no live_status and writes no live notification` | `server/test/smoke.test.js:10928` |
| `First active live saved today → live_status, one system_notification, rows only for notify_new_events = 1` | `server/test/smoke.test.js:10947` |
| `A second save the same day (extending until) → live_status again, but no new rows and no announcement` | `server/test/smoke.test.js:10989` |
| `Saving a live whose until is already past → live_status, but no notification at all` | `server/test/smoke.test.js:11009` |
| `/live/embed with no link saved at all → 404` | `server/test/smoke.test.js:11047` |
| `Set up: an active YouTube live, today's episode with a poll, and yesterday's poll with three votes` | `server/test/smoke.test.js:11053` |
| `GET /live names no platform and shows the topic, episode question, today's poll read-only, and yesterday's result` | `server/test/smoke.test.js:11090` |
| `An <img onerror> in the episode topic renders escaped on /live, never as markup` | `server/test/smoke.test.js:11120` |
| `GET /live/embed with a YouTube live → 200, an iframe onto embed_url with referrerpolicy, under its own CSP` | `server/test/smoke.test.js:11126` |
| `/live/go still redirects to the active live's own link` | `server/test/smoke.test.js:11148` |
| `/live/embed with a TikTok stream link → 404, and /live/go goes to that link as before` | `server/test/smoke.test.js:11154` |
| `Set up: three events across three distinct towns (two weddings, one funeral) plus a fourth event in a fresh village` | `server/test/smoke.test.js:11189` |
| `A single ?town= value returns exactly what it always has — the no-regression case` | `server/test/smoke.test.js:11238` |
| `Two comma-separated towns return the union of both, and nothing from a third` | `server/test/smoke.test.js:11247` |
| `A single occasion_type_id (the funeral) excludes a wedding event` | `server/test/smoke.test.js:11257` |
| `Two comma-separated occasion_type_id values return the union of both types` | `server/test/smoke.test.js:11264` |
| `?village_id= filters to only that village alone` | `server/test/smoke.test.js:11272` |
| `village_id combined with a town in a DIFFERENT town returns the union of both places, not their (always-empty) intersection` | `server/test/smoke.test.js:11282` |
| `village_id combined with town = 'القرى والتجمعات' itself is coherent: the catch-all town already contains every village's events, so the union is just that same catch-all set` | `server/test/smoke.test.js:11291` |
| `Twenty comma-separated occasion_type_id values are accepted` | `server/test/smoke.test.js:11299` |
| `Twenty-one comma-separated occasion_type_id values are rejected with 400 and an Arabic message — not a silent truncation to the first twenty` | `server/test/smoke.test.js:11305` |
| `Twenty-one repetitions of the SAME occasion_type_id are also rejected — the cap counts raw values sent, not distinct ones after dedupe` | `server/test/smoke.test.js:11315` |
| `A duplicated value in the list does not duplicate a row in the result` | `server/test/smoke.test.js:11322` |
| `'الكل' inside a town list still means no town filter, exactly as a lone ?town=الكل` | `server/test/smoke.test.js:11328` |
| `An unknown town value matches nothing, exactly like before list support existed — 200 with an empty list, not a 400` | `server/test/smoke.test.js:11342` |
| `A request with no X-App-Version cannot see the non-legacy funeral type even when it asks for it by id inside a list` | `server/test/smoke.test.js:11348` |
| `A legacy client requesting ONLY the non-legacy funeral type by id gets an empty result, never a widened one` | `server/test/smoke.test.js:11356` |
| `GET /api/map/events supports the same town/occasion_type_id/village_id list filtering, including the legacy intersection` | `server/test/smoke.test.js:11362` |
| `the migration turned the archive on for the wedding type only` | `server/test/smoke.test.js:11433` |
| `a live on a CHANNEL link is not saved as an episode, and the admin is told why` | `server/test/smoke.test.js:11440` |
| `a live on ONE video's link becomes today's episode, kept in its canonical watch form` | `server/test/smoke.test.js:11456` |
| `while the live is on, today is the live itself — not in «الحلقات السابقة»` | `server/test/smoke.test.js:11471` |
| `a topic the admin already typed for the day is kept when the live is re-saved` | `server/test/smoke.test.js:11478` |
| `once the live ends, today's episode is listed under «الحلقات السابقة» with its own link and player` | `server/test/smoke.test.js:11488` |
| `the /live page lists «الحلقات السابقة» as links to each episode page, titles escaped` | `server/test/smoke.test.js:11503` |
| `PUT /api/admin/live/episodes/:date refuses a channel link as an episode video, and stores a video link canonically` | `server/test/smoke.test.js:11510` |
| `an episode save without video_url keeps the recorded video (a broadcast may have landed after the form loaded); an empty one clears it` | `server/test/smoke.test.js:11526` |
| `GET /live/e/:id is the branded episode page: escaped title, its own card as og:image, and «شاهد الحلقة»` | `server/test/smoke.test.js:11549` |
| `the episode card is a 1200×1200 JPEG; /go redirects to the stored video only; /embed frames it` | `server/test/smoke.test.js:11561` |
| `an unknown, malformed or video-less episode id is a 404 on every episode route` | `server/test/smoke.test.js:11578` |
| `without Cloudinary keys, asking to upload a share image answers in Arabic instead of failing` | `server/test/smoke.test.js:11592` |
| `share-image signing is super_admin only` | `server/test/smoke.test.js:11601` |
| `the signature names a public_id inside this episode's own folder, and never carries the secret` | `server/test/smoke.test.js:11609` |
| `registering a share image needs a real Cloudinary response signature for THIS episode` | `server/test/smoke.test.js:11624` |
| `a verified share image is stored and drawn into the episode card` | `server/test/smoke.test.js:11639` |
| `removing the share image goes back to the generated card, and deletes the file on Cloudinary` | `server/test/smoke.test.js:11657` |
| `album photos: the type gate is the only gate — an upcoming wedding can be prepared, an ended funeral cannot` | `server/test/smoke.test.js:11741` |
| `album routes: a town admin manages a wedding in their town; one with no towns gets 404, never 403` | `server/test/smoke.test.js:11755` |
| `a verified photo is added and shows under the ended wedding in GET /api/events/:id` | `server/test/smoke.test.js:11767` |
| `a user tags himself: pending and invisible, then searchable by a spelling variant after approval` | `server/test/smoke.test.js:11826` |
| `a user withdraws the tag, re-requests, is rejected, and cannot re-request the same photo` | `server/test/smoke.test.js:11872` |
| `a self-tag without a profile photo, or without confirm_phone, is refused and writes no row` | `server/test/smoke.test.js:11898` |
| `a conditional tag keeps both descriptions and the phone-confirmation stamp, and the queue returns them` | `server/test/smoke.test.js:11923` |
| `apply_caption adopts the suggestion on approval; without it — and on any rejection — the caption is untouched` | `server/test/smoke.test.js:11954` |
| `descriptions longer than 200 characters are truncated, and blank ones are stored NULL` | `server/test/smoke.test.js:12007` |
| `the tag queue counts match the rows of each status, and move as a tag is decided` | `server/test/smoke.test.js:12039` |
| `three distinct privacy reports hide the photo; the admin restores it and it is public again` | `server/test/smoke.test.js:12071` |
| `there is no album photo cap: 61 rows are accepted and every one is listed` | `server/test/smoke.test.js:12099` |
| `GET /p/:id serves one photo with og:image, noindex, and no script — and 404s when hidden` | `server/test/smoke.test.js:12125` |
| `GET /a/:id serves the album with its cover as og:image, noindex, and no script — and 404s when hidden or malformed` | `server/test/smoke.test.js:12149` |
| `a person is a row: a honoree is findable by name, his album counted, and his page renders (ADR-0011)` | `server/test/smoke.test.js:12190` |
| `two spellings of one name are one person, and a name with nothing public never appears` | `server/test/smoke.test.js:12220` |
| `GET /api/admin/people suggests a nearer name with its photo count, and reading never merges (#107)` | `server/test/smoke.test.js:12250` |
| `merging two people moves their tags, occasions and accounts, and only a super admin can (#107)` | `server/test/smoke.test.js:12273` |
| `the archive is hidden (not deleted) when the event is unpublished or its type turns the archive off` | `server/test/smoke.test.js:12370` |
| `deleting an archive photo removes the row and its Cloudinary file; a wrong event id is 404` | `server/test/smoke.test.js:12390` |
| `POST /api/admin/albums builds a published album from the groom name alone, and a blank name is an Arabic 400` | `server/test/smoke.test.js:12401` |
| `admin album photos: the album comes back in the public shape — the honoree album names itself after reopening, the event album keeps its event` | `server/test/smoke.test.js:12458` |
| `a no-event album with no approved photo and no video is not public — the list, the search and its page all wait` | `server/test/smoke.test.js:12492` |
| `a town admin creates an album in their own town and gets 404 outside it — never 403, and nothing is written` | `server/test/smoke.test.js:12547` |
| `GET /api/admin/albums?without_event=1 lists honoree albums for a super admin, newest first, in the public shape` | `server/test/smoke.test.js:12600` |
| `GET /api/admin/albums?without_event=1 hides another town’s honoree album — and the album route is 404, never 403` | `server/test/smoke.test.js:12625` |
| `GET /api/admin/albums?without_event=1 never lists an album that has an event` | `server/test/smoke.test.js:12645` |
| `GET /a/:id and GET /p/:id serve a no-event album and its photo instead of falling over` | `server/test/smoke.test.js:12657` |
| `an album attached to an event is untouched: the same event object, the same fields, the same route` | `server/test/smoke.test.js:12690` |
| `album videos: a YouTube link lands on the wedding album, in GET /api/albums/:id, and on its own public route with the YouTube thumbnail` | `server/test/smoke.test.js:12731` |
| `album videos: a non-http link is an Arabic 400, the same link twice in one album is a 409, and another album accepts it` | `server/test/smoke.test.js:12766` |
| `album videos: hiding removes it from the album and 404s its own public route; an unknown status is an Arabic 400` | `server/test/smoke.test.js:12797` |
| `album videos: deleting removes the row and its public route, and touches no file — the link is external` | `server/test/smoke.test.js:12827` |
| `album videos: a town admin outside the album’s scope gets 404 on all four video routes — never 403 — and nothing is written` | `server/test/smoke.test.js:12842` |
| `album videos: a groom-only album (ADR-0012) takes a video, and its public route waits for the album to be published — event stays null` | `server/test/smoke.test.js:12873` |
| `video share page: og:video.other, our own card as og:image, «شاهد الفيديو على يوتيوب», and the injected title escaped` | `server/test/smoke.test.js:12918` |
| `the video card is a JPEG of its own, served with a short cache` | `server/test/smoke.test.js:12962` |
| `a hidden video is a 404 on its page and its card, and comes back when it is approved again` | `server/test/smoke.test.js:12971` |
| `a malformed and a non-existent video id are the same 404 on both video share routes` | `server/test/smoke.test.js:12988` |
| `an ended-wedding album with no approved photo but one approved video is public — list, detail, /a/:id — and hiding the video hides it again` | `server/test/smoke.test.js:13001` |
| `a groom-only album with no photo but one approved video is public in the list, the search and the person page — hiding the video hides it again` | `server/test/smoke.test.js:13075` |
| `an uploaded poster is forwarded to Cloudinary and stored as its URL, with no copy left on disk` | `server/test/smoke.test.js:13162` |
| `a poster replaced by PATCH, and an artist image, go to their own Cloudinary folders` | `server/test/smoke.test.js:13196` |
| `replacing a poster deletes the old one from Cloudinary — unless another row still uses it` | `server/test/smoke.test.js:13223` |
| `a JSON edit that leaves the poster alone deletes nothing; a typed external URL is never deleted` | `server/test/smoke.test.js:13260` |
| `when Cloudinary fails, the publish still succeeds and the poster stays on this server` | `server/test/smoke.test.js:13276` |
| `a refused publish uploads nothing to Cloudinary` | `server/test/smoke.test.js:13293` |
| `the audio track stays on this server — only images go to Cloudinary` | `server/test/smoke.test.js:13304` |
| `a service provider's image goes to Cloudinary too` | `server/test/smoke.test.js:13319` |
| `Name matching: hamza, a joined «أبو», a one-letter typo, a dropped middle name and ة/ه all match` | `server/test/smoke.test.js:13361` |
| `Name matching: a different father (a cousin), a different first name, or a different word never match` | `server/test/smoke.test.js:13370` |
| `Set up: an admin publishes a wedding — nothing like it exists yet, so it goes straight out` | `server/test/smoke.test.js:13396` |
| `A regular user publishing the same wedding is neither warned nor stopped — it queues as before` | `server/test/smoke.test.js:13404` |
| `GET /api/admin/events flags the pending request as a certain duplicate before anyone presses approve` | `server/test/smoke.test.js:13413` |
| `Approving it without confirming is refused with 409 POSSIBLE_DUPLICATE, and the event stays pending` | `server/test/smoke.test.js:13427` |
| `Approving it with confirm_duplicate goes through, and the override is logged against both events` | `server/test/smoke.test.js:13439` |
| `An admin's own publish with a one-letter typo the next day is refused (409, likely) and writes no row at all` | `server/test/smoke.test.js:13451` |
| `The same publish confirmed through multipart (confirm_duplicate=1, as the panel and the app send it) goes live` | `server/test/smoke.test.js:13464` |
| `A different groom of the same family, same day and town, is flagged — likely, never certain (تذكرة #159)` | `server/test/smoke.test.js:13489` |
| `The same name in another town is still flagged, but only as likely — two towns, possibly two people` | `server/test/smoke.test.js:13501` |
| `A town admin is never shown another town's unpublished request as a duplicate; the super_admin is` | `server/test/smoke.test.js:13511` |
| `A rejected event is never a candidate — rejecting it is how a duplicate is cleared` | `server/test/smoke.test.js:13546` |
| `POST /api/auth/me/avatar stores the photo — absolute URL out, relative path in the column — and GET /api/auth/me carries it` | `server/test/smoke.test.js:13585` |
| `A second avatar upload replaces the first, and the replaced local file is gone from uploadsDir` | `server/test/smoke.test.js:13605` |
| `A text file named x.png is refused with a 400 that names the accepted formats` | `server/test/smoke.test.js:13622` |
| `POST /api/auth/me/avatar without a file is a 400 in Arabic` | `server/test/smoke.test.js:13631` |
| `Set up: a brand-new account answers avatar_url: null — the key exists and is not undefined` | `server/test/smoke.test.js:13639` |
| `PATCH /api/auth/me updates full_name and clan_town, and GET /api/auth/me reflects both` | `server/test/smoke.test.js:13648` |
| `PATCH /api/auth/me refuses an empty full_name with a 400 in Arabic` | `server/test/smoke.test.js:13663` |
| `PATCH /api/auth/me applies analytics_opt_out too when it rides along with a profile field` | `server/test/smoke.test.js:13672` |
| `Set up: two fresh accounts with a real PIN hash — one holds the number the other will take` | `server/test/smoke.test.js:13686` |
| `PATCH /api/auth/me/phone with a wrong PIN is a 400 and leaves the number unchanged` | `server/test/smoke.test.js:13692` |
| `PATCH /api/auth/me/phone refuses another account's number with a 409` | `server/test/smoke.test.js:13704` |
| `PATCH /api/auth/me/phone changes the number and returns a token signed with the new one` | `server/test/smoke.test.js:13717` |
| `After the change, login with the old number is 401 and with the new one is 200` | `server/test/smoke.test.js:13751` |
| `PATCH /api/auth/me carrying phone_number never writes it` | `server/test/smoke.test.js:13760` |
| `مناسبة منشورة في بلدة حقيقية تحمل محافظة تلك البلدة (تذكرة #120)` | `server/test/smoke.test.js:13793` |
| `مناسبة تحت البند الجامع مع region_id تحمل المحافظة المرسلة (تذكرة #120)` | `server/test/smoke.test.js:13808` |
| `مناسبة تحت البند الجامع بلا region_id تحمل المحافظة الافتراضية — سلوك عميل 1.21.3 المنشور (تذكرة #120)` | `server/test/smoke.test.js:13821` |
| `طلب لوحة قديم بلا region_id ينجح ويأخذ محافظة البند الجامع، وكل صفوف villages تحمل region_id (تذكرة #120)` | `server/test/smoke.test.js:13834` |
| `POST /api/admin/events/:id/promote-village ينشئ القرية على محافظة مناسبتها (تذكرة #120)` | `server/test/smoke.test.js:13854` |
| `PATCH /api/admin/towns/:id بنقل بلدة إلى محافظة ثانية يحدّث مناسباتها وقُراها في المعاملة نفسها (تذكرة #120)` | `server/test/smoke.test.js:13880` |
| `تغيير village_id وحده يحفظ محافظة القرية لا المحافظة الافتراضية (تذكرة #120)` | `server/test/smoke.test.js:13923` |
| `promote-village يرفض ربط مناسبة في محافظة ثانية بقرية تحمل الاسم نفسه في محافظة أخرى (تذكرة #120)` | `server/test/smoke.test.js:13959` |
| `Set up: كل مناسبة اختبار تحمل محافظتها — النقب للبلدية، والثانية للثانية والقروية (تذكرة #121)` | `server/test/smoke.test.js:14071` |
| `GET /api/events بلا X-Region لا يعيد أي مناسبة من المحافظة الثانية (تذكرة #121)` | `server/test/smoke.test.js:14078` |
| `GET /api/events بـ X-Region للمحافظة الثانية يعيد صفوفها وحدها (تذكرة #121)` | `server/test/smoke.test.js:14086` |
| `GET /api/map/events يعزل المحافظة نفسها: دبّوس لكل محافظة ولا تسريب (تذكرة #121)` | `server/test/smoke.test.js:14096` |
| `all_regions=1 يتجاوز تقييد المحافظة في GET /api/events و GET /api/map/events، والافتراضي يبقى مقيَّداً (تذكرة #161)` | `server/test/smoke.test.js:14110` |
| `إعلانات تغيير التاريخ في GET /api/events تعزل المحافظة كالمناسبة نفسها (تذكرة #121)` | `server/test/smoke.test.js:14145` |
| `مناسبة قروية تحت البند الجامع بمحافظة ثانية تظهر لطلبها ولا تظهر لطلب النقب (تذكرة #121)` | `server/test/smoke.test.js:14196` |
| `X-Region غير رقمي أو معرّف لا وجود له → 400 برسالة عربية (تذكرة #121)` | `server/test/smoke.test.js:14208` |
| `محافظة موقوفة (is_active = 0) → الطلب ينجح ويعيد صفوف المحافظة الافتراضية (تذكرة #121)` | `server/test/smoke.test.js:14218` |
| `PATCH /api/auth/me يقبل region_id، و publicUser و GET /api/auth/me يرجّعانه (تذكرة #121)` | `server/test/smoke.test.js:14245` |
| `PATCH /api/auth/me بمعرّف محافظة وهمي → 400 عربي ولا يمسّ المكتوب (تذكرة #121)` | `server/test/smoke.test.js:14261` |
| `مسجَّل بلا X-Region يرى محافظة حسابه، ومسح التفضيل (null) يعيده إلى الافتراضية (تذكرة #121)` | `server/test/smoke.test.js:14273` |
| `حساب على محافظة موقوفة بلا X-Region يرى صفوف المحافظة الافتراضية (تذكرة #121)` | `server/test/smoke.test.js:14293` |
| `GET /api/events/:id لمناسبة في محافظة أخرى يبقى 200 بترويسة النقب — التفاصيل عالمية (تذكرة #121)` | `server/test/smoke.test.js:14313` |
| `غياب X-Region لا يغيّر صفوف فيد النقب ولا ترتيبها: مطابق تماماً لطلب صريح بـ X-Region: النقب (تذكرة #121)` | `server/test/smoke.test.js:14319` |
| `CORS: طلب OPTIONS يسمح بترويسة X-Region القادمة من المتصفّح (تذكرة #121)` | `server/test/smoke.test.js:14332` |
| `Set up: ألبوم في كل محافظة، وألبوم عريس في الثانية، وصورة موسومة لأجل البحث في الأشخاص (تذكرة #122)` | `server/test/smoke.test.js:14496` |
| `GET /api/albums يعرض ألبومات المحافظة وحدها: ألبوم الثانية لا يظهر افتراضياً ويظهر بترويسة محافظتها، والعكس لألبوم النقب (تذكرة #122)` | `server/test/smoke.test.js:14513` |
| `ألبوم العريس يتقيّد ببلدة صاحبه: ألبوم في بلدة المحافظة الثانية لا يظهر افتراضياً ويظهر لمحافظتها (تذكرة #122)` | `server/test/smoke.test.js:14527` |
| `ألبوم العريس بلا بلدة مكانه غير معروف فيظهر في كل المحافظات — القائمة والبحث بالترويسين (تذكرة #122)` | `server/test/smoke.test.js:14542` |
| `GET /api/photos يتقيّد بالألبوم: صورة ألبوم المحافظة الثانية لا تظهر افتراضياً وتظهر بترويسة محافظتها (تذكرة #122)` | `server/test/smoke.test.js:14559` |
| `GET /api/search بنفس الكلمة: الألبوم والصورة يتقيّدان بالمحافظة، والأشخاص عالميون في التراويس كلها (تذكرة #122)` | `server/test/smoke.test.js:14579` |
| `GET /api/stories: ستوري البلدة في محافظتها وحدها، وستوري بلا بلدة وإعلان المنصة في كل المحافظات (تذكرة #122)` | `server/test/smoke.test.js:14600` |
| `GET /api/services/providers يعرض من يخدم بلدة في المحافظة وحدها: مزوّد الثانية لا يظهر افتراضياً ويظهر لمحافظتها (تذكرة #122)` | `server/test/smoke.test.js:14642` |
| `GET /api/albums/:id و GET /api/people/:id يفتحان بالمعرّف لصفّ من محافظة أخرى بلا ترويسة (تذكرة #122)` | `server/test/smoke.test.js:14656` |
| `غياب X-Region لا يقيّد أكثر من المحافظة الافتراضية: نتائج الاكتشاف مطابقة لطلب صريح بالنقب (تذكرة #122)` | `server/test/smoke.test.js:14677` |
| `مناسبة في النقب ونفس الاسم والتاريخ في محافظة ثانية: نشر فوري بلا 409 (تذكرة #123)` | `server/test/smoke.test.js:14758` |
| `نداء داخلي بلا region_id يرى مرشّح كل محافظة، وبمحافظة النقب لا يرى الثاني (تذكرة #123)` | `server/test/smoke.test.js:14776` |
| `طلب مستخدم بنفس الاسم والتاريخ في محافظة ثانية لا يظهر تكراراً لصفّ النقب في الطابور (تذكرة #123)` | `server/test/smoke.test.js:14793` |
| `نفس الاسم والتاريخ داخل المحافظة نفسها: الأدمن يُرفض بـ409 كما كان بالحرف (تذكرة #123)` | `server/test/smoke.test.js:14813` |
| `نفس الاسم والتاريخ داخل المحافظة نفسها: المستخدم العادي لا يُمنع وطلبه يدخل الطابور (تذكرة #123)` | `server/test/smoke.test.js:14835` |
| `town = اسم المحافظة يعني «مكان غير معروف» داخل محافظتها وحدها (تذكرة #123)` | `server/test/smoke.test.js:14858` |
| `الاعتماد: تطابق في محافظة ثانية يمرّ بلا 409، وداخل المحافظة نفسها يُرفض بـ409 (تذكرة #123)` | `server/test/smoke.test.js:14888` |
| `البند الجامع: المكان نفسه في محافظة أخرى لا يتصادم، وداخل المحافظة نفسها يتصادم (تذكرة #123)` | `server/test/smoke.test.js:14934` |
| `إعداد: مناسبتان معتمدتان في رهط في اليوم نفسه وعائلتان مختلفتان (تذكرة #159)` | `server/test/smoke.test.js:15065` |
| `تعديل الأدمن المطابق يُرفض بـ409 بنفس شكل النشر، ولا يكتب أي تغيير (تذكرة #159)` | `server/test/smoke.test.js:15084` |
| `إعادة تعديل الأدمن مع confirm_duplicate تنجح، والتجاوز يُسجَّل (تذكرة #159)` | `server/test/smoke.test.js:15107` |
| `إعادة حفظ لا تغيّر مدخلاً من مدخلات الحارس لا تعيد الـ409 ولا تسجّل تجاوزاً ثانياً (تذكرة #159)` | `server/test/smoke.test.js:15127` |
| `حفظ المالك الذي لا يغيّر مدخلاً من مدخلات الحارس يبقى منشوراً ولو كان للصفّ شبيه معتمد (تذكرة #159)` | `server/test/smoke.test.js:15150` |
| `تعديل المناسبة لا يُنبّه على نفسها: تغيير إملائي في اسمها يمرّ بلا 409 (تذكرة #159)` | `server/test/smoke.test.js:15183` |
| `تعديل المالك المشتبه لا يُوقَف بـ409، ويعود pending مع الشبه في طابور الأدمن (تذكرة #159)` | `server/test/smoke.test.js:15201` |
| `تعديل المالك غير المشتبه يتبع التصنيف القائم: التجميلي يبقى منشوراً والحرِج يعود للمراجعة (تذكرة #159)` | `server/test/smoke.test.js:15237` |
| `أسماء مختلفة وعائلة واحدة (بإملاء آخر) في نفس البلدة والتاريخ تعطي likely لا certain (تذكرة #159)` | `server/test/smoke.test.js:15265` |
| `نفس العائلة في محافظة أخرى لا تنبّه، ونفس الزوج في محافظة واحدة ينبّه — عبر بند «القرى والتجمعات» (تذكرة #159)` | `server/test/smoke.test.js:15292` |
| `نقطة فحص الاستيراد تقرأ قرار حارس التكرار من الخدمة نفسها (تذكرة #160)` | `server/test/smoke.test.js:15404` |
| `munasabatna-insert لا يدرج المشتبه، ويطبعه في قسم «تُخطِّي» مع المطابقة ودرجتها (تذكرة #160)` | `server/test/smoke.test.js:15437` |
| `munasabatna-insert يُدرج المدخل غير المشتبه كما كان، ويعدّه في قسم «أُدرج» (تذكرة #160)` | `server/test/smoke.test.js:15458` |
| `import-legacy-json يمرّر العائلة الحقيقية ويمرّ على الحارس، وتقريره يفصل الأقسام الأربعة (تذكرة #160)` | `server/test/smoke.test.js:15498` |
| `POST /api/admin/regions ينشئ محافظة على نمط «إضافة بلدة»؛ الاسم المكرر 409، وبلا إحداثيات 400، وأدمن بلدة 403 (تذكرة #128)` | `server/test/smoke.test.js:15613` |
| `POST /api/admin/villages بمحافظة يُخزّنها، و GET /api/admin/villages يعيد region_id في الصفّ (تذكرة #128)` | `server/test/smoke.test.js:15673` |
| `بثّ باسم محافظة يكتب صفّاً لكل بلدة من بلداتها داخل نطاق الأدمن، ولا صفّ باسم المحافظة نفسه (تذكرة #128)` | `server/test/smoke.test.js:15699` |
| `أدمن يملك بلدة واحدة في المحافظة يبثّ لها وحدها؛ وأدمن لا يملك شيئاً منها يُرفض 404 بلا كتابة (تذكرة #128)` | `server/test/smoke.test.js:15748` |
| `سوبر أدمن يسمّي محافظة: صفّ لكل بلدة نشطة فيها ولا صفّ عام؛ وبلا اسم: صفّ عام واحد كما كان (تذكرة #128)` | `server/test/smoke.test.js:15802` |
| `GET /api/admin/analytics/overview يحمل by_region إضافياً، وحدثان على بلدة المحافظة الثانية يزيدانها اثنين بالضبط (تذكرة #128)` | `server/test/smoke.test.js:15844` |
| `صفّ بـ content_town = «القرى والتجمعات» مع مناسبة في المحافظة الثانية يذهب إلى «غير محدَّد» ولا يُسقَط (تذكرة #128)` | `server/test/smoke.test.js:15896` |
| `GET /api/news يشتقّ منطقة المحافظة من اسمها ويعيد عقد القائمة كاملاً (وجهة «خدماتنا»)` | `server/test/smoke.test.js:16082` |
| `general=1 يجبر الوجه العام بلا منطقة، ولا يرسل area للمصدر` | `server/test/smoke.test.js:16116` |
| `مفاتيح مناطق الأخبار عربية — المصدر يردّ zone_not_found لكل مفتاح لاتيني` | `server/test/smoke.test.js:16129` |
| `?limit= يُقصّ إلى سقف الخمسين بدل أن يُرفض أو يُمرَّر` | `server/test/smoke.test.js:16143` |
| `?offset= ينتقل إلى الصفحة التالية ويُبلغ has_more بالصدق` | `server/test/smoke.test.js:16151` |
| `إزاحة غير صالحة (سالب أو نصّ) تُرفض 400 برسالة عربية` | `server/test/smoke.test.js:16160` |
| `GET /api/news/:id يعيد التفصيل: الكاتب والنصّ الكامل فقرات` | `server/test/smoke.test.js:16169` |
| `خبر غير موجود أو غير منشور عند المصدر ← 404 عربي` | `server/test/smoke.test.js:16183` |
| `فشل المصدر بلا كاش ← 502 بالرسالة العربية، لا قائمة فارغة تُوهم بالهدوء` | `server/test/smoke.test.js:16194` |
| `بعد نجاح سابق، سقوط المصدر يخدم آخر نسخة محفوظة بدل 502` | `server/test/smoke.test.js:16207` |
| `رسالة ApiError المقصودة تمرّ في الإنتاج، ورسالة الخطأ الداخلي تُحجب` | `server/test/smoke.test.js:16222` |
| `GET /api/prices عام بلا رمز — العيارات الثلاثة والعملات الست محسوبة من المصدرين` | `server/test/smoke.test.js:16326` |
| `الطلب الثاني خلال الساعة لا ينادي المصدر إطلاقاً — والسعر المخزَّن هو المعروض` | `server/test/smoke.test.js:16365` |
| `فشل المصدر بعد نجاح سابق ← 200 وstale: true وآخر نسخة محفوظة` | `server/test/smoke.test.js:16395` |
| `فشل المصدر بلا نسخة سابقة ← 503 برسالة عربية، لا 500 ولا رسالة إنجليزية` | `server/test/smoke.test.js:16417` |
| `ردّ ناقص (عملة غائبة) يُعامَل فشلاً لا قائمة ناقصة` | `server/test/smoke.test.js:16434` |
| `GET /api/stats/ticker يحمل prices ولا يتأثّر بفشله` | `server/test/smoke.test.js:16447` |
| `POST /api/events defaults visibility to public, and an unknown value is refused with an Arabic 400` | `server/test/smoke.test.js:16519` |
| `A link_only event is approved silently: no «مناسبة جديدة» row and no digest for anyone` | `server/test/smoke.test.js:16544` |
| `The duplicate guard still compares against a link_only event — hiding never blinds it (تذكرة #166)` | `server/test/smoke.test.js:16593` |
| `The public twin IS still announced — the silencing is the visibility, not a broken notification path` | `server/test/smoke.test.js:16613` |
| `A link_only event is absent from the feed, the map, search, related events and the sitemap — even with no X-App-Version` | `server/test/smoke.test.js:16638` |
| `A link_only event opens by id in the API and at /e/:id, with noindex in the meta tag AND the header; a public one is unchanged` | `server/test/smoke.test.js:16688` |
| `Editing visibility hides an approved event without sending it back to review, and setting it public brings it back` | `server/test/smoke.test.js:16713` |
| `POST /api/check-collision (public, no auth) never names a link_only event, while the public twin of that day and town still shows` | `server/test/smoke.test.js:16746` |
| `The daily «مناسبة جديدة» count is public events only — a link_only approval neither takes one of the three nor inflates the digest` | `server/test/smoke.test.js:16772` |
| `Set up: عرس معتمد يملكه حساب عادي، وعزاء معتمد — كلاهما من الأزرار نفسها` | `server/test/smoke.test.js:16891` |
| `«جاي» بعدد 3 يُنشئ الجواب و«ذكّرني» معاً، ويردّ بحالة المستخدم والعدّاد` | `server/test/smoke.test.js:16928` |
| `الجواب الثاني من الحساب نفسه يُحدّث الصفّ ولا يُضيف ثانياً` | `server/test/smoke.test.js:16954` |
| `«مش جاي» لا يمسّ «ذكّرني»، و`DELETE` يسحب الجواب ولا يحذفه` | `server/test/smoke.test.js:16972` |
| `عدد الحاضرين خارج 1..RSVP_PARTY_SIZE_MAX يُرفض بـ400 عربية، والغياب يعني 1` | `server/test/smoke.test.js:17002` |
| `rsvp_going_count = مجموع العدد من الحساب والضيف معاً، في القائمة والتفصيل` | `server/test/smoke.test.js:17024` |
| `العزاء: 404 على المسار، ولا rsvp_going_count في أي ردّ` | `server/test/smoke.test.js:17061` |
| `«مين جاي»: الأسماء والعدد والمصدر والمجاميع للمالك وللأدمن، و404 لغيرهما، وبلا هاتف في أي جسم` | `server/test/smoke.test.js:17089` |
| `نوع rsvp_enabled مطفأ لا يخرج عدّاده ولو وُجدت أجوبة — لا في التفصيل ولا في القائمة` | `server/test/smoke.test.js:17154` |
| `طلب بلا X-App-Version لا ينكسر بالحقول الجديدة` | `server/test/smoke.test.js:17192` |
| `إيقاع النشر المجدول مستقلّ عن الجولة اليومية: start() يسلّح مؤقّتاً أقصر من يوم (#167)` | `server/test/smoke.test.js:17264` |
| `دورة نشر بدأت قبل stop() لا تعيد تسليح مؤقّت بعد stop() ثم start() (#167)` | `server/test/smoke.test.js:17291` |
| `مناسبة بموعد نشر مستقبلي غائبة عن كل قائمة عامة وحاضرة بالتفصيل وبالرابط، ثم تظهر ويصل إشعارها مرة واحدة` | `server/test/smoke.test.js:17334` |
| `فشلٌ بعد كتابة الإعلان وقبل التزامه يتراجع كاملاً فتُعلنها المحاولة التالية — لا يُفقد الإعلان (#167)` | `server/test/smoke.test.js:17466` |
| `مناسبة بموعد نشر مستقبلي لا يُعلنها المجدول قبل موعدها ولو شُغّل عشر مرّات` | `server/test/smoke.test.js:17527` |
| `أهلية الإعلان تُقرأ تحت القفل: ${change} بين جلب الدفعة والحجز يمنع الإعلان حتى تعود الأهلية (#167)` | `server/test/smoke.test.js:17609` |
| `اعتمادُ مناسبة بموعد مستقبلي لا يستهلك حصة اليوم: أوّل مناسبة منشورة فعلاً تصل فرديّة لا ملخّصاً (#167)` | `server/test/smoke.test.js:17695` |
| `حصة «مناسبة جديدة» المشتركة لا تتجاوز ثلاث فرادى عند إعلان مناسبتين متزامنتين في المحافظة نفسها (#167)` | `server/test/smoke.test.js:17750` |
| `شاهد عزل الحصة: اختبارا «مناسبة جديدة» لا يمسّان مناسبات القسم السابقة ولا ملخّصاته (#167)` | `server/test/smoke.test.js:17834` |
| `publish_at في الماضي أو غير صالح يُرفض 400 عربية في النشر والتعديل، وإعادة الموعد المخزَّن لا تُرفض` | `server/test/smoke.test.js:17857` |
| `شرط publish_at يأخذ ساعة القدس مُعامَلةً لا NOW() (ساعة الجلسة UTC في الإنتاج) وتُظهر المجدولة عند موعدها القدسي (#167)` | `server/test/smoke.test.js:17921` |
| `نافذة البقاء: نجاح منتهٍ منذ ٣ أيام يظهر في «القادم» بـ«انتهت»، ومنذ ٨ لا يظهر، وعرس منتهٍ أمس لا يظهر، والخريطة لا تعرض المنتهي` | `server/test/smoke.test.js:17994` |
| `صفّ بلا نوع لا يبقى في «القادم» أبداً: منتهٍ منذ ٣٠ يوماً يخرج، والمنتهي اليوم يظهر (#167)` | `server/test/smoke.test.js:18067` |
| `feed_linger_days: افتراضه 0، والسوبر أدمن يضبطه من مسار الأنواع (0..30) ويُرفض ما خارجه` | `server/test/smoke.test.js:18115` |
| `ترقية صيغة #167 الأولى بلا علَم والعمود موجود تحفظ اختيار السوبر أدمن صفراً، والتثبيت الجديد يزرع 7 (#167)` | `server/test/smoke.test.js:18152` |
| `Set up: عرس معتمد قادم، وعرس معتمد انتهى، وعزاء معتمد` | `server/test/smoke.test.js:18240` |
| `الصفحة تحمل النموذج ولا <script>، والـCSP تحمل form-action 'self' لهذه الصفحة وحدها` | `server/test/smoke.test.js:18281` |
| `إرسال صحيح يعيد التوجيه بالشارة، ويُنشئ صفّاً بالهاتف المطبَّع` | `server/test/smoke.test.js:18308` |
| `الإرسال الثاني بالهاتف نفسه يُحدّث الصفّ ولا يُضيف ثانياً` | `server/test/smoke.test.js:18343` |
| `هاتف فارغ يعطي رسالة عربية بلا صفّ` | `server/test/smoke.test.js:18368` |
| `عدد 21 يعطي رسالة عربية بلا صفّ` | `server/test/smoke.test.js:18386` |
| `الهاتف لا يظهر في أي ردّ /api ولا في /e/` | `server/test/smoke.test.js:18406` |
| `نوع مطفأ أو مناسبة منتهية: لا نموذج، والـPOST يعطي 404 الموحّدة` | `server/test/smoke.test.js:18431` |
| `طلب الضيف يستهلك دلو /api المجهول المشترك، حتى لو أُرفق رمز صالح` | `server/test/smoke.test.js:18459` |
| `الطلب الحادي عشر من IP واحد في الساعة يعطي 429 بصفحة عربية` | `server/test/smoke.test.js:18495` |
| `نصّا الخصوصية وADR-0006 محدَّثان بجمع اسم الضيف وهاتفه والإشارة إلى ADR-0015` | `server/test/smoke.test.js:18549` |
| `Set up: عرس معتمد قادم، وعرس معتمد انتهى، وعزاء معتمد — كلها لحساب واحد` | `server/test/smoke.test.js:18603` |
| `إنشاء ثلاثة أسماء يعيد ثلاثة روابط مختلفة، توكين كلٍّ منها ٣٢ حرفاً hex` | `server/test/smoke.test.js:18636` |
| `غير المالك وأدمن خارج البلدة: 404 للمسارات الثلاثة — وأدمن البلدة يقرأ` | `server/test/smoke.test.js:18674` |
| `صفحة الدعوة 200: «أهلاً <الاسم>» والاسم مسبقاً والتوكِن مخفيّ، noindex، بلا <script>` | `server/test/smoke.test.js:18706` |
| `الفتح الأول يكتب opened_at، والثاني لا يغيّره` | `server/test/smoke.test.js:18741` |
| `الجواب من الدعوة يكتب invite_id ويعود إلى صفحة الدعوة، ويظهر في «مين جاي»` | `server/test/smoke.test.js:18776` |
| `جواب عادي بلا دعوة يبقى invite_id = NULL ويبقى على صفحة المناسبة` | `server/test/smoke.test.js:18823` |
| `رمز خاطئ أو غير موجود أو لا يخصّ المناسبة: 404 الموحّدة بلا كتابة` | `server/test/smoke.test.js:18844` |
| `مناسبة انتهت أو نوع مطفأ: صفحة الدعوة 404 ولو كان رمزها صحيحاً` | `server/test/smoke.test.js:18880` |
| `حذف الدعوة لا يحذف الجواب: invite_id يصير NULL والصفّ يبقى في «مين جاي»` | `server/test/smoke.test.js:18896` |
| `قائمة أسماء فارغة أو زائدة أو اسم فارغ: 400 عربية بلا صفّ جديد` | `server/test/smoke.test.js:18934` |
| `PATCH /api/admin/events/:id/featured يكتب featured_until، والمبرزة تتصدّر تغذية محافظتها بـis_featured منطقية` | `server/test/smoke.test.js:19051` |
| `الرابعة النشِطة في المحافظة نفسها تُقبل بلا سقف، ومبرزة محافظة أخرى لا تدخل تغذية هذه المحافظة` | `server/test/smoke.test.js:19087` |
| `إلغاء الإبراز بـnull يعيد الصفّ لمكانه في التغذية` | `server/test/smoke.test.js:19135` |
| `تاريخ انتهى (أمس) لا يُبرز: is_featured false والصفّ لا يتصدّر` | `server/test/smoke.test.js:19158` |
| `أدمن خارج نطاق المناسبة يُردّ 404 لا 403 ولا يُكتب شيء، وأدمن داخله يمرّ` | `server/test/smoke.test.js:19174` |
| `تاريخ الإبراز يُتحقَّق في validate.js: صيغة خاطئة 400، وغياب المفتاح 400 لا إلغاء صامت` | `server/test/smoke.test.js:19204` |
| `الترقيم لا ينكسر: COUNT(*) يعدّ الصفوف نفسها، والمبرزة تظهر مرة واحدة عبر الصفحات` | `server/test/smoke.test.js:19225` |
| `تاريخ مستقبلي أو منقضٍ يُقبلان بلا سقف، والمنقضي يبقى is_featured: false` | `server/test/smoke.test.js:19254` |
| `طلبان متزامنان لإبراز مناسبتين مختلفتين في المحافظة نفسها ينجحان معاً (200 و200)` | `server/test/smoke.test.js:19273` |
| `GET /api/events/featured لا يلتقطه مسار /events/:id` | `server/test/smoke.test.js:19329` |
| `GET /api/events/featured يعيد events: [] عندما لا توجد مناسبات مبرزة نشِطة` | `server/test/smoke.test.js:19341` |
| `GET /api/events/featured يعيد المبرزة النشِطة مرتّبةً بـevent_date ASC, id ASC وبنفس شكل صفّ trending ووسائط مطلقة` | `server/test/smoke.test.js:19369` |
| `GET /api/events/featured يستبعد منتهي الإبراز والمنتهية نفسها وغير المعتمدة والمحجوبة والمجدولة` | `server/test/smoke.test.js:19426` |
| `GET /api/events/featured يقصّ بـregion_id ومحافظة الحساب، ويوسّع مع all_regions=1، ويرفض region_id=abc بـ400 عربية` | `server/test/smoke.test.js:19448` |
| `GET /api/events/featured يحترم ترويسة X-App-Version كالتغذية وtrending` | `server/test/smoke.test.js:19483` |
| `?sort=newest يرتّب بـcreated_at DESC — الأحدث إضافةً أولاً، وكل المرشّحات والترقيم كما هي` | `server/test/smoke.test.js:19565` |
| `بلا ?sort يبقى الترتيب القائم حرفاً بحرف، و?sort= الفارغ لا يغيّره` | `server/test/smoke.test.js:19581` |
| `?sort= بقيمة أخرى يُرفض 400 برسالة عربية بدل الهبوط الصامت إلى ترتيب آخر` | `server/test/smoke.test.js:19597` |
| `GET /api/stats/ticker عام — كل صفّ { region_id, name, upcoming_count }، وtotal مجموع الصفوف، وupdated_at لحظة` | `server/test/smoke.test.js:19676` |
| `عدّ المحافظة يطابق القائمة العامة نفسها — المعلّقة والمجدولة لا تُعدّان` | `server/test/smoke.test.js:19707` |
| `مناسبة «بالرابط فقط» معتمدة وقادمة لا تُعدّ في الشريط` | `server/test/smoke.test.js:19748` |
| `مناسبة انتهى امتدادها لا تُعدّ «قادمة» — وهي معتمدة ويجدها زائر في الأرشيف` | `server/test/smoke.test.js:19764` |
| `الطلب الثاني خلال الكاش لا يستعلم شيئاً، وupdated_at لحظة التعبئة نفسها` | `server/test/smoke.test.js:19786` |
| `الكاش هو ما يجمّد الرقم: مناسبة قادمة ثالثة لا تُحتسب حتى تنتهي مدّته، ثم تُحتسب` | `server/test/smoke.test.js:19824` |
| `GET /api/stats/ticker يحمل latest_news: أحدث خبر كما يعيده GET /api/news للطلب نفسه` | `server/test/smoke.test.js:19938` |
| `تعطّل مصدر الأخبار يترك latest_news: null والشريط 200 بـregions وtotal كما هما` | `server/test/smoke.test.js:19970` |
| `Set up: مناسبة عرس ومناسبة عزاء معتمدتان لصاحب البطاقة` | `server/test/smoke.test.js:20083` |
| `GET /api/card-templates عام: ١٢ قالباً وأربعة مقاسات وخمس عائلات خطوط` | `server/test/smoke.test.js:20127` |
| `المعاينة تعيد image/png بالمقاس المصغّر الصحيح للمقاسات الأربعة` | `server/test/smoke.test.js:20155` |
| `الحفظ يعيد رابطاً بالمقاس الكامل لكل مقاس، وكل بطاقة أساسية وحدها` | `server/test/smoke.test.js:20178` |
| `download.png يفضّل البطاقة الأساسية على الملصق: مقاس الناتج = مقاس البطاقة المحفوظة + الشريط (#182)` | `server/test/smoke.test.js:20215` |
| `غير المالك يُردّ بـ404 في القائمة والحفظ والمعاينة` | `server/test/smoke.test.js:20228` |
| `اختيار بلا لون أو قالب أو مقاس يُردّ 400 عربية لا 500` | `server/test/smoke.test.js:20270` |
| `طلب مرفوض بملف لا يترك صورة يتيمة في uploads` | `server/test/smoke.test.js:20291` |
| `العزاء لا يرى إلا قوالب النبرة الهادئة — ولو أُرسل قالب فرح رُدّ 400` | `server/test/smoke.test.js:20332` |
| `البطاقة الأساسية تصير og:image، وحذفها يعيد البطاقة المولَّدة` | `server/test/smoke.test.js:20369` |
| `PATCH يجعل البطاقة المطلوبة أساسية وحدها` | `server/test/smoke.test.js:20409` |
| `photo_source: upload يحفظ صورة المصدر ويُبقي photo_url حيّة` | `server/test/smoke.test.js:20431` |
| `معاينة متكررة تتجاوز الحدّ ⇒ 429 برسالة عربية` | `server/test/smoke.test.js:20474` |
| `Setup (#184): فئتان ومحافظة ثانية، ومزوّدون في الفئة نفسها ومعتمدون في بلدة الأدمن` | `server/test/smoke.test.js:20536` |
| `Setup (#184): أدمن بلدات حيّ على «رهط» — نطاق حقيقي لتأكيدَي 403 و404` | `server/test/smoke.test.js:20600` |
| `Setup (#184): مزوّد بلا رقم، ومزوّد في بلدة خارج نطاق أدمن البلدات، ومزوّد في محافظة أخرى` | `server/test/smoke.test.js:20622` |
| `similar: بلا المزوّد نفسه، وبلا غير المعتمد، وبلا فئة أخرى وبلا محافظة أخرى، وبالترتيب «مميّز ثم الأحدث» وحتى ستة` | `server/test/smoke.test.js:20633` |
| `القائمة: «مميّز» أولاً داخل الفئة، والشارتان تخرجان في كل صفّ، ولا رقم في أي صفّ` | `server/test/smoke.test.js:20662` |
| `واتساب: رابط wa.me ينبني في الخادم برقم دولي ورسالة عربية تذكر «أعراسنا» والفئة، والاستجابة بلا رقم` | `server/test/smoke.test.js:20685` |
| `واتساب: مزوّد بلا رقم ⇒ 404، ومزوّد غير معتمد ⇒ 404، وغير الموجود ⇒ 404` | `server/test/smoke.test.js:20698` |
| `الساعات: مصفوفة 0..6 تُخزَّن كما أُرسلت وتعود في التفصيل العام، وأي شكل آخر 400 عربي` | `server/test/smoke.test.js:20712` |
| `العروض: المنتهي والمطفأ لا يخرجان في التفصيل العام، والسارية تخرج الأقرب انتهاءً أولاً ثم بلا نهاية` | `server/test/smoke.test.js:20760` |
| `العروض إدارةً: PATCH يطفئ عرضاً فيسقط من العام، وDELETE يحذفه من اللوحة` | `server/test/smoke.test.js:20799` |
| `المعرض: رفع صورة من اللوحة يظهر في المعرض العام برابط مطلق، والحذف يزيلها من الصفّ` | `server/test/smoke.test.js:20832` |
| `المعرض: صورة بلا ملف ⇒ 400 عربي، وصورة لا تخصّ المزوّد ⇒ 404` | `server/test/smoke.test.js:20859` |
| `الشعار والغلاف: ملفّان في PATCH واحد يعيدان رابطين مطلقين، وتعذّر Cloudinary لا يُسقط الطلب` | `server/test/smoke.test.js:20873` |
| `المنتجات إدارةً: إضافة بسعر «تبدأ من» ثم تعديل السعر ثم حذف، واللوحة تعيدها في المجموعات` | `server/test/smoke.test.js:20899` |
| `الشارتان: السوبر أدمن يضعهما ويقرأهما في التفصيل، وأدمن البلدات يُردّ 403 على كلٍّ منهما` | `server/test/smoke.test.js:20934` |
| `أدمن خارج بلدات المزوّد يُردّ 404 على كل مسار إداري جديد، ولا يترك ملف رفع وراءه` | `server/test/smoke.test.js:20968` |
| `القراءة العامة بلا رقم: القائمة وبطاقات المشابهين لا تحمل مفتاح phone — الرقم في صفحة المزوّد المفردة وحدها (ADR-0016)` | `server/test/smoke.test.js:21006` |
| `Setup (#185): سوبر أدمن حيّ خاص بالقسم — شريحة طلبات جديدة لا تستهلكها بقية السويت` | `server/test/smoke.test.js:21085` |
| `Setup (#185): فئة، ومزوّد معتمد، وآخر معلّق، ومستخدمان حقيقيان` | `server/test/smoke.test.js:21103` |
| `المشاهدة: مفتاح الزائر يُحسب مرة في اليوم، والتكرار لا يزيد العدّاد ولا يضيف صفاً` | `server/test/smoke.test.js:21139` |
| `المشاهدة: صفّ الأمس للمفتاح نفسه لا يمنع مشاهدة اليوم — والتاريخ هو الفاصل` | `server/test/smoke.test.js:21164` |
| `المشاهدة: بلا X-Visitor-Id وبلا حساب لا تُحسب — 200 وcounted: false لا خطأ` | `server/test/smoke.test.js:21187` |
| `المشاهدة: مفتاحان مختلفان في اليوم نفسه يُحسبان معاً` | `server/test/smoke.test.js:21204` |
| `المشاهدة: الحساب المسجَّل مفتاحه u:<id> — مشاهدته الأولى تُحسب والثانية لا` | `server/test/smoke.test.js:21217` |
| `الخصوصية: لا عمود IP في جداول المشاهدة والمفضّلة ولا في صفّ المزوّد` | `server/test/smoke.test.js:21235` |
| `المفضّلة: PUT ثم PUT لا يكرّر العدّاد، وDELETE يُنقصه ثم DELETE لا يُخطئ` | `server/test/smoke.test.js:21260` |
| `المفضّلة: GET /api/services/favorites يعيد محفوظات صاحب الحساب وحده، وبلا رقم` | `server/test/smoke.test.js:21286` |
| `404: مزوّد غير معتمد يُردّ 404 للمشاهدة والمفضّلة` | `server/test/smoke.test.js:21304` |
| `القائمة والتفصيل يحملان العدّادين، والزائر يستلم is_favorite: false صراحةً` | `server/test/smoke.test.js:21316` |
| `نصّا الخصوصية يذكران معرّف الزائر العشوائي وأن المشاهدة بلا IP (#185)` | `server/test/smoke.test.js:21336` |
| `Setup (#186): سوبر أدمن حيّ وفئة ومزوّد معتمد وأربعة مستخدمين وأدمن خارج النطاق` | `server/test/smoke.test.js:21419` |
| `بلا confirm_phone: true يُردّ 400 عربية — والنصّ "true" ليس إقراراً` | `server/test/smoke.test.js:21470` |
| `rating خارج 1..5 يُرفض 400 — صفر وستة وغير الصحيح` | `server/test/smoke.test.js:21491` |
| `أول تقييم يُنشر فوراً visible مع phone_confirmed_at، ويظهر في المتوسط والعدد والتوزيع` | `server/test/smoke.test.js:21508` |
| `التقييم الثاني يحدّث الصفّ نفسه ولا يضيف ثانياً، والمتوسط يتبعه` | `server/test/smoke.test.js:21554` |
| `GET reviews عامّ ومرقّم: visible وحدها والاسم من الحساب وis_mine لصاحبه وحده` | `server/test/smoke.test.js:21573` |
| `أدمن خارج نطاق بلدات المزوّد يُردّ 404 على حذف التقييم، والصفّ يبقى` | `server/test/smoke.test.js:21591` |
| `بلاغ واحد لكل مستخدم: التكرار لا يرفع العدّاد، والثالث يُخفي ويُخرجه من المتوسط` | `server/test/smoke.test.js:21599` |
| `حذف الأدمن داخل النطاق يعمل — السوبر أدمن يحذف التقييم المخفي فيختفي صفّه` | `server/test/smoke.test.js:21649` |
| `حذف تقييمي: صاحبه وحده، idempotent — وغيره لا يمسّه` | `server/test/smoke.test.js:21660` |
| `Setup (#187): سوبر أدمن حيّ، وأدمن خارج النطاق، وثلاثة مستخدمين، وفئة ومزوّدان` | `server/test/smoke.test.js:21761` |
| `أدمن البلدة يُردّ 404 على الربط والفكّ ولا يُكتب شيء` | `server/test/smoke.test.js:21816` |
| `حساب إدارة أو حساب غير موجود ← 400 عربية، ولا ربط` | `server/test/smoke.test.js:21838` |
| `السوبر أدمن يربط: 200، والعمود يُكتب، والحدث في activity_log` | `server/test/smoke.test.js:21858` |
| `الربط لا يغيّر users.role — ولا قيمة provider في القاعدة` | `server/test/smoke.test.js:21885` |
| `«مزوّدي»: بطاقة صاحب الربط وحده، وبلا رقم، ولا linked_user_id في أي استجابة` | `server/test/smoke.test.js:21903` |
| `لا ردّ قبل الكتابة، والحساب المربوط يردّ فيظهر في القراءة العامة` | `server/test/smoke.test.js:21931` |
| `ردّ واحد لكل تقييم: التعديل يستبدل ويكتب وقتاً جديداً` | `server/test/smoke.test.js:21973` |
| `حساب آخر يُردّ 404 — ولو كان كاتب التقييم أو مربوطاً بمزوّد آخر` | `server/test/smoke.test.js:22011` |
| `نصّ الردّ إلزامي غير فارغ وبسقف 1000 — وإلا 400` | `server/test/smoke.test.js:22044` |
| `فكّ الربط: يُسجَّل، ويفقد الحساب الردّ و«مزوّدي»، ويبقى الردّ المنشور` | `server/test/smoke.test.js:22090` |
| `حذف الحساب يفكّ الربط ولا يحذف المزوّد` | `server/test/smoke.test.js:22124` |
| `Setup (#188): سوبر أدمن وفئة، ومزوّد مربوط وآخر غير مربوط، وثلاثة حسابات ومناسبتان` | `server/test/smoke.test.js:22206` |
| `مزوّد غير مربوط: channel=whatsapp ورابط برسالة في الخادم، ولا صفّ في القاعدة` | `server/test/smoke.test.js:22320` |
| `مزوّد مربوط: صفّ awaiting_offer وإشعار للحساب المربوط وحده` | `server/test/smoke.test.js:22351` |
| `event_id لمناسبة لا يملكها الطالب أو لا وجود لها ← 404 بلا صفّ` | `server/test/smoke.test.js:22382` |
| `«الطلبات الواردة»: مزوّدات الحساب وحده، وبلا user_id ولا هاتف، وغيره 404` | `server/test/smoke.test.js:22401` |
| `العرض: سعر إلزامي، ومن awaiting_offer إلى offered، و409 على أي عرض ثانٍ` | `server/test/smoke.test.js:22461` |
| `«العروض المستلمة»: الأقسام الثلاثة، والفلترة والشرط داخل الخادم` | `server/test/smoke.test.js:22504` |
| `إلغاء قبل القرار: من awaiting_offer إلى cancelled، ثم 409 على كل قرار بعده` | `server/test/smoke.test.js:22548` |
| `القبول: offered ← accepted وإشعار quote_accepted للحساب المربوط وحده، ثم 409` | `server/test/smoke.test.js:22623` |
| `الرفض: offered ← declined، ثم 409 على أي انتقال بعده` | `server/test/smoke.test.js:22675` |
| `web/index.html + config.js + api.js + app.js load together in a jsdom document with no source change` | `server/test/web-dom.test.js:1006` |
| `switchTab('tabAdd') actually builds the publish form — dynamicFormFields stops being empty` | `server/test/web-dom.test.js:1038` |
| `the publish form carries a «سهرة الشباب» field for a type that defines one` | `server/test/web-dom.test.js:1058` |
| `نموذج النشر يحمل خيار الظهور، وافتراضه «عام» (#166)` | `server/test/web-dom.test.js:1081` |
| `اختيار «بالرابط فقط» يسافر مع طلب النشر (#166)` | `server/test/web-dom.test.js:1096` |
| `نافذة التعديل تعرض ظهور المناسبة وتُرسله مع الحفظ (#166)` | `server/test/web-dom.test.js:1122` |
| `نموذج النشر يحمل «موعد النشر»، ويُرسَل في جسم النشر عند تعبئته ويغيب عند فراغه (#167)` | `server/test/web-dom.test.js:1172` |
| `نافذة التعديل تعرض «موعد النشر» المخزَّن وتُرسله كما هو (#167)` | `server/test/web-dom.test.js:1221` |
| `after the shared field-renderer refactor, the public form still has its own map, crop entry point, and honoree-button styling` | `server/test/web-dom.test.js:1275` |
| `shared (non-overridden) fields still render correctly on the public form: town select and event-date input` | `server/test/web-dom.test.js:1303` |
| `#addEventDate defaults to the LOCAL day, not the UTC day (public publish form)` | `server/test/web-dom.test.js:1333` |
| `groupUploads wraps the poster field in .upload-section on the public form` | `server/test/web-dom.test.js:1370` |
| `choosing a poster reveals the crop editor and steps the plain upload box aside` | `server/test/web-dom.test.js:1412` |
| `the crop rectangle starts as the largest 4:5 rectangle centred on the image` | `server/test/web-dom.test.js:1427` |
| `dragging a corner keeps the 4:5 ratio, with the dominant pointer axis leading` | `server/test/web-dom.test.js:1446` |
| `dragging from the middle moves the rectangle without resizing it — even on a photo below the floor` | `server/test/web-dom.test.js:1498` |
| `reopening the editor after «استخدام الصورة كاملة» starts again from the centred 4:5 crop` | `server/test/web-dom.test.js:1544` |
| `a photo smaller than the 1600px cap is never upscaled — 300×200 exports as a 160×200 4:5 crop` | `server/test/web-dom.test.js:1573` |
| `the default crop exports a 480×600 4:5 poster — smaller than its 480×640 source` | `server/test/web-dom.test.js:1597` |
| `confirming a crop sends the cropped Blob under "poster", with an explicit .jpg filename` | `server/test/web-dom.test.js:1621` |
| `submitting without pressing «تأكيد القص» still uploads the processed 4:5 JPEG, not the raw photo` | `server/test/web-dom.test.js:1662` |
| `the raw file is sent only when the photo cannot be decoded at all` | `server/test/web-dom.test.js:1703` |
| `a delayed decode failure from an old selection never uploads the newer file raw` | `server/test/web-dom.test.js:1750` |
| `a delayed export from an old selection cannot replace the newer selection’s blob or preview` | `server/test/web-dom.test.js:1788` |
| `a delayed whole-image export cannot replace the 4:5 crop after reopening the editor` | `server/test/web-dom.test.js:1818` |
| `two submit calls while the crop export is pending both prevent default and make one publish POST` | `server/test/web-dom.test.js:1848` |
| `a rejected publish fetch records publish_failed with the town, resolves without rejection and re-enables submit` | `server/test/web-dom.test.js:1880` |
| `"استخدام الصورة كاملة" still submits a Blob, and the working canvas never exceeds 1600px on its longest edge` | `server/test/web-dom.test.js:1932` |
| `both live buttons are visible with no hidden attribute, even with a channel set and live = null, and no story-strip bubble exists` | `server/test/web-dom.test.js:1979` |
| `every story with an http(s) target gets a CTA — not only ads — and a javascript: link gets none` | `server/test/web-dom.test.js:2015` |
| `ألبومات الأعراس: one box searches albums/photos/people, an album opens its photos, and a photo can be tagged` | `server/test/web-dom.test.js:2052` |
| `share a no-event honoree album: the line names its town from the album, and so does the analytics event` | `server/test/web-dom.test.js:2264` |
| `share an event album: the event town is what the line and the analytics event carry` | `server/test/web-dom.test.js:2279` |
| `share an album with neither town nor event: the title alone, with no dangling dash` | `server/test/web-dom.test.js:2293` |
| `فيديوهات الألبوم في الموقع: بطاقة لكل فيديو بوسم منصّتها، و«فتح» خارجي، و«مشاركة» ترسل صفحتنا /v/:id` | `server/test/web-dom.test.js:2315` |
| `ألبوم بلا فيديوهات: #albumDetailVideos مخفي، والانتقال إليه لا يترك بطاقات الألبوم السابق` | `server/test/web-dom.test.js:2405` |
| `the event page gets an additive album strip — escaped titles, cover and count — and nothing when empty` | `server/test/web-dom.test.js:2453` |
| `ألبوم بلا صور وفيديوهان: البطاقة وشريط المناسبة ورأس التفاصيل تكتب «2 فيديو»، والصور تبقى أولاً` | `server/test/web-dom.test.js:2481` |
| `the «مباشر» badge shows on both buttons only while live.active, and turns itself off at until` | `server/test/web-dom.test.js:2567` |
| `embed_url → an in-page iframe with referrerpolicy and allowfullscreen, plus «افتح في يوتيوب»; closing removes it` | `server/test/web-dom.test.js:2599` |
| `no embed_url with a live → «ادخل البث» to <share_url>/go and no iframe; no live → «لا يوجد بث الآن» + «قناتنا»` | `server/test/web-dom.test.js:2623` |
| `the section shows topic, episode question and yesterday's result, hides each when empty, and escapes all of them` | `server/test/web-dom.test.js:2647` |
| `a vote without a token opens the login modal and sends no request` | `server/test/web-dom.test.js:2680` |
| `after voting the bars show percentages and a count, and live_poll_<id> updates them — never before voting` | `server/test/web-dom.test.js:2696` |
| `a 409 «already voted» shows the message and re-reads the hub to show the results` | `server/test/web-dom.test.js:2755` |
| `GET /api/live/hub carries the token only when one exists; GET /api/live never does` | `server/test/web-dom.test.js:2779` |
| `a live_status signal re-fetches GET /api/live (and the hub while the section is open)` | `server/test/web-dom.test.js:2799` |
| `a live_started item in the notification center opens the live section` | `server/test/web-dom.test.js:2825` |
| `?live=1 (the Web Push click target) opens the live section on load` | `server/test/web-dom.test.js:2848` |
| `the share button shares share_url through the same path as an event share` | `server/test/web-dom.test.js:2855` |
| `on a desktop the share button opens our own dialog — never navigator.share, and nothing is copied by itself` | `server/test/web-dom.test.js:2877` |
| `on a phone the native share sheet is still used; with no navigator.share at all our dialog opens instead of a silent copy` | `server/test/web-dom.test.js:2919` |
| `the share dialog is the last overlay in the page, so it opens above the congratulations room and the event page` | `server/test/web-dom.test.js:2937` |
| `no TikTok LIVE identifier is left in web/index.html, app.js or styles.css — the story platform key is the one allowed mention` | `server/test/web-dom.test.js:2943` |
| `no circle stories strip exists; the big promo card renders carousel stories then bar stories, never feed stories` | `server/test/web-dom.test.js:3015` |
| `single promo story shows no dots; zero stories hides the promo card and moves the live capsule to the chips row` | `server/test/web-dom.test.js:3038` |
| `the carousel sits inside the home tab and above the feed container, so it is the top of the feed` | `server/test/web-dom.test.js:3073` |
| `a feed ad is inserted after card 8 and card 16, rotating between the feed stories` | `server/test/web-dom.test.js:3087` |
| `no ad appears before the eighth card: seven cards render none, and the eighth earns the first` | `server/test/web-dom.test.js:3107` |
| `the interval is the server's: feed_ad_interval 5 moves the first ad to after the fifth card` | `server/test/web-dom.test.js:3121` |
| `the feed ad opens the feed story list for the view, and its CTA posts the click — not the bar list` | `server/test/web-dom.test.js:3137` |
| `the big promo card opens the promo story list (carousel then bar), and its CTA posts that story's click` | `server/test/web-dom.test.js:3179` |
| `the drawer promo card mirrors carousel then bar stories, opens that list, and records its CTA click` | `server/test/web-dom.test.js:3206` |
| `«الأعراس المميزة» تُرسم من /api/events/featured فوق التغذية بإطار ذهبي وبوستر كامل وتفتح صفحة المناسبة` | `server/test/web-dom.test.js:3280` |
| `the phone drawer gets the same featured cards from the same reply, and is emptied and hidden with the feed copy` | `server/test/web-dom.test.js:3314` |
| `an empty /api/events/featured reply leaves the section hidden and the row empty` | `server/test/web-dom.test.js:3342` |
| `a late /api/events/featured reply from the previous governorate never paints over the newer one` | `server/test/web-dom.test.js:3360` |
| `a failing /api/events/featured request hides the section silently instead of throwing` | `server/test/web-dom.test.js:3386` |
| `choosing another governorate carries region_id=2 into the next /api/events/featured request` | `server/test/web-dom.test.js:3400` |
| `التقدّم التلقائي يتوقف مع prefers-reduced-motion وdocument.hidden وعند فتح نافذة أو صفحة مناسبة` | `server/test/web-dom.test.js:3431` |
| `a no-event album card names the honoree and his town, and draws no empty line where the event line sits` | `server/test/web-dom.test.js:3471` |
| `a no-event album header names the honoree and his town, with no date line and no dangling separator` | `server/test/web-dom.test.js:3518` |
| `an event album keeps its event title, town and date on the card and in the header (regression)` | `server/test/web-dom.test.js:3563` |
| `selecting two towns sends both in one ?town= parameter` | `server/test/web-dom.test.js:3650` |
| `selecting a village sends ?village_id=, separate from ?town=` | `server/test/web-dom.test.js:3663` |
| `a town and a village picked together travel in their own separate parameters` | `server/test/web-dom.test.js:3675` |
| `selecting two kinds sends both in one ?occasion_type_id= parameter, alongside a place filter` | `server/test/web-dom.test.js:3688` |
| `nothing selected sends no place/kind parameters at all` | `server/test/web-dom.test.js:3706` |
| `the place chip label shows one name, or "name +N" once more than one place is selected` | `server/test/web-dom.test.js:3716` |
| `a selected id that cannot be resolved is still reported as selected, never silently dropped to "nothing selected"` | `server/test/web-dom.test.js:3741` |
| `ticking a 21st option in one kind is rejected in the sheet, in Arabic, and never reaches the request` | `server/test/web-dom.test.js:3773` |
| `"مسح الفلاتر" clears every filter, resets both chip labels, and re-fetches with no filter params` | `server/test/web-dom.test.js:3799` |
| `date filter ranges match the mobile client: the week runs to Saturday, Thursday–Saturday is the coming wedding nights` | `server/test/web-dom.test.js:3822` |
| `the date chip sends date_from/date_to, a picked day needs a day, and «مسح الفلاتر» drops the range` | `server/test/web-dom.test.js:3840` |
| `«مسح الفلاتر» is always visible, not only once something is selected` | `server/test/web-dom.test.js:3877` |
| `the selection is restored from localStorage on load, and reflected in the chip label` | `server/test/web-dom.test.js:3888` |
| `a restored village selection resolves its real name once towns/villages have loaded` | `server/test/web-dom.test.js:3904` |
| `a corrupt or missing localStorage filter value does not break the page` | `server/test/web-dom.test.js:3918` |
| `two identical searches send one request and leave the very same cards in place` | `server/test/web-dom.test.js:3993` |
| `opening and closing the filter drawer without changing anything keeps the cards and sends no request` | `server/test/web-dom.test.js:4008` |
| `an actual filter change shows the floating «رجوع لنتائجك السابقة» pill` | `server/test/web-dom.test.js:4024` |
| `pressing the pill restores the previous card ids in their order with no new request, then hides` | `server/test/web-dom.test.js:4048` |
| `pressing the pill restores the filter UI its list was fetched with, so nothing re-fetches afterwards` | `server/test/web-dom.test.js:4069` |
| `a real filter change draws its results from the top, with an explicit scroll reset` | `server/test/web-dom.test.js:4115` |
| `tapping the header brand closes #eventPage and keeps the chosen filter, with no refetch` | `server/test/web-dom.test.js:4174` |
| `the in-page brand closes #eventPage — the header one is covered by it` | `server/test/web-dom.test.js:4200` |
| `the phone/PWA header — not just the hidden wide one — carries the brand` | `server/test/web-dom.test.js:4223` |
| `the floating bar keeps every control at a 44px target and re-flows to two rows instead of shrinking` | `server/test/web-dom.test.js:4258` |
| `on the feed itself, the header brand scrolls back to the top of the list` | `server/test/web-dom.test.js:4331` |
| `from another destination, the header brand lands on the feed` | `server/test/web-dom.test.js:4345` |
| `skeleton placeholders appear synchronously while fetchEvents is still in flight` | `server/test/web-dom.test.js:4359` |
| `the fade-in class is applied on the very first render only, never on a later refetch` | `server/test/web-dom.test.js:4383` |
| `the event page renders the youth-party line when youth_party_date is present` | `server/test/web-dom.test.js:4451` |
| `an event card omits the youth-party line entirely when youth_party_date is empty` | `server/test/web-dom.test.js:4462` |
| `an event card renders the dinner-time line when dinner_time carries a value` | `server/test/web-dom.test.js:4502` |
| `an event card omits the dinner-time line entirely when dinner_time is empty — no invented 8:00` | `server/test/web-dom.test.js:4509` |
| `the share button exists on every card and its word follows the occasion type's tone` | `server/test/web-dom.test.js:4518` |
| `a card with a poster emits the four nested layers, media covers from top, no blur, and the kind badge in caption` | `server/test/web-dom.test.js:4532` |
| `a card with NO poster builds the short caption plus the icon, not a tall empty box` | `server/test/web-dom.test.js:4585` |
| `frame colour source: type with colour sets inline --tone, type without colour emits no inline --tone` | `server/test/web-dom.test.js:4607` |
| `the feed is its own scroll container and its tree holds only cards` | `server/test/web-dom.test.js:4637` |
| `a mourning card never emits a countdown badge, whether or not it has a poster` | `server/test/web-dom.test.js:4679` |
| `a mourning card shows a plain, visible date on its face — never a countdown, never hidden behind "التفاصيل"` | `server/test/web-dom.test.js:4699` |
| `«التفاصيل» opens the event page like the phone — labelled rows, artist, nav buttons — and «رجوع» returns to the feed untouched` | `server/test/web-dom.test.js:4715` |
| `«نزّل الصورة» في صفحة المناسبة يفتح /e/<id>/download.png بالمعرّف الصحيح وبلا fetch` | `server/test/web-dom.test.js:4772` |
| `فشل إنشاء رابط التنزيل لا يُسقط الصفحة: توست عربي والمحتوى كما هو (#182)` | `server/test/web-dom.test.js:4807` |
| `tapping the card photo opens the same page, and the browser Back button closes it instead of leaving the site` | `server/test/web-dom.test.js:4835` |
| `every info line clamps its text to one line, structurally` | `server/test/web-dom.test.js:4857` |
| `the card headline is the type and the honoree, never a place-only title, and «التفاصيل» leads the actions` | `server/test/web-dom.test.js:4880` |
| `an announcement card names the honoree and the type, not the town its `title` carries` | `server/test/web-dom.test.js:4972` |
| `the announcement card has one «التفاصيل» action that opens the event, and no «ذكّرني»/«التبريكات»/«المشاركة» or audio` | `server/test/web-dom.test.js:5000` |
| `the same card without opts keeps its four actions and its audio hook — the feed card is untouched` | `server/test/web-dom.test.js:5034` |
| `the merged feed renders both a personal notification and a broadcast entry, both marked unread` | `server/test/web-dom.test.js:5101` |
| `clicking the broadcast card calls PATCH /api/broadcasts/:id/dismiss, never /api/notifications/:id/read — even though the ids collide` | `server/test/web-dom.test.js:5119` |
| `the badge reaches zero once every entry — personal and broadcast alike — has been acted on` | `server/test/web-dom.test.js:5133` |
| `a clicked notification stays in the list as read — no red dot, no «جديد» — instead of disappearing` | `server/test/web-dom.test.js:5151` |
| `«جعل الكل مقروء» posts read-all once, keeps every entry, clears every red mark and hides itself` | `server/test/web-dom.test.js:5171` |
| `opening the service-category form renders an icon picker under the free-text field` | `server/test/web-dom.test.js:5212` |
| `clicking a suggested icon fills the input the form submits` | `server/test/web-dom.test.js:5224` |
| `the occasion-type form got the same treatment, not just the service one` | `server/test/web-dom.test.js:5237` |
| `service-category form has attributes editor container and addCategoryAttributeRow adds rows` | `server/test/web-dom.test.js:5259` |
| `provider form has price type, estimate description, and dynamic attributes container` | `server/test/web-dom.test.js:5272` |
| `the event edit form carries a map and a file input, not hand-typed coordinates` | `server/test/web-dom.test.js:5289` |
| `opening the map on an event with coordinates fills the fields the form submits` | `server/test/web-dom.test.js:5304` |
| `an event with no coordinates opens with nothing selected, and clearing says so` | `server/test/web-dom.test.js:5321` |
| `a chosen poster is sent as multipart under the field name the server reads` | `server/test/web-dom.test.js:5331` |
| `the event edit form takes the audio as a file, not a typed URL` | `server/test/web-dom.test.js:5353` |
| `a chosen audio file is sent as multipart under "audio", alone or with a poster` | `server/test/web-dom.test.js:5362` |
| `removing the current audio empties the value the diff compares, and hides the player` | `server/test/web-dom.test.js:5373` |
| `the village form carries a map container, and coordinates stay required` | `server/test/web-dom.test.js:5399` |
| `opening the map on a village with coordinates fills the fields the form submits` | `server/test/web-dom.test.js:5409` |
| `a simulated pin placement (click or drag) writes vilLat/vilLng — the same function the map's own click/drag handlers call` | `server/test/web-dom.test.js:5419` |
| `typing a full, valid pair of coordinates by hand moves the pin and recentres the map` | `server/test/web-dom.test.js:5437` |
| `typing a partial or non-numeric coordinate by hand is ignored — no thrown error, no pin jumping to a nonsense location` | `server/test/web-dom.test.js:5462` |
| `the event and village pickers are genuinely distinct registry entries, not a shared global` | `server/test/web-dom.test.js:5494` |
| `initDirectAddForm() builds a type picker and the first active type's own fields — no hardcoded wedding form` | `server/test/web-dom.test.js:5536` |
| `#dirEventDate defaults to the LOCAL day too (admin direct-add form)` | `server/test/web-dom.test.js:5562` |
| `switching to a mourning type relabels the honorees field and drops fields it does not define` | `server/test/web-dom.test.js:5584` |
| `the admin honoree-add button keeps the panel's own styling, not the public site's` | `server/test/web-dom.test.js:5598` |
| `the panel keeps its own two-column layout for town+village — not the shared renderer's stacked default` | `server/test/web-dom.test.js:5617` |
| `the panel gets no .upload-section wrapper — groupUploads stays false there` | `server/test/web-dom.test.js:5638` |
| `a required field left empty is rejected client-side with that type's own label` | `server/test/web-dom.test.js:5647` |
| `a successful publish sends occasion_type_id and honorees[], never the old hardcoded groom_name form` | `server/test/web-dom.test.js:5669` |
| `a pending card with possible_duplicates shows a danger badge when one is certain, an amber one when all are likely, and none otherwise` | `server/test/web-dom.test.js:5738` |
| `clicking the badge opens the comparison with one card per duplicate and the approve-context buttons` | `server/test/web-dom.test.js:5763` |
| `server text in a duplicate is escaped, never injected as markup` | `server/test/web-dom.test.js:5786` |
| `a 409 POSSIBLE_DUPLICATE on approve opens #duplicateModal with the server message instead of the generic error notice` | `server/test/web-dom.test.js:5799` |
| `«اعتماد رغم ذلك» re-sends the approval with confirm_duplicate: true and closes the modal` | `server/test/web-dom.test.js:5816` |
| `«إلغاء» on the approve modal sends nothing and leaves the card there to decide on later` | `server/test/web-dom.test.js:5830` |
| `«رفض كمكررة» closes the comparison and opens the reject modal with the reason prefilled` | `server/test/web-dom.test.js:5846` |
| `the panel marks a featured event with a gold tag carrying its expiry date, and offers «إبراز» on the others` | `server/test/web-dom.test.js:5895` |
| `the feature modal opens with the stored expiry date, and «إلغاء الإبراز» is offered only where a date exists` | `server/test/web-dom.test.js:5921` |
| `«إبراز» PATCHes the chosen date, «إلغاء الإبراز» PATCHes null — both through the admin API` | `server/test/web-dom.test.js:5952` |
| `«فتح المناسبة» opens the existing event's edit form when the panel has it, and a notice (not an error) when it does not` | `server/test/web-dom.test.js:5969` |
| `a 409 POSSIBLE_DUPLICATE on an edit opens the same #duplicateModal in edit context, and «حفظ رغم ذلك» re-sends that edit with confirm_duplicate` | `server/test/web-dom.test.js:6043` |
| `«إلغاء» on an edit duplicate leaves the form and its values untouched and sends nothing more` | `server/test/web-dom.test.js:6071` |
| `a 409 POSSIBLE_DUPLICATE on direct add opens the modal in direct-add context and keeps the form intact on cancel` | `server/test/web-dom.test.js:6115` |
| `«نشر رغم ذلك» re-sends the same direct-add FormData with confirm_duplicate=1` | `server/test/web-dom.test.js:6136` |
| `a direct add the server queues as pending shows the server's message, not the «published directly» celebration` | `server/test/web-dom.test.js:6152` |
| `the activity log labels event_duplicate_override with its own verb, shows the ids, and offers a filter for it` | `server/test/web-dom.test.js:6164` |
| `the admin list draws the whole poster over a fill, not a crop of it` | `server/test/web-dom.test.js:6189` |
| `and its stylesheet contains the poster rather than cropping it` | `server/test/web-dom.test.js:6205` |
| `the feed card has no blur and no card-level fixed ratio, its media reserves the poster ratio, object-fit is cover from top center, and snapping is declared` | `server/test/web-dom.test.js:6231` |
| `a featured card carries the gold «مناسبة كبرى» badge, and a card without is_featured carries none` | `server/test/web-dom.test.js:6305` |
| `the badge is the first chip of the card, ahead of the occasion-type chip` | `server/test/web-dom.test.js:6322` |
| `the featured card shows the whole invitation (contain) and its badge is gold` | `server/test/web-dom.test.js:6331` |
| `the feed keeps the server's order and never re-sorts featured cards on the client` | `server/test/web-dom.test.js:6361` |
| `the empty feed is a door: add your event, wedding services, your albums, and expanding beyond the governorate — each lands on its destination (#161)` | `server/test/web-dom.test.js:6398` |
| `«وسّع إلى كل المحافظات» يجعل الجلب التالي يحمل all_regions=1 — وإلا فالزرّ يعيد التغذية نفسها (#161)` | `server/test/web-dom.test.js:6463` |
| `a Cloudinary card poster is asked for at card width, and a local poster is left exactly as it is (#161)` | `server/test/web-dom.test.js:6500` |
| `the users tab filters by phone number and by name, over the already-fetched list` | `server/test/web-dom.test.js:6547` |
| `the users tab offers «حذف الحساب» to a super_admin on every row except a super_admin row, and never to a plain admin` | `server/test/web-dom.test.js:6572` |
| `deleting a user asks for two explicit confirmations, sends DELETE /api/admin/users/:id through adminFetch, then reloads the list and reports success` | `server/test/web-dom.test.js:6594` |
| `backing out of either confirmation sends no request at all` | `server/test/web-dom.test.js:6642` |
| `the counts panel shows Arabic labels, never raw English event keys, and flags exactly the two failure events` | `server/test/web-dom.test.js:6675` |
| `every known event renders as its own row, and one with zero recorded occurrences renders as 0, not blank or omitted` | `server/test/web-dom.test.js:6693` |
| `a retired/unknown event_name the server still has real rows for renders with its raw key and an Arabic "unknown" marker, instead of vanishing` | `server/test/web-dom.test.js:6725` |
| `the retention notice states the real retention window read from analytics.service.js, not an independent literal` | `server/test/web-dom.test.js:6771` |
| `a 403 on the counts endpoint (a non-super-admin somehow landing here) renders the server's Arabic message, not a blank panel or a thrown error` | `server/test/web-dom.test.js:6782` |
| `picking a user from the users list renders that user's paginated log with Arabic event labels` | `server/test/web-dom.test.js:6798` |
| `a multi-page user log renders prev/next controls, and clicking "next" requests page=2` | `server/test/web-dom.test.js:6824` |
| `rejecting an event sends a reason in the request body` | `server/test/web-dom.test.js:6867` |
| `a broadcast carries a tone and a duration` | `server/test/web-dom.test.js:6904` |
| `a broadcast with duration "none" sends duration: "none" and the composer describes it as centre-only` | `server/test/web-dom.test.js:6935` |
| `super admin gets «كل المناطق» plus one «كل بلدات <المحافظة>» target per governorate, and no regions hides the picker (تذكرة #128)` | `server/test/web-dom.test.js:6965` |
| `town admin sees only their own assigned towns among the broadcast targets` | `server/test/web-dom.test.js:7032` |
| `admin with zero assigned towns is stopped before sending (controls disabled and notice shown)` | `server/test/web-dom.test.js:7069` |
| `settings tab is reachable only for super admin, saves number, and can clear it` | `server/test/web-dom.test.js:7096` |
| `the settings tab carries the two home-welcome fields and saves them through the same form` | `server/test/web-dom.test.js:7164` |
| `invalid WhatsApp number displays the server's Arabic error without client format check` | `server/test/web-dom.test.js:7227` |
| `town dropdowns are filled from GET /api/towns with 'الكل' filtered out` | `server/test/web-dom.test.js:7257` |
| `panel behaves sanely when GET /api/towns fails (uses fallback array)` | `server/test/web-dom.test.js:7281` |
| `picking "القرى والتجمعات" in direct add form keeps the selection without resetting to default town` | `server/test/web-dom.test.js:7303` |
| `a token expiring in under 15 minutes triggers the warning, and one expiring in hours does not` | `server/test/web-dom.test.js:7322` |
| `the warning appears ONCE, not on every tick` | `server/test/web-dom.test.js:7344` |
| `an expired session does NOT tear the dashboard down` | `server/test/web-dom.test.js:7364` |
| `re-entering the expired-session path does not wipe a PIN already being typed` | `server/test/web-dom.test.js:7387` |
| `a successful re-login swaps the stored token and leaves the dashboard mounted` | `server/test/web-dom.test.js:7404` |
| `the PIN is not in localStorage or sessionStorage after a successful re-login` | `server/test/web-dom.test.js:7435` |
| `a draft is saved from the direct-add form and offered back after re-login` | `server/test/web-dom.test.js:7466` |
| `declining the restore deletes the draft so it is not offered again` | `server/test/web-dom.test.js:7497` |
| `a draft that had a file field says so in Arabic on restore` | `server/test/web-dom.test.js:7521` |
| `logging out clears the drafts` | `server/test/web-dom.test.js:7543` |
| `the page links a real manifest and a real apple-touch-icon` | `server/test/web-dom.test.js:7569` |
| `the manifest is valid JSON, standalone, and names icons that exist on disk` | `server/test/web-dom.test.js:7581` |
| `the header carries a drawn mark, not an emoji` | `server/test/web-dom.test.js:7596` |
| `the inlined header/install-hint/admin mark paths match the current mark geometry` | `server/test/web-dom.test.js:7616` |
| `the rename to «أعراسنا» reached the document title, the iOS web-app title, and the header` | `server/test/web-dom.test.js:7629` |
| `the manifest short_name is «أعراسنا» alone, and name carries both names` | `server/test/web-dom.test.js:7645` |
| `the smallest Android mipmap (mdpi, 48×48) really is 48×48 and mixes mark- and ground-coloured pixels` | `server/test/web-dom.test.js:7655` |
| `every safe-zone render keeps mark-coloured pixels inside the circular safe zone (radius 40% of the image width)` | `server/test/web-dom.test.js:7672` |
| `detail 'icon' is the full mark minus the word — nothing else drops or moves out of order` | `server/test/web-dom.test.js:7695` |
| `nothing is clipped by the circular mask at safe-zone scale` | `server/test/web-dom.test.js:7702` |
| `the two rings interlock: right over left, then a left-ring sector back over the right` | `server/test/web-dom.test.js:7733` |
| `the shaping parity gate — static vector path matches Cairo ctx.fillText Arabic shaping` | `server/test/web-dom.test.js:7739` |
| `detail 'icon' and detail 'full' render different bytes at the same size` | `server/test/web-dom.test.js:7803` |
| `the generated favicon SVG is well-formed, carries both brand colours, and matches the geometry the raster uses` | `server/test/web-dom.test.js:7809` |
| `an iPhone visitor who has not installed is shown how` | `server/test/web-dom.test.js:7834` |
| `everyone else is left alone` | `server/test/web-dom.test.js:7847` |
| `an iPhone that already installed the app is not told to install it` | `server/test/web-dom.test.js:7858` |
| `and it is actually wired into page load, not merely defined` | `server/test/web-dom.test.js:7870` |
| `nothing that ships hidden is un-hidden by a class that forces a display` | `server/test/web-dom.test.js:7893` |
| `dismissing the hint keeps it dismissed on the next visit` | `server/test/web-dom.test.js:7923` |
| `شاشة الترحيب تظهر لزائر جديد: مخفية في الملف، بثلاث بطاقات و«تخطّي»` | `server/test/web-dom.test.js:7946` |
| `«تخطّي» يكتب negev_welcome_seen فلا تعود الشاشة في زيارة تالية` | `server/test/web-dom.test.js:7968` |
| `and the welcome is wired into page load, not merely defined` | `server/test/web-dom.test.js:7994` |
| `first visit on iPhone: the welcome comes first, and the install hint waits its turn` | `server/test/web-dom.test.js:8008` |
| `الويب لا يعرض «قيّمنا» إطلاقاً — التقييم في التطبيق وحده` | `server/test/web-dom.test.js:8032` |
| `the ticker renders from GET /api/broadcasts/live on load, with no socket involved` | `server/test/web-dom.test.js:8079` |
| `zero live broadcasts leaves the ticker hidden` | `server/test/web-dom.test.js:8093` |
| `with two live broadcasts, the ticker shows the newest and an indicator that opens the rest` | `server/test/web-dom.test.js:8104` |
| `signed in, the same indicator re-fetches the notifications centre before opening it, instead of expanding the ticker` | `server/test/web-dom.test.js:8125` |
| `a solemn broadcast gets its own class and never the animated (urgent-pulse) class` | `server/test/web-dom.test.js:8147` |
| `an urgent broadcast gets the pulse class, for contrast with solemn` | `server/test/web-dom.test.js:8160` |
| `dismissing while signed in calls PATCH /api/broadcasts/:id/dismiss, and the ticker clears` | `server/test/web-dom.test.js:8171` |
| `dismissing while anonymous writes to localStorage, calls no PATCH, and the broadcast does not come back on the next render` | `server/test/web-dom.test.js:8186` |
| `a town_broadcast socket signal triggers a re-fetch and never renders text from the payload itself` | `server/test/web-dom.test.js:8218` |
| `the support entry opens a wa.me link built from the exact stored number, unmodified — via the in-app modal, not confirm()` | `server/test/web-dom.test.js:8264` |
| `FIX 5: the disclosure is the page's own modal, not a browser confirm() — declining it opens nothing` | `server/test/web-dom.test.js:8297` |
| `a null support number leaves the entry visible but disabled, and tapping it explains why in the same modal, never a browser alert()` | `server/test/web-dom.test.js:8330` |
| `FIX 1: a single long broadcast — no "+N" to fall back on — is still reachable in full, for an anonymous AND a signed-in visitor` | `server/test/web-dom.test.js:8361` |
| `FIX 2b: a broadcast dismissed while anonymous does not reappear after signing in on the SAME device` | `server/test/web-dom.test.js:8407` |
| `لا شريط أرقام (#statsTicker) بعد الآن، والتعميم الحيّ (#broadcastTicker) لا يزال يظهر` | `server/test/web-dom.test.js:8502` |
| `loading the page does NOT request notification permission` | `server/test/web-dom.test.js:8544` |
| `tapping a personal notification with an event_id marks it read AND navigates to that event` | `server/test/web-dom.test.js:8575` |
| `adding a reminder requests notification permission, and removing one does not` | `server/test/web-dom.test.js:8647` |
| `a null VAPID public key means no prompt, no subscribe call, and no visible error` | `server/test/web-dom.test.js:8698` |
| `a successful subscribe POSTs the exact { endpoint, keys: { p256dh, auth } } shape` | `server/test/web-dom.test.js:8744` |
| `the off control calls DELETE /api/notifications/subscribe and the displayed state changes` | `server/test/web-dom.test.js:8787` |
| `tapping a broadcast marks it read through the broadcast endpoint and navigates nowhere` | `server/test/web-dom.test.js:8852` |
| `a browser with no serviceWorker/PushManager degrades silently and the page still works` | `server/test/web-dom.test.js:8908` |
| `iOS Safari not installed shows Arabic line and does not prompt` | `server/test/web-dom.test.js:8937` |
| `after turning notifications off, adding a reminder does not re-subscribe (FIX 4, story 18)` | `server/test/web-dom.test.js:8974` |
| `the deep-linked event survives the feed load instead of being wiped by it (FIX 5, story 14)` | `server/test/web-dom.test.js:9041` |
| `navigateToEvent opens the event page without any animated scroll of the feed (FIX 7, story 54)` | `server/test/web-dom.test.js:9111` |
| `clicking an event in the agenda day list closes the agenda and navigates to that event, with no ReferenceError` | `server/test/web-dom.test.js:9127` |
| `the agenda counts the month from GET /api/events/calendar, never from the events the feed already loaded (#175)` | `server/test/web-dom.test.js:9246` |
| `the agenda dot is gold for one event and red for two or more, and today is emphasised (#175)` | `server/test/web-dom.test.js:9273` |
| `the agenda governorate filter comes from GET /api/towns and refetches the month with region_id (#175)` | `server/test/web-dom.test.js:9312` |
| `clicking an agenda day lists that day's events from the existing feed route (?date_from=&date_to=) (#175)` | `server/test/web-dom.test.js:9361` |
| `a month count landing after a newer governorate's is dropped — the request identity is the month AND the governorate (#175)` | `server/test/web-dom.test.js:9401` |
| `a day list landing after a newer day's is dropped — the request identity is the day AND the governorate (#175)` | `server/test/web-dom.test.js:9447` |
| `an empty second page preserves pagination.total and declares the partial day list (#175)` | `server/test/web-dom.test.js:9506` |
| `switching governorates clears the old dots before the new month response arrives (#175)` | `server/test/web-dom.test.js:9566` |
| `choosing a new day replaces prior events with an Arabic loading row until its response arrives (#175)` | `server/test/web-dom.test.js:9599` |
| `a failed day fetch shows an Arabic error, not an invented empty day (#175)` | `server/test/web-dom.test.js:9643` |
| `a day list answering for "all governorates" cannot outlive the governorate chosen after it — the day alone is not the identity (#175)` | `server/test/web-dom.test.js:9668` |
| `«القادم هذا الشهر» asks for max(today, month start) → month end, with X-Region for a governorate and all_regions=1 for all (#M2)` | `server/test/web-dom.test.js:9751` |
| `«القادم هذا الشهر» groups events under day headers and pulls a multi-day event that started before today up to today (#M2)` | `server/test/web-dom.test.js:9798` |
| `the upcoming pill counts pagination.total, a capped list is declared, and picking a day never refetches the month (#M2)` | `server/test/web-dom.test.js:9843` |
| `a month entirely in the past hides «القادم هذا الشهر» with no request at all (#M2)` | `server/test/web-dom.test.js:9885` |
| `a late «القادم هذا الشهر» answer for the previous month never paints over the newer month (#M2)` | `server/test/web-dom.test.js:9923` |
| `a failed upcoming fetch shows an Arabic error and «—», never an invented zero or an empty month (#M2)` | `server/test/web-dom.test.js:9967` |
| `on the last day of the month the upcoming range is that single day, and the section still renders (#M2)` | `server/test/web-dom.test.js:9996` |
| `a failed upcoming fetch offers «إعادة المحاولة» that reloads the month section alone, then shows its events (#M2)` | `server/test/web-dom.test.js:10041` |
| `an upcoming month row opens its event on click and on Enter/Space, exactly like a day row (#M2)` | `server/test/web-dom.test.js:10093` |
| `a late «القادم هذا الشهر» answer for a previous governorate never paints under the newer one (#M2)` | `server/test/web-dom.test.js:10129` |
| `agenda month stepping builds from day 1: 31 January ⇒ February 2027, and 31 March ⇒ February again (#175)` | `server/test/web-dom.test.js:10211` |
| `iOS install hint is not shown unbidden if already dismissed (FIX 3, story 17)` | `server/test/web-dom.test.js:10245` |
| `event card countdown accurately reflects today, tomorrow, and future days without timezone drift` | `server/test/web-dom.test.js:10277` |
| `«غداً» is computed in Jerusalem time — a device in another zone cannot shift the day` | `server/test/web-dom.test.js:10318` |
| `كرت التغذية يحمل «انتهت» حين يقول الخادم إن أيام المناسبة مضت، ولا يحملها لمناسبة قائمة (#167)` | `server/test/web-dom.test.js:10350` |
| `services tab has filter chips, search input, filter modals, and renders luxury service cards` | `server/test/web-dom.test.js:10367` |
| `العرض المختصر: صفّ لكل مزوّد (صورة، اسم، فئة وبلدة، شارة سعر، «اتصال» و«تفاصيل»)، و«اتصال» يغيب حين لا يوجد رقم` | `server/test/web-dom.test.js:10468` |
| `العميل: غياب providers_display أو قيمته غير المعروفة يعني الصفوف المختصرة (حسم الخادم في smoke)` | `server/test/web-dom.test.js:10518` |
| `صفّ البلدات لا يدّعي «جميع البلدات» من أربع بلدات (تذكرة #127)` | `server/test/web-dom.test.js:10536` |
| `«تفاصيل» في الصفّ المختصر تفتح نافذة المزوّد من GET /api/services/providers/:id بحزمة السعر والمواصفات` | `server/test/web-dom.test.js:10556` |
| `providers_display = cards يعيد الكروت الكبيرة، وتغيير الشكل بعد الرسم يعيده من الذاكرة بلا طلب مزوّدين جديد` | `server/test/web-dom.test.js:10606` |
| `تنسيق الصفّ المختصر: لا نص أصغر من 15px ولا زرّ أقصر من 44px` | `server/test/web-dom.test.js:10638` |
| `نافذة المزوّد تعرض كل الأقسام: الغلاف والشعار والشارتين والساعات والمعرض والعروض والمنتجات والمشابهين (#184)` | `server/test/web-dom.test.js:10760` |
| `نافذة المزوّد تُخفي كل قسم فارغ: لا ساعات ولا معرض ولا عروض ولا منتجات ولا مشابهين ولا شارات (#184)` | `server/test/web-dom.test.js:10823` |
| `زرّ واتساب يقرأ الرابط من GET .../whatsapp ويفتحه كما وصل — لا wa.me يبنيه العميل (#184)` | `server/test/web-dom.test.js:10857` |
| `شارتا «موثّق» و«مميّز» على بطاقة القائمة في الشكلين، ولا شارة لمن لا يحملها (#184)` | `server/test/web-dom.test.js:10884` |
| `بطاقة المزوّد ونافذته تعرضان 👁 المشاهدات و♥ المفضّلة من الخادم، والفتح يسجّل مشاهدة واحدة` | `server/test/web-dom.test.js:11017` |
| `زرّ الحفظ يبدّل DELETE/PUT ويأخذ العدّاد ونصّه من ردّ الخادم` | `server/test/web-dom.test.js:11060` |
| `الزائر يرسل X-Visitor-Id عشوائياً محفوظاً في localStorage — مرة واحدة` | `server/test/web-dom.test.js:11094` |
| `«قائمتي»: قسم «مزوّدون محفوظون» يعرض محفوظات صاحبه ويختفي حين لا محفوظات` | `server/test/web-dom.test.js:11129` |
| `بطاقة القائمة تحمل ★ المتوسط (العدد)، ومزوّد بلا تقييمات بلا نجمة` | `server/test/web-dom.test.js:11340` |
| `نافذة المزوّد: التوزيع خمسة أعمدة والتعليقات مرقّمة و«المزيد» يضيف الصفحة التالية` | `server/test/web-dom.test.js:11361` |
| `كتابة تقييم: نجوم 1..5 ونصّ، وconfirm_phone: true منطقي في الجسم` | `server/test/web-dom.test.js:11400` |
| `حذف تقييمي: DELETE للمسار نفسه والمتوسط يتبع ردّ الخادم` | `server/test/web-dom.test.js:11438` |
| `صاحب تقييم مخفي: «عدّل تقييمك» وملاحظة الإخفاء وحذفه من الرأس` | `server/test/web-dom.test.js:11484` |
| `اللوحة: مربّعا «موثّق»/«مميّز» يظهران للسوبر أدمن وحدهما، ومحرّر الساعات والمعرض يظهران لمزوّد محفوظ (#184)` | `server/test/web-dom.test.js:11522` |
| `اللوحة: نموذج مزوّد جديد لا يفتح الشعار والغلاف والمعرض قبل الحفظ (#184)` | `server/test/web-dom.test.js:11598` |
| `a 401 on an auth:true site call runs handleSessionExpired once — token cleared, auth modal open, one notice for two parallel 401s` | `server/test/web-dom.test.js:11625` |
| `a 401 on a call WITHOUT auth:true (or on the admin token) leaves the site session alone` | `server/test/web-dom.test.js:11649` |
| `a 401 on the publish POST keeps the filled form and retries the same submission right after logging in again` | `server/test/web-dom.test.js:11663` |
| `header account buttons are removed; bottom bar «حسابي» opens #tabAccount for guests and signed-in users while logout lives inside #tabAccount` | `server/test/web-dom.test.js:11706` |
| `choosing «قريتي غير موجودة» reveals a name field and the publish POST carries requested_village_name with no village_id` | `server/test/web-dom.test.js:11759` |
| `the card shows a typed (unlisted) village name in place of «القرى والتجمعات», escaped` | `server/test/web-dom.test.js:11836` |
| `effective audio: the platform default plays for a type that shows audio_url, and a type that hides it gets no audio at all` | `server/test/web-dom.test.js:11852` |
| `feed audio is isolated per card like a story: moving on stops the old track — even a shared default one — and starts the next from zero` | `server/test/web-dom.test.js:11892` |
| `«قوّي مناسبتك» opens the edit form of that very event; the daily digest goes to the feed` | `server/test/web-dom.test.js:11945` |
| `leaving the feed for another tab and coming back returns to the same card, not the first` | `server/test/web-dom.test.js:11981` |
| `the «new events» switch reads the server, saves a change, and snaps back if the save fails` | `server/test/web-dom.test.js:12001` |
| `admin activity log reads as a sentence — who, did what, to which event — with «افتح» only while the event exists` | `server/test/web-dom.test.js:12038` |
| `admin event card names its publisher, and admin.html?event=<id> opens that event for editing` | `server/test/web-dom.test.js:12068` |
| `admin events: search survives an event with no groom, and phone/poster values stay text` | `server/test/web-dom.test.js:12088` |
| `the global sound toggle lives in the header AND the floating bar, and muting is remembered per viewer` | `server/test/web-dom.test.js:12114` |
| `admin moderation card: a typed village shows as «قرية مقترحة», and only super_admin gets «اعتمدها قرية»` | `server/test/web-dom.test.js:12130` |
| `every element id the live admin.js code reads for actually exists in admin.html` | `server/test/web-dom.test.js:12149` |
| `getLiveShareUrl() returns <origin>/live for the default empty apiBase` | `server/test/web-dom.test.js:12163` |
| `getLiveShareUrl() follows NEGEV_CONFIG.apiBase when it is set to a non-empty absolute origin` | `server/test/web-dom.test.js:12168` |
| `duration presets compute a future "until", and "حتى منتصف الليل" lands exactly on the next local midnight` | `server/test/web-dom.test.js:12174` |
| `clicking a duration preset writes the hidden "until" field and the readable preview text` | `server/test/web-dom.test.js:12198` |
| `status strip: active live shows the badge, topic and remaining time; a saved channel with no live shows the channel-only line; nothing saved shows the unset line` | `server/test/web-dom.test.js:12212` |
| `an expired live (until in the past) renders as "no live", never as an active one` | `server/test/web-dom.test.js:12236` |
| `«إنهاء البث الآن» clears title and until together, in a single PUT request body` | `server/test/web-dom.test.js:12252` |
| `a topic containing markup is inserted into the status strip as text, never as HTML` | `server/test/web-dom.test.js:12283` |
| `each duration button in admin.html is wired to a preset key computeLiveDurationUntil actually resolves` | `server/test/web-dom.test.js:12299` |
| `an expired live is not handed back to the form: its topic and until are cleared, and «إنهاء البث الآن» is disabled` | `server/test/web-dom.test.js:12318` |
| `a still-running live IS restored into the form untouched` | `server/test/web-dom.test.js:12346` |
| `when GET /api/live fails, the strip stops claiming that no channel is configured` | `server/test/web-dom.test.js:12363` |
| `the live section and the episodes section say nothing about TikTok anywhere — text, placeholders or titles` | `server/test/web-dom.test.js:12401` |
| `saving the live form PUTs exactly live_channel_url, live_title, live_until and live_stream_url through adminFetch` | `server/test/web-dom.test.js:12413` |
| `the stream-url hint follows embed_url from GET /api/live: inside the app when set, outside when null, hidden when nothing is configured` | `server/test/web-dom.test.js:12445` |
| `the episode form defaults its date to today in Asia/Jerusalem, and the episodes list loads through adminFetch` | `server/test/web-dom.test.js:12468` |
| `«إضافة خيار» stops at 4 options and the per-option delete stops at 2` | `server/test/web-dom.test.js:12485` |
| `an episode with votes locks its option inputs and add/remove buttons, with the note; one without votes does not` | `server/test/web-dom.test.js:12516` |
| `saving an episode PUTs to /api/admin/live/episodes/:date via adminFetch; an empty poll is sent as no poll; a 409 message is shown as-is` | `server/test/web-dom.test.js:12549` |
| `deleting an episode asks confirm() first and sends DELETE through adminFetch only when confirmed` | `server/test/web-dom.test.js:12589` |
| `«الحلقات السابقة» is the last section of the live page: escaped titles, image or placeholder, and «شاهد هنا» / «افتح على يوتيوب» / «شارك»` | `server/test/web-dom.test.js:12643` |
| `«الحلقات السابقة» stays hidden when past_episodes is empty` | `server/test/web-dom.test.js:12695` |
| `«أرشيف العرس» appears in the event details only when archive_photos is non-empty, and opens a full-screen viewer` | `server/test/web-dom.test.js:12708` |
| `the map popup Waze button still records its town when the town name has an apostrophe` | `server/test/web-dom.test.js:12779` |
| `the host call/WhatsApp buttons work for a town with an apostrophe, and a hostile host_phone stays text` | `server/test/web-dom.test.js:12808` |
| `admin: «عرض السجل» opens the log of the exact device id — a crafted id is data, never code` | `server/test/web-dom.test.js:12838` |
| `no inline handler in web/app.js or web/admin.js embeds escapeHtml() inside a quoted JS string` | `server/test/web-dom.test.js:12866` |
| `uploadToCloudinary POSTs exactly the signed fields plus the file to upload_url, with no token, and throws an Arabic message on refusal` | `server/test/web-dom.test.js:12873` |
| `the episode form prefills and sends video_url; a saved episode lists its video, thumbnail and share link` | `server/test/web-dom.test.js:12900` |
| `saving the live shows live_episode_notice as a warning, or «حُفظ البث كحلقة اليوم» with an optional share-image upload` | `server/test/web-dom.test.js:12945` |
| `the occasion-type form prefills and sends archive_gallery` | `server/test/web-dom.test.js:12986` |
| `لوحة الأنواع تحمل حقل feed_linger_days ويُحفظ عبر المسار القائم (#167)` | `server/test/web-dom.test.js:13014` |
| `an ended event of an archive type gets «صور الأرشيف» (super_admin); the modal lists photos, deletes after confirm, and uploads with per-file status` | `server/test/web-dom.test.js:13047` |
| `ستوريو التسويق: super_admin sees the tab, previews a link, publishes, and deletes with its asset` | `server/test/web-dom.test.js:13123` |
| `ستوريو التسويق: موضع الظهور يُرسَل كما اختير ويُعاد إلى bar بعد النشر (#173)` | `server/test/web-dom.test.js:13193` |
| `بطاقة الدخول: the pinned story is preselected, and saving sends its id or an explicit empty string` | `server/test/web-dom.test.js:13237` |
| `ستوريو التسويق is hidden from a town admin — the tab is absent, not disabled` | `server/test/web-dom.test.js:13291` |
| `تبويب «الأشخاص» is hidden from a town admin and shown to a super admin — merging is super-only (#107)` | `server/test/web-dom.test.js:13299` |
| `اقتراحات الدمج in the people tab are rendered, escaped, and only preselect — they never merge (#107)` | `server/test/web-dom.test.js:13314` |
| `دمج الأشخاص: the merge POST carries JSON and the selected source, and success clears the selection (#107)` | `server/test/web-dom.test.js:13362` |
| `ألبومات الإدارة: pick an archive-gallery event, open its album, edit a caption, and moderate a tag/report` | `server/test/web-dom.test.js:13406` |
| `ألبومات الإدارة: زرّ الحذف في الرأس يرسل معرّف الألبوم الحقيقي، ويغلق اللوحة ويعيد جلب الألبومات` | `server/test/web-dom.test.js:13563` |
| `ألبومات الإدارة: رقاقة «بلا مناسبة» تجلب ألبومات العريس وتعرض بطاقتها، و«فتح» يفتح تفاصيلها` | `server/test/web-dom.test.js:13630` |
| `فيديوهات اللوحة: حالة عربية، «إخفاء» يرسل PATCH، «حذف» بعد تأكيد يرسل DELETE، والإضافة ترسل { url, title }` | `server/test/web-dom.test.js:13692` |
| `ألبومات الإدارة: الوسم يسمّي أصحاب المناسبة والبلدة مرة واحدة، والبحث يرشّح بالكتابة` | `server/test/web-dom.test.js:13804` |
| `ألبومات الإدارة: رفع 45 صورة يوقّع 3 دفعات (max_batch = 20) ويُدخل صفاً لكل صورة` | `server/test/web-dom.test.js:13959` |
| `ألبومات الإدارة: إدخال يردّ 429 برسالة انتظار — الصفّ يقول «أعد المحاولة بعد 2 دقيقة» والصفوف التالية تُحاول` | `server/test/web-dom.test.js:13995` |
| `ألبومات الإدارة: فشل التوقيع بـ 429 يوقف الطابور ويحمل الصفوف الباقية رسالة الانتظار بلا طلب ثانٍ` | `server/test/web-dom.test.js:14024` |
| `the «البلدات والمحافظات» tab button is hidden for a plain admin and shown for super_admin` | `server/test/web-dom.test.js:14093` |
| `the towns table renders per region from GET /api/admin/towns; the locked row has only the reorder buttons` | `server/test/web-dom.test.js:14107` |
| `▼ on the first town PUTs /api/admin/towns/order with the full swapped id list, then refreshes the shared towns list` | `server/test/web-dom.test.js:14135` |
| `submitting the new-town form POSTs name, latitude, longitude and region_id` | `server/test/web-dom.test.js:14155` |
| `the event edit town select offers «النقب — بلا بلدة محدّدة» and keeps an unknown current town selected` | `server/test/web-dom.test.js:14179` |
| `the admin → towns grid offers the region as «النقب (بلا بلدة محدّدة)» and «عرض المناسبات بلا بلدة» filters the events list to that exact town` | `server/test/web-dom.test.js:14198` |
| `the village form carries a mandatory governorate picker and every create sends region_id (تذكرة #128)` | `server/test/web-dom.test.js:14261` |
| `the villages table shows only the chosen governorate's villages, names that governorate, and follows the picker (تذكرة #128)` | `server/test/web-dom.test.js:14292` |
| `the «إضافة محافظة» button opens a form that POSTs the governorate to /api/admin/regions (تذكرة #128)` | `server/test/web-dom.test.js:14316` |
| `the broadcast target offers «كل بلدات <المحافظة>» from GET /api/towns and sends the governorate name for the server to expand (تذكرة #128)` | `server/test/web-dom.test.js:14344` |
| `the analytics tab renders the per-governorate breakdown from overview.by_region, with the «غير محدَّد» row, leaving the summary KPIs as they were (تذكرة #128)` | `server/test/web-dom.test.js:14383` |
| `the publish town select offers the region as «النقب — بلا بلدة محدّدة», valued with the bare region name` | `server/test/web-dom.test.js:14460` |
| `choosing the region centres the map on it with no pin, and publish sends town=النقب with no latitude/longitude` | `server/test/web-dom.test.js:14476` |
| `the edit modal keeps an event's current town selected even when it is not among the options, and saves it back unchanged` | `server/test/web-dom.test.js:14516` |
| `the place filter offers the region «(بلا بلدة محدّدة)» and selecting it sends ?town=النقب` | `server/test/web-dom.test.js:14548` |
| `a region-level event's card shows the bare region name, and the empty feed names the first region` | `server/test/web-dom.test.js:14558` |
| `the collision alert shows the town and date as text — markup in them is never parsed` | `server/test/web-dom.test.js:14570` |
| `switching to «القرى والتجمعات» drops the previous town's automatic pin, but never a pin the user placed` | `server/test/web-dom.test.js:14594` |
| `the publish form renders an extra-days list and «أضف يوماً» button for a type that defines one, and nothing for a type without it` | `server/test/web-dom.test.js:14635` |
| `submitting the publish form sends extra_days[i][…] bracket keys, and a fully blank row is dropped` | `server/test/web-dom.test.js:14655` |
| `the edit modal fills its days from evt.extra_days and PATCHes them back as an array` | `server/test/web-dom.test.js:14694` |
| `«برنامج المناسبة» يجمع محطات اليوم الواحد تحت تاريخ واحد مرتّبةً بالوقت، ويضع كل تاريخ في مجموعته` | `server/test/web-dom.test.js:14738` |
| `«أضف إلى تقويم الهاتف» رابط تنزيل إلى /api/events/<id>/calendar.ics على أصل الـAPI لا أصل الصفحة` | `server/test/web-dom.test.js:14799` |
| `«أضف إلى تقويم الهاتف» يغيب عن غير المؤهّل: معلّقة، أو «بالرابط فقط»، أو مجدولة لم يبلغ موعدها (تذكرة #176)` | `server/test/web-dom.test.js:14836` |
| `زرّ الملاحة بجانب سطر المكان: href بالإحداثيات حين توجد، وباسم المكان حين تغيب` | `server/test/web-dom.test.js:14864` |
| `the admin direct-add form gets its own styled «أضف يوماً» button for a type with extra_days` | `server/test/web-dom.test.js:14899` |
| `admin direct add sends extra_days[i][…] for a filled day row and drops a blank one` | `server/test/web-dom.test.js:14952` |
| `a direct-add draft restores its saved extra-day row` | `server/test/web-dom.test.js:14993` |
| `the admin edit form shows the event's extra days as editable rows` | `server/test/web-dom.test.js:15023` |
| `renaming an extra day sends extra_days but never raises the critical-amendment warning` | `server/test/web-dom.test.js:15036` |
| `changing an extra day's date sends extra_days and raises the critical-amendment warning` | `server/test/web-dom.test.js:15054` |
| `swapping two extra days' dates raises the critical-amendment warning even though the date list is unchanged` | `server/test/web-dom.test.js:15070` |
| `leaving the extra days untouched sends no extra_days key at all` | `server/test/web-dom.test.js:15098` |
| `the days section is hidden for a type that does not show extra_days, and the key is never sent` | `server/test/web-dom.test.js:15117` |
| `buildEventEditFormData JSON-stringifies extra_days exactly like honorees` | `server/test/web-dom.test.js:15138` |
| `admin.css styles the direct-add honoree and extra-day rows, which had no rule before` | `server/test/web-dom.test.js:15147` |
| `the occasion-type editor round-trips every server field key, so saving a type deletes none` | `server/test/web-dom.test.js:15160` |
| `the reminder button reads «أضف لقائمتي» when unsaved, and «في قائمتي» + is-saved when saved, with the heart as its state marker` | `server/test/web-dom.test.js:15228` |
| `renderMyList draws the six server buckets in order, collapses «انتهت سابقاً», and picks row actions by bucket` | `server/test/web-dom.test.js:15257` |
| `a date change shows «تغيّر الموعد» with old→new in its title, and null renders nothing` | `server/test/web-dom.test.js:15309` |
| `the «انتهت» chip filters client-side, and each chip has its own empty state` | `server/test/web-dom.test.js:15342` |
| `the bottom nav holds six slots in RTL order with center gold button, «حسابي» last, and both publish capsules above` | `server/test/web-dom.test.js:15374` |
| `زرّ الوسط يفتح ورقة «مميّز عندنا» بثمانية عناصر، وEsc يغلقها ويعيد التركيز إلى الزرّ` | `server/test/web-dom.test.js:15455` |
| `«مناسباتي» تعرض «مناسباتي اللي نشرتها» قبل «قائمتي» مع الحالات الفارغة والأزرار القائمة` | `server/test/web-dom.test.js:15558` |
| `«خدماتنا» is a public page with the three Ktra platform capsules in order, the news one opening the reader in-place` | `server/test/web-dom.test.js:15620` |
| `«خدماتنا» carries the five calculators as one visible panel at a time, with the Hijri ±1 day warning in plain sight` | `server/test/web-dom.test.js:15711` |
| `the wedding budget sums its items, and refuses an empty name, a negative amount and text` | `server/test/web-dom.test.js:15753` |
| `the expense split names who pays whom, exactly, and refuses a single person and a zero total` | `server/test/web-dom.test.js:15810` |
| `the split settlement never invents or loses an agora, across a fixed pseudo-random run` | `server/test/web-dom.test.js:15870` |
| `the guest estimator multiplies families and tables, treats empty as zero, and refuses text` | `server/test/web-dom.test.js:15928` |
| `the countdown counts local calendar days — 45 ahead, today, 3 past — and rejects a non-existent date` | `server/test/web-dom.test.js:15974` |
| `the Hijri calculator matches four Umm al-Qura reference dates exactly and shows the ±1 day note` | `server/test/web-dom.test.js:16025` |
| `no calculator reaches /api — every one of the five computes on the device` | `server/test/web-dom.test.js:16061` |
| `the add-service window names its purpose, and no outside button borrows that wording` | `server/test/web-dom.test.js:16118` |
| `«أسعار الذهب» — الحاسبة تضرب الوزن في سعر العيار من /api/prices وتُظهر تاريخ المصدر` | `server/test/web-dom.test.js:16167` |
| `«محوّل العملات» — يحوّل في الاتجاهين بسعر ils_per_unit ويعرض تاريخ الصرف` | `server/test/web-dom.test.js:16242` |
| `حين لا تصل الأسعار يُخفى جسم الأداة وتاريخها ويبقى سطر عربي واحد` | `server/test/web-dom.test.js:16287` |
| `الرابط العميق ?tab=ourServices يفتح الوجهة بأداتي الأسعار، وبلا نداء أسعار قبل فتح أداة` | `server/test/web-dom.test.js:16321` |
| `«آخر الأخبار» renders /api/news cards (breaking, category, relative time), then closes with Escape` | `server/test/web-dom.test.js:16350` |
| `the empty governorate offers «أخبار محلية عامة», and choosing it refetches with general=1 and shows the «عامة» tag` | `server/test/web-dom.test.js:16430` |
| `tapping a news card opens its detail inside the layer — body paragraphs, source line, «افتح على كترا» — and back restores the list` | `server/test/web-dom.test.js:16482` |
| `a failing /api/news shows the Arabic error with «إعادة المحاولة», and the retry refetches` | `server/test/web-dom.test.js:16563` |
| `resumePendingIntent with { type: 'remind' } POSTs /api/events/:id/remind after sign-in` | `server/test/web-dom.test.js:16607` |
| `«نظّف المنتهية» confirms first, then DELETEs /api/my-reminders?scope=ended with the token` | `server/test/web-dom.test.js:16640` |
| `removing an event from «قائمتي» clears is_reminded on the feed entry, so its card offers adding it again` | `server/test/web-dom.test.js:16673` |
| `clearEndedMyList: a refused clear toasts nothing and moves nothing; a successful one un-saves the cleared feed event` | `server/test/web-dom.test.js:16735` |
| `the «تراجع» undo of a failed re-add alerts and still reloads the list` | `server/test/web-dom.test.js:16817` |
| `the event page offers no save button for an event that is not approved` | `server/test/web-dom.test.js:16875` |
| `account avatar: a stored avatar_url shows the photo and hides the icon fallback` | `server/test/web-dom.test.js:16937` |
| `account avatar: avatar_url = null hides the photo and brings the icon back` | `server/test/web-dom.test.js:16952` |
| `account profile: save sends full_name + clan_town and adopts the server answer` | `server/test/web-dom.test.js:16966` |
| `account phone: save sends the number with the PIN and keeps only the fresh token` | `server/test/web-dom.test.js:17008` |
| `account phone: a 400 wrong PIN keeps the session and the open form, and shows the server message` | `server/test/web-dom.test.js:17049` |
| `account avatar upload: multipart body with the `image` field and no Content-Type header` | `server/test/web-dom.test.js:17079` |
| `«أنا في الصورة»: an account without a photo opens the sheet, keeps sending disabled and posts nothing` | `server/test/web-dom.test.js:17132` |
| `«أنا في الصورة»: photo + confirmed number send both descriptions with confirm_phone` | `server/test/web-dom.test.js:17170` |
| `«أنا في الصورة»: a 400 shows its server message inside the sheet and leaves it open` | `server/test/web-dom.test.js:17218` |
| `طابور الوسوم: three tabs carry the server counts and switch the queue status` | `server/test/web-dom.test.js:17247` |
| `apiFetch sends X-Region only for a numeric negev_region — no saved value means no header at all` | `server/test/web-dom.test.js:17302` |
| `adminFetch never sends X-Region, even when the browser has one saved` | `server/test/web-dom.test.js:17324` |
| `the region picker is drawn above the feed chips from GET /api/towns (regions), with each region's state` | `server/test/web-dom.test.js:17342` |
| `a saved region is selected again when the page opens, and the drawer copy shows the same state` | `server/test/web-dom.test.js:17369` |
| `choosing another region saves it, empties the previous list, and refetches page 1 with the new X-Region` | `server/test/web-dom.test.js:17392` |
| `publishing under «القرى والتجمعات» requires a region and sends region_id` | `server/test/web-dom.test.js:17435` |
| `the edit modal shows the event's region and sends region_id only when the user changes it` | `server/test/web-dom.test.js:17484` |
| `the very first feed request carries X-Region of the saved region, not the first one` | `server/test/web-dom.test.js:17524` |
| `اختيار محافظة بعد «وسّع إلى كل المحافظات» يُلغي all_regions من الطلب التالي (#161)` | `server/test/web-dom.test.js:17548` |
| `a signed-in visitor with no stored choice is shown the account region the server actually uses` | `server/test/web-dom.test.js:17602` |
| `clicking the drawn default region stores it explicitly and refetches` | `server/test/web-dom.test.js:17631` |
| `the place filter offers only the active region's towns, and an open sheet is rebuilt on a region change` | `server/test/web-dom.test.js:17654` |
| `editing still saves when GET /api/towns returned no regions — the region is only required when a list exists` | `server/test/web-dom.test.js:17673` |
| `the map opens on the active region's centre and re-centres when the region changes` | `server/test/web-dom.test.js:17711` |
| `a slow answer from the previous region cannot land on the new region's feed` | `server/test/web-dom.test.js:17749` |
| `«أهلاً، الاسم» للمسجَّل وحده، والزائر لا يراه (#174)` | `server/test/web-dom.test.js:17825` |
| `negev_user بلا negev_token لا يحيّي في موضعي الترويسة، والجلسة المكتملة تحيّي فيهما (#174)` | `server/test/web-dom.test.js:17844` |
| `كبسولة المحافظة تحمل اسمها من الخادم وتفتح ورقة المحافظة، والاختيار فيها يمشي في selectRegion القائم` | `server/test/web-dom.test.js:17864` |
| `بلا محافظات من الخادم: الكبسولة تقول «منطقتك» والورقة تشرح الفراغ بدل بطاقة فارغة` | `server/test/web-dom.test.js:17900` |
| `القلب يفتح «مناسباتي» وزرّ الأجندة يفتح الأجندة القائمة، والشريط السفلي بست خانات` | `server/test/web-dom.test.js:17919` |
| `قاعدة CSS تُخفي التحية عن الزائر صراحةً، والكبسولة تقصّ الاسم الطويل` | `server/test/web-dom.test.js:17959` |
| `الهاتف وPWA المثبَّت: الصفّ الغني له موضعٌ ثانٍ داخل الشريط العائم الظاهر هناك` | `server/test/web-dom.test.js:17982` |
| `حجز بطاقة التغذية يساوي علوّ الشريط العائم المعلن في كل عتبة (#174)` | `server/test/web-dom.test.js:18048` |
| `التحية والكبسولة تُكتبان في موضعَي الصفّ الغني معاً، واختيار كبسولة الهاتف يمشي في selectRegion نفسه` | `server/test/web-dom.test.js:18115` |
| `المحافظة الأصلية (النقب) بلا شريط: الشريط خبر توسّع لا تحيّة، ولا ورقة قديمة ولا مفتاحها` | `server/test/web-dom.test.js:18218` |
| `التبديل إلى محافظة طولكرم: شريط داخل الصفحة بنصّ الخادم وعدد بلداتها — لا طبقة ولا حوار` | `server/test/web-dom.test.js:18235` |
| `تبديل ثانٍ إلى اللد والرملة ويافا: الشريط يتبع كل تبديل بنصّ المحافظة الجديدة وعدد بلداتها (٣)` | `server/test/web-dom.test.js:18278` |
| `محافظة بصفر مناسبات: عدد البلدات وسطر «كن أول»، ولا «0 مناسبة» في أي نصّ` | `server/test/web-dom.test.js:18302` |
| `محافظة فيها مناسبة معتمدة: رقم المناسبات لا عدد البلدات` | `server/test/web-dom.test.js:18321` |
| `صيغ العدد العربية: بلدة، بلدتان، بلدات، بلدة — وكذلك المناسبات` | `server/test/web-dom.test.js:18337` |
| `× يُخفي الشريط ويسجّل الإخفاء لهذه المحافظة وحدها — ويبقى بعد إعادة التحميل` | `server/test/web-dom.test.js:18355` |
| `اسم المحافظة يمرّ عبر escapeHtml — لا HTML من الخادم في العنوان أو السطر` | `server/test/web-dom.test.js:18394` |
| `تبديل المحافظة لا يطلب /api/towns مرة أخرى — الأرقام من استجابة الإقلاع نفسها` | `server/test/web-dom.test.js:18412` |
| `الموقوفة لا تُختار ولا شريط لها، ومحافظة بلا عدّادين من الخادم لا شريط لها` | `server/test/web-dom.test.js:18433` |
| `ناشر النقب يرى في نموذج النشر بلدات النقب وحدها ثم «النقب — بلا بلدة محدّدة»` | `server/test/web-dom.test.js:18529` |
| `ناشر طولكرم يرى «القرى والتجمعات» في آخر بلداته — ولا بلدة نقبية واحدة` | `server/test/web-dom.test.js:18545` |
| `تبديل حبة المحافظة يعيد بناء بلدات نموذج النشر المفتوح على المحافظة الجديدة` | `server/test/web-dom.test.js:18592` |
| `نافذة التعديل تعرض بلدات محافظة المناسبة وتُبقي بلدةً خارجها مختارة` | `server/test/web-dom.test.js:18608` |
| `النشر المباشر: محافظة الأدمن افتراضاً، وتبديل المحافظة يعيد بناء بلداتها وحدها` | `server/test/web-dom.test.js:18634` |
| `لوحة التعديل: منتقي البلدة يُبنى من محافظة المناسبة ويُبقي بلدة خارجها مختارة` | `server/test/web-dom.test.js:18675` |
| `نموذج تعديل مناسبة قروية في طولكرم يعرض قرى طولكرم وحدها في منتقي القرية` | `server/test/web-dom.test.js:18732` |
| `تبديل محافظة نموذج التعديل إلى النقب يعيد بناء قرى منتقي القرية من النقب` | `server/test/web-dom.test.js:18749` |
| `صفوف قرى بلا region_id (خادم أقدم أو قائمة احتياطية) تُعرض كاملة في منتقي التعديل` | `server/test/web-dom.test.js:18774` |
| `قرية المناسبة الحالية خارج قرى محافظتها تبقى خياراً مختاراً في منتقي التعديل` | `server/test/web-dom.test.js:18788` |
| `مسودّة النشر المباشر: محافظة لم تبق نشطة تعود إلى الافتراضية ولا تترك منتقي البلدة فارغاً` | `server/test/web-dom.test.js:18802` |
| `web/index.html keeps pinch-zoom enabled (no maximum-scale, no user-scalable) and keeps viewport-fit=cover` | `server/test/web-dom.test.js:18830` |
| `Chart.js is pinned to one explicit version, the same in index.html and admin.html` | `server/test/web-dom.test.js:18848` |
| `styles.css: one general :focus-visible rule, and a 44px button base no button rule lowers` | `server/test/web-dom.test.js:18873` |
| `admin.css carries the same 44px button base and general :focus-visible — the panel loads no other stylesheet` | `server/test/web-dom.test.js:18953` |
| `sw.js precaches the shell files only — never an /api endpoint, never admin.html, never a CDN URL` | `server/test/web-dom.test.js:18994` |
| `sw.js covers every local script index.html loads — in the precache list AND the runtime pattern` | `server/test/web-dom.test.js:19035` |
| `sw.js leaves /api responses, non-GET requests and cross-origin requests completely alone` | `server/test/web-dom.test.js:19063` |
| `sw.js serves shell files from the cache and still opens the shell offline` | `server/test/web-dom.test.js:19083` |
| `sw.js activate drops every previous shell cache (the version bump) and leaves other caches alone` | `server/test/web-dom.test.js:19111` |
| `sw.js fails install when an essential shell file cannot be downloaded — the previous cache survives whole` | `server/test/web-dom.test.js:19138` |
| `sw.js keeps install alive when only an icon fails to download — and the icon is filled in at runtime` | `server/test/web-dom.test.js:19204` |
| `صفحة المناسبة تعرض «جاي» و«مش جاي» والعدد 1..20 والعدّاد وحالة الجواب` | `server/test/web-dom.test.js:19270` |
| `لا أزرار حضور ولا عدّاد: لنوع solemn، ولا لنوع rsvp_enabled مطفأ، ولا حين يخفي النوع العدّاد` | `server/test/web-dom.test.js:19300` |
| `«جاي» يرسل PUT /api/events/:id/rsvp بإجمالي الحاضرين المختار، ويحدّث الحالة والعدّاد من ردّ الخادم` | `server/test/web-dom.test.js:19328` |
| `«مش جاي» يُرسل party_size = 1، و«سحب جوابي» يستعمل DELETE على المسار نفسه` | `server/test/web-dom.test.js:19392` |
| `«مين جاي» يرسم الأسماء والعدد والجواب والمصدر والمجاميع` | `server/test/web-dom.test.js:19448` |
| `زرّ «مين جاي» يرسمه «مناسباتي» لمناسبة نوعها مفتوح، ويغيب عن غيرها` | `server/test/web-dom.test.js:19472` |
| `فتح «مين جاي» يقرأ GET /api/events/:id/rsvps بالرمز، ويُظهر رسالة الخادم عند الرفض` | `server/test/web-dom.test.js:19489` |
| `فتح «الدعوات» يقرأ GET /api/events/:id/invites بالرمز ويرسم الاسم والرابط وحالة الفتح والجواب` | `server/test/web-dom.test.js:19545` |
| `«أنشئ الدعوات» يرسل POST بأسماء السطور غير الفارغة، و«حذف» يرسل DELETE على المسار نفسه` | `server/test/web-dom.test.js:19603` |
| `«مين جاي» يعرض سطر الدعوة لصفّها وحده: الاسم و«فُتحت»/«لم تُفتح»` | `server/test/web-dom.test.js:19650` |
| `زرّ «الدعوات» يُرسم بجانب «مين جاي» بنفس شرط النوع` | `server/test/web-dom.test.js:19688` |
| `كرت العرس يحمل الأفعال الثلاثة، والعزاء «عزّي» وحده بلا عدّاد، ونوع بلا rsvp_enabled بلا «جاي»` | `server/test/web-dom.test.js:19743` |
| `«جاي» من الكرت يسجّل الجواب بعدد 1 ويُفعّل «ذكّرني» ظاهراً` | `server/test/web-dom.test.js:19785` |
| `«بارك» يفتح ورقة «اختر رسالة» برسائل النوع، واختيار رسالة يفتح التبريك بنصّها قابلاً للتعديل` | `server/test/web-dom.test.js:19837` |
| `إغلاق ورقة الرسائل أثناء جلب الأنواع لا يرمي ولا يكتب إلى الورقة المغلقة` | `server/test/web-dom.test.js:19905` |
| `ردّ ورقة رسائل قديمة لا يستبدل حالة ورقة جديدة أو محتواها` | `server/test/web-dom.test.js:19930` |
| `ورقة الرسائل لا تُكتب من الكود: نوع بلا رسائل نشِطة يفتح باب الكتابة وحده` | `server/test/web-dom.test.js:19960` |
| `عدّادات صفحة المناسبة: مهتمين وتبريكات حين يرسلهما الخادم، ويغيبان حين يطفئهما النوع أو تكون النغمة وقورة` | `server/test/web-dom.test.js:19988` |
| `بلا اختيار محفوظ وجهاز داكن: لا data-theme على <html> والأيقونة شمس` | `server/test/web-dom.test.js:20022` |
| `اختيار محفوظ dark يُطبَّق على <html> لحظة تحميل السكربت — قبل أول رسم` | `server/test/web-dom.test.js:20039` |
| `toggleTheme يقلب المظهر ويكتبه في localStorage ويحدّث الأيقونة` | `server/test/web-dom.test.js:20053` |
| `قيمة محفوظة فاسدة تُتجاهَل: لا data-theme، والنظام يحكم` | `server/test/web-dom.test.js:20074` |
| `theme-color يتبع المظهر الظاهر، وقيمتاه هما --ground في styles.css` | `server/test/web-dom.test.js:20099` |
| `الصفحات الخمس تحمّل theme-boot.js في <head> قبل أول نمط` | `server/test/web-dom.test.js:20115` |
| `لوحة الإدارة تحترم الاختيار المحفوظ عبر theme-boot نفسه` | `server/test/web-dom.test.js:20133` |
| `لا متغيّر CSS مستعمل وغير معرَّف في styles.css ولا admin.css` | `server/test/web-dom.test.js:20150` |
| `«مناسبتي» وصفحة المناسبة تحملان «صمّم بطاقة» و«ارفع بطاقتك الجاهزة» لصاحبها` | `server/test/web-dom.test.js:20276` |
| `فتح الستوديو يجلب الكتالوج ويعرض قوالب النبرة الاحتفالية وحدها` | `server/test/web-dom.test.js:20306` |
| `مناسبة العزاء ترى قالب العزاء وحده (#180)` | `server/test/web-dom.test.js:20330` |
| `«معاينة» ترسل القالب والمقاس المختارين وتعرض الـblob العائد` | `server/test/web-dom.test.js:20345` |
| `«حفظ البطاقة» يرسل POST ويعرض رابط المقاس الكامل` | `server/test/web-dom.test.js:20382` |
| `فشل الشبكة في المعاينة يظهر رسالة عربية بلا انهيار` | `server/test/web-dom.test.js:20408` |
| `429 في المعاينة والحفظ: «حاول بعد قليل» (#180)` | `server/test/web-dom.test.js:20429` |
| `نافذة المزوّد: الردّ اقتباس تحت التقييم، وزرّه للحساب المربوط وحده` | `server/test/web-dom.test.js:20600` |
| `الردّ يُكتب بـPUT على مسار التقييم نفسه، ويظهر اقتباساً بعد الإعادة` | `server/test/web-dom.test.js:20652` |
| `«عدّل الردّ» يفتح الورقة على النصّ القائم — تعديل لا كتابة من الصفر` | `server/test/web-dom.test.js:20704` |
| `«حسابي»: قسم «مزوّدي» من الخادم، وبطاقته تفتح نافذة المزوّد` | `server/test/web-dom.test.js:20729` |
| `«حسابي»: القسم يختفي كاملاً حين لا مزوّد مربوط — ويُفرَّغ لا يُترك قديماً` | `server/test/web-dom.test.js:20762` |
| `«اطلب عرض سعر»: الزرّ يفتح النموذج، والجسم يحمل التاريخ والمعازيم والملاحظة والمناسبة` | `server/test/web-dom.test.js:20983` |
| `المزوّد غير المربوط: تُفتح `url` التي بناها الخادم، ولا حقول مخترعة في الجسم` | `server/test/web-dom.test.js:21051` |
| `«الطلبات الواردة»: تفاصيل الطالب، والعرض يذهب بـPUT ويُعاد رسمه من الخادم` | `server/test/web-dom.test.js:21090` |
| `«العروض المستلمة»: ثلاثة أقسام يفلترها الخادم، وأزرارها بحسب الحالة` | `server/test/web-dom.test.js:21141` |
| `قسمَا الطلبات والعروض يختفيان كاملاً حين لا صفوف — ولا بطاقة قديمة تبقى` | `server/test/web-dom.test.js:21220` |
| `عدّاد زاوية الملصق: «اليوم» و«غداً» و«بعد N أيام» بتوقيت القدس، ولا شيء لمناسبة انتهت` | `server/test/web-dom.test.js:21260` |
| `باني بنود الشريط الإخباري: المحافظات والمجموع والذهب والعملات والخبر، والغائب يُسقَط وحده` | `server/test/web-dom.test.js:21286` |
| `الشريط الإخباري يُخفى كاملاً حين لا بنود، ويُعرض بصفّين متطابقين حين تصل` | `server/test/web-dom.test.js:21345` |
| `بطاقة الترحيب: تُغلق ببصمة نصّها، ورسالة جديدة ببصمة جديدة تعود` | `server/test/web-dom.test.js:21396` |
| `«الأعراس المميزة»: بطاقة واحدة نشِطة من بطاقتين، ونقطتان، والنقر ينقل البطاقة` | `server/test/web-dom.test.js:21421` |
| `أقسام الرئيسية تُخفى كاملة حين لا بيانات، وتُملأ من ردودها حين تصل` | `server/test/web-dom.test.js:21475` |
| `كرت التغذية يحمل شريحة عدّ واحدة على زاوية الملصق — ولا يحملها لمناسبة انتهت ولا لكرت عزاء` | `server/test/web-dom.test.js:21550` |
| `ترتيب أقسام الرئيسية من أعلى لأسفل كما في المواصفة، والتغذية آخرها` | `server/test/web-dom.test.js:21589` |
