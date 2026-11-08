# ملحق الاختبارات — منصة مناسبات النقب

> **مولَّد من `server/scripts/build-index.js` — لا تحرّره بيدك؛ شغّل `npm run index:build`.**
> ملحق `INDEX.md`: كل حالة `await test(` في ملفَي الاختبار، مرتّبة بالملف ثم السطر.

## حالات الاختبار — 1217

`npm test` يشغّل `web-dom` ثم `smoke`؛ `smoke` يحتاج MySQL حيّة، وكل حالة معرَّفة داخل ملفها.

| الحالة | file:line |
|---|---|
| `GET /health reports the database is up` | `server/test/smoke.test.js:221` |
| `GET /api/events returns approved events with reaction counts` | `server/test/smoke.test.js:227` |
| `GET /api/events returns all events by default, while ?upcoming=1 filters to upcoming only` | `server/test/smoke.test.js:234` |
| `GET /api/events?town= filters by town` | `server/test/smoke.test.js:245` |
| `GET /api/events?search= matches Arabic text` | `server/test/smoke.test.js:250` |
| `GET /api/stories exposes isLive` | `server/test/smoke.test.js:255` |
| `GET /api/map/events returns Waze links` | `server/test/smoke.test.js:261` |
| `GET /api/towns lists towns and per-town stats` | `server/test/smoke.test.js:267` |
| `GET /api/towns carries a map centre for every real town, and none for القرى والتجمعات (#20 step 6)` | `server/test/smoke.test.js:273` |
| `GET /api/app/version announces the mobile release` | `server/test/smoke.test.js:285` |
| `POST /api/check-collision detects a booked date` | `server/test/smoke.test.js:294` |
| `POST /api/check-collision rejects a malformed date` | `server/test/smoke.test.js:300` |
| `POST /api/auth/register creates an account` | `server/test/smoke.test.js:306` |
| `POST /api/auth/register rejects a duplicate phone` | `server/test/smoke.test.js:315` |
| `POST /api/auth/login rejects a wrong PIN` | `server/test/smoke.test.js:322` |
| `POST /api/auth/login succeeds with the right PIN` | `server/test/smoke.test.js:329` |
| `The register and login calls above each wrote a server-side analytics row for this user (issue #44) — no extra requests needed, just reading what already happened` | `server/test/smoke.test.js:337` |
| `An anonymous request is counted per IP and reports RATE_LIMIT_MAX as its ceiling` | `server/test/smoke.test.js:356` |
| `A signed-in request is counted per user and reports the larger RATE_LIMIT_USER_MAX ceiling` | `server/test/smoke.test.js:361` |
| `A garbage bearer token is anonymous again — it keeps the per-IP ceiling` | `server/test/smoke.test.js:367` |
| `authenticatedUserId reads a real token, and answers null for anything unusable` | `server/test/smoke.test.js:372` |
| `GET /api/nokoot without a token is rejected` | `server/test/smoke.test.js:384` |
| `POST /api/nokoot stores a ledger entry` | `server/test/smoke.test.js:389` |
| `GET /api/nokoot returns totals and analytics` | `server/test/smoke.test.js:398` |
| `DELETE /api/nokoot/:id removes the entry` | `server/test/smoke.test.js:404` |
| `POST /api/admin/login rejects a wrong PIN` | `server/test/smoke.test.js:410` |
| `POST /api/admin/login rejects a non-admin account` | `server/test/smoke.test.js:417` |
| `POST /api/admin/login succeeds for the super admin` | `server/test/smoke.test.js:424` |
| `GET /api/admin/stats is closed to a normal user` | `server/test/smoke.test.js:432` |
| `GET /api/admin/stats returns counters for an admin` | `server/test/smoke.test.js:437` |
| `POST /api/admin/broadcast is accepted` | `server/test/smoke.test.js:443` |
| `GET /api/occasion-types returns the five seeded types ordered by position, عرس first` | `server/test/smoke.test.js:453` |
| `عزا carries zero reactions while عرس carries all five` | `server/test/smoke.test.js:462` |
| `Seed a plain admin directly via the DB (no API creates that role)` | `server/test/smoke.test.js:489` |
| `A plain admin is rejected (403) on all four occasion-type admin routes` | `server/test/smoke.test.js:502` |
| `A super_admin passes GET /api/admin/occasion-types and gets the unpublished-type notice` | `server/test/smoke.test.js:513` |
| `Creating a type from the admin panel appears immediately in the public list — no deploy, no migration` | `server/test/smoke.test.js:521` |
| `Creating a type without honorees/town/event_date visible is rejected` | `server/test/smoke.test.js:539` |
| `Creating a type with a field_key outside the master set is rejected` | `server/test/smoke.test.js:549` |
| `A type with an event attached cannot be deleted — refused and disabled instead` | `server/test/smoke.test.js:561` |
| `A type with no events is deleted outright` | `server/test/smoke.test.js:593` |
| `Hiding a field on عرس hides it from the type config but does not touch existing event data` | `server/test/smoke.test.js:599` |
| `GET /api/occasion-types يحمل messages لكل نوع مزروع — بذرة، بالشكل العام بلا أعلام إدارة، ولا نصّ في الكود` | `server/test/smoke.test.js:640` |
| `السوبر أدمن وحده يدير الرسائل — أدمن البلدة يُردّ 403 على القراءة والإضافة والتعديل` | `server/test/smoke.test.js:669` |
| `إضافة رسالة وإطفاؤها: تظهر في الإدارة وفي الردّ العام، ويغيب المطفأ عن العميل وحده` | `server/test/smoke.test.js:686` |
| `تفصيل المناسبة: congratulations_count وinterested_count يصلان إلا ما أطفأه النوع، ولا شيء منهما على العزاء` | `server/test/smoke.test.js:732` |
| `A legacy-shaped event row is backfilled to عرس with one event_honorees row` | `server/test/smoke.test.js:805` |
| `Running the migration twice does not duplicate occasion types, honorees or people` | `server/test/smoke.test.js:828` |
| `إعادة الترحيل لا تكرّر رسائل الأنواع المزروعة — البذرة تُكتب في نوع بلا رسالة واحدة فقط` | `server/test/smoke.test.js:847` |
| `A default poster belongs to the occasion type: عرس gets one, عزا gets none` | `server/test/smoke.test.js:880` |
| `Publishing with five honorees, then searching by the fifth name, returns the event exactly once` | `server/test/smoke.test.js:906` |
| `groom_name is filled with the first honoree by position, written in the same transaction` | `server/test/smoke.test.js:927` |
| `A wedding without a second honoree (bride) is accepted — the second name is optional` | `server/test/smoke.test.js:934` |
| `A funeral (عزا) without event_end_date is rejected with an Arabic message` | `server/test/smoke.test.js:944` |
| `The rejection message names the field by its label in this type — المتوفَّى, not العريس` | `server/test/smoke.test.js:959` |
| `A wedding (عرس) without event_end_date is accepted — only عزا requires it` | `server/test/smoke.test.js:974` |
| `A field hidden for this type (youth_party_date on عزا) is silently ignored, not rejected` | `server/test/smoke.test.js:984` |
| `The default title generated for a funeral contains no festive wording` | `server/test/smoke.test.js:1004` |
| `Publishing with two extra days out of date order stores them and returns them sorted by day_date` | `server/test/smoke.test.js:1016` |
| `A multipart publish with extra_days[0][name] bracket keys stores the day` | `server/test/smoke.test.js:1043` |
| `An extra day with a name but no date is rejected with اليوم 1 in the message` | `server/test/smoke.test.js:1069` |
| `More than ten non-blank extra days is rejected` | `server/test/smoke.test.js:1078` |
| `PATCH extra_days replaces the list, an empty list clears it, and an absent key leaves it untouched` | `server/test/smoke.test.js:1091` |
| `A type where extra_days is hidden ignores posted days instead of rejecting them` | `server/test/smoke.test.js:1131` |
| `GET /api/events list rows carry extra_days` | `server/test/smoke.test.js:1172` |
| `An approved event whose main date has passed is still upcoming — and mapped — while an extra day is ahead` | `server/test/smoke.test.js:1184` |
| `?date_from/?date_to find an event by an extra day or a youth party earlier than its event_date` | `server/test/smoke.test.js:1218` |
| `Set up: an approved wedding with two extra days for the extra-days edit tests` | `server/test/smoke.test.js:1263` |
| `Re-dating one extra day is critical: the event returns to pending and one extra_days amendment row is logged` | `server/test/smoke.test.js:1279` |
| `Renaming one extra day is cosmetic: the event stays approved and the amendment row is cosmetic` | `server/test/smoke.test.js:1320` |
| `Resubmitting the identical extra-days list rewrites no rows and logs no new amendment row` | `server/test/smoke.test.js:1342` |
| `Swapping which named day sits on which date is critical: the event returns to pending and the amendment row is critical` | `server/test/smoke.test.js:1373` |
| `An event whose date has passed is absent from the list and present in the archive` | `server/test/smoke.test.js:1404` |
| `A عزا that started yesterday and spans today is still shown — COALESCE(event_end_date, event_date), not event_date alone` | `server/test/smoke.test.js:1421` |
| `?date_from=/?date_to= return the events on those days — a past day too, and a spanning عزا by overlap` | `server/test/smoke.test.js:1442` |
| `Default page size is 30, and the hard ceiling on ?limit= is enforced` | `server/test/smoke.test.js:1465` |
| `?page= returns a different page than page 1` | `server/test/smoke.test.js:1473` |
| `?occasion_type_id= filters on the server, not the client` | `server/test/smoke.test.js:1480` |
| `congratulations_count is always present (zero when there are none), and latest_congratulation is null` | `server/test/smoke.test.js:1486` |
| `Three تعازي on a عزا (which premoderates) are created pending, with sender_name taken from the account` | `server/test/smoke.test.js:1499` |
| `The admin approves all three; only then does the count/preview reflect them, without duplicating the row` | `server/test/smoke.test.js:1521` |
| `The congratulations counter/preview disappear from the card when show_congratulations_count is off, and return when it is back on` | `server/test/smoke.test.js:1537` |
| `A request with no X-App-Version header only sees weddings from GET /api/events` | `server/test/smoke.test.js:1562` |
| `A request with no X-App-Version header only sees weddings from GET /api/map/events` | `server/test/smoke.test.js:1568` |
| `Reordering the type tabs does not change what a legacy client receives` | `server/test/smoke.test.js:1575` |
| `An occasion type carries an explicit tone, and a renamed label never changes it` | `server/test/smoke.test.js:1596` |
| `An unknown tone is rejected with an Arabic message` | `server/test/smoke.test.js:1620` |
| `A type created from the panel is not sent to already-published clients` | `server/test/smoke.test.js:1638` |
| `A request with a modern X-App-Version header sees every occasion type` | `server/test/smoke.test.js:1659` |
| `A legacy client requesting the details of an unsupported occasion type gets 404 with the fixed Arabic message` | `server/test/smoke.test.js:1665` |
| `A modern client requesting the same event passes through` | `server/test/smoke.test.js:1671` |
| `Explicit list columns still include every field a legacy client reads: groom_name, title, family_clan, dinner_time` | `server/test/smoke.test.js:1676` |
| `Set up: a logged-in user publishes an event (used for the edit-permission tests below)` | `server/test/smoke.test.js:1689` |
| `The owner can edit their own event` | `server/test/smoke.test.js:1697` |
| `A non-owner is rejected with 403` | `server/test/smoke.test.js:1706` |
| `An admin can edit any event, including one it does not own` | `server/test/smoke.test.js:1719` |
| `An orphaned event (created_by IS NULL) can only be edited by an admin` | `server/test/smoke.test.js:1728` |
| `A cosmetic edit (title) keeps an approved event approved` | `server/test/smoke.test.js:1745` |
| `A critical edit (event_date) sends an approved event back to pending` | `server/test/smoke.test.js:1756` |
| `A critical edit (location_name) sends an approved event back to pending` | `server/test/smoke.test.js:1766` |
| `GET /api/my-events returns what this user published, across all statuses` | `server/test/smoke.test.js:1777` |
| `Ownership transfer works for an admin, and is rejected for anyone else` | `server/test/smoke.test.js:1783` |
| `Set up: user publishes and admin approves a wedding for amendment-log tests` | `server/test/smoke.test.js:1806` |
| `A cosmetic edit is logged and the event stays approved` | `server/test/smoke.test.js:1819` |
| `A critical edit produces a pending amendment row and sends the event back to pending` | `server/test/smoke.test.js:1835` |
| `Editing two fields in one request produces two amendment rows` | `server/test/smoke.test.js:1850` |
| `Resubmitting the same value produces no new amendment row and no status change` | `server/test/smoke.test.js:1861` |
| `Approving the event resolves every pending amendment row` | `server/test/smoke.test.js:1874` |
| `An admin reads the amendment log` | `server/test/smoke.test.js:1892` |
| `The owner reads their own event amendment log` | `server/test/smoke.test.js:1898` |
| `A non-owner is rejected from reading the amendment log` | `server/test/smoke.test.js:1904` |
| `The public cannot read the amendment log at all` | `server/test/smoke.test.js:1914` |
| `Set up: an approved wedding with a pin and two honorees` | `server/test/smoke.test.js:1926` |
| `Re-sending an unchanged pin as a number with fewer decimals is not an edit — approved stays approved, no amendment` | `server/test/smoke.test.js:1945` |
| `Changing only the second honoree's name stays approved and logs one cosmetic 'honorees' amendment` | `server/test/smoke.test.js:1969` |
| `Re-sending the identical honorees is not an edit — no new amendment and no row rewrite` | `server/test/smoke.test.js:2007` |
| `Set up: an approved عزا, whose type hides youth_party_date` | `server/test/smoke.test.js:2037` |
| `PATCHing a field the type hides is silently ignored, while a visible field in the same request still applies` | `server/test/smoke.test.js:2053` |
| `Set up: an approved wedding for the multipart list-field edits` | `server/test/smoke.test.js:2074` |
| `A multipart PATCH sending honorees as a JSON string replaces the names` | `server/test/smoke.test.js:2086` |
| `A multipart PATCH sending extra_days as a JSON string stores the day` | `server/test/smoke.test.js:2103` |
| `A multipart PATCH with a malformed JSON list string is rejected with the existing Arabic message` | `server/test/smoke.test.js:2119` |
| `Set up: two funerals published in the same town on the same day` | `server/test/smoke.test.js:2147` |
| `عزا checking against an overlapping عزا in the same town produces no warning (funerals never collision-check)` | `server/test/smoke.test.js:2175` |
| `Checking a عرس against an existing عزا in the same town warns of a collision` | `server/test/smoke.test.js:2188` |
| `Set up: a funeral spanning four days` | `server/test/smoke.test.js:2198` |
| `A عرس on day two of a four-day عزا is detected — range intersection, not date equality` | `server/test/smoke.test.js:2213` |
| `A عرس does not collide with a عرس in a different town on the same day` | `server/test/smoke.test.js:2221` |
| `Set up: a wedding published on a free day` | `server/test/smoke.test.js:2236` |
| `Changing the date to a day now booked by a عزا produces a fresh collision warning not seen at creation` | `server/test/smoke.test.js:2249` |
| `The legacy check-collision shape (date + town only, no occasion_type_id) still works` | `server/test/smoke.test.js:2261` |
| `Migration moves a row still carrying the old placeholder coordinates` | `server/test/smoke.test.js:2282` |
| `Migration does not touch a row with a human-chosen coordinate` | `server/test/smoke.test.js:2291` |
| `Migration drops the pin for a 'القرى والتجمعات' row carrying the old placeholder` | `server/test/smoke.test.js:2300` |
| `Running the migration twice is safe and converges to the same result` | `server/test/smoke.test.js:2309` |
| `Publishing under 'القرى والتجمعات' with no village_id is rejected (case 9)` | `server/test/smoke.test.js:2330` |
| `A legacy row under 'القرى والتجمعات' with a NULL village_id and no requested name — inserted directly, since no publish path can produce one any more — still gets no pin` | `server/test/smoke.test.js:2343` |
| `An event published in a village inherits that village's coordinates and gets a real pin (case 11)` | `server/test/smoke.test.js:2357` |
| `Editing an event to a different village moves its pin as well as its village` | `server/test/smoke.test.js:2389` |
| `Publishing under the catch-all with only a typed requested_village_name succeeds, gets no invented pin, and the moderation queue returns the name` | `server/test/smoke.test.js:2430` |
| `requested_village_name outside the catch-all town is rejected` | `server/test/smoke.test.js:2462` |
| `village_id and requested_village_name together are rejected` | `server/test/smoke.test.js:2476` |
| `A typed name that is already an active village links to it silently and inherits its pin` | `server/test/smoke.test.js:2491` |
| `POST /api/admin/events/:id/promote-village: plain admin 403; super_admin links every event that asked for the name, with exactly one village; a second promote reuses (and re-activates) it` | `server/test/smoke.test.js:2523` |
| `A poster uploads and comes back as an absolute URL, not a relative one` | `server/test/smoke.test.js:2610` |
| `PATCH replaces a poster from an uploaded file, not only from a URL` | `server/test/smoke.test.js:2624` |
| `A multipart PATCH uploading a poster the type hides is ignored, while a visible change in the same request still applies` | `server/test/smoke.test.js:2652` |
| `A JSON PATCH still works now that the route carries multer — the old path must not regress` | `server/test/smoke.test.js:2703` |
| `A poster and an artist image upload together — three file fields are now allowed, not two` | `server/test/smoke.test.js:2722` |
| `A file whose type is not on the allowlist is rejected with a message that names what IS accepted` | `server/test/smoke.test.js:2739` |
| `A file sent under an unknown field name is rejected rather than silently stored` | `server/test/smoke.test.js:2749` |
| `A pin inside the chosen town gets no location_warning on publish` | `server/test/smoke.test.js:2762` |
| `A pin nearer another town gets a location_warning, but publishes with the chosen town untouched (no rejection, no auto-correction)` | `server/test/smoke.test.js:2779` |
| `The same mismatch is re-detected on an edit that moves the pin further from the chosen town` | `server/test/smoke.test.js:2801` |
| `An edit that does not touch latitude/longitude/town carries no location_warning` | `server/test/smoke.test.js:2811` |
| `A publish that leaves dinner_time blank stores no time at all — not a forced 8:00` | `server/test/smoke.test.js:2821` |
| `An edit may clear dinner_time — an emptied field is a real change, not a fallback to the old value` | `server/test/smoke.test.js:2833` |
| `An explicit but out-of-range latitude is rejected with an Arabic message` | `server/test/smoke.test.js:2857` |
| `An explicit, non-numeric longitude is rejected the same way` | `server/test/smoke.test.js:2866` |
| `Publishing with no coordinates at all is still accepted, falling back to the town centre as before` | `server/test/smoke.test.js:2874` |
| `A relative sticker URL comes back absolute, like every other media column` | `server/test/smoke.test.js:2887` |
| `POST /api/events without a token is rejected (publishing now requires an account)` | `server/test/smoke.test.js:2916` |
| `A logged-in (non-admin) submission lands in the pending queue` | `server/test/smoke.test.js:2922` |
| `A pending event is hidden from the public list` | `server/test/smoke.test.js:2932` |
| `An admin submission publishes immediately` | `server/test/smoke.test.js:2937` |
| `An unknown town is rejected` | `server/test/smoke.test.js:2951` |
| `GET /api/towns returns exactly the pre-table town list and centres, in the same order (TWN-1)` | `server/test/smoke.test.js:2962` |
| `A town added to the towns table is listed and publishable with no deploy; disabling it withdraws both (TWN-1)` | `server/test/smoke.test.js:2972` |
| `Re-running migrate never duplicates towns nor resurrects one the super_admin deleted (TWN-1)` | `server/test/smoke.test.js:3011` |
| `GET /api/towns carries the regions key: النقب with its centre and every seeded town, while towns[] stays unchanged (TWN-2)` | `server/test/smoke.test.js:3035` |
| `Publishing with town = the region name is accepted, gets no fallback pin, and never warns about a nearer town (TWN-2)` | `server/test/smoke.test.js:3048` |
| `Resolving a pinless region-level event to a real town gives it that town's centre; an existing pin is never overwritten (TWN-2)` | `server/test/smoke.test.js:3069` |
| `migrate moves every legacy 'غير محدد' town onto the region, and leaves real towns alone (TWN-2)` | `server/test/smoke.test.js:3093` |
| `munasabatna-insert files an invitation with no known town under the region, still pending and pinless (TWN-2)` | `server/test/smoke.test.js:3113` |
| `A super_admin may hand a local admin the region itself, and that admin then sees the region-level queue; a made-up name is still refused (TWN-2)` | `server/test/smoke.test.js:3131` |
| `GET /api/towns keeps regions active-only with is_active and real counts, moves a stopped governorate to regions_soon as {id,name}, and still publishes only into the active name (#127)` | `server/test/smoke.test.js:3180` |
| `Town management is super_admin only — a plain admin gets 403 on every /admin/towns and /admin/regions path (TWN-3)` | `server/test/smoke.test.js:3281` |
| `GET /api/admin/towns lists the region with every town, its event count, and the villages catch-all marked locked (TWN-3)` | `server/test/smoke.test.js:3305` |
| `Adding a town validates coordinates, refuses spelling-variant duplicates, the reserved sentinel and a region name (TWN-3)` | `server/test/smoke.test.js:3316` |
| `A new town lands last; renaming is allowed until something stores its name, then refused; delete disables a used town and removes an unused one (TWN-3)` | `server/test/smoke.test.js:3333` |
| `The villages catch-all can be reordered but never renamed, disabled, moved, given a centre or deleted (TWN-3)` | `server/test/smoke.test.js:3384` |
| `PUT /api/admin/towns/order rewrites the order the public list follows, and refuses a partial list (TWN-3)` | `server/test/smoke.test.js:3397` |
| `PATCH /api/admin/regions/:id edits the map centre/zoom, refuses an out-of-range zoom, and refuses renaming a region events are filed under (TWN-3)` | `server/test/smoke.test.js:3414` |
| `PATCH /api/admin/events/:id/status approves the event` | `server/test/smoke.test.js:3435` |
| `Reactions and congratulations attach to the event` | `server/test/smoke.test.js:3445` |
| `An invalid reaction type is rejected` | `server/test/smoke.test.js:3457` |
| `DELETE /api/admin/events/:id cascades to child rows` | `server/test/smoke.test.js:3464` |
| `An unknown API route returns 404 JSON` | `server/test/smoke.test.js:3471` |
| `POST /api/events/:id/congratulate without a token is rejected` | `server/test/smoke.test.js:3482` |
| `Set up: a regular (non-admin) user publishes a عزا, the admin approves the event itself` | `server/test/smoke.test.js:3491` |
| `A تعزية on this عزا is created pending, with no injected festive badge, sender_name from the account` | `server/test/smoke.test.js:3515` |
| `The public (no token) does not see the pending تعزية` | `server/test/smoke.test.js:3529` |
| `The sender sees their own pending تعزية; a different logged-in visitor does not` | `server/test/smoke.test.js:3534` |
| `A non-owner, non-admin is rejected (403) from approving, deleting, or reading the moderation queue` | `server/test/smoke.test.js:3542` |
| `GET .../congratulations rejects an unknown ?status= filter` | `server/test/smoke.test.js:3557` |
| `The owner approves the pending تعزية — no admin involved — and it is now publicly visible` | `server/test/smoke.test.js:3562` |
| `A second تعزية is approved by an admin instead of the owner` | `server/test/smoke.test.js:3573` |
| `The owner can also reject a pending تعزية — it becomes hidden, not shown publicly` | `server/test/smoke.test.js:3586` |
| `The same owner also publishes an approved عرس — ownership is not type-bound` | `server/test/smoke.test.js:3604` |
| `A congratulation on this عرس publishes immediately — no premoderation outside عزا` | `server/test/smoke.test.js:3617` |
| `The owner (a non-admin) deletes it — an ownership right, not an admin-only power, even in a type that never premoderates` | `server/test/smoke.test.js:3629` |
| `Set up: a fresh, never-reviewed (auto-approved) congratulation to report` | `server/test/smoke.test.js:3643` |
| `Set up: ${CONGRATULATION_REPORT_THRESHOLD} distinct reporter accounts` | `server/test/smoke.test.js:3658` |
| `Reports under the threshold do not hide the message` | `server/test/smoke.test.js:3664` |
| `The same person reporting twice is rejected (409) and does not double the count` | `server/test/smoke.test.js:3678` |
| `The report that crosses the threshold auto-hides the message` | `server/test/smoke.test.js:3686` |
| `DELETE /api/admin/comments/:id is gone (case 19) — the hard-delete route was removed, the row is not` | `server/test/smoke.test.js:3705` |
| `Set up: an owner publishes an approved wedding for the reminder/announcement/notification tests` | `server/test/smoke.test.js:3730` |
| `POST/DELETE .../remind toggles "ذكّرني", and re-pressing an active reminder does not duplicate the row` | `server/test/smoke.test.js:3747` |
| `followers_count shows on a عرس event and disappears when show_followers_count is off — by the flag, not the type name` | `server/test/smoke.test.js:3769` |
| `عزا is seeded with show_followers_count off, so it never carries followers_count — one death is never compared to another` | `server/test/smoke.test.js:3796` |
| `is_reminded is true for the following user, false for a stranger, and false/absent for a guest` | `server/test/smoke.test.js:3820` |
| `GET /api/my-reminders returns what this user is following` | `server/test/smoke.test.js:3831` |
| `Set up: an admin publishes an upcoming and an already-ended wedding, and the follower follows both` | `server/test/smoke.test.js:3845` |
| `PATCH /api/events/:id/remind mutes without unfollowing; a non-boolean is 400 and an event not in the list is 404` | `server/test/smoke.test.js:3864` |
| `A muted follower is excluded from the reminder schedule and from an owner's cosmetic edit, while an unmuted follower still hears both` | `server/test/smoke.test.js:3908` |
| `POST /api/events/:id/remind on a pending event is a 404 and writes no row` | `server/test/smoke.test.js:3933` |
| `GET /api/my-reminders shapes «قائمتي»: counts, under_review_count, span strings, a bucket, upcoming before ended` | `server/test/smoke.test.js:3951` |
| `under_review_count carries the same legacy filter as the list itself` | `server/test/smoke.test.js:3990` |
| `myListBucket places every day in exactly one bucket, boundaries included` | `server/test/smoke.test.js:4027` |
| `date_change appears only for an announcement published after the row was saved` | `server/test/smoke.test.js:4043` |
| `DELETE /api/my-reminders?scope=ended clears only this user's ended rows; another scope is 400` | `server/test/smoke.test.js:4068` |
| `Set up: the owner also reminds their own event — tests self-exclusion even when editor is both owner and follower` | `server/test/smoke.test.js:4093` |
| `A critical event_date edit produces no live announcement until an admin approves it` | `server/test/smoke.test.js:4098` |
| `Approving that edit publishes the announcement, naming the old and new date` | `server/test/smoke.test.js:4110` |
| `The follower is notified; the owner who edited it themself is not, even though they also follow it` | `server/test/smoke.test.js:4151` |
| `A second critical date edit — this time by an admin, not the owner — supersedes the first announcement; both rows stay in the table` | `server/test/smoke.test.js:4183` |
| `This time both the follower and the owner (neither of them the editor) are notified` | `server/test/smoke.test.js:4208` |
| `GET /api/notifications returns only this user's own rows, and PATCH marks one read` | `server/test/smoke.test.js:4222` |
| `A user cannot read or mark-read another user's notification — secrecy at the query itself` | `server/test/smoke.test.js:4244` |
| `A cosmetic edit publishes no announcement, but tells each follower once — never the stranger, and a second edit the same day refreshes that one row` | `server/test/smoke.test.js:4255` |
| `A critical edit that is NOT a date change (location) is approved normally, never publishes a date announcement, but does notify as a venue change (issue #85, story 6)` | `server/test/smoke.test.js:4287` |
| `An announcement about an occasion type a legacy client cannot render never reaches it` | `server/test/smoke.test.js:4330` |
| `views_count stays a bare counter — repeated views by different identities never write a per-viewer row, and no such table exists` | `server/test/smoke.test.js:4364` |
| `The live announcement disappears once its event's (new) date has passed` | `server/test/smoke.test.js:4392` |
| `Set up: a followed wedding 4 days away, and a followed funeral 4 days away (notify_countdown off)` | `server/test/smoke.test.js:4439` |
| `A follower of an event 4 days away gets exactly one event_soon row` | `server/test/smoke.test.js:4470` |
| `The countdown body never names a date` | `server/test/smoke.test.js:4481` |
| `An occasion type with notify_countdown = 0 produces NO countdown row, for any offset` | `server/test/smoke.test.js:4490` |
| `Running the scheduler pass twice for the same day produces ONE row, not two` | `server/test/smoke.test.js:4498` |
| `Set up: an owner publishes an approved wedding for the venue-change notification test` | `server/test/smoke.test.js:4515` |
| `A venue change notifies followers; the user who made the change is not notified` | `server/test/smoke.test.js:4537` |
| `Approval notifies the publisher` | `server/test/smoke.test.js:4599` |
| `Rejection notifies the publisher and carries the reason` | `server/test/smoke.test.js:4622` |
| `Set up: a publisher owns a funeral with two pending تعازي awaiting review` | `server/test/smoke.test.js:4655` |
| `The moderation digest is ONE row carrying a count, not one row per message` | `server/test/smoke.test.js:4688` |
| `Set up: capUser follows four unrelated events at four countdown offsets, and owns+follows a fifth at 0 days` | `server/test/smoke.test.js:4713` |
| `The daily cap holds at three scheduled notifications, but an own-event one still arrives once the cap is spent` | `server/test/smoke.test.js:4761` |
| `A venue change still arrives for this same user even though the daily cap is already spent` | `server/test/smoke.test.js:4781` |
| `Exempt (own-event) event_soon rows must not be COUNTED by the cap — three of them must never block a fourth, unrelated one (issue #85 review, FIX 2)` | `server/test/smoke.test.js:4811` |
| `Notification preferences: «مناسبة جديدة» is on by default, can be turned off, and only a boolean is accepted` | `server/test/smoke.test.js:4889` |
| `A first approval tells everyone who kept «مناسبة جديدة» on — never the publisher or whoever turned it off — and asks the publisher to strengthen the event` | `server/test/smoke.test.js:4905` |
| `Rejecting and re-approving never announces the same event twice, and keeps its first approval time` | `server/test/smoke.test.js:4931` |
| `From the fourth new event of a day, each user gets ONE digest that updates in place and turns unread again` | `server/test/smoke.test.js:4945` |
| `«مناسبة جديدة» تصل أهل المحافظة ومن بلا محافظة ولا تصل محافظة أخرى — صفوفاً ودفعاً (#161)` | `server/test/smoke.test.js:4986` |
| `عدّاد «مناسبة جديدة» اليومي بمحافظة المناسبة: أول اعتماد في محافظة أخرى فرديّ لا ملخّص، ودفعه لا يستهلكه غيرها (#161)` | `server/test/smoke.test.js:5102` |
| `من بلا محافظة يتلقّى ملخّصاً مستقلاً لكل محافظة بعددها الصحيح ودفعةً واحدة لكل منهما — لا صفّاً واحداً يُكتب فوقه (#161)` | `server/test/smoke.test.js:5185` |
| `A followed event 2 days out reads «باقي يومين», the countdown's own idiom` | `server/test/smoke.test.js:5253` |
| `The second «قوّي مناسبتك» arrives once, two days after the first, while something is still missing` | `server/test/smoke.test.js:5267` |
| `A solemn occasion (عزا) is never asked to «strengthen» itself` | `server/test/smoke.test.js:5282` |
| `The admin event list names who published each event` | `server/test/smoke.test.js:5300` |
| `Activity log: who did what to which event — filterable, super admin only, and a deleted event stays readable` | `server/test/smoke.test.js:5309` |
| `start() re-arms itself with a fresh, zone-aware setTimeout every cycle — never a fixed-length setInterval` | `server/test/smoke.test.js:5358` |
| `The next run lands on 09:00 Asia/Jerusalem wall-clock across the next real DST boundary, not merely 24h later` | `server/test/smoke.test.js:5411` |
| `GET /api/reminders/schedule returns the remaining offsets for a followed event and nothing for an unfollowed one` | `server/test/smoke.test.js:5468` |
| `shouldDropSubscription: pure decision, no network — drops only on 404/410, keeps on 429/413/5xx/success` | `server/test/smoke.test.js:5516` |
| `GET /api/notifications/vapid-public-key returns null with no VAPID keys configured, and never carries a private key` | `server/test/smoke.test.js:5526` |
| `POST /api/notifications/subscribe is refused with an Arabic message (not a 500) when no VAPID keys are configured, and writes no row` | `server/test/smoke.test.js:5534` |
| `A notification row is still written normally with no VAPID keys configured (push failure never blocks persistence)` | `server/test/smoke.test.js:5547` |
| `Set up two users for push subscription storage/isolation tests` | `server/test/smoke.test.js:5583` |
| `Subscribing stores exactly one row per device; re-subscribing the same device is idempotent, not a duplicate; the endpoint never appears in the response` | `server/test/smoke.test.js:5588` |
| `A malformed subscription body is rejected with 400 in Arabic before ever reaching storage` | `server/test/smoke.test.js:5610` |
| `An over-length endpoint is rejected with 400, never silently truncated and stored (issue #85 review, FIX 1)` | `server/test/smoke.test.js:5624` |
| `A non-URL, and a non-https, endpoint are both rejected with 400 — a capability URL that is not even a URL is not worth storing` | `server/test/smoke.test.js:5650` |
| `DELETE /api/notifications/subscribe also rejects an over-length endpoint with 400 (shares the same validation)` | `server/test/smoke.test.js:5669` |
| `A user cannot see or remove another user's subscription, and unsubscribing an already-gone endpoint is not an error` | `server/test/smoke.test.js:5678` |
| `A 429 with a short Retry-After triggers exactly one retry, and sendToUser itself returns without waiting for it (issue #85 review, FIX 2) — no real network call` | `server/test/smoke.test.js:5705` |
| `A 429 whose Retry-After exceeds the retry ceiling is NOT retried, and still keeps the row` | `server/test/smoke.test.js:5749` |
| `Deleting a user deletes their push subscriptions (story 21, FK ON DELETE CASCADE)` | `server/test/smoke.test.js:5783` |
| `Admin creates a plain (non-ad) story` | `server/test/smoke.test.js:5812` |
| `A regular user is rejected (403) from every /api/admin/stories route` | `server/test/smoke.test.js:5823` |
| `An ad story with no advertiser_name is rejected with an Arabic message` | `server/test/smoke.test.js:5836` |
| `An ad story with advertiser_name is accepted and carries the ad fields` | `server/test/smoke.test.js:5846` |
| `A story link must be http(s); a video platform and CTA are stored and returned` | `server/test/smoke.test.js:5858` |
| `The studio previews a YouTube link as a real 1080×1920 card without uploading it` | `server/test/smoke.test.js:5889` |
| `Publishing a studio story uploads the generated poster, stores the link/CTA, and deletes the asset with the story` | `server/test/smoke.test.js:5921` |
| `Publishing a studio story validates the placement before any Cloudinary upload or database write (#173)` | `server/test/smoke.test.js:5988` |
| `Turning an existing story into an ad without an advertiser_name is rejected the same way on PATCH` | `server/test/smoke.test.js:6021` |
| `The four ready-made expiry presets come from the server` | `server/test/smoke.test.js:6030` |
| `An expired story is excluded from GET /api/stories; a not-yet-expired one and a never-expiring one both remain` | `server/test/smoke.test.js:6038` |
| `An invalid expires_at is rejected instead of silently becoming null` | `server/test/smoke.test.js:6066` |
| `Set up: two registered viewers from two different towns` | `server/test/smoke.test.js:6084` |
| `A registered viewer watching the same story twice today is counted once` | `server/test/smoke.test.js:6098` |
| `An anonymous viewer watching with the same device_id twice today is counted once` | `server/test/smoke.test.js:6109` |
| `A view with no token and no device_id is rejected` | `server/test/smoke.test.js:6119` |
| `A second, different registered viewer is counted as a third distinct view/viewer overall` | `server/test/smoke.test.js:6125` |
| `Town breakdown reports one count per registered viewer's town, and a bucket for the anonymous device view` | `server/test/smoke.test.js:6133` |
| `Clicks are counted, and CPM/eCPM/frequency never appear in the metrics response` | `server/test/smoke.test.js:6141` |
| `A report is recorded once per person; a second report from the same person is rejected` | `server/test/smoke.test.js:6152` |
| `Reporting a story requires a login` | `server/test/smoke.test.js:6159` |
| `With no entry_promo_story_id the entry card is the first active story, source "auto"` | `server/test/smoke.test.js:6170` |
| `Pinning a story id returns that story from the entry card with source "pinned"` | `server/test/smoke.test.js:6181` |
| `Clearing entry_promo_story_id with an empty string returns the entry card to auto` | `server/test/smoke.test.js:6199` |
| `A pinned story that is then deleted leaves the entry card on auto, without an error` | `server/test/smoke.test.js:6211` |
| `A non-numeric entry_promo_story_id is rejected with an Arabic 400, and a town-scoped admin is refused (403)` | `server/test/smoke.test.js:6237` |
| `With no active story the entry card is disabled, and every story's expiry is restored afterwards` | `server/test/smoke.test.js:6266` |
| `Placement (#173): no X-App-Version receives bar stories only; a modern header receives all three` | `server/test/smoke.test.js:6285` |
| `Placement (#173): the entry card never hands a legacy client a pinned carousel or feed story` | `server/test/smoke.test.js:6332` |
| `Placement (#173): an unknown placement is refused with 400 and an Arabic message, and nothing is stored` | `server/test/smoke.test.js:6378` |
| `Placement (#173): null and empty placements fall back to bar, and an update moves the story between positions` | `server/test/smoke.test.js:6420` |
| `Placement (#173): views and clicks are recorded for carousel and feed stories exactly as for bar ones` | `server/test/smoke.test.js:6447` |
| `Set up: a town-scoped admin, assigned to رهط via the super_admin's towns API` | `server/test/smoke.test.js:6502` |
| `Set up: one pending event inside the scoped admin's town, one outside it` | `server/test/smoke.test.js:6524` |
| `Case 1: a town-scoped admin approves an event in their own town — 200` | `server/test/smoke.test.js:6542` |
| `Case 2: the same admin gets 404, not 403, for an event outside their towns` | `server/test/smoke.test.js:6549` |
| `Case 3: GET /admin/events never returns the out-of-scope event to the scoped admin` | `server/test/smoke.test.js:6556` |
| `Case 4: GET /admin/stats counts only the scoped admin's own town — matches a direct DB count for رهط exactly` | `server/test/smoke.test.js:6561` |
| `Case 5: GET /admin/users is closed (403) to a plain admin — super_admin only now` | `server/test/smoke.test.js:6567` |
| `Case 6: a super_admin passes every one of cases 1-5 — no town restriction, and /admin/users stays open to it` | `server/test/smoke.test.js:6572` |
| `Case 7: an admin with zero admin_towns rows sees nothing and can approve nothing — fail closed` | `server/test/smoke.test.js:6594` |
| `GET /admin/me reports the caller's own towns, and an admin with none gets an empty list` | `server/test/smoke.test.js:6628` |
| `Case 8: an admin publishing in their own town is approved immediately; the same admin publishing outside it lands pending, never rejected` | `server/test/smoke.test.js:6643` |
| `A super_admin's broadcast lands with scope_town = NULL and reaches a user in any town` | `server/test/smoke.test.js:6683` |
| `A town admin's broadcast produces one row per own town and reaches only those users` | `server/test/smoke.test.js:6703` |
| `A user in another town does NOT see a town-scoped broadcast` | `server/test/smoke.test.js:6718` |
| `A town admin naming a town outside their scope gets 404, and writes zero rows` | `server/test/smoke.test.js:6723` |
| `An admin with no assigned towns is refused and writes zero rows` | `server/test/smoke.test.js:6735` |
| `An expired broadcast is absent from the live read and present in the notification centre` | `server/test/smoke.test.js:6749` |
| `A «بلا شريط» broadcast (expires_at = NULL) never appears in the live read` | `server/test/smoke.test.js:6772` |
| `Dismissing hides a broadcast from the live read for that user only, moves it to read in their centre, and it stays there` | `server/test/smoke.test.js:6788` |
| `Dismissing a broadcast outside the caller's scope is 404` | `server/test/smoke.test.js:6815` |
| `POST /api/notifications/read-all marks every personal notification and broadcast read, deletes nothing, and touches no one else` | `server/test/smoke.test.js:6820` |
| `A user created AFTER the broadcast still sees it — proves no fan-out` | `server/test/smoke.test.js:6855` |
| `The centre hides a broadcast published before the account registered, and keeps a newer one` | `server/test/smoke.test.js:6913` |
| `A broadcast that expired more than 30 days ago drops out of the centre; one expired 10 days ago stays` | `server/test/smoke.test.js:6943` |
| `GET /api/broadcasts/live is unchanged by the centre limits: only live broadcasts, even anonymously` | `server/test/smoke.test.js:6961` |
| `An invalid tone is rejected in Arabic` | `server/test/smoke.test.js:6978` |
| `A past expires_at is rejected in Arabic` | `server/test/smoke.test.js:6987` |
| `An expires_at too far in the future is rejected` | `server/test/smoke.test.js:6996` |
| `A non-super admin gets 404, not 403, on PATCH /admin/users/:id/role` | `server/test/smoke.test.js:7033` |
| `super_admin is never grantable through this endpoint` | `server/test/smoke.test.js:7040` |
| `Promotion reaches admin and nothing higher, and the response never carries pin_code` | `server/test/smoke.test.js:7047` |
| `Promoting an already-admin user is rejected, not silently repeated` | `server/test/smoke.test.js:7063` |
| `Demoting clears admin_towns in the same transaction` | `server/test/smoke.test.js:7070` |
| `Demoting a plain user (never an admin) is rejected` | `server/test/smoke.test.js:7090` |
| `Self-demotion is refused` | `server/test/smoke.test.js:7097` |
| `The last remaining super_admin cannot be demoted` | `server/test/smoke.test.js:7105` |
| `admin.demote is logged only for a successful commit, never for a rejected attempt` | `server/test/smoke.test.js:7124` |
| `Case 10: sending village_id together with a non-catch-all town is rejected` | `server/test/smoke.test.js:7158` |
| `Case 12: GET /api/towns with no X-App-Version returns the towns array unchanged, element by element, plus the new villages key, each row carrying its real region_id` | `server/test/smoke.test.js:7172` |
| `Case 13: artist_name sent on a عزا publish is silently ignored — not stored, not rejected` | `server/test/smoke.test.js:7244` |
| `Case 14: artist_name sent on a عرس publish is stored and comes back in GET /api/events` | `server/test/smoke.test.js:7267` |
| `Set up: a super_admin creates a service category` | `server/test/smoke.test.js:7291` |
| `Case 17: an admin-created provider needs no consent fields — the server records the consent itself` | `server/test/smoke.test.js:7300` |
| `Case 18: an admin holding only رهط cannot create a provider for {رهط, حورة} — containment` | `server/test/smoke.test.js:7322` |
| `Set up: a super_admin creates a real provider with a phone number` | `server/test/smoke.test.js:7340` |
| `Case 15: GET /api/services/providers carries no phone key on any row` | `server/test/smoke.test.js:7357` |
| `Case 16: GET /api/services/providers/:id carries phone` | `server/test/smoke.test.js:7365` |
| `Optional phone: an admin creates a provider with no phone — 201, stored as NULL` | `server/test/smoke.test.js:7372` |
| `Optional phone: a present but invalid phone is still rejected (400), and nothing is written` | `server/test/smoke.test.js:7383` |
| `Optional phone: the detail returns phone: null; the list has no phone key and has_phone tells the two apart` | `server/test/smoke.test.js:7395` |
| `Optional phone: PATCH sets the number, leaves it alone when the key is absent, and clears it with an empty string` | `server/test/smoke.test.js:7409` |
| `Category attributes: creating a category with custom attributes saves and returns them` | `server/test/smoke.test.js:7440` |
| `Category attributes: GET /api/services/categories returns attributes for active categories` | `server/test/smoke.test.js:7460` |
| `Provider specs & estimates: creating a provider with package estimate and attributes` | `server/test/smoke.test.js:7471` |
| `Provider specs & estimates: GET /api/services/providers carries specs, price_estimate_desc, price_type, and strictly NO phone` | `server/test/smoke.test.js:7493` |
| `Provider search: ?search= filters by name, description, and specs` | `server/test/smoke.test.js:7505` |
| `Provider specs & estimates: GET /api/services/providers/:id carries full details including phone` | `server/test/smoke.test.js:7513` |
| `Set up: an owner publishes an approved event in the scoped admin's town, and a well-wisher congratulates it` | `server/test/smoke.test.js:7536` |
| `Case 20: a town-scoped admin hides the comment — status becomes hidden, moderated_by is set to that admin` | `server/test/smoke.test.js:7565` |
| `Case 21: the event owner cannot lift the block the admin placed` | `server/test/smoke.test.js:7577` |
| `Set up: an approved wedding whose honoree name and clan carry HTML metacharacters` | `server/test/smoke.test.js:7694` |
| `GET /e/:id on an approved event returns 200 HTML with absolute og:title/og:image/og:url` | `server/test/smoke.test.js:7710` |
| `User text comes back escaped — in the page body AND inside content="…"` | `server/test/smoke.test.js:7722` |
| `The preview leads with the occasion type, not the free-text title` | `server/test/smoke.test.js:7748` |
| `og:image points at the generated card, and og:image:width/height declare its real 1200×1200 size` | `server/test/smoke.test.js:7754` |
| `GET /e/:id/card.jpg on the approved event is a real 1200×1200 JPEG` | `server/test/smoke.test.js:7765` |
| `THE SIZE GUARD: a card built from a real (non-trivial) poster still stays under the WhatsApp preview limit` | `server/test/smoke.test.js:7784` |
| `The footer mark/text sit clear of the decorative frame — lowest drawn content stays ≥12px above the companion rule` | `server/test/smoke.test.js:7802` |
| `A second request for the same card is served from cache, not re-rendered` | `server/test/smoke.test.js:7839` |
| `The Content-Security-Policy header is present on the share route, with a font source and still no script source` | `server/test/smoke.test.js:7851` |
| `The Cairo woff2 files are actually served by the assets route with the woff2 content type` | `server/test/smoke.test.js:7866` |
| `Both download buttons are present, and the secondary one points at the site root rather than the APK` | `server/test/smoke.test.js:7875` |
| `The three-reason strip is present` | `server/test/smoke.test.js:7888` |
| `The page contains no <script tag at all` | `server/test/smoke.test.js:7895` |
| `No date, venue, or phone value leaks anywhere in the response for an event that has all three set` | `server/test/smoke.test.js:7900` |
| `Editing the event produces a different card, and the old cached one is evicted` | `server/test/smoke.test.js:7922` |
| `Set up: a pending (not yet approved) wedding` | `server/test/smoke.test.js:7951` |
| `GET /e/:id on a pending event, a non-existent id, and a non-numeric id all 404 with an identical body` | `server/test/smoke.test.js:7961` |
| `GET /e/:id/card.jpg on a pending event, a non-existent id, and a non-numeric id all 404` | `server/test/smoke.test.js:7973` |
| `Set up: an approved wedding whose date has already passed` | `server/test/smoke.test.js:7983` |
| `GET /e/:id on an expired approved event is still 200 and shows the «انتهت» marker` | `server/test/smoke.test.js:7993` |
| `Set up: a poster-less عزا (solemn tone, no default_poster_url either)` | `server/test/smoke.test.js:8000` |
| `The festive share page carries «أعراسنا» in og:site_name, the description, and the footer` | `server/test/smoke.test.js:8017` |
| `A solemn-tone event with no poster renders a real card in the solemn palette, not the festive one` | `server/test/smoke.test.js:8029` |
| `Both palettes expose a wordmark, and the generated card renders for each tone` | `server/test/smoke.test.js:8050` |
| `The solemn (condolence) share page never carries «أعراسنا» anywhere, and still carries «مناسبات النقب»` | `server/test/smoke.test.js:8065` |
| `Set up: an approved event for the share/download analytics tests below` | `server/test/smoke.test.js:8085` |
| `A name from the closed list is accepted, and a row is actually written` | `server/test/smoke.test.js:8095` |
| `A name outside the closed list is rejected with an Arabic message` | `server/test/smoke.test.js:8108` |
| `A count-only name (share_page_viewed) sent WITH a token and a device_id still writes a row whose user_id and device_id are both NULL` | `server/test/smoke.test.js:8116` |
| `The tighter analytics rate limit actually returns a rejection when exceeded` | `server/test/smoke.test.js:8131` |
| `The analytics_events table has no event_id, ip, or user_agent column at all — the direct, permanent test of the governing rule` | `server/test/smoke.test.js:8142` |
| `Exercising the nokoot (دفتر النقوط) routes writes ZERO analytics rows — the private ledger is not an exception` | `server/test/smoke.test.js:8151` |
| `GET /e/:id/download 302-redirects to the APK url and records app_download_clicked with the event's town` | `server/test/smoke.test.js:8166` |
| `GET /e/:id/download still redirects and records for a non-existent id — just with no content_town` | `server/test/smoke.test.js:8188` |
| `A row older than the retention window loses its identity on fold and survives as a daily counter; running the fold twice does not double-count` | `server/test/smoke.test.js:8202` |
| `Set up: two fresh users for the privacy tests below, each with a pre-existing identified analytics row (standing in for the register-time row a real sign-up would have written)` | `server/test/smoke.test.js:8262` |
| `PATCH /api/auth/me opts a user out of behavioural analytics, and GET /api/auth/me reflects it — neither response carries pin_code` | `server/test/smoke.test.js:8278` |
| `an expired or tampered token is 401 (sign in again), never 403 — 403 stays "not allowed"` | `server/test/smoke.test.js:8293` |
| `GET /api/auth/me renews a plain user's token (a working one), and never an admin's` | `server/test/smoke.test.js:8310` |
| `An opted-out signed-in user triggers an identified analytics event ⇒ zero rows written for them — not an anonymised one` | `server/test/smoke.test.js:8328` |
| `Opting out changes nothing about the ability to use the app — a normal authenticated action still succeeds` | `server/test/smoke.test.js:8345` |
| `POST /api/privacy/analytics-erasure erases only the caller's own analytics rows — another user's rows are untouched` | `server/test/smoke.test.js:8354` |
| `Deleting an account removes its analytics rows too — the FK cascade, not a separate code path` | `server/test/smoke.test.js:8375` |
| `POST /api/privacy/requests queues a formal request and states a deadline` | `server/test/smoke.test.js:8385` |
| `POST /api/privacy/requests rejects an unknown request type` | `server/test/smoke.test.js:8398` |
| `A town-scoped admin gets 403 on both the analytics read and the privacy request queue — super_admin only, never a town admin` | `server/test/smoke.test.js:8406` |
| `A super_admin gets 200 on both, sees the queued request, and can close it` | `server/test/smoke.test.js:8414` |
| `DELETE /api/account — no PIN is 400, a wrong PIN is 401, the right PIN is 200; an already-issued token stops answering with data afterwards` | `server/test/smoke.test.js:8438` |
| `POST /api/privacy/deletion-request is public, folds Arabic-Indic digits and spaces, answers identically for a registered number, an unknown one and a duplicate, and queues exactly one erasure request` | `server/test/smoke.test.js:8467` |
| `DELETE /api/admin/users/:id — a super_admin deletes another account, its queue row goes with it (CASCADE), deleting itself is refused, and an unknown id is 404` | `server/test/smoke.test.js:8525` |
| `An old public request neither blocks the owner from filing a verified one nor gets promoted to verified` | `server/test/smoke.test.js:8568` |
| `The scheduled daily pass deletes a user whose VERIFIED erasure request passed the 30-day deadline — and leaves the fresh, the access-only and the already-closed requests untouched; a second run is safe` | `server/test/smoke.test.js:8610` |
| `executeErasureRequest refuses a fresh request when called directly — it re-proves eligibility, not just existence` | `server/test/smoke.test.js:8704` |
| `A close committed after the job’s pending pre-read but held under a row lock makes the atomic eligibility check prevent the deletion` | `server/test/smoke.test.js:8736` |
| `deleting your own account deletes your profile photo from Cloudinary, not just the row that pointed at it` | `server/test/smoke.test.js:8833` |
| `a super_admin deleting an account from the panel deletes its profile photo too` | `server/test/smoke.test.js:8866` |
| `GET /api/admin/analytics/users/:id (issue #44, user story 45) — a super_admin reads one user's own rows, isolated from another user's, with no event id of any kind, and pagination that behaves` | `server/test/smoke.test.js:8901` |
| `GET /api/admin/analytics/overview, devices, and devices/:deviceId/log — super_admin tracks all viewers and devices while town admins are refused` | `server/test/smoke.test.js:8962` |
| `GET /api/privacy/notice is public, names every event in the closed list in Arabic, and leaks no code identifiers` | `server/test/smoke.test.js:9039` |
| `GET /api/settings/public answers cleanly before any setting was ever saved, and exposes nothing but the support number, the default audio and the providers layout` | `server/test/smoke.test.js:9064` |
| `A plain (town-scoped) admin is refused on both GET and PUT /api/admin/settings — super_admin only` | `server/test/smoke.test.js:9075` |
| `PUT /api/admin/settings rejects an invalid WhatsApp number with an Arabic message` | `server/test/smoke.test.js:9085` |
| `PUT /api/admin/settings rejects a key outside the code-owned whitelist` | `server/test/smoke.test.js:9093` |
| `A super_admin saves the support number, local and international forms normalise to the same canonical value, and it reads back on both the admin and public routes` | `server/test/smoke.test.js:9100` |
| `A super_admin clears a previously-saved support number with an explicit empty value — it goes back to null everywhere, and an absent key leaves it untouched` | `server/test/smoke.test.js:9123` |
| `providers_display: a super_admin saves «cards» and every client reads it back from the public route; a town-scoped admin is refused (403) and changes nothing` | `server/test/smoke.test.js:9163` |
| `providers_display: an unknown value is rejected with an Arabic 400 and the saved choice stays` | `server/test/smoke.test.js:9186` |
| `providers_display: clearing it with an explicit empty value returns the public route to the default «compact»` | `server/test/smoke.test.js:9199` |
| `providers_display: a stale value in the table also reads as «compact» — the fallback lives in the service, not in a client` | `server/test/smoke.test.js:9209` |
| `POST and DELETE /api/admin/settings/default-audio refuse a plain user and a town-scoped admin — super_admin only` | `server/test/smoke.test.js:9232` |
| `POST /api/admin/settings/default-audio rejects a missing file, and a non-audio file under the audio field` | `server/test/smoke.test.js:9244` |
| `A super_admin uploads the default audio — it is stored relative and comes back absolute on the admin and public routes` | `server/test/smoke.test.js:9255` |
| `PUT /api/admin/settings refuses the default audio as free text — it can only be set by upload` | `server/test/smoke.test.js:9276` |
| `DELETE /api/admin/settings/default-audio clears it back to null on the public route` | `server/test/smoke.test.js:9289` |
| `GET /api/live answers cleanly before anything is ever saved` | `server/test/smoke.test.js:9305` |
| `A plain (town-scoped) admin is refused on PUT for the live keys — super_admin only` | `server/test/smoke.test.js:9314` |
| `PUT /api/admin/settings rejects a non-https stream URL` | `server/test/smoke.test.js:9321` |
| `PUT /api/admin/settings rejects a stream URL whose host has no dot, and a value that is not a URL at all` | `server/test/smoke.test.js:9329` |
| `Any https platform is accepted now — a non-TikTok host is no longer refused` | `server/test/smoke.test.js:9340` |
| `A stream URL carrying embedded credentials is rejected with an Arabic message — the displayed link is a phishing shape` | `server/test/smoke.test.js:9349` |
| `A stream URL carrying a newline is stored normalised, never as the raw string that was validated` | `server/test/smoke.test.js:9357` |
| `A super_admin saves a valid channel URL — it reads back on both the admin route and GET /api/live` | `server/test/smoke.test.js:9371` |
| `Saving a live title without an until is rejected with an Arabic message, and nothing is saved` | `server/test/smoke.test.js:9384` |
| `Saving a live title with a FUTURE until marks the live active, falling back to the profile url` | `server/test/smoke.test.js:9397` |
| `A distinct live_stream_url overrides the profile url in live.url, and a TikTok link is simply non-embeddable` | `server/test/smoke.test.js:9412` |
| `Saving a PAST until keeps the live present but inactive` | `server/test/smoke.test.js:9423` |
| `Clearing the title and until brings live back to null` | `server/test/smoke.test.js:9435` |
| `GET /api/settings/public still returns exactly its three keys after the live settings were saved` | `server/test/smoke.test.js:9445` |
| `With no channel and no live saved, /live, /live/card.jpg and /live/go all 404` | `server/test/smoke.test.js:9459` |
| `Set up: a permanent channel link only, no live` | `server/test/smoke.test.js:9468` |
| `/live with a channel link only renders the channel headline and no «مباشر الآن»` | `server/test/smoke.test.js:9475` |
| `/live/go redirects to the profile url when there is no active live` | `server/test/smoke.test.js:9483` |
| `Set up: an ACTIVE live (future until, its own live url)` | `server/test/smoke.test.js:9489` |
| `/live with an active live shows the topic as the headline, in og:title, and with the «مباشر الآن» badge` | `server/test/smoke.test.js:9502` |
| `/live/go redirects to the live url while active` | `server/test/smoke.test.js:9518` |
| `Set up: the same live, now EXPIRED (until moved to the past)` | `server/test/smoke.test.js:9524` |
| `/live with an EXPIRED live falls back to the channel state — no stale topic, no stale badge` | `server/test/smoke.test.js:9532` |
| `/live/go redirects to the profile url once the live has expired` | `server/test/smoke.test.js:9543` |
| `A topic carrying an injection attempt renders escaped — the raw <img never appears in the page body` | `server/test/smoke.test.js:9549` |
| `/live/card.jpg is a real, non-empty JPEG, and a different topic produces a different cached file` | `server/test/smoke.test.js:9573` |
| `/live/download 302-redirects to the APK url and records app_download_clicked with no content_town` | `server/test/smoke.test.js:9594` |
| `Both new analytics event names (tiktok_page_viewed, tiktok_click_through) are accepted by analytics.service.js and stay count-only` | `server/test/smoke.test.js:9606` |
| `A youtube.com/live/<id> stream link is saved and GET /api/live derives its youtube-nocookie embed_url` | `server/test/smoke.test.js:9632` |
| `GET /api/live keeps its original shape for published APKs: profile_url and live.{title,until,url,active}` | `server/test/smoke.test.js:9651` |
| `toEmbedUrl derives youtu.be, watch?v= (www and m.), embed/, and /channel/UC… links correctly` | `server/test/smoke.test.js:9661` |
| `toEmbedUrl returns null for an @handle, TikTok, Facebook, a malformed id, and garbage` | `server/test/smoke.test.js:9675` |
| `A TikTok stream link saves fine but GET /api/live answers embed_url: null (a plain link)` | `server/test/smoke.test.js:9690` |
| `Migration renames tiktok_profile_url to live_channel_url, and running migrate twice in a row is safe` | `server/test/smoke.test.js:9702` |
| `The rename never overwrites a value already saved under the new key` | `server/test/smoke.test.js:9719` |
| `jerusalemDateString returns the Asia/Jerusalem date, not the UTC one, at 22:30Z (summer and winter)` | `server/test/smoke.test.js:9732` |
| `PUT /api/admin/live/episodes/<today> without a token → 401, from a town admin → 403` | `server/test/smoke.test.js:9773` |
| `A poll with fewer than two or more than four options is refused with 400` | `server/test/smoke.test.js:9783` |
| `A poll question without options, options without a question, a blank option, and a bad date are refused with 400` | `server/test/smoke.test.js:9793` |
| `A super_admin creates today's episode → 200 with the saved episode` | `server/test/smoke.test.js:9806` |
| `Set up: yesterday with no poll, and two days ago with a poll (past dates are allowed)` | `server/test/smoke.test.js:9818` |
| `GET /api/live/hub (anonymous): today has its poll without results, previous is the latest earlier day WITH a poll` | `server/test/smoke.test.js:9833` |
| `POST vote without a token → 401` | `server/test/smoke.test.js:9853` |
| `POST vote with an out-of-range or non-integer option_index → 400; on an unknown episode → 404` | `server/test/smoke.test.js:9858` |
| `POST vote on an earlier day's episode → 400 «هذا النقاش مغلق»` | `server/test/smoke.test.js:9869` |
| `The first vote → 200 with results; a second vote by the same account → 409` | `server/test/smoke.test.js:9881` |
| `GET /api/live/hub shows today's results to the voter, and still hides them from a signed-in non-voter` | `server/test/smoke.test.js:9900` |
| `After a vote, changing the poll options → 409; changing only the topic → 200` | `server/test/smoke.test.js:9911` |
| `GET /api/admin/live/episodes lists the recent episodes newest first with vote_count, super_admin only` | `server/test/smoke.test.js:9928` |
| `DELETE /api/admin/live/episodes/:id removes the episode and its votes; an unknown id → 404` | `server/test/smoke.test.js:9939` |
| `A vote emits live_poll_<episodeId> with { results, total_votes } only — never my_vote` | `server/test/smoke.test.js:9989` |
| `PUT /api/admin/settings with only the WhatsApp number emits no live_status and writes no live notification` | `server/test/smoke.test.js:10023` |
| `First active live saved today → live_status, one system_notification, rows only for notify_new_events = 1` | `server/test/smoke.test.js:10042` |
| `A second save the same day (extending until) → live_status again, but no new rows and no announcement` | `server/test/smoke.test.js:10084` |
| `Saving a live whose until is already past → live_status, but no notification at all` | `server/test/smoke.test.js:10104` |
| `/live/embed with no link saved at all → 404` | `server/test/smoke.test.js:10142` |
| `Set up: an active YouTube live, today's episode with a poll, and yesterday's poll with three votes` | `server/test/smoke.test.js:10148` |
| `GET /live names no platform and shows the topic, episode question, today's poll read-only, and yesterday's result` | `server/test/smoke.test.js:10185` |
| `An <img onerror> in the episode topic renders escaped on /live, never as markup` | `server/test/smoke.test.js:10215` |
| `GET /live/embed with a YouTube live → 200, an iframe onto embed_url with referrerpolicy, under its own CSP` | `server/test/smoke.test.js:10221` |
| `/live/go still redirects to the active live's own link` | `server/test/smoke.test.js:10243` |
| `/live/embed with a TikTok stream link → 404, and /live/go goes to that link as before` | `server/test/smoke.test.js:10249` |
| `Set up: three events across three distinct towns (two weddings, one funeral) plus a fourth event in a fresh village` | `server/test/smoke.test.js:10284` |
| `A single ?town= value returns exactly what it always has — the no-regression case` | `server/test/smoke.test.js:10333` |
| `Two comma-separated towns return the union of both, and nothing from a third` | `server/test/smoke.test.js:10342` |
| `A single occasion_type_id (the funeral) excludes a wedding event` | `server/test/smoke.test.js:10352` |
| `Two comma-separated occasion_type_id values return the union of both types` | `server/test/smoke.test.js:10359` |
| `?village_id= filters to only that village alone` | `server/test/smoke.test.js:10367` |
| `village_id combined with a town in a DIFFERENT town returns the union of both places, not their (always-empty) intersection` | `server/test/smoke.test.js:10377` |
| `village_id combined with town = 'القرى والتجمعات' itself is coherent: the catch-all town already contains every village's events, so the union is just that same catch-all set` | `server/test/smoke.test.js:10386` |
| `Twenty comma-separated occasion_type_id values are accepted` | `server/test/smoke.test.js:10394` |
| `Twenty-one comma-separated occasion_type_id values are rejected with 400 and an Arabic message — not a silent truncation to the first twenty` | `server/test/smoke.test.js:10400` |
| `Twenty-one repetitions of the SAME occasion_type_id are also rejected — the cap counts raw values sent, not distinct ones after dedupe` | `server/test/smoke.test.js:10410` |
| `A duplicated value in the list does not duplicate a row in the result` | `server/test/smoke.test.js:10417` |
| `'الكل' inside a town list still means no town filter, exactly as a lone ?town=الكل` | `server/test/smoke.test.js:10423` |
| `An unknown town value matches nothing, exactly like before list support existed — 200 with an empty list, not a 400` | `server/test/smoke.test.js:10437` |
| `A request with no X-App-Version cannot see the non-legacy funeral type even when it asks for it by id inside a list` | `server/test/smoke.test.js:10443` |
| `A legacy client requesting ONLY the non-legacy funeral type by id gets an empty result, never a widened one` | `server/test/smoke.test.js:10451` |
| `GET /api/map/events supports the same town/occasion_type_id/village_id list filtering, including the legacy intersection` | `server/test/smoke.test.js:10457` |
| `the migration turned the archive on for the wedding type only` | `server/test/smoke.test.js:10528` |
| `a live on a CHANNEL link is not saved as an episode, and the admin is told why` | `server/test/smoke.test.js:10535` |
| `a live on ONE video's link becomes today's episode, kept in its canonical watch form` | `server/test/smoke.test.js:10551` |
| `while the live is on, today is the live itself — not in «الحلقات السابقة»` | `server/test/smoke.test.js:10566` |
| `a topic the admin already typed for the day is kept when the live is re-saved` | `server/test/smoke.test.js:10573` |
| `once the live ends, today's episode is listed under «الحلقات السابقة» with its own link and player` | `server/test/smoke.test.js:10583` |
| `the /live page lists «الحلقات السابقة» as links to each episode page, titles escaped` | `server/test/smoke.test.js:10598` |
| `PUT /api/admin/live/episodes/:date refuses a channel link as an episode video, and stores a video link canonically` | `server/test/smoke.test.js:10605` |
| `an episode save without video_url keeps the recorded video (a broadcast may have landed after the form loaded); an empty one clears it` | `server/test/smoke.test.js:10621` |
| `GET /live/e/:id is the branded episode page: escaped title, its own card as og:image, and «شاهد الحلقة»` | `server/test/smoke.test.js:10644` |
| `the episode card is a 1200×1200 JPEG; /go redirects to the stored video only; /embed frames it` | `server/test/smoke.test.js:10656` |
| `an unknown, malformed or video-less episode id is a 404 on every episode route` | `server/test/smoke.test.js:10673` |
| `without Cloudinary keys, asking to upload a share image answers in Arabic instead of failing` | `server/test/smoke.test.js:10687` |
| `share-image signing is super_admin only` | `server/test/smoke.test.js:10696` |
| `the signature names a public_id inside this episode's own folder, and never carries the secret` | `server/test/smoke.test.js:10704` |
| `registering a share image needs a real Cloudinary response signature for THIS episode` | `server/test/smoke.test.js:10719` |
| `a verified share image is stored and drawn into the episode card` | `server/test/smoke.test.js:10734` |
| `removing the share image goes back to the generated card, and deletes the file on Cloudinary` | `server/test/smoke.test.js:10752` |
| `album photos: the type gate is the only gate — an upcoming wedding can be prepared, an ended funeral cannot` | `server/test/smoke.test.js:10836` |
| `album routes: a town admin manages a wedding in their town; one with no towns gets 404, never 403` | `server/test/smoke.test.js:10850` |
| `a verified photo is added and shows under the ended wedding in GET /api/events/:id` | `server/test/smoke.test.js:10862` |
| `a user tags himself: pending and invisible, then searchable by a spelling variant after approval` | `server/test/smoke.test.js:10921` |
| `a user withdraws the tag, re-requests, is rejected, and cannot re-request the same photo` | `server/test/smoke.test.js:10967` |
| `a self-tag without a profile photo, or without confirm_phone, is refused and writes no row` | `server/test/smoke.test.js:10993` |
| `a conditional tag keeps both descriptions and the phone-confirmation stamp, and the queue returns them` | `server/test/smoke.test.js:11018` |
| `apply_caption adopts the suggestion on approval; without it — and on any rejection — the caption is untouched` | `server/test/smoke.test.js:11049` |
| `descriptions longer than 200 characters are truncated, and blank ones are stored NULL` | `server/test/smoke.test.js:11102` |
| `the tag queue counts match the rows of each status, and move as a tag is decided` | `server/test/smoke.test.js:11134` |
| `three distinct privacy reports hide the photo; the admin restores it and it is public again` | `server/test/smoke.test.js:11166` |
| `there is no album photo cap: 61 rows are accepted and every one is listed` | `server/test/smoke.test.js:11194` |
| `GET /p/:id serves one photo with og:image, noindex, and no script — and 404s when hidden` | `server/test/smoke.test.js:11220` |
| `GET /a/:id serves the album with its cover as og:image, noindex, and no script — and 404s when hidden or malformed` | `server/test/smoke.test.js:11244` |
| `a person is a row: a honoree is findable by name, his album counted, and his page renders (ADR-0011)` | `server/test/smoke.test.js:11285` |
| `two spellings of one name are one person, and a name with nothing public never appears` | `server/test/smoke.test.js:11315` |
| `GET /api/admin/people suggests a nearer name with its photo count, and reading never merges (#107)` | `server/test/smoke.test.js:11345` |
| `merging two people moves their tags, occasions and accounts, and only a super admin can (#107)` | `server/test/smoke.test.js:11368` |
| `the archive is hidden (not deleted) when the event is unpublished or its type turns the archive off` | `server/test/smoke.test.js:11465` |
| `deleting an archive photo removes the row and its Cloudinary file; a wrong event id is 404` | `server/test/smoke.test.js:11485` |
| `POST /api/admin/albums builds a published album from the groom name alone, and a blank name is an Arabic 400` | `server/test/smoke.test.js:11496` |
| `admin album photos: the album comes back in the public shape — the honoree album names itself after reopening, the event album keeps its event` | `server/test/smoke.test.js:11553` |
| `a no-event album with no approved photo and no video is not public — the list, the search and its page all wait` | `server/test/smoke.test.js:11587` |
| `a town admin creates an album in their own town and gets 404 outside it — never 403, and nothing is written` | `server/test/smoke.test.js:11642` |
| `GET /api/admin/albums?without_event=1 lists honoree albums for a super admin, newest first, in the public shape` | `server/test/smoke.test.js:11695` |
| `GET /api/admin/albums?without_event=1 hides another town’s honoree album — and the album route is 404, never 403` | `server/test/smoke.test.js:11720` |
| `GET /api/admin/albums?without_event=1 never lists an album that has an event` | `server/test/smoke.test.js:11740` |
| `GET /a/:id and GET /p/:id serve a no-event album and its photo instead of falling over` | `server/test/smoke.test.js:11752` |
| `an album attached to an event is untouched: the same event object, the same fields, the same route` | `server/test/smoke.test.js:11785` |
| `album videos: a YouTube link lands on the wedding album, in GET /api/albums/:id, and on its own public route with the YouTube thumbnail` | `server/test/smoke.test.js:11826` |
| `album videos: a non-http link is an Arabic 400, the same link twice in one album is a 409, and another album accepts it` | `server/test/smoke.test.js:11861` |
| `album videos: hiding removes it from the album and 404s its own public route; an unknown status is an Arabic 400` | `server/test/smoke.test.js:11892` |
| `album videos: deleting removes the row and its public route, and touches no file — the link is external` | `server/test/smoke.test.js:11922` |
| `album videos: a town admin outside the album’s scope gets 404 on all four video routes — never 403 — and nothing is written` | `server/test/smoke.test.js:11937` |
| `album videos: a groom-only album (ADR-0012) takes a video, and its public route waits for the album to be published — event stays null` | `server/test/smoke.test.js:11968` |
| `video share page: og:video.other, our own card as og:image, «شاهد الفيديو على يوتيوب», and the injected title escaped` | `server/test/smoke.test.js:12013` |
| `the video card is a JPEG of its own, served with a short cache` | `server/test/smoke.test.js:12057` |
| `a hidden video is a 404 on its page and its card, and comes back when it is approved again` | `server/test/smoke.test.js:12066` |
| `a malformed and a non-existent video id are the same 404 on both video share routes` | `server/test/smoke.test.js:12083` |
| `an ended-wedding album with no approved photo but one approved video is public — list, detail, /a/:id — and hiding the video hides it again` | `server/test/smoke.test.js:12096` |
| `a groom-only album with no photo but one approved video is public in the list, the search and the person page — hiding the video hides it again` | `server/test/smoke.test.js:12170` |
| `an uploaded poster is forwarded to Cloudinary and stored as its URL, with no copy left on disk` | `server/test/smoke.test.js:12257` |
| `a poster replaced by PATCH, and an artist image, go to their own Cloudinary folders` | `server/test/smoke.test.js:12291` |
| `replacing a poster deletes the old one from Cloudinary — unless another row still uses it` | `server/test/smoke.test.js:12318` |
| `a JSON edit that leaves the poster alone deletes nothing; a typed external URL is never deleted` | `server/test/smoke.test.js:12355` |
| `when Cloudinary fails, the publish still succeeds and the poster stays on this server` | `server/test/smoke.test.js:12371` |
| `a refused publish uploads nothing to Cloudinary` | `server/test/smoke.test.js:12388` |
| `the audio track stays on this server — only images go to Cloudinary` | `server/test/smoke.test.js:12399` |
| `a service provider's image goes to Cloudinary too` | `server/test/smoke.test.js:12414` |
| `Name matching: hamza, a joined «أبو», a one-letter typo, a dropped middle name and ة/ه all match` | `server/test/smoke.test.js:12456` |
| `Name matching: a different father (a cousin), a different first name, or a different word never match` | `server/test/smoke.test.js:12465` |
| `Set up: an admin publishes a wedding — nothing like it exists yet, so it goes straight out` | `server/test/smoke.test.js:12491` |
| `A regular user publishing the same wedding is neither warned nor stopped — it queues as before` | `server/test/smoke.test.js:12499` |
| `GET /api/admin/events flags the pending request as a certain duplicate before anyone presses approve` | `server/test/smoke.test.js:12508` |
| `Approving it without confirming is refused with 409 POSSIBLE_DUPLICATE, and the event stays pending` | `server/test/smoke.test.js:12522` |
| `Approving it with confirm_duplicate goes through, and the override is logged against both events` | `server/test/smoke.test.js:12534` |
| `An admin's own publish with a one-letter typo the next day is refused (409, likely) and writes no row at all` | `server/test/smoke.test.js:12546` |
| `The same publish confirmed through multipart (confirm_duplicate=1, as the panel and the app send it) goes live` | `server/test/smoke.test.js:12559` |
| `A different groom of the same family, same day and town, is flagged — likely, never certain (تذكرة #159)` | `server/test/smoke.test.js:12584` |
| `The same name in another town is still flagged, but only as likely — two towns, possibly two people` | `server/test/smoke.test.js:12596` |
| `A town admin is never shown another town's unpublished request as a duplicate; the super_admin is` | `server/test/smoke.test.js:12606` |
| `A rejected event is never a candidate — rejecting it is how a duplicate is cleared` | `server/test/smoke.test.js:12641` |
| `POST /api/auth/me/avatar stores the photo — absolute URL out, relative path in the column — and GET /api/auth/me carries it` | `server/test/smoke.test.js:12680` |
| `A second avatar upload replaces the first, and the replaced local file is gone from uploadsDir` | `server/test/smoke.test.js:12700` |
| `A text file named x.png is refused with a 400 that names the accepted formats` | `server/test/smoke.test.js:12717` |
| `POST /api/auth/me/avatar without a file is a 400 in Arabic` | `server/test/smoke.test.js:12726` |
| `Set up: a brand-new account answers avatar_url: null — the key exists and is not undefined` | `server/test/smoke.test.js:12734` |
| `PATCH /api/auth/me updates full_name and clan_town, and GET /api/auth/me reflects both` | `server/test/smoke.test.js:12743` |
| `PATCH /api/auth/me refuses an empty full_name with a 400 in Arabic` | `server/test/smoke.test.js:12758` |
| `PATCH /api/auth/me applies analytics_opt_out too when it rides along with a profile field` | `server/test/smoke.test.js:12767` |
| `Set up: two fresh accounts with a real PIN hash — one holds the number the other will take` | `server/test/smoke.test.js:12781` |
| `PATCH /api/auth/me/phone with a wrong PIN is a 400 and leaves the number unchanged` | `server/test/smoke.test.js:12787` |
| `PATCH /api/auth/me/phone refuses another account's number with a 409` | `server/test/smoke.test.js:12799` |
| `PATCH /api/auth/me/phone changes the number and returns a token signed with the new one` | `server/test/smoke.test.js:12812` |
| `After the change, login with the old number is 401 and with the new one is 200` | `server/test/smoke.test.js:12846` |
| `PATCH /api/auth/me carrying phone_number never writes it` | `server/test/smoke.test.js:12855` |
| `مناسبة منشورة في بلدة حقيقية تحمل محافظة تلك البلدة (تذكرة #120)` | `server/test/smoke.test.js:12888` |
| `مناسبة تحت البند الجامع مع region_id تحمل المحافظة المرسلة (تذكرة #120)` | `server/test/smoke.test.js:12903` |
| `مناسبة تحت البند الجامع بلا region_id تحمل المحافظة الافتراضية — سلوك عميل 1.21.3 المنشور (تذكرة #120)` | `server/test/smoke.test.js:12916` |
| `طلب لوحة قديم بلا region_id ينجح ويأخذ محافظة البند الجامع، وكل صفوف villages تحمل region_id (تذكرة #120)` | `server/test/smoke.test.js:12929` |
| `POST /api/admin/events/:id/promote-village ينشئ القرية على محافظة مناسبتها (تذكرة #120)` | `server/test/smoke.test.js:12949` |
| `PATCH /api/admin/towns/:id بنقل بلدة إلى محافظة ثانية يحدّث مناسباتها وقُراها في المعاملة نفسها (تذكرة #120)` | `server/test/smoke.test.js:12975` |
| `تغيير village_id وحده يحفظ محافظة القرية لا المحافظة الافتراضية (تذكرة #120)` | `server/test/smoke.test.js:13018` |
| `promote-village يرفض ربط مناسبة في محافظة ثانية بقرية تحمل الاسم نفسه في محافظة أخرى (تذكرة #120)` | `server/test/smoke.test.js:13054` |
| `Set up: كل مناسبة اختبار تحمل محافظتها — النقب للبلدية، والثانية للثانية والقروية (تذكرة #121)` | `server/test/smoke.test.js:13166` |
| `GET /api/events بلا X-Region لا يعيد أي مناسبة من المحافظة الثانية (تذكرة #121)` | `server/test/smoke.test.js:13173` |
| `GET /api/events بـ X-Region للمحافظة الثانية يعيد صفوفها وحدها (تذكرة #121)` | `server/test/smoke.test.js:13181` |
| `GET /api/map/events يعزل المحافظة نفسها: دبّوس لكل محافظة ولا تسريب (تذكرة #121)` | `server/test/smoke.test.js:13191` |
| `all_regions=1 يتجاوز تقييد المحافظة في GET /api/events و GET /api/map/events، والافتراضي يبقى مقيَّداً (تذكرة #161)` | `server/test/smoke.test.js:13205` |
| `إعلانات تغيير التاريخ في GET /api/events تعزل المحافظة كالمناسبة نفسها (تذكرة #121)` | `server/test/smoke.test.js:13240` |
| `مناسبة قروية تحت البند الجامع بمحافظة ثانية تظهر لطلبها ولا تظهر لطلب النقب (تذكرة #121)` | `server/test/smoke.test.js:13291` |
| `X-Region غير رقمي أو معرّف لا وجود له → 400 برسالة عربية (تذكرة #121)` | `server/test/smoke.test.js:13303` |
| `محافظة موقوفة (is_active = 0) → الطلب ينجح ويعيد صفوف المحافظة الافتراضية (تذكرة #121)` | `server/test/smoke.test.js:13313` |
| `PATCH /api/auth/me يقبل region_id، و publicUser و GET /api/auth/me يرجّعانه (تذكرة #121)` | `server/test/smoke.test.js:13340` |
| `PATCH /api/auth/me بمعرّف محافظة وهمي → 400 عربي ولا يمسّ المكتوب (تذكرة #121)` | `server/test/smoke.test.js:13356` |
| `مسجَّل بلا X-Region يرى محافظة حسابه، ومسح التفضيل (null) يعيده إلى الافتراضية (تذكرة #121)` | `server/test/smoke.test.js:13368` |
| `حساب على محافظة موقوفة بلا X-Region يرى صفوف المحافظة الافتراضية (تذكرة #121)` | `server/test/smoke.test.js:13388` |
| `GET /api/events/:id لمناسبة في محافظة أخرى يبقى 200 بترويسة النقب — التفاصيل عالمية (تذكرة #121)` | `server/test/smoke.test.js:13408` |
| `غياب X-Region لا يغيّر صفوف فيد النقب ولا ترتيبها: مطابق تماماً لطلب صريح بـ X-Region: النقب (تذكرة #121)` | `server/test/smoke.test.js:13414` |
| `CORS: طلب OPTIONS يسمح بترويسة X-Region القادمة من المتصفّح (تذكرة #121)` | `server/test/smoke.test.js:13427` |
| `Set up: ألبوم في كل محافظة، وألبوم عريس في الثانية، وصورة موسومة لأجل البحث في الأشخاص (تذكرة #122)` | `server/test/smoke.test.js:13591` |
| `GET /api/albums يعرض ألبومات المحافظة وحدها: ألبوم الثانية لا يظهر افتراضياً ويظهر بترويسة محافظتها، والعكس لألبوم النقب (تذكرة #122)` | `server/test/smoke.test.js:13608` |
| `ألبوم العريس يتقيّد ببلدة صاحبه: ألبوم في بلدة المحافظة الثانية لا يظهر افتراضياً ويظهر لمحافظتها (تذكرة #122)` | `server/test/smoke.test.js:13622` |
| `ألبوم العريس بلا بلدة مكانه غير معروف فيظهر في كل المحافظات — القائمة والبحث بالترويسين (تذكرة #122)` | `server/test/smoke.test.js:13637` |
| `GET /api/photos يتقيّد بالألبوم: صورة ألبوم المحافظة الثانية لا تظهر افتراضياً وتظهر بترويسة محافظتها (تذكرة #122)` | `server/test/smoke.test.js:13654` |
| `GET /api/search بنفس الكلمة: الألبوم والصورة يتقيّدان بالمحافظة، والأشخاص عالميون في التراويس كلها (تذكرة #122)` | `server/test/smoke.test.js:13674` |
| `GET /api/stories: ستوري البلدة في محافظتها وحدها، وستوري بلا بلدة وإعلان المنصة في كل المحافظات (تذكرة #122)` | `server/test/smoke.test.js:13695` |
| `GET /api/services/providers يعرض من يخدم بلدة في المحافظة وحدها: مزوّد الثانية لا يظهر افتراضياً ويظهر لمحافظتها (تذكرة #122)` | `server/test/smoke.test.js:13737` |
| `GET /api/albums/:id و GET /api/people/:id يفتحان بالمعرّف لصفّ من محافظة أخرى بلا ترويسة (تذكرة #122)` | `server/test/smoke.test.js:13751` |
| `غياب X-Region لا يقيّد أكثر من المحافظة الافتراضية: نتائج الاكتشاف مطابقة لطلب صريح بالنقب (تذكرة #122)` | `server/test/smoke.test.js:13772` |
| `مناسبة في النقب ونفس الاسم والتاريخ في محافظة ثانية: نشر فوري بلا 409 (تذكرة #123)` | `server/test/smoke.test.js:13853` |
| `نداء داخلي بلا region_id يرى مرشّح كل محافظة، وبمحافظة النقب لا يرى الثاني (تذكرة #123)` | `server/test/smoke.test.js:13871` |
| `طلب مستخدم بنفس الاسم والتاريخ في محافظة ثانية لا يظهر تكراراً لصفّ النقب في الطابور (تذكرة #123)` | `server/test/smoke.test.js:13888` |
| `نفس الاسم والتاريخ داخل المحافظة نفسها: الأدمن يُرفض بـ409 كما كان بالحرف (تذكرة #123)` | `server/test/smoke.test.js:13908` |
| `نفس الاسم والتاريخ داخل المحافظة نفسها: المستخدم العادي لا يُمنع وطلبه يدخل الطابور (تذكرة #123)` | `server/test/smoke.test.js:13930` |
| `town = اسم المحافظة يعني «مكان غير معروف» داخل محافظتها وحدها (تذكرة #123)` | `server/test/smoke.test.js:13953` |
| `الاعتماد: تطابق في محافظة ثانية يمرّ بلا 409، وداخل المحافظة نفسها يُرفض بـ409 (تذكرة #123)` | `server/test/smoke.test.js:13983` |
| `البند الجامع: المكان نفسه في محافظة أخرى لا يتصادم، وداخل المحافظة نفسها يتصادم (تذكرة #123)` | `server/test/smoke.test.js:14029` |
| `إعداد: مناسبتان معتمدتان في رهط في اليوم نفسه وعائلتان مختلفتان (تذكرة #159)` | `server/test/smoke.test.js:14160` |
| `تعديل الأدمن المطابق يُرفض بـ409 بنفس شكل النشر، ولا يكتب أي تغيير (تذكرة #159)` | `server/test/smoke.test.js:14179` |
| `إعادة تعديل الأدمن مع confirm_duplicate تنجح، والتجاوز يُسجَّل (تذكرة #159)` | `server/test/smoke.test.js:14202` |
| `إعادة حفظ لا تغيّر مدخلاً من مدخلات الحارس لا تعيد الـ409 ولا تسجّل تجاوزاً ثانياً (تذكرة #159)` | `server/test/smoke.test.js:14222` |
| `حفظ المالك الذي لا يغيّر مدخلاً من مدخلات الحارس يبقى منشوراً ولو كان للصفّ شبيه معتمد (تذكرة #159)` | `server/test/smoke.test.js:14245` |
| `تعديل المناسبة لا يُنبّه على نفسها: تغيير إملائي في اسمها يمرّ بلا 409 (تذكرة #159)` | `server/test/smoke.test.js:14278` |
| `تعديل المالك المشتبه لا يُوقَف بـ409، ويعود pending مع الشبه في طابور الأدمن (تذكرة #159)` | `server/test/smoke.test.js:14296` |
| `تعديل المالك غير المشتبه يتبع التصنيف القائم: التجميلي يبقى منشوراً والحرِج يعود للمراجعة (تذكرة #159)` | `server/test/smoke.test.js:14332` |
| `أسماء مختلفة وعائلة واحدة (بإملاء آخر) في نفس البلدة والتاريخ تعطي likely لا certain (تذكرة #159)` | `server/test/smoke.test.js:14360` |
| `نفس العائلة في محافظة أخرى لا تنبّه، ونفس الزوج في محافظة واحدة ينبّه — عبر بند «القرى والتجمعات» (تذكرة #159)` | `server/test/smoke.test.js:14387` |
| `نقطة فحص الاستيراد تقرأ قرار حارس التكرار من الخدمة نفسها (تذكرة #160)` | `server/test/smoke.test.js:14499` |
| `munasabatna-insert لا يدرج المشتبه، ويطبعه في قسم «تُخطِّي» مع المطابقة ودرجتها (تذكرة #160)` | `server/test/smoke.test.js:14532` |
| `munasabatna-insert يُدرج المدخل غير المشتبه كما كان، ويعدّه في قسم «أُدرج» (تذكرة #160)` | `server/test/smoke.test.js:14553` |
| `import-legacy-json يمرّر العائلة الحقيقية ويمرّ على الحارس، وتقريره يفصل الأقسام الأربعة (تذكرة #160)` | `server/test/smoke.test.js:14593` |
| `POST /api/admin/regions ينشئ محافظة على نمط «إضافة بلدة»؛ الاسم المكرر 409، وبلا إحداثيات 400، وأدمن بلدة 403 (تذكرة #128)` | `server/test/smoke.test.js:14708` |
| `POST /api/admin/villages بمحافظة يُخزّنها، و GET /api/admin/villages يعيد region_id في الصفّ (تذكرة #128)` | `server/test/smoke.test.js:14768` |
| `بثّ باسم محافظة يكتب صفّاً لكل بلدة من بلداتها داخل نطاق الأدمن، ولا صفّ باسم المحافظة نفسه (تذكرة #128)` | `server/test/smoke.test.js:14794` |
| `أدمن يملك بلدة واحدة في المحافظة يبثّ لها وحدها؛ وأدمن لا يملك شيئاً منها يُرفض 404 بلا كتابة (تذكرة #128)` | `server/test/smoke.test.js:14843` |
| `سوبر أدمن يسمّي محافظة: صفّ لكل بلدة نشطة فيها ولا صفّ عام؛ وبلا اسم: صفّ عام واحد كما كان (تذكرة #128)` | `server/test/smoke.test.js:14897` |
| `GET /api/admin/analytics/overview يحمل by_region إضافياً، وحدثان على بلدة المحافظة الثانية يزيدانها اثنين بالضبط (تذكرة #128)` | `server/test/smoke.test.js:14939` |
| `صفّ بـ content_town = «القرى والتجمعات» مع مناسبة في المحافظة الثانية يذهب إلى «غير محدَّد» ولا يُسقَط (تذكرة #128)` | `server/test/smoke.test.js:14991` |
| `GET /api/news يشتقّ منطقة المحافظة من اسمها ويعيد عقد القائمة كاملاً (وجهة «خدماتنا»)` | `server/test/smoke.test.js:15177` |
| `general=1 يجبر الوجه العام بلا منطقة، ولا يرسل area للمصدر` | `server/test/smoke.test.js:15211` |
| `مفاتيح مناطق الأخبار عربية — المصدر يردّ zone_not_found لكل مفتاح لاتيني` | `server/test/smoke.test.js:15224` |
| `?limit= يُقصّ إلى سقف الخمسين بدل أن يُرفض أو يُمرَّر` | `server/test/smoke.test.js:15238` |
| `?offset= ينتقل إلى الصفحة التالية ويُبلغ has_more بالصدق` | `server/test/smoke.test.js:15246` |
| `إزاحة غير صالحة (سالب أو نصّ) تُرفض 400 برسالة عربية` | `server/test/smoke.test.js:15255` |
| `GET /api/news/:id يعيد التفصيل: الكاتب والنصّ الكامل فقرات` | `server/test/smoke.test.js:15264` |
| `خبر غير موجود أو غير منشور عند المصدر ← 404 عربي` | `server/test/smoke.test.js:15278` |
| `فشل المصدر بلا كاش ← 502 بالرسالة العربية، لا قائمة فارغة تُوهم بالهدوء` | `server/test/smoke.test.js:15289` |
| `بعد نجاح سابق، سقوط المصدر يخدم آخر نسخة محفوظة بدل 502` | `server/test/smoke.test.js:15302` |
| `رسالة ApiError المقصودة تمرّ في الإنتاج، ورسالة الخطأ الداخلي تُحجب` | `server/test/smoke.test.js:15317` |
| `POST /api/events defaults visibility to public, and an unknown value is refused with an Arabic 400` | `server/test/smoke.test.js:15383` |
| `A link_only event is approved silently: no «مناسبة جديدة» row and no digest for anyone` | `server/test/smoke.test.js:15408` |
| `The duplicate guard still compares against a link_only event — hiding never blinds it (تذكرة #166)` | `server/test/smoke.test.js:15457` |
| `The public twin IS still announced — the silencing is the visibility, not a broken notification path` | `server/test/smoke.test.js:15477` |
| `A link_only event is absent from the feed, the map, search, related events and the sitemap — even with no X-App-Version` | `server/test/smoke.test.js:15502` |
| `A link_only event opens by id in the API and at /e/:id, with noindex in the meta tag AND the header; a public one is unchanged` | `server/test/smoke.test.js:15552` |
| `Editing visibility hides an approved event without sending it back to review, and setting it public brings it back` | `server/test/smoke.test.js:15577` |
| `POST /api/check-collision (public, no auth) never names a link_only event, while the public twin of that day and town still shows` | `server/test/smoke.test.js:15610` |
| `The daily «مناسبة جديدة» count is public events only — a link_only approval neither takes one of the three nor inflates the digest` | `server/test/smoke.test.js:15636` |
| `Set up: عرس معتمد يملكه حساب عادي، وعزاء معتمد — كلاهما من الأزرار نفسها` | `server/test/smoke.test.js:15755` |
| `«جاي» بعدد 3 يُنشئ الجواب و«ذكّرني» معاً، ويردّ بحالة المستخدم والعدّاد` | `server/test/smoke.test.js:15792` |
| `الجواب الثاني من الحساب نفسه يُحدّث الصفّ ولا يُضيف ثانياً` | `server/test/smoke.test.js:15818` |
| `«مش جاي» لا يمسّ «ذكّرني»، و`DELETE` يسحب الجواب ولا يحذفه` | `server/test/smoke.test.js:15836` |
| `عدد الحاضرين خارج 1..RSVP_PARTY_SIZE_MAX يُرفض بـ400 عربية، والغياب يعني 1` | `server/test/smoke.test.js:15866` |
| `rsvp_going_count = مجموع العدد من الحساب والضيف معاً، في القائمة والتفصيل` | `server/test/smoke.test.js:15888` |
| `العزاء: 404 على المسار، ولا rsvp_going_count في أي ردّ` | `server/test/smoke.test.js:15925` |
| `«مين جاي»: الأسماء والعدد والمصدر والمجاميع للمالك وللأدمن، و404 لغيرهما، وبلا هاتف في أي جسم` | `server/test/smoke.test.js:15953` |
| `نوع rsvp_enabled مطفأ لا يخرج عدّاده ولو وُجدت أجوبة — لا في التفصيل ولا في القائمة` | `server/test/smoke.test.js:16018` |
| `طلب بلا X-App-Version لا ينكسر بالحقول الجديدة` | `server/test/smoke.test.js:16056` |
| `إيقاع النشر المجدول مستقلّ عن الجولة اليومية: start() يسلّح مؤقّتاً أقصر من يوم (#167)` | `server/test/smoke.test.js:16128` |
| `دورة نشر بدأت قبل stop() لا تعيد تسليح مؤقّت بعد stop() ثم start() (#167)` | `server/test/smoke.test.js:16155` |
| `مناسبة بموعد نشر مستقبلي غائبة عن كل قائمة عامة وحاضرة بالتفصيل وبالرابط، ثم تظهر ويصل إشعارها مرة واحدة` | `server/test/smoke.test.js:16198` |
| `فشلٌ بعد كتابة الإعلان وقبل التزامه يتراجع كاملاً فتُعلنها المحاولة التالية — لا يُفقد الإعلان (#167)` | `server/test/smoke.test.js:16330` |
| `مناسبة بموعد نشر مستقبلي لا يُعلنها المجدول قبل موعدها ولو شُغّل عشر مرّات` | `server/test/smoke.test.js:16391` |
| `أهلية الإعلان تُقرأ تحت القفل: ${change} بين جلب الدفعة والحجز يمنع الإعلان حتى تعود الأهلية (#167)` | `server/test/smoke.test.js:16473` |
| `اعتمادُ مناسبة بموعد مستقبلي لا يستهلك حصة اليوم: أوّل مناسبة منشورة فعلاً تصل فرديّة لا ملخّصاً (#167)` | `server/test/smoke.test.js:16559` |
| `حصة «مناسبة جديدة» المشتركة لا تتجاوز ثلاث فرادى عند إعلان مناسبتين متزامنتين في المحافظة نفسها (#167)` | `server/test/smoke.test.js:16614` |
| `شاهد عزل الحصة: اختبارا «مناسبة جديدة» لا يمسّان مناسبات القسم السابقة ولا ملخّصاته (#167)` | `server/test/smoke.test.js:16698` |
| `publish_at في الماضي أو غير صالح يُرفض 400 عربية في النشر والتعديل، وإعادة الموعد المخزَّن لا تُرفض` | `server/test/smoke.test.js:16721` |
| `شرط publish_at يأخذ ساعة القدس مُعامَلةً لا NOW() (ساعة الجلسة UTC في الإنتاج) وتُظهر المجدولة عند موعدها القدسي (#167)` | `server/test/smoke.test.js:16785` |
| `نافذة البقاء: نجاح منتهٍ منذ ٣ أيام يظهر في «القادم» بـ«انتهت»، ومنذ ٨ لا يظهر، وعرس منتهٍ أمس لا يظهر، والخريطة لا تعرض المنتهي` | `server/test/smoke.test.js:16858` |
| `صفّ بلا نوع لا يبقى في «القادم» أبداً: منتهٍ منذ ٣٠ يوماً يخرج، والمنتهي اليوم يظهر (#167)` | `server/test/smoke.test.js:16931` |
| `feed_linger_days: افتراضه 0، والسوبر أدمن يضبطه من مسار الأنواع (0..30) ويُرفض ما خارجه` | `server/test/smoke.test.js:16979` |
| `ترقية صيغة #167 الأولى بلا علَم والعمود موجود تحفظ اختيار السوبر أدمن صفراً، والتثبيت الجديد يزرع 7 (#167)` | `server/test/smoke.test.js:17016` |
| `Set up: عرس معتمد قادم، وعرس معتمد انتهى، وعزاء معتمد` | `server/test/smoke.test.js:17104` |
| `الصفحة تحمل النموذج ولا <script>، والـCSP تحمل form-action 'self' لهذه الصفحة وحدها` | `server/test/smoke.test.js:17145` |
| `إرسال صحيح يعيد التوجيه بالشارة، ويُنشئ صفّاً بالهاتف المطبَّع` | `server/test/smoke.test.js:17172` |
| `الإرسال الثاني بالهاتف نفسه يُحدّث الصفّ ولا يُضيف ثانياً` | `server/test/smoke.test.js:17207` |
| `هاتف فارغ يعطي رسالة عربية بلا صفّ` | `server/test/smoke.test.js:17232` |
| `عدد 21 يعطي رسالة عربية بلا صفّ` | `server/test/smoke.test.js:17250` |
| `الهاتف لا يظهر في أي ردّ /api ولا في /e/` | `server/test/smoke.test.js:17270` |
| `نوع مطفأ أو مناسبة منتهية: لا نموذج، والـPOST يعطي 404 الموحّدة` | `server/test/smoke.test.js:17295` |
| `طلب الضيف يستهلك دلو /api المجهول المشترك، حتى لو أُرفق رمز صالح` | `server/test/smoke.test.js:17323` |
| `الطلب الحادي عشر من IP واحد في الساعة يعطي 429 بصفحة عربية` | `server/test/smoke.test.js:17359` |
| `نصّا الخصوصية وADR-0006 محدَّثان بجمع اسم الضيف وهاتفه والإشارة إلى ADR-0015` | `server/test/smoke.test.js:17413` |
| `PATCH /api/admin/events/:id/featured يكتب featured_until، والمبرزة تتصدّر تغذية محافظتها بـis_featured منطقية` | `server/test/smoke.test.js:17518` |
| `الرابعة النشِطة في المحافظة نفسها 409 عربية، والرابعة في محافظة أخرى تُقبل` | `server/test/smoke.test.js:17554` |
| `إلغاء الإبراز بـnull يعيد الصفّ لمكانه ويُفرّغ مقعد السقف` | `server/test/smoke.test.js:17601` |
| `تاريخ انتهى (أمس) لا يُبرز: is_featured false والصفّ لا يتصدّر` | `server/test/smoke.test.js:17630` |
| `أدمن خارج نطاق المناسبة يُردّ 404 لا 403 ولا يُكتب شيء، وأدمن داخله يمرّ` | `server/test/smoke.test.js:17646` |
| `تاريخ الإبراز يُتحقَّق في validate.js: صيغة خاطئة 400، وغياب المفتاح 400 لا إلغاء صامت` | `server/test/smoke.test.js:17676` |
| `الترقيم لا ينكسر: COUNT(*) يعدّ الصفوف نفسها، والمبرزة تظهر مرة واحدة عبر الصفحات` | `server/test/smoke.test.js:17697` |
| `السقف يحرس الانتقال إلى نشِط وحده: تاريخ مستقبلي لصفّ غير مبرز 409، وتاريخ منقضٍ له 200` | `server/test/smoke.test.js:17726` |
| `طلبان متزامنان لإبراز مناسبتين مختلفتين بمقعد حرّ واحد: أحدهما 200 والآخر 409، والنشِطة لا تتجاوز السقف` | `server/test/smoke.test.js:17764` |
| `GET /api/stats/ticker عام — كل صفّ { region_id, name, upcoming_count }، وtotal مجموع الصفوف، وupdated_at لحظة` | `server/test/smoke.test.js:17882` |
| `عدّ المحافظة يطابق القائمة العامة نفسها — المعلّقة والمجدولة لا تُعدّان` | `server/test/smoke.test.js:17913` |
| `مناسبة «بالرابط فقط» معتمدة وقادمة لا تُعدّ في الشريط` | `server/test/smoke.test.js:17954` |
| `مناسبة انتهى امتدادها لا تُعدّ «قادمة» — وهي معتمدة ويجدها زائر في الأرشيف` | `server/test/smoke.test.js:17970` |
| `الطلب الثاني خلال الكاش لا يستعلم شيئاً، وupdated_at لحظة التعبئة نفسها` | `server/test/smoke.test.js:17992` |
| `الكاش هو ما يجمّد الرقم: مناسبة قادمة ثالثة لا تُحتسب حتى تنتهي مدّته، ثم تُحتسب` | `server/test/smoke.test.js:18030` |
| `web/index.html + config.js + api.js + app.js load together in a jsdom document with no source change` | `server/test/web-dom.test.js:916` |
| `switchTab('tabAdd') actually builds the publish form — dynamicFormFields stops being empty` | `server/test/web-dom.test.js:948` |
| `the publish form carries a «سهرة الشباب» field for a type that defines one` | `server/test/web-dom.test.js:968` |
| `نموذج النشر يحمل خيار الظهور، وافتراضه «عام» (#166)` | `server/test/web-dom.test.js:991` |
| `اختيار «بالرابط فقط» يسافر مع طلب النشر (#166)` | `server/test/web-dom.test.js:1006` |
| `نافذة التعديل تعرض ظهور المناسبة وتُرسله مع الحفظ (#166)` | `server/test/web-dom.test.js:1032` |
| `نموذج النشر يحمل «موعد النشر»، ويُرسَل في جسم النشر عند تعبئته ويغيب عند فراغه (#167)` | `server/test/web-dom.test.js:1082` |
| `نافذة التعديل تعرض «موعد النشر» المخزَّن وتُرسله كما هو (#167)` | `server/test/web-dom.test.js:1131` |
| `after the shared field-renderer refactor, the public form still has its own map, crop entry point, and honoree-button styling` | `server/test/web-dom.test.js:1185` |
| `shared (non-overridden) fields still render correctly on the public form: town select and event-date input` | `server/test/web-dom.test.js:1213` |
| `#addEventDate defaults to the LOCAL day, not the UTC day (public publish form)` | `server/test/web-dom.test.js:1243` |
| `groupUploads wraps the poster field in .upload-section on the public form` | `server/test/web-dom.test.js:1280` |
| `choosing a poster reveals the crop editor and steps the plain upload box aside` | `server/test/web-dom.test.js:1322` |
| `the crop rectangle initialises around the whole image` | `server/test/web-dom.test.js:1337` |
| `dragging a corner handle changes the crop rectangle's stored bounds` | `server/test/web-dom.test.js:1352` |
| `confirming a crop sends the cropped Blob under "poster", with an explicit .jpg filename` | `server/test/web-dom.test.js:1376` |
| `"استخدام الصورة كاملة" still submits a Blob, and the working canvas never exceeds 1600px on its longest edge` | `server/test/web-dom.test.js:1417` |
| `both live buttons are visible with no hidden attribute, even with a channel set and live = null, and no story-strip bubble exists` | `server/test/web-dom.test.js:1464` |
| `every story with an http(s) target gets a CTA — not only ads — and a javascript: link gets none` | `server/test/web-dom.test.js:1500` |
| `ألبومات الأعراس: one box searches albums/photos/people, an album opens its photos, and a photo can be tagged` | `server/test/web-dom.test.js:1537` |
| `share a no-event honoree album: the line names its town from the album, and so does the analytics event` | `server/test/web-dom.test.js:1749` |
| `share an event album: the event town is what the line and the analytics event carry` | `server/test/web-dom.test.js:1764` |
| `share an album with neither town nor event: the title alone, with no dangling dash` | `server/test/web-dom.test.js:1778` |
| `فيديوهات الألبوم في الموقع: بطاقة لكل فيديو بوسم منصّتها، و«فتح» خارجي، و«مشاركة» ترسل صفحتنا /v/:id` | `server/test/web-dom.test.js:1800` |
| `ألبوم بلا فيديوهات: #albumDetailVideos مخفي، والانتقال إليه لا يترك بطاقات الألبوم السابق` | `server/test/web-dom.test.js:1890` |
| `the event page gets an additive album strip — escaped titles, cover and count — and nothing when empty` | `server/test/web-dom.test.js:1938` |
| `ألبوم بلا صور وفيديوهان: البطاقة وشريط المناسبة ورأس التفاصيل تكتب «2 فيديو»، والصور تبقى أولاً` | `server/test/web-dom.test.js:1966` |
| `the «مباشر» badge shows on both buttons only while live.active, and turns itself off at until` | `server/test/web-dom.test.js:2052` |
| `embed_url → an in-page iframe with referrerpolicy and allowfullscreen, plus «افتح في يوتيوب»; closing removes it` | `server/test/web-dom.test.js:2084` |
| `no embed_url with a live → «ادخل البث» to <share_url>/go and no iframe; no live → «لا يوجد بث الآن» + «قناتنا»` | `server/test/web-dom.test.js:2108` |
| `the section shows topic, episode question and yesterday's result, hides each when empty, and escapes all of them` | `server/test/web-dom.test.js:2132` |
| `a vote without a token opens the login modal and sends no request` | `server/test/web-dom.test.js:2165` |
| `after voting the bars show percentages and a count, and live_poll_<id> updates them — never before voting` | `server/test/web-dom.test.js:2181` |
| `a 409 «already voted» shows the message and re-reads the hub to show the results` | `server/test/web-dom.test.js:2240` |
| `GET /api/live/hub carries the token only when one exists; GET /api/live never does` | `server/test/web-dom.test.js:2264` |
| `a live_status signal re-fetches GET /api/live (and the hub while the section is open)` | `server/test/web-dom.test.js:2284` |
| `a live_started item in the notification center opens the live section` | `server/test/web-dom.test.js:2310` |
| `?live=1 (the Web Push click target) opens the live section on load` | `server/test/web-dom.test.js:2333` |
| `the share button shares share_url through the same path as an event share` | `server/test/web-dom.test.js:2340` |
| `on a desktop the share button opens our own dialog — never navigator.share, and nothing is copied by itself` | `server/test/web-dom.test.js:2362` |
| `on a phone the native share sheet is still used; with no navigator.share at all our dialog opens instead of a silent copy` | `server/test/web-dom.test.js:2404` |
| `the share dialog is the last overlay in the page, so it opens above the congratulations room and the event page` | `server/test/web-dom.test.js:2422` |
| `no TikTok LIVE identifier is left in web/index.html, app.js or styles.css — the story platform key is the one allowed mention` | `server/test/web-dom.test.js:2428` |
| `the strip holds bar stories only, and the carousel holds carousel stories only` | `server/test/web-dom.test.js:2500` |
| `the carousel sits inside the home tab and above the feed container, so it is the top of the feed` | `server/test/web-dom.test.js:2515` |
| `a feed ad is inserted after card 8 and card 16, rotating between the feed stories` | `server/test/web-dom.test.js:2529` |
| `no ad appears before the eighth card: seven cards render none, and the eighth earns the first` | `server/test/web-dom.test.js:2549` |
| `the interval is the server's: feed_ad_interval 5 moves the first ad to after the fifth card` | `server/test/web-dom.test.js:2563` |
| `the feed ad opens the feed story list for the view, and its CTA posts the click — not the bar list` | `server/test/web-dom.test.js:2579` |
| `the carousel banner opens the carousel list, and its CTA posts that story's click` | `server/test/web-dom.test.js:2621` |
| `the drawer carousel holds carousel banners alone, opens that list, and records its CTA click` | `server/test/web-dom.test.js:2651` |
| `a no-event album card names the honoree and his town, and draws no empty line where the event line sits` | `server/test/web-dom.test.js:2692` |
| `a no-event album header names the honoree and his town, with no date line and no dangling separator` | `server/test/web-dom.test.js:2739` |
| `an event album keeps its event title, town and date on the card and in the header (regression)` | `server/test/web-dom.test.js:2784` |
| `selecting two towns sends both in one ?town= parameter` | `server/test/web-dom.test.js:2871` |
| `selecting a village sends ?village_id=, separate from ?town=` | `server/test/web-dom.test.js:2884` |
| `a town and a village picked together travel in their own separate parameters` | `server/test/web-dom.test.js:2896` |
| `selecting two kinds sends both in one ?occasion_type_id= parameter, alongside a place filter` | `server/test/web-dom.test.js:2909` |
| `nothing selected sends no place/kind parameters at all` | `server/test/web-dom.test.js:2927` |
| `the place chip label shows one name, or "name +N" once more than one place is selected` | `server/test/web-dom.test.js:2937` |
| `a selected id that cannot be resolved is still reported as selected, never silently dropped to "nothing selected"` | `server/test/web-dom.test.js:2962` |
| `ticking a 21st option in one kind is rejected in the sheet, in Arabic, and never reaches the request` | `server/test/web-dom.test.js:2994` |
| `"مسح الفلاتر" clears every filter, resets both chip labels, and re-fetches with no filter params` | `server/test/web-dom.test.js:3020` |
| `date filter ranges match the mobile client: the week runs to Saturday, Thursday–Saturday is the coming wedding nights` | `server/test/web-dom.test.js:3043` |
| `the date chip sends date_from/date_to, a picked day needs a day, and «مسح الفلاتر» drops the range` | `server/test/web-dom.test.js:3061` |
| `«مسح الفلاتر» is always visible, not only once something is selected` | `server/test/web-dom.test.js:3098` |
| `the selection is restored from localStorage on load, and reflected in the chip label` | `server/test/web-dom.test.js:3109` |
| `a restored village selection resolves its real name once towns/villages have loaded` | `server/test/web-dom.test.js:3125` |
| `a corrupt or missing localStorage filter value does not break the page` | `server/test/web-dom.test.js:3139` |
| `two identical searches send one request and leave the very same cards in place` | `server/test/web-dom.test.js:3214` |
| `opening and closing the filter drawer without changing anything keeps the cards and sends no request` | `server/test/web-dom.test.js:3229` |
| `an actual filter change shows the floating «رجوع لنتائجك السابقة» pill` | `server/test/web-dom.test.js:3245` |
| `pressing the pill restores the previous card ids in their order with no new request, then hides` | `server/test/web-dom.test.js:3269` |
| `pressing the pill restores the filter UI its list was fetched with, so nothing re-fetches afterwards` | `server/test/web-dom.test.js:3290` |
| `a real filter change draws its results from the top, with an explicit scroll reset` | `server/test/web-dom.test.js:3336` |
| `tapping the header brand closes #eventPage and keeps the chosen filter, with no refetch` | `server/test/web-dom.test.js:3395` |
| `the in-page brand closes #eventPage — the header one is covered by it` | `server/test/web-dom.test.js:3421` |
| `the phone/PWA header — not just the hidden wide one — carries the brand` | `server/test/web-dom.test.js:3444` |
| `the floating bar keeps every control at a 44px target and re-flows to two rows instead of shrinking` | `server/test/web-dom.test.js:3479` |
| `on the feed itself, the header brand scrolls back to the top of the list` | `server/test/web-dom.test.js:3568` |
| `from another destination, the header brand lands on the feed` | `server/test/web-dom.test.js:3582` |
| `skeleton placeholders appear synchronously while fetchEvents is still in flight` | `server/test/web-dom.test.js:3596` |
| `the fade-in class is applied on the very first render only, never on a later refetch` | `server/test/web-dom.test.js:3620` |
| `the event page renders the youth-party line when youth_party_date is present` | `server/test/web-dom.test.js:3688` |
| `an event card omits the youth-party line entirely when youth_party_date is empty` | `server/test/web-dom.test.js:3699` |
| `an event card renders the dinner-time line when dinner_time carries a value` | `server/test/web-dom.test.js:3739` |
| `an event card omits the dinner-time line entirely when dinner_time is empty — no invented 8:00` | `server/test/web-dom.test.js:3746` |
| `the share button exists on every card and its word follows the occasion type's tone` | `server/test/web-dom.test.js:3755` |
| `a card with a poster emits the four nested layers, media covers from top, no blur, and badges sit in caption` | `server/test/web-dom.test.js:3769` |
| `a card with NO poster builds the short caption plus the icon, not a tall empty box` | `server/test/web-dom.test.js:3806` |
| `frame colour source: type with colour sets inline --tone, type without colour emits no inline --tone` | `server/test/web-dom.test.js:3828` |
| `the feed is its own scroll container and its tree holds only cards` | `server/test/web-dom.test.js:3858` |
| `a mourning card never emits a countdown badge, whether or not it has a poster` | `server/test/web-dom.test.js:3900` |
| `a mourning card shows a plain, visible date on its face — never a countdown, never hidden behind "التفاصيل"` | `server/test/web-dom.test.js:3918` |
| `«التفاصيل» opens the event page like the phone — labelled rows, artist, nav buttons — and «رجوع» returns to the feed untouched` | `server/test/web-dom.test.js:3933` |
| `tapping the card photo opens the same page, and the browser Back button closes it instead of leaving the site` | `server/test/web-dom.test.js:3983` |
| `every info line clamps its text to one line, structurally` | `server/test/web-dom.test.js:4005` |
| `the card headline is the type and the honoree, never a place-only title, and «التفاصيل» leads the actions` | `server/test/web-dom.test.js:4028` |
| `an announcement card names the honoree and the type, not the town its `title` carries` | `server/test/web-dom.test.js:4120` |
| `the announcement card has one «التفاصيل» action that opens the event, and no «ذكّرني»/«التبريكات»/«المشاركة» or audio` | `server/test/web-dom.test.js:4148` |
| `the same card without opts keeps its four actions and its audio hook — the feed card is untouched` | `server/test/web-dom.test.js:4182` |
| `the merged feed renders both a personal notification and a broadcast entry, both marked unread` | `server/test/web-dom.test.js:4249` |
| `clicking the broadcast card calls PATCH /api/broadcasts/:id/dismiss, never /api/notifications/:id/read — even though the ids collide` | `server/test/web-dom.test.js:4267` |
| `the badge reaches zero once every entry — personal and broadcast alike — has been acted on` | `server/test/web-dom.test.js:4281` |
| `a clicked notification stays in the list as read — no red dot, no «جديد» — instead of disappearing` | `server/test/web-dom.test.js:4299` |
| `«جعل الكل مقروء» posts read-all once, keeps every entry, clears every red mark and hides itself` | `server/test/web-dom.test.js:4319` |
| `opening the service-category form renders an icon picker under the free-text field` | `server/test/web-dom.test.js:4360` |
| `clicking a suggested icon fills the input the form submits` | `server/test/web-dom.test.js:4372` |
| `the occasion-type form got the same treatment, not just the service one` | `server/test/web-dom.test.js:4385` |
| `service-category form has attributes editor container and addCategoryAttributeRow adds rows` | `server/test/web-dom.test.js:4407` |
| `provider form has price type, estimate description, and dynamic attributes container` | `server/test/web-dom.test.js:4420` |
| `the event edit form carries a map and a file input, not hand-typed coordinates` | `server/test/web-dom.test.js:4437` |
| `opening the map on an event with coordinates fills the fields the form submits` | `server/test/web-dom.test.js:4452` |
| `an event with no coordinates opens with nothing selected, and clearing says so` | `server/test/web-dom.test.js:4469` |
| `a chosen poster is sent as multipart under the field name the server reads` | `server/test/web-dom.test.js:4479` |
| `the event edit form takes the audio as a file, not a typed URL` | `server/test/web-dom.test.js:4501` |
| `a chosen audio file is sent as multipart under "audio", alone or with a poster` | `server/test/web-dom.test.js:4510` |
| `removing the current audio empties the value the diff compares, and hides the player` | `server/test/web-dom.test.js:4521` |
| `the village form carries a map container, and coordinates stay required` | `server/test/web-dom.test.js:4547` |
| `opening the map on a village with coordinates fills the fields the form submits` | `server/test/web-dom.test.js:4557` |
| `a simulated pin placement (click or drag) writes vilLat/vilLng — the same function the map's own click/drag handlers call` | `server/test/web-dom.test.js:4567` |
| `typing a full, valid pair of coordinates by hand moves the pin and recentres the map` | `server/test/web-dom.test.js:4585` |
| `typing a partial or non-numeric coordinate by hand is ignored — no thrown error, no pin jumping to a nonsense location` | `server/test/web-dom.test.js:4610` |
| `the event and village pickers are genuinely distinct registry entries, not a shared global` | `server/test/web-dom.test.js:4642` |
| `initDirectAddForm() builds a type picker and the first active type's own fields — no hardcoded wedding form` | `server/test/web-dom.test.js:4684` |
| `#dirEventDate defaults to the LOCAL day too (admin direct-add form)` | `server/test/web-dom.test.js:4710` |
| `switching to a mourning type relabels the honorees field and drops fields it does not define` | `server/test/web-dom.test.js:4732` |
| `the admin honoree-add button keeps the panel's own styling, not the public site's` | `server/test/web-dom.test.js:4746` |
| `the panel keeps its own two-column layout for town+village — not the shared renderer's stacked default` | `server/test/web-dom.test.js:4765` |
| `the panel gets no .upload-section wrapper — groupUploads stays false there` | `server/test/web-dom.test.js:4786` |
| `a required field left empty is rejected client-side with that type's own label` | `server/test/web-dom.test.js:4795` |
| `a successful publish sends occasion_type_id and honorees[], never the old hardcoded groom_name form` | `server/test/web-dom.test.js:4817` |
| `a pending card with possible_duplicates shows a danger badge when one is certain, an amber one when all are likely, and none otherwise` | `server/test/web-dom.test.js:4886` |
| `clicking the badge opens the comparison with one card per duplicate and the approve-context buttons` | `server/test/web-dom.test.js:4911` |
| `server text in a duplicate is escaped, never injected as markup` | `server/test/web-dom.test.js:4934` |
| `a 409 POSSIBLE_DUPLICATE on approve opens #duplicateModal with the server message instead of the generic error notice` | `server/test/web-dom.test.js:4947` |
| `«اعتماد رغم ذلك» re-sends the approval with confirm_duplicate: true and closes the modal` | `server/test/web-dom.test.js:4964` |
| `«إلغاء» on the approve modal sends nothing and leaves the card there to decide on later` | `server/test/web-dom.test.js:4978` |
| `«رفض كمكررة» closes the comparison and opens the reject modal with the reason prefilled` | `server/test/web-dom.test.js:4994` |
| `the panel marks a featured event with a gold tag carrying its expiry date, and offers «إبراز» on the others` | `server/test/web-dom.test.js:5043` |
| `the feature modal opens with the stored expiry date, and «إلغاء الإبراز» is offered only where a date exists` | `server/test/web-dom.test.js:5069` |
| `«إبراز» PATCHes the chosen date, «إلغاء الإبراز» PATCHes null — both through the admin API` | `server/test/web-dom.test.js:5100` |
| `«فتح المناسبة» opens the existing event's edit form when the panel has it, and a notice (not an error) when it does not` | `server/test/web-dom.test.js:5117` |
| `a 409 POSSIBLE_DUPLICATE on an edit opens the same #duplicateModal in edit context, and «حفظ رغم ذلك» re-sends that edit with confirm_duplicate` | `server/test/web-dom.test.js:5191` |
| `«إلغاء» on an edit duplicate leaves the form and its values untouched and sends nothing more` | `server/test/web-dom.test.js:5219` |
| `a 409 POSSIBLE_DUPLICATE on direct add opens the modal in direct-add context and keeps the form intact on cancel` | `server/test/web-dom.test.js:5263` |
| `«نشر رغم ذلك» re-sends the same direct-add FormData with confirm_duplicate=1` | `server/test/web-dom.test.js:5284` |
| `a direct add the server queues as pending shows the server's message, not the «published directly» celebration` | `server/test/web-dom.test.js:5300` |
| `the activity log labels event_duplicate_override with its own verb, shows the ids, and offers a filter for it` | `server/test/web-dom.test.js:5312` |
| `the admin list draws the whole poster over a fill, not a crop of it` | `server/test/web-dom.test.js:5337` |
| `and its stylesheet contains the poster rather than cropping it` | `server/test/web-dom.test.js:5353` |
| `the feed card has no blur and no card-level fixed ratio, its media reserves the poster ratio, object-fit is cover from top center, and snapping is declared` | `server/test/web-dom.test.js:5379` |
| `a featured card carries the gold «مناسبة كبرى» badge, and a card without is_featured carries none` | `server/test/web-dom.test.js:5453` |
| `the badge is the first chip of the card, ahead of the occasion-type chip` | `server/test/web-dom.test.js:5470` |
| `the featured card shows the whole invitation (contain) and its badge is gold` | `server/test/web-dom.test.js:5479` |
| `the feed keeps the server's order and never re-sorts featured cards on the client` | `server/test/web-dom.test.js:5509` |
| `the empty feed is a door: add your event, wedding services, your albums, and expanding beyond the governorate — each lands on its destination (#161)` | `server/test/web-dom.test.js:5546` |
| `«وسّع إلى كل المحافظات» يجعل الجلب التالي يحمل all_regions=1 — وإلا فالزرّ يعيد التغذية نفسها (#161)` | `server/test/web-dom.test.js:5611` |
| `a Cloudinary card poster is asked for at card width, and a local poster is left exactly as it is (#161)` | `server/test/web-dom.test.js:5648` |
| `the users tab filters by phone number and by name, over the already-fetched list` | `server/test/web-dom.test.js:5695` |
| `the users tab offers «حذف الحساب» to a super_admin on every row except a super_admin row, and never to a plain admin` | `server/test/web-dom.test.js:5720` |
| `deleting a user asks for two explicit confirmations, sends DELETE /api/admin/users/:id through adminFetch, then reloads the list and reports success` | `server/test/web-dom.test.js:5742` |
| `backing out of either confirmation sends no request at all` | `server/test/web-dom.test.js:5790` |
| `the counts panel shows Arabic labels, never raw English event keys, and flags exactly the two failure events` | `server/test/web-dom.test.js:5823` |
| `every known event renders as its own row, and one with zero recorded occurrences renders as 0, not blank or omitted` | `server/test/web-dom.test.js:5841` |
| `a retired/unknown event_name the server still has real rows for renders with its raw key and an Arabic "unknown" marker, instead of vanishing` | `server/test/web-dom.test.js:5873` |
| `the retention notice states the real retention window read from analytics.service.js, not an independent literal` | `server/test/web-dom.test.js:5919` |
| `a 403 on the counts endpoint (a non-super-admin somehow landing here) renders the server's Arabic message, not a blank panel or a thrown error` | `server/test/web-dom.test.js:5930` |
| `picking a user from the users list renders that user's paginated log with Arabic event labels` | `server/test/web-dom.test.js:5946` |
| `a multi-page user log renders prev/next controls, and clicking "next" requests page=2` | `server/test/web-dom.test.js:5972` |
| `rejecting an event sends a reason in the request body` | `server/test/web-dom.test.js:6015` |
| `a broadcast carries a tone and a duration` | `server/test/web-dom.test.js:6052` |
| `a broadcast with duration "none" sends duration: "none" and the composer describes it as centre-only` | `server/test/web-dom.test.js:6083` |
| `super admin gets «كل المناطق» plus one «كل بلدات <المحافظة>» target per governorate, and no regions hides the picker (تذكرة #128)` | `server/test/web-dom.test.js:6113` |
| `town admin sees only their own assigned towns among the broadcast targets` | `server/test/web-dom.test.js:6180` |
| `admin with zero assigned towns is stopped before sending (controls disabled and notice shown)` | `server/test/web-dom.test.js:6217` |
| `settings tab is reachable only for super admin, saves number, and can clear it` | `server/test/web-dom.test.js:6244` |
| `invalid WhatsApp number displays the server's Arabic error without client format check` | `server/test/web-dom.test.js:6312` |
| `town dropdowns are filled from GET /api/towns with 'الكل' filtered out` | `server/test/web-dom.test.js:6342` |
| `panel behaves sanely when GET /api/towns fails (uses fallback array)` | `server/test/web-dom.test.js:6366` |
| `picking "القرى والتجمعات" in direct add form keeps the selection without resetting to default town` | `server/test/web-dom.test.js:6388` |
| `a token expiring in under 15 minutes triggers the warning, and one expiring in hours does not` | `server/test/web-dom.test.js:6407` |
| `the warning appears ONCE, not on every tick` | `server/test/web-dom.test.js:6429` |
| `an expired session does NOT tear the dashboard down` | `server/test/web-dom.test.js:6449` |
| `re-entering the expired-session path does not wipe a PIN already being typed` | `server/test/web-dom.test.js:6472` |
| `a successful re-login swaps the stored token and leaves the dashboard mounted` | `server/test/web-dom.test.js:6489` |
| `the PIN is not in localStorage or sessionStorage after a successful re-login` | `server/test/web-dom.test.js:6520` |
| `a draft is saved from the direct-add form and offered back after re-login` | `server/test/web-dom.test.js:6551` |
| `declining the restore deletes the draft so it is not offered again` | `server/test/web-dom.test.js:6582` |
| `a draft that had a file field says so in Arabic on restore` | `server/test/web-dom.test.js:6606` |
| `logging out clears the drafts` | `server/test/web-dom.test.js:6628` |
| `the page links a real manifest and a real apple-touch-icon` | `server/test/web-dom.test.js:6654` |
| `the manifest is valid JSON, standalone, and names icons that exist on disk` | `server/test/web-dom.test.js:6666` |
| `the header carries a drawn mark, not an emoji` | `server/test/web-dom.test.js:6681` |
| `the inlined header/install-hint/admin mark paths match the current mark geometry` | `server/test/web-dom.test.js:6701` |
| `the rename to «أعراسنا» reached the document title, the iOS web-app title, and the header` | `server/test/web-dom.test.js:6714` |
| `the manifest short_name is «أعراسنا» alone, and name carries both names` | `server/test/web-dom.test.js:6730` |
| `the smallest Android mipmap (mdpi, 48×48) really is 48×48 and mixes mark- and ground-coloured pixels` | `server/test/web-dom.test.js:6740` |
| `every safe-zone render keeps mark-coloured pixels inside the circular safe zone (radius 40% of the image width)` | `server/test/web-dom.test.js:6757` |
| `detail 'icon' is the full mark minus the word — nothing else drops or moves out of order` | `server/test/web-dom.test.js:6780` |
| `nothing is clipped by the circular mask at safe-zone scale` | `server/test/web-dom.test.js:6787` |
| `the two rings interlock: right over left, then a left-ring sector back over the right` | `server/test/web-dom.test.js:6818` |
| `the shaping parity gate — static vector path matches Cairo ctx.fillText Arabic shaping` | `server/test/web-dom.test.js:6824` |
| `detail 'icon' and detail 'full' render different bytes at the same size` | `server/test/web-dom.test.js:6888` |
| `the generated favicon SVG is well-formed, carries both brand colours, and matches the geometry the raster uses` | `server/test/web-dom.test.js:6894` |
| `an iPhone visitor who has not installed is shown how` | `server/test/web-dom.test.js:6919` |
| `everyone else is left alone` | `server/test/web-dom.test.js:6932` |
| `an iPhone that already installed the app is not told to install it` | `server/test/web-dom.test.js:6943` |
| `and it is actually wired into page load, not merely defined` | `server/test/web-dom.test.js:6955` |
| `nothing that ships hidden is un-hidden by a class that forces a display` | `server/test/web-dom.test.js:6978` |
| `dismissing the hint keeps it dismissed on the next visit` | `server/test/web-dom.test.js:7008` |
| `شاشة الترحيب تظهر لزائر جديد: مخفية في الملف، بثلاث بطاقات و«تخطّي»` | `server/test/web-dom.test.js:7031` |
| `«تخطّي» يكتب negev_welcome_seen فلا تعود الشاشة في زيارة تالية` | `server/test/web-dom.test.js:7053` |
| `and the welcome is wired into page load, not merely defined` | `server/test/web-dom.test.js:7079` |
| `first visit on iPhone: the welcome comes first, and the install hint waits its turn` | `server/test/web-dom.test.js:7093` |
| `الويب لا يعرض «قيّمنا» إطلاقاً — التقييم في التطبيق وحده` | `server/test/web-dom.test.js:7117` |
| `the ticker renders from GET /api/broadcasts/live on load, with no socket involved` | `server/test/web-dom.test.js:7164` |
| `zero live broadcasts leaves the ticker hidden` | `server/test/web-dom.test.js:7178` |
| `with two live broadcasts, the ticker shows the newest and an indicator that opens the rest` | `server/test/web-dom.test.js:7189` |
| `signed in, the same indicator re-fetches the notifications centre before opening it, instead of expanding the ticker` | `server/test/web-dom.test.js:7210` |
| `a solemn broadcast gets its own class and never the animated (urgent-pulse) class` | `server/test/web-dom.test.js:7232` |
| `an urgent broadcast gets the pulse class, for contrast with solemn` | `server/test/web-dom.test.js:7245` |
| `dismissing while signed in calls PATCH /api/broadcasts/:id/dismiss, and the ticker clears` | `server/test/web-dom.test.js:7256` |
| `dismissing while anonymous writes to localStorage, calls no PATCH, and the broadcast does not come back on the next render` | `server/test/web-dom.test.js:7271` |
| `a town_broadcast socket signal triggers a re-fetch and never renders text from the payload itself` | `server/test/web-dom.test.js:7303` |
| `the support entry opens a wa.me link built from the exact stored number, unmodified — via the in-app modal, not confirm()` | `server/test/web-dom.test.js:7349` |
| `FIX 5: the disclosure is the page's own modal, not a browser confirm() — declining it opens nothing` | `server/test/web-dom.test.js:7382` |
| `a null support number leaves the entry visible but disabled, and tapping it explains why in the same modal, never a browser alert()` | `server/test/web-dom.test.js:7415` |
| `FIX 1: a single long broadcast — no "+N" to fall back on — is still reachable in full, for an anonymous AND a signed-in visitor` | `server/test/web-dom.test.js:7446` |
| `FIX 2b: a broadcast dismissed while anonymous does not reappear after signing in on the SAME device` | `server/test/web-dom.test.js:7492` |
| `الشريط يحمل صفّ المحافظة وعددها كما وصلا، والمجموع، و«حُدّث HH:MM» بالساعة المحلية` | `server/test/web-dom.test.js:7617` |
| `بلا رقم بعد لا شريط إطلاقاً — لا أصفار كاذبة قبل وصول الخادم` | `server/test/web-dom.test.js:7653` |
| `شريط واحد فقط: الرقم لا يظهر قبل حسم التعاميم، والتعميم الحيّ يحلّ محلّه بعدها` | `server/test/web-dom.test.js:7670` |
| `إغلاق التعميم يعيد الشريط، والتعميم المُغلَق سابقاً لا يمنعه` | `server/test/web-dom.test.js:7728` |
| `الشريط يُطلب مرّة واحدة عند فتح الصفحة، لا عند فتح تبويب` | `server/test/web-dom.test.js:7759` |
| `قاعدة CSS تُبقي [hidden] غالباً على display:flex — وإلا ظهر الشريط رغم إخفائه` | `server/test/web-dom.test.js:7787` |
| `loading the page does NOT request notification permission` | `server/test/web-dom.test.js:7801` |
| `tapping a personal notification with an event_id marks it read AND navigates to that event` | `server/test/web-dom.test.js:7832` |
| `adding a reminder requests notification permission, and removing one does not` | `server/test/web-dom.test.js:7904` |
| `a null VAPID public key means no prompt, no subscribe call, and no visible error` | `server/test/web-dom.test.js:7955` |
| `a successful subscribe POSTs the exact { endpoint, keys: { p256dh, auth } } shape` | `server/test/web-dom.test.js:8001` |
| `the off control calls DELETE /api/notifications/subscribe and the displayed state changes` | `server/test/web-dom.test.js:8044` |
| `tapping a broadcast marks it read through the broadcast endpoint and navigates nowhere` | `server/test/web-dom.test.js:8109` |
| `a browser with no serviceWorker/PushManager degrades silently and the page still works` | `server/test/web-dom.test.js:8160` |
| `iOS Safari not installed shows Arabic line and does not prompt` | `server/test/web-dom.test.js:8189` |
| `after turning notifications off, adding a reminder does not re-subscribe (FIX 4, story 18)` | `server/test/web-dom.test.js:8226` |
| `the deep-linked event survives the feed load instead of being wiped by it (FIX 5, story 14)` | `server/test/web-dom.test.js:8293` |
| `navigateToEvent opens the event page without any animated scroll of the feed (FIX 7, story 54)` | `server/test/web-dom.test.js:8363` |
| `clicking an event in the agenda day list closes the agenda and navigates to that event, with no ReferenceError` | `server/test/web-dom.test.js:8379` |
| `iOS install hint is not shown unbidden if already dismissed (FIX 3, story 17)` | `server/test/web-dom.test.js:8409` |
| `event card countdown accurately reflects today, tomorrow, and future days without timezone drift` | `server/test/web-dom.test.js:8441` |
| `«غداً» is computed in Jerusalem time — a device in another zone cannot shift the day` | `server/test/web-dom.test.js:8482` |
| `كرت التغذية يحمل «انتهت» حين يقول الخادم إن أيام المناسبة مضت، ولا يحملها لمناسبة قائمة (#167)` | `server/test/web-dom.test.js:8503` |
| `services tab has filter chips, search input, filter modals, and renders luxury service cards` | `server/test/web-dom.test.js:8519` |
| `العرض المختصر: صفّ لكل مزوّد (صورة، اسم، فئة وبلدة، شارة سعر، «اتصال» و«تفاصيل»)، و«اتصال» يغيب حين لا يوجد رقم` | `server/test/web-dom.test.js:8620` |
| `العميل: غياب providers_display أو قيمته غير المعروفة يعني الصفوف المختصرة (حسم الخادم في smoke)` | `server/test/web-dom.test.js:8670` |
| `صفّ البلدات لا يدّعي «جميع البلدات» من أربع بلدات (تذكرة #127)` | `server/test/web-dom.test.js:8688` |
| `«تفاصيل» في الصفّ المختصر تفتح نافذة المزوّد من GET /api/services/providers/:id بحزمة السعر والمواصفات` | `server/test/web-dom.test.js:8708` |
| `providers_display = cards يعيد الكروت الكبيرة، وتغيير الشكل بعد الرسم يعيده من الذاكرة بلا طلب مزوّدين جديد` | `server/test/web-dom.test.js:8754` |
| `تنسيق الصفّ المختصر: لا نص أصغر من 15px ولا زرّ أقصر من 44px` | `server/test/web-dom.test.js:8786` |
| `a 401 on an auth:true site call runs handleSessionExpired once — token cleared, auth modal open, one notice for two parallel 401s` | `server/test/web-dom.test.js:8833` |
| `a 401 on a call WITHOUT auth:true (or on the admin token) leaves the site session alone` | `server/test/web-dom.test.js:8857` |
| `a 401 on the publish POST keeps the filled form and retries the same submission right after logging in again` | `server/test/web-dom.test.js:8871` |
| `the header and floating account buttons always read «حسابي» with a person icon, open #tabAccount instead of a login form or a logout, and leave the logout inside «حسابي» alone` | `server/test/web-dom.test.js:8914` |
| `choosing «قريتي غير موجودة» reveals a name field and the publish POST carries requested_village_name with no village_id` | `server/test/web-dom.test.js:8996` |
| `the card shows a typed (unlisted) village name in place of «القرى والتجمعات», escaped` | `server/test/web-dom.test.js:9073` |
| `effective audio: the platform default plays for a type that shows audio_url, and a type that hides it gets no audio at all` | `server/test/web-dom.test.js:9089` |
| `feed audio is isolated per card like a story: moving on stops the old track — even a shared default one — and starts the next from zero` | `server/test/web-dom.test.js:9129` |
| `«قوّي مناسبتك» opens the edit form of that very event; the daily digest goes to the feed` | `server/test/web-dom.test.js:9182` |
| `leaving the feed for another tab and coming back returns to the same card, not the first` | `server/test/web-dom.test.js:9218` |
| `the «new events» switch reads the server, saves a change, and snaps back if the save fails` | `server/test/web-dom.test.js:9238` |
| `admin activity log reads as a sentence — who, did what, to which event — with «افتح» only while the event exists` | `server/test/web-dom.test.js:9275` |
| `admin event card names its publisher, and admin.html?event=<id> opens that event for editing` | `server/test/web-dom.test.js:9305` |
| `admin events: search survives an event with no groom, and phone/poster values stay text` | `server/test/web-dom.test.js:9325` |
| `the global sound toggle lives in the header AND the floating bar, and muting is remembered per viewer` | `server/test/web-dom.test.js:9351` |
| `admin moderation card: a typed village shows as «قرية مقترحة», and only super_admin gets «اعتمدها قرية»` | `server/test/web-dom.test.js:9367` |
| `every element id the live admin.js code reads for actually exists in admin.html` | `server/test/web-dom.test.js:9386` |
| `getLiveShareUrl() returns <origin>/live for the default empty apiBase` | `server/test/web-dom.test.js:9400` |
| `getLiveShareUrl() follows NEGEV_CONFIG.apiBase when it is set to a non-empty absolute origin` | `server/test/web-dom.test.js:9405` |
| `duration presets compute a future "until", and "حتى منتصف الليل" lands exactly on the next local midnight` | `server/test/web-dom.test.js:9411` |
| `clicking a duration preset writes the hidden "until" field and the readable preview text` | `server/test/web-dom.test.js:9435` |
| `status strip: active live shows the badge, topic and remaining time; a saved channel with no live shows the channel-only line; nothing saved shows the unset line` | `server/test/web-dom.test.js:9449` |
| `an expired live (until in the past) renders as "no live", never as an active one` | `server/test/web-dom.test.js:9473` |
| `«إنهاء البث الآن» clears title and until together, in a single PUT request body` | `server/test/web-dom.test.js:9489` |
| `a topic containing markup is inserted into the status strip as text, never as HTML` | `server/test/web-dom.test.js:9520` |
| `each duration button in admin.html is wired to a preset key computeLiveDurationUntil actually resolves` | `server/test/web-dom.test.js:9536` |
| `an expired live is not handed back to the form: its topic and until are cleared, and «إنهاء البث الآن» is disabled` | `server/test/web-dom.test.js:9555` |
| `a still-running live IS restored into the form untouched` | `server/test/web-dom.test.js:9583` |
| `when GET /api/live fails, the strip stops claiming that no channel is configured` | `server/test/web-dom.test.js:9600` |
| `the live section and the episodes section say nothing about TikTok anywhere — text, placeholders or titles` | `server/test/web-dom.test.js:9638` |
| `saving the live form PUTs exactly live_channel_url, live_title, live_until and live_stream_url through adminFetch` | `server/test/web-dom.test.js:9650` |
| `the stream-url hint follows embed_url from GET /api/live: inside the app when set, outside when null, hidden when nothing is configured` | `server/test/web-dom.test.js:9682` |
| `the episode form defaults its date to today in Asia/Jerusalem, and the episodes list loads through adminFetch` | `server/test/web-dom.test.js:9705` |
| `«إضافة خيار» stops at 4 options and the per-option delete stops at 2` | `server/test/web-dom.test.js:9722` |
| `an episode with votes locks its option inputs and add/remove buttons, with the note; one without votes does not` | `server/test/web-dom.test.js:9753` |
| `saving an episode PUTs to /api/admin/live/episodes/:date via adminFetch; an empty poll is sent as no poll; a 409 message is shown as-is` | `server/test/web-dom.test.js:9786` |
| `deleting an episode asks confirm() first and sends DELETE through adminFetch only when confirmed` | `server/test/web-dom.test.js:9826` |
| `«الحلقات السابقة» is the last section of the live page: escaped titles, image or placeholder, and «شاهد هنا» / «افتح على يوتيوب» / «شارك»` | `server/test/web-dom.test.js:9880` |
| `«الحلقات السابقة» stays hidden when past_episodes is empty` | `server/test/web-dom.test.js:9932` |
| `«أرشيف العرس» appears in the event details only when archive_photos is non-empty, and opens a full-screen viewer` | `server/test/web-dom.test.js:9945` |
| `the map popup Waze button still records its town when the town name has an apostrophe` | `server/test/web-dom.test.js:10016` |
| `the host call/WhatsApp buttons work for a town with an apostrophe, and a hostile host_phone stays text` | `server/test/web-dom.test.js:10045` |
| `admin: «عرض السجل» opens the log of the exact device id — a crafted id is data, never code` | `server/test/web-dom.test.js:10075` |
| `no inline handler in web/app.js or web/admin.js embeds escapeHtml() inside a quoted JS string` | `server/test/web-dom.test.js:10103` |
| `uploadToCloudinary POSTs exactly the signed fields plus the file to upload_url, with no token, and throws an Arabic message on refusal` | `server/test/web-dom.test.js:10110` |
| `the episode form prefills and sends video_url; a saved episode lists its video, thumbnail and share link` | `server/test/web-dom.test.js:10137` |
| `saving the live shows live_episode_notice as a warning, or «حُفظ البث كحلقة اليوم» with an optional share-image upload` | `server/test/web-dom.test.js:10182` |
| `the occasion-type form prefills and sends archive_gallery` | `server/test/web-dom.test.js:10223` |
| `لوحة الأنواع تحمل حقل feed_linger_days ويُحفظ عبر المسار القائم (#167)` | `server/test/web-dom.test.js:10251` |
| `an ended event of an archive type gets «صور الأرشيف» (super_admin); the modal lists photos, deletes after confirm, and uploads with per-file status` | `server/test/web-dom.test.js:10284` |
| `ستوريو التسويق: super_admin sees the tab, previews a link, publishes, and deletes with its asset` | `server/test/web-dom.test.js:10360` |
| `ستوريو التسويق: موضع الظهور يُرسَل كما اختير ويُعاد إلى bar بعد النشر (#173)` | `server/test/web-dom.test.js:10430` |
| `بطاقة الدخول: the pinned story is preselected, and saving sends its id or an explicit empty string` | `server/test/web-dom.test.js:10474` |
| `ستوريو التسويق is hidden from a town admin — the tab is absent, not disabled` | `server/test/web-dom.test.js:10528` |
| `تبويب «الأشخاص» is hidden from a town admin and shown to a super admin — merging is super-only (#107)` | `server/test/web-dom.test.js:10536` |
| `اقتراحات الدمج in the people tab are rendered, escaped, and only preselect — they never merge (#107)` | `server/test/web-dom.test.js:10551` |
| `دمج الأشخاص: the merge POST carries JSON and the selected source, and success clears the selection (#107)` | `server/test/web-dom.test.js:10599` |
| `ألبومات الإدارة: pick an archive-gallery event, open its album, edit a caption, and moderate a tag/report` | `server/test/web-dom.test.js:10643` |
| `ألبومات الإدارة: زرّ الحذف في الرأس يرسل معرّف الألبوم الحقيقي، ويغلق اللوحة ويعيد جلب الألبومات` | `server/test/web-dom.test.js:10800` |
| `ألبومات الإدارة: رقاقة «بلا مناسبة» تجلب ألبومات العريس وتعرض بطاقتها، و«فتح» يفتح تفاصيلها` | `server/test/web-dom.test.js:10867` |
| `فيديوهات اللوحة: حالة عربية، «إخفاء» يرسل PATCH، «حذف» بعد تأكيد يرسل DELETE، والإضافة ترسل { url, title }` | `server/test/web-dom.test.js:10929` |
| `ألبومات الإدارة: الوسم يسمّي أصحاب المناسبة والبلدة مرة واحدة، والبحث يرشّح بالكتابة` | `server/test/web-dom.test.js:11041` |
| `ألبومات الإدارة: رفع 45 صورة يوقّع 3 دفعات (max_batch = 20) ويُدخل صفاً لكل صورة` | `server/test/web-dom.test.js:11196` |
| `ألبومات الإدارة: إدخال يردّ 429 برسالة انتظار — الصفّ يقول «أعد المحاولة بعد 2 دقيقة» والصفوف التالية تُحاول` | `server/test/web-dom.test.js:11232` |
| `ألبومات الإدارة: فشل التوقيع بـ 429 يوقف الطابور ويحمل الصفوف الباقية رسالة الانتظار بلا طلب ثانٍ` | `server/test/web-dom.test.js:11261` |
| `the «البلدات والمحافظات» tab button is hidden for a plain admin and shown for super_admin` | `server/test/web-dom.test.js:11330` |
| `the towns table renders per region from GET /api/admin/towns; the locked row has only the reorder buttons` | `server/test/web-dom.test.js:11344` |
| `▼ on the first town PUTs /api/admin/towns/order with the full swapped id list, then refreshes the shared towns list` | `server/test/web-dom.test.js:11372` |
| `submitting the new-town form POSTs name, latitude, longitude and region_id` | `server/test/web-dom.test.js:11392` |
| `the event edit town select offers «النقب — بلا بلدة محدّدة» and keeps an unknown current town selected` | `server/test/web-dom.test.js:11416` |
| `the admin → towns grid offers the region as «النقب (بلا بلدة محدّدة)» and «عرض المناسبات بلا بلدة» filters the events list to that exact town` | `server/test/web-dom.test.js:11435` |
| `the village form carries a mandatory governorate picker and every create sends region_id (تذكرة #128)` | `server/test/web-dom.test.js:11498` |
| `the villages table shows only the chosen governorate's villages, names that governorate, and follows the picker (تذكرة #128)` | `server/test/web-dom.test.js:11529` |
| `the «إضافة محافظة» button opens a form that POSTs the governorate to /api/admin/regions (تذكرة #128)` | `server/test/web-dom.test.js:11553` |
| `the broadcast target offers «كل بلدات <المحافظة>» from GET /api/towns and sends the governorate name for the server to expand (تذكرة #128)` | `server/test/web-dom.test.js:11581` |
| `the analytics tab renders the per-governorate breakdown from overview.by_region, with the «غير محدَّد» row, leaving the summary KPIs as they were (تذكرة #128)` | `server/test/web-dom.test.js:11620` |
| `the publish town select offers the region as «النقب — بلا بلدة محدّدة», valued with the bare region name` | `server/test/web-dom.test.js:11697` |
| `choosing the region centres the map on it with no pin, and publish sends town=النقب with no latitude/longitude` | `server/test/web-dom.test.js:11713` |
| `the edit modal keeps an event's current town selected even when it is not among the options, and saves it back unchanged` | `server/test/web-dom.test.js:11753` |
| `the place filter offers the region «(بلا بلدة محدّدة)» and selecting it sends ?town=النقب` | `server/test/web-dom.test.js:11785` |
| `a region-level event's card shows the bare region name, and the empty feed names the first region` | `server/test/web-dom.test.js:11795` |
| `the collision alert shows the town and date as text — markup in them is never parsed` | `server/test/web-dom.test.js:11807` |
| `switching to «القرى والتجمعات» drops the previous town's automatic pin, but never a pin the user placed` | `server/test/web-dom.test.js:11831` |
| `the publish form renders an extra-days list and «أضف يوماً» button for a type that defines one, and nothing for a type without it` | `server/test/web-dom.test.js:11872` |
| `submitting the publish form sends extra_days[i][…] bracket keys, and a fully blank row is dropped` | `server/test/web-dom.test.js:11892` |
| `the edit modal fills its days from evt.extra_days and PATCHes them back as an array` | `server/test/web-dom.test.js:11931` |
| `the event page renders one row per extra day with its name and long Arabic date, keeping order and escaping markup` | `server/test/web-dom.test.js:11975` |
| `the admin direct-add form gets its own styled «أضف يوماً» button for a type with extra_days` | `server/test/web-dom.test.js:12013` |
| `admin direct add sends extra_days[i][…] for a filled day row and drops a blank one` | `server/test/web-dom.test.js:12066` |
| `a direct-add draft restores its saved extra-day row` | `server/test/web-dom.test.js:12107` |
| `the admin edit form shows the event's extra days as editable rows` | `server/test/web-dom.test.js:12137` |
| `renaming an extra day sends extra_days but never raises the critical-amendment warning` | `server/test/web-dom.test.js:12150` |
| `changing an extra day's date sends extra_days and raises the critical-amendment warning` | `server/test/web-dom.test.js:12168` |
| `swapping two extra days' dates raises the critical-amendment warning even though the date list is unchanged` | `server/test/web-dom.test.js:12184` |
| `leaving the extra days untouched sends no extra_days key at all` | `server/test/web-dom.test.js:12212` |
| `the days section is hidden for a type that does not show extra_days, and the key is never sent` | `server/test/web-dom.test.js:12231` |
| `buildEventEditFormData JSON-stringifies extra_days exactly like honorees` | `server/test/web-dom.test.js:12252` |
| `admin.css styles the direct-add honoree and extra-day rows, which had no rule before` | `server/test/web-dom.test.js:12261` |
| `the occasion-type editor round-trips every server field key, so saving a type deletes none` | `server/test/web-dom.test.js:12274` |
| `the reminder button reads «أضف لقائمتي» when unsaved, and «في قائمتي» + is-saved when saved, with the heart as its state marker` | `server/test/web-dom.test.js:12342` |
| `renderMyList draws the six server buckets in order, collapses «انتهت سابقاً», and picks row actions by bucket` | `server/test/web-dom.test.js:12371` |
| `a date change shows «تغيّر الموعد» with old→new in its title, and null renders nothing` | `server/test/web-dom.test.js:12423` |
| `the «انتهت» chip filters client-side, and each chip has its own empty state` | `server/test/web-dom.test.js:12456` |
| `the bottom nav holds three destinations — المناسبات · خدماتنا · خدمات الأعراس — and «حسابي», a header button rather than a bar slot, lights nothing down there` | `server/test/web-dom.test.js:12488` |
| `«خدماتنا» is a public page with the three Ktra platform capsules in order, the news one opening the reader in-place` | `server/test/web-dom.test.js:12585` |
| `«خدماتنا» carries the five calculators as one visible panel at a time, with the Hijri ±1 day warning in plain sight` | `server/test/web-dom.test.js:12676` |
| `the wedding budget sums its items, and refuses an empty name, a negative amount and text` | `server/test/web-dom.test.js:12718` |
| `the expense split names who pays whom, exactly, and refuses a single person and a zero total` | `server/test/web-dom.test.js:12775` |
| `the split settlement never invents or loses an agora, across a fixed pseudo-random run` | `server/test/web-dom.test.js:12835` |
| `the guest estimator multiplies families and tables, treats empty as zero, and refuses text` | `server/test/web-dom.test.js:12893` |
| `the countdown counts local calendar days — 45 ahead, today, 3 past — and rejects a non-existent date` | `server/test/web-dom.test.js:12939` |
| `the Hijri calculator matches four Umm al-Qura reference dates exactly and shows the ±1 day note` | `server/test/web-dom.test.js:12990` |
| `no calculator reaches /api — every one of the five computes on the device` | `server/test/web-dom.test.js:13026` |
| `the add-service window names its purpose, and no outside button borrows that wording` | `server/test/web-dom.test.js:13083` |
| `«آخر الأخبار» renders /api/news cards (breaking, category, relative time), then closes with Escape` | `server/test/web-dom.test.js:13107` |
| `the empty governorate offers «أخبار محلية عامة», and choosing it refetches with general=1 and shows the «عامة» tag` | `server/test/web-dom.test.js:13187` |
| `tapping a news card opens its detail inside the layer — body paragraphs, source line, «افتح على كترا» — and back restores the list` | `server/test/web-dom.test.js:13239` |
| `a failing /api/news shows the Arabic error with «إعادة المحاولة», and the retry refetches` | `server/test/web-dom.test.js:13320` |
| `resumePendingIntent with { type: 'remind' } POSTs /api/events/:id/remind after sign-in` | `server/test/web-dom.test.js:13364` |
| `«نظّف المنتهية» confirms first, then DELETEs /api/my-reminders?scope=ended with the token` | `server/test/web-dom.test.js:13397` |
| `removing an event from «قائمتي» clears is_reminded on the feed entry, so its card offers adding it again` | `server/test/web-dom.test.js:13430` |
| `clearEndedMyList: a refused clear toasts nothing and moves nothing; a successful one un-saves the cleared feed event` | `server/test/web-dom.test.js:13492` |
| `the «تراجع» undo of a failed re-add alerts and still reloads the list` | `server/test/web-dom.test.js:13574` |
| `the event page offers no save button for an event that is not approved` | `server/test/web-dom.test.js:13632` |
| `account avatar: a stored avatar_url shows the photo and hides the icon fallback` | `server/test/web-dom.test.js:13694` |
| `account avatar: avatar_url = null hides the photo and brings the icon back` | `server/test/web-dom.test.js:13709` |
| `account profile: save sends full_name + clan_town and adopts the server answer` | `server/test/web-dom.test.js:13723` |
| `account phone: save sends the number with the PIN and keeps only the fresh token` | `server/test/web-dom.test.js:13765` |
| `account phone: a 400 wrong PIN keeps the session and the open form, and shows the server message` | `server/test/web-dom.test.js:13806` |
| `account avatar upload: multipart body with the `image` field and no Content-Type header` | `server/test/web-dom.test.js:13836` |
| `«أنا في الصورة»: an account without a photo opens the sheet, keeps sending disabled and posts nothing` | `server/test/web-dom.test.js:13889` |
| `«أنا في الصورة»: photo + confirmed number send both descriptions with confirm_phone` | `server/test/web-dom.test.js:13927` |
| `«أنا في الصورة»: a 400 shows its server message inside the sheet and leaves it open` | `server/test/web-dom.test.js:13975` |
| `طابور الوسوم: three tabs carry the server counts and switch the queue status` | `server/test/web-dom.test.js:14004` |
| `apiFetch sends X-Region only for a numeric negev_region — no saved value means no header at all` | `server/test/web-dom.test.js:14059` |
| `adminFetch never sends X-Region, even when the browser has one saved` | `server/test/web-dom.test.js:14081` |
| `the region picker is drawn above the feed chips from GET /api/towns (regions), with each region's state` | `server/test/web-dom.test.js:14099` |
| `a saved region is selected again when the page opens, and the drawer copy shows the same state` | `server/test/web-dom.test.js:14126` |
| `choosing another region saves it, empties the previous list, and refetches page 1 with the new X-Region` | `server/test/web-dom.test.js:14149` |
| `publishing under «القرى والتجمعات» requires a region and sends region_id` | `server/test/web-dom.test.js:14192` |
| `the edit modal shows the event's region and sends region_id only when the user changes it` | `server/test/web-dom.test.js:14241` |
| `the very first feed request carries X-Region of the saved region, not the first one` | `server/test/web-dom.test.js:14281` |
| `اختيار محافظة بعد «وسّع إلى كل المحافظات» يُلغي all_regions من الطلب التالي (#161)` | `server/test/web-dom.test.js:14305` |
| `a signed-in visitor with no stored choice is shown the account region the server actually uses` | `server/test/web-dom.test.js:14359` |
| `clicking the drawn default region stores it explicitly and refetches` | `server/test/web-dom.test.js:14388` |
| `the place filter offers only the active region's towns, and an open sheet is rebuilt on a region change` | `server/test/web-dom.test.js:14411` |
| `editing still saves when GET /api/towns returned no regions — the region is only required when a list exists` | `server/test/web-dom.test.js:14430` |
| `the map opens on the active region's centre and re-centres when the region changes` | `server/test/web-dom.test.js:14468` |
| `a slow answer from the previous region cannot land on the new region's feed` | `server/test/web-dom.test.js:14506` |
| `«أهلاً، الاسم» للمسجَّل وحده، والزائر لا يراه (#174)` | `server/test/web-dom.test.js:14582` |
| `negev_user بلا negev_token لا يحيّي في موضعي الترويسة، والجلسة المكتملة تحيّي فيهما (#174)` | `server/test/web-dom.test.js:14601` |
| `كبسولة المحافظة تحمل اسمها من الخادم وتفتح ورقة المحافظة، والاختيار فيها يمشي في selectRegion القائم` | `server/test/web-dom.test.js:14621` |
| `بلا محافظات من الخادم: الكبسولة تقول «منطقتك» والورقة تشرح الفراغ بدل بطاقة فارغة` | `server/test/web-dom.test.js:14657` |
| `القلب يفتح «قائمتي» وزرّ الأجندة يفتح الأجندة القائمة، والشريط السفلي يبقى ثلاث وجهات` | `server/test/web-dom.test.js:14676` |
| `قاعدة CSS تُخفي التحية عن الزائر صراحةً، والكبسولة تقصّ الاسم الطويل` | `server/test/web-dom.test.js:14717` |
| `الهاتف وPWA المثبَّت: الصفّ الغني له موضعٌ ثانٍ داخل الشريط العائم الظاهر هناك` | `server/test/web-dom.test.js:14740` |
| `حجز بطاقة التغذية يساوي علوّ الشريط العائم المعلن في كل عتبة (#174)` | `server/test/web-dom.test.js:14806` |
| `التحية والكبسولة تُكتبان في موضعَي الصفّ الغني معاً، واختيار كبسولة الهاتف يمشي في selectRegion نفسه` | `server/test/web-dom.test.js:14873` |
| `المحافظة الأصلية (النقب) بلا شريط: الشريط خبر توسّع لا تحيّة، ولا ورقة قديمة ولا مفتاحها` | `server/test/web-dom.test.js:14976` |
| `التبديل إلى محافظة طولكرم: شريط داخل الصفحة بنصّ الخادم وعدد بلداتها — لا طبقة ولا حوار` | `server/test/web-dom.test.js:14993` |
| `تبديل ثانٍ إلى اللد والرملة ويافا: الشريط يتبع كل تبديل بنصّ المحافظة الجديدة وعدد بلداتها (٣)` | `server/test/web-dom.test.js:15036` |
| `محافظة بصفر مناسبات: عدد البلدات وسطر «كن أول»، ولا «0 مناسبة» في أي نصّ` | `server/test/web-dom.test.js:15060` |
| `محافظة فيها مناسبة معتمدة: رقم المناسبات لا عدد البلدات` | `server/test/web-dom.test.js:15079` |
| `صيغ العدد العربية: بلدة، بلدتان، بلدات، بلدة — وكذلك المناسبات` | `server/test/web-dom.test.js:15095` |
| `× يُخفي الشريط ويسجّل الإخفاء لهذه المحافظة وحدها — ويبقى بعد إعادة التحميل` | `server/test/web-dom.test.js:15113` |
| `اسم المحافظة يمرّ عبر escapeHtml — لا HTML من الخادم في العنوان أو السطر` | `server/test/web-dom.test.js:15152` |
| `تبديل المحافظة لا يطلب /api/towns مرة أخرى — الأرقام من استجابة الإقلاع نفسها` | `server/test/web-dom.test.js:15170` |
| `الموقوفة لا تُختار ولا شريط لها، ومحافظة بلا عدّادين من الخادم لا شريط لها` | `server/test/web-dom.test.js:15191` |
| `ناشر النقب يرى في نموذج النشر بلدات النقب وحدها ثم «النقب — بلا بلدة محدّدة»` | `server/test/web-dom.test.js:15287` |
| `ناشر طولكرم يرى «القرى والتجمعات» في آخر بلداته — ولا بلدة نقبية واحدة` | `server/test/web-dom.test.js:15303` |
| `تبديل حبة المحافظة يعيد بناء بلدات نموذج النشر المفتوح على المحافظة الجديدة` | `server/test/web-dom.test.js:15350` |
| `نافذة التعديل تعرض بلدات محافظة المناسبة وتُبقي بلدةً خارجها مختارة` | `server/test/web-dom.test.js:15366` |
| `النشر المباشر: محافظة الأدمن افتراضاً، وتبديل المحافظة يعيد بناء بلداتها وحدها` | `server/test/web-dom.test.js:15392` |
| `لوحة التعديل: منتقي البلدة يُبنى من محافظة المناسبة ويُبقي بلدة خارجها مختارة` | `server/test/web-dom.test.js:15433` |
| `نموذج تعديل مناسبة قروية في طولكرم يعرض قرى طولكرم وحدها في منتقي القرية` | `server/test/web-dom.test.js:15490` |
| `تبديل محافظة نموذج التعديل إلى النقب يعيد بناء قرى منتقي القرية من النقب` | `server/test/web-dom.test.js:15507` |
| `صفوف قرى بلا region_id (خادم أقدم أو قائمة احتياطية) تُعرض كاملة في منتقي التعديل` | `server/test/web-dom.test.js:15532` |
| `قرية المناسبة الحالية خارج قرى محافظتها تبقى خياراً مختاراً في منتقي التعديل` | `server/test/web-dom.test.js:15546` |
| `مسودّة النشر المباشر: محافظة لم تبق نشطة تعود إلى الافتراضية ولا تترك منتقي البلدة فارغاً` | `server/test/web-dom.test.js:15560` |
| `web/index.html keeps pinch-zoom enabled (no maximum-scale, no user-scalable) and keeps viewport-fit=cover` | `server/test/web-dom.test.js:15588` |
| `Chart.js is pinned to one explicit version, the same in index.html and admin.html` | `server/test/web-dom.test.js:15606` |
| `styles.css: one general :focus-visible rule, and a 44px button base no button rule lowers` | `server/test/web-dom.test.js:15631` |
| `admin.css carries the same 44px button base and general :focus-visible — the panel loads no other stylesheet` | `server/test/web-dom.test.js:15711` |
| `sw.js precaches the shell files only — never an /api endpoint, never admin.html, never a CDN URL` | `server/test/web-dom.test.js:15752` |
| `sw.js covers every local script index.html loads — in the precache list AND the runtime pattern` | `server/test/web-dom.test.js:15792` |
| `sw.js leaves /api responses, non-GET requests and cross-origin requests completely alone` | `server/test/web-dom.test.js:15820` |
| `sw.js serves shell files from the cache and still opens the shell offline` | `server/test/web-dom.test.js:15840` |
| `sw.js activate drops every previous shell cache (the version bump) and leaves other caches alone` | `server/test/web-dom.test.js:15868` |
| `sw.js fails install when an essential shell file cannot be downloaded — the previous cache survives whole` | `server/test/web-dom.test.js:15895` |
| `sw.js keeps install alive when only an icon fails to download — and the icon is filled in at runtime` | `server/test/web-dom.test.js:15961` |
| `صفحة المناسبة تعرض «جاي» و«مش جاي» والعدد 1..20 والعدّاد وحالة الجواب` | `server/test/web-dom.test.js:16027` |
| `لا أزرار حضور ولا عدّاد: لنوع solemn، ولا لنوع rsvp_enabled مطفأ، ولا حين يخفي النوع العدّاد` | `server/test/web-dom.test.js:16057` |
| `«جاي» يرسل PUT /api/events/:id/rsvp بإجمالي الحاضرين المختار، ويحدّث الحالة والعدّاد من ردّ الخادم` | `server/test/web-dom.test.js:16085` |
| `«مش جاي» يُرسل party_size = 1، و«سحب جوابي» يستعمل DELETE على المسار نفسه` | `server/test/web-dom.test.js:16149` |
| `«مين جاي» يرسم الأسماء والعدد والجواب والمصدر والمجاميع` | `server/test/web-dom.test.js:16205` |
| `زرّ «مين جاي» يرسمه «مناسباتي» لمناسبة نوعها مفتوح، ويغيب عن غيرها` | `server/test/web-dom.test.js:16229` |
| `فتح «مين جاي» يقرأ GET /api/events/:id/rsvps بالرمز، ويُظهر رسالة الخادم عند الرفض` | `server/test/web-dom.test.js:16246` |
| `كرت العرس يحمل الأفعال الثلاثة، والعزاء «عزّي» وحده بلا عدّاد، ونوع بلا rsvp_enabled بلا «جاي»` | `server/test/web-dom.test.js:16320` |
| `«جاي» من الكرت يسجّل الجواب بعدد 1 ويُفعّل «ذكّرني» ظاهراً` | `server/test/web-dom.test.js:16361` |
| `«بارك» يفتح ورقة «اختر رسالة» برسائل النوع، واختيار رسالة يفتح التبريك بنصّها قابلاً للتعديل` | `server/test/web-dom.test.js:16413` |
| `إغلاق ورقة الرسائل أثناء جلب الأنواع لا يرمي ولا يكتب إلى الورقة المغلقة` | `server/test/web-dom.test.js:16481` |
| `ردّ ورقة رسائل قديمة لا يستبدل حالة ورقة جديدة أو محتواها` | `server/test/web-dom.test.js:16506` |
| `ورقة الرسائل لا تُكتب من الكود: نوع بلا رسائل نشِطة يفتح باب الكتابة وحده` | `server/test/web-dom.test.js:16536` |
| `عدّادات صفحة المناسبة: مهتمين وتبريكات حين يرسلهما الخادم، ويغيبان حين يطفئهما النوع أو تكون النغمة وقورة` | `server/test/web-dom.test.js:16564` |
