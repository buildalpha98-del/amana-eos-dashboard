# Cowork setup — Amana HQ

Paste everything below the line into Cowork.

---

**From now on, everything you gather for Amana OSHC goes into the Amana dashboard — Amana HQ — not into spreadsheets.**

Amana HQ (https://amanaoshc.company/hq) is our version of OWNA HQ: one place where Jayden and Daniel see every centre's bookings, revenue, staff cost, food and resources budgets, program feedback, stock, families and materials. Everything you used to put in the **Amana OSHC Master Accounts Tracker** and the **Term materials order tracker** now has a home there, and you post it with the requests below. Keep gathering the data exactly as you do now — only the destination changes. Once a week is in the dashboard, the spreadsheets are no longer needed.

**Every request:** `POST` to `https://amanaoshc.company/...`, headers `Authorization: Bearer <COWORK_API_KEY>` (the key you already use for Amana) and `Content-Type: application/json`. Dates are `YYYY-MM-DD`. Every request can be sent again safely — rows update on their keys, they never duplicate. Each response tells you how many rows were saved and lists any `unknownServiceCodes` — if you see one, fix the code and send again.

**Centre codes:**

| Centre | Code | | Centre | Code |
|---|---|---|---|---|
| MFIS Greenacre | MFIS-GA | | AIA KKCC (Coburg) | AIA-COB |
| MFIS Beaumont Hills | MFIS-BH | | Al-Taqwa College | ATC |
| MFIS Hoxton Park | MFIS-HP | | Minaret Officer | MIN-OFF |
| Arkana College | ARK | | Minaret Doveton | MIN-DOV |
| Unity Grammar | UG | | Minaret Springvale | MIN-SPR |
| Minarah College | MNC | | | |

Never enter card details, passwords or bank details anywhere. Jayden or Daniel checks out carts. Never email families or centres about things the dashboard already sends (first-day emails, check-ins, reminders) — flag them in your summary instead.

## 1. The weekly accounts — every Monday, for the week just finished

This is the master tracker's **Weekly Log**. Gather it exactly as before:
- **Bookings and revenue:** OWNA → choose the centre → Attendances → Weekly Attendances → set the week → Get Report → eye icon. Add up each room's bookings: Rise and Shine / Before School = `bscBookings`, Amana Afternoons / After School = `ascBookings`, with their revenue lines. Holiday Quest, pupil-free days and vacation care go in `otherRevenue`.
- **Staff cost:** OWNA HQ → Financials → Revenue Vs Staff Costs → set the dates → Get Report. Use **Timesheet Costs (actual)**, not Roster Costs, with "Don't include Superannuation Guarantee" **unticked** so super is included.
- **Check:** total revenue should equal the Revenue column of that same HQ report.

`POST /api/cowork/accounts`

```json
{
  "weekly": [
    {
      "serviceCode": "MFIS-GA",
      "weekStart": "2026-10-12",
      "termWeek": "NSW W1",
      "bscBookings": 32,
      "ascBookings": 157,
      "bscRevenue": 885.62,
      "ascRevenue": 6828.84,
      "otherRevenue": 1912.58,
      "totalRevenue": 9627.04,
      "staffCost": 4122.58,
      "notes": "Holiday Quest $1,912.58"
    }
  ]
}
```

One row per centre per week. `weekStart` is the Monday. Revenue is booked fees before CCS (OWNA HQ's figure), not cash received. VIC and NSW terms start on different Mondays — label `termWeek` the way you do now ("VIC W2", "NSW W1"). Send all 11 centres in one request if you like.

## 2. Woolies orders — every Saturday, after ordering

The tracker's **Woolies Orders**. One row per order. The food spend counts as that centre's grocery spend in the dashboard, so it comes out of their grocery budget and the budget bank.

`POST /api/cowork/accounts`

```json
{
  "groceryOrders": [
    {
      "serviceCode": "MFIS-GA",
      "retailer": "Woolworths",
      "orderNo": "331654698",
      "deliveryDate": "2026-10-19",
      "deliveryWindow": "4-6pm",
      "weekStart": "2026-10-19",
      "weeksCovered": 1,
      "budget": 242.8,
      "foodSpend": 231.72,
      "totalPaid": 242.52,
      "notes": "Includes Monday 26 Oct."
    }
  ]
}
```

`weekStart` = the Monday of the first week the order covers. Fortnightly centres (Arkana, Doveton, Springvale) send `weeksCovered: 2` with two weeks' budget on one order. `budget` is the ERM grocery budget for the order.

## 3. Resources — whenever something is bought or reimbursed

The tracker's **Resources**. One row per order or reimbursed purchase, against the month it counts in. It comes off the centre's monthly resources budget ($150, or $300 when average weekly bookings are over 100).

`POST /api/cowork/accounts`

```json
{
  "resources": [
    {
      "serviceCode": "MFIS-HP",
      "month": "2026-10-01",
      "purchaseDate": "2026-10-13",
      "supplier": "Kmart",
      "orderRef": "715333153",
      "items": "Program resources",
      "spend": 79,
      "notes": "Week 1 local purchases: reimbursement claim coming."
    }
  ]
}
```

Use the same `orderRef` when you update a purchase (e.g. once the amount is confirmed) so it updates rather than adds. No order number? Keep `items` exactly the same each time you resend it.

## 4. Stock lists — the centres keep these themselves now

Centres no longer email their stocktake. Each centre keeps its own list on its service page (**Program → Resources & stock**) and taps **Send stocktake** when it's counted; head office is notified with what's running low, and it shows in Amana HQ. If a centre emails a stocktake anyway, reply pointing them there.

You only send stock **once**, to bring across the lists already in the Master Accounts Tracker:

`POST /api/cowork/accounts`

```json
{ "stock": [ { "serviceCode": "MFIS-GA", "category": "Art & craft", "item": "Glue sticks", "type": "consumable",
  "qtyOnHand": 4, "unit": "sticks", "reorderAt": 10, "lastCounted": "2026-10-16" } ] }
```

`type` is `consumable` or `durable`. After that, leave stock to the centres — don't resend old counts over theirs.

## 5. Program feedback — every Friday

One row per centre per week, from the Friday email replies and OWNA reflections (Staff → Reflections and the program's Write Evaluation fields).

`POST /api/cowork/accounts`

```json
{
  "feedback": [
    {
      "serviceCode": "MFIS-HP",
      "weekStart": "2026-10-12",
      "termWeek": "NSW W1",
      "feedbackReceived": true,
      "reflections": "complete",
      "kidsEnjoyed": "Face painting (clear favourite), fruit kebabs, table puzzles",
      "didntWork": "Mindfulness breathing (lost interest)",
      "childrensIdeas": "Face painting again; more gardening and seeds",
      "resourcesRequested": "Pencils, pens, eraser",
      "notes": ""
    }
  ]
}
```

`reflections` is `none`, `partial` or `complete`.

**First time:** send everything that's already in the Master Accounts Tracker — every Weekly Log row, every Woolies order, every Resources row, the stock lists (once — see 4) and the program feedback — so Amana HQ starts with the whole term.

## 6. The OWNA data run — every Wednesday and Friday

This feeds the parent journey: first-day emails, "we've missed you" and "we're still here" check-ins, and the Follow-ups call lists. It also gives Amana HQ live attendance between the Monday accounts.

**When:** Wednesday around 1pm (Monday to Wednesday morning) and Friday around 6pm (the whole week), Sydney time, every centre. If a run fails, retry the same day — a centre's data counts as live for 4½ days.

**Read in OWNA, per centre:** every enrolled child (first name, surname, date of birth, room, still active, regular booked days Mon–Fri; casual-only children have none) and, for every day in the period, every booked child per session (before school `bsc`, after school `asc`, holiday/vacation care `vc`): signed in or not, sign-in/out times, casual or not, and the session fee if shown. Also each staff member's sign-in and sign-out for each day (OWNA staff attendance).

`POST /api/cowork/owna/run`

```json
{
  "serviceCode": "MFIS-GA",
  "runType": "midweek",
  "periodStart": "2026-10-19",
  "periodEnd": "2026-10-21",
  "children": [
    { "ownaChildId": "if-visible", "firstName": "Yusuf", "surname": "Khan", "dob": "2018-03-02", "room": "Juniors", "active": true,
      "bookedDays": { "monday": false, "tuesday": true, "wednesday": false, "thursday": true, "friday": false } }
  ],
  "attendance": [
    { "firstName": "Yusuf", "surname": "Khan", "dob": "2018-03-02", "date": "2026-10-21", "session": "asc", "signedIn": true, "signInTime": "15:12", "signOutTime": "17:40", "casual": false, "fee": 43.5 },
    { "firstName": "Maryam", "surname": "Ali", "dob": "2019-07-14", "date": "2026-10-21", "session": "bsc", "signedIn": false, "casual": true }
  ],
  "staff": [
    { "name": "Sarah Ahmed", "email": "sarah@amanaoshc.com.au", "date": "2026-10-21", "signIn": "14:45", "signOut": "18:30" }
  ]
}
```

- `runType`: `"midweek"` on Wednesday, `"end_of_week"` on Friday.
- Always include `dob` — it's how children are matched to their enrolment.
- Include absent booked children with `signedIn: false`. An absence is information.
- Send the whole period each time (re-sending a day overwrites it).
- The response gives `matched` (children matched to enrolments), `staffUnmatched` (staff names the dashboard couldn't find — use their dashboard email next time) and `errors`. A `207` means it ran with errors: report them.

## 7. Term materials orders — whenever the round changes

The materials order tracker you ran for Term 4. Send the whole round whenever something changes: after you email the centres, after each reply, when a cart is built, when it's checked out.

`POST /api/cowork/materials`

```json
{
  "round": { "key": "2026-T4-weeks-1-4", "title": "Term 4 materials (Weeks 1–4)", "term": "2026-T4",
             "programStart": "2026-10-12", "programEnd": "2026-11-06", "repliesDueAt": "2026-10-13T12:00:00+11:00",
             "notes": "Local buys within $30 ($120 at Hoxton Park), receipt to Daniel." },
  "centres": [ { "serviceCode": "AIA-COB", "replyStatus": "replied", "replyAt": "2026-10-12T22:42:00+11:00", "notes": "Thushy replied (cc Tracie)" } ],
  "lines": [
    { "serviceCode": "AIA-COB", "ref": "w2-spray-bottle", "week": 2, "item": "Spray bottle", "qty": 1, "purpose": "Grow a Chickpea",
      "ifMissing": "hq_order", "centreHasIt": "no", "notes": "Label 'water only' on arrival" }
  ],
  "carts": [
    { "serviceCode": "AIA-COB", "retailer": "Kmart", "status": "ready", "lineCount": 10, "total": 65.25,
      "buyLocally": "Clear contact 1 roll; Non-toxic washable paint 1 bottle", "otherOrder": "Woolworths week 2: clear cups 11" }
  ]
}
```

- `ref` must stay the same for an item at a centre: use `w<week>-<item-slug>`.
- `ifMissing`: `local_buy` (Week 1, the centre buys it within the local-buy limit), `hq_order` (Weeks 2–4, one HQ cart per centre) or `follow_up` (library books, pebbles, recycled boxes).
- `centreHasIt`: `yes`, `no`, `check`, or leave it out if they haven't answered. Centres can also answer on the dashboard themselves — don't overwrite an answer that's already there with an older one.
- `replyStatus`: `awaiting`, `reminded`, `partial`, `replied`, `nothing_needed`, `hold`.
- Cart `status`: `draft`, `ready`, `hold`, `checked_out`, `received`, `nothing_needed`. When a cart is checked out, send `checked_out` with the final `total` and `checkedOutAt` — the dashboard records it as that centre's materials spend, once.
- First time: send the current Term 4 round from the spreadsheet.

## After each job

Post a short summary to Cowork's report: what you sent, counts per centre, anything that didn't match, and anything that needs a person (a centre over its grocery budget, staff cost above 70% of revenue, a centre with no reflections, stock to reorder, a family that may need a call).

## Where it shows up (so you can check)

**Amana HQ** at `/hq`:
- **Network:** the selected week, term to date, and resources month, like the master tracker's Network Summary.
- **Centres:** each centre's tab with its weekly numbers, Woolies orders, resources, feedback, stock and budget bank.
- **Families:** follow-ups, first days and quiet families.
- **Materials:** the term round.
- **Data:** when each centre last sent an OWNA run and its weekly accounts.
