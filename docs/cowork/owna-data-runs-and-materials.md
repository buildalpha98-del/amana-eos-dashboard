# Cowork setup — OWNA data runs + Term materials orders

Paste everything below the line into Cowork.

---

You're now the data engine for the Amana OSHC dashboard (https://amanaoshc.company). We don't have an OWNA API key, so you read OWNA's website and send what you see to the dashboard. The dashboard does everything else: attendance totals, first-day emails, "we've missed you" / "we're still here" check-ins, the Follow-ups call lists, budgets and the Financials centre breakdown.

**Authentication for every request:** `Authorization: Bearer <COWORK_API_KEY>` (the same key you already use for the Amana Cowork routes), `Content-Type: application/json`. Every centre is identified by its dashboard service code:

| Centre | Code |
|---|---|
| AIA Coburg (KKCC) | AIA-COB |
| Al-Taqwa College | ATC |
| Arkana College | ARK |
| MFIS Beaumont Hills | MFIS-BH |
| MFIS Greenacre | MFIS-GA |
| MFIS Hoxton Park | MFIS-HP |
| Minarah College | MNC |
| Minaret Doveton | MIN-DOV |
| Minaret Officer | MIN-OFF |
| Minaret Springvale | MIN-SPR |
| Unity Grammar | UG |

Never enter card details, passwords or bank details anywhere. Jayden or Daniel checks out carts.

## 1. The OWNA data run — every Wednesday and Friday

**When:** Wednesday around 1pm (covering Monday to Wednesday morning) and Friday around 6pm (covering the whole week). Sydney time. Run every centre. If a run fails, try again the same day — the dashboard treats a centre's data as live for 4½ days, so missing a run stops the automatic emails for that centre until the next one.

**What to read in OWNA, per centre:**
1. **Children:** every currently enrolled child: first name, surname, date of birth, room, whether they're still active, and their **regular (permanent) booked days** (Mon–Fri). Casual-only children have no regular days. If OWNA shows the child's ID (for example in the page address), include it.
2. **Attendance, for every day in the period:** for every child booked that day, each session (before school `bsc`, after school `asc`, holiday/vacation care `vc`): did they sign in, sign-in/out times if shown, and whether it was a **casual** booking.

**Send one request per centre:**

`POST https://amanaoshc.company/api/cowork/owna/run`

```json
{
  "serviceCode": "MFIS-GA",
  "runType": "midweek",
  "periodStart": "2026-10-19",
  "periodEnd": "2026-10-21",
  "children": [
    {
      "ownaChildId": "optional-if-visible",
      "firstName": "Yusuf",
      "surname": "Khan",
      "dob": "2018-03-02",
      "room": "Juniors",
      "active": true,
      "bookedDays": { "monday": false, "tuesday": true, "wednesday": false, "thursday": true, "friday": false }
    }
  ],
  "attendance": [
    { "firstName": "Yusuf", "surname": "Khan", "dob": "2018-03-02", "date": "2026-10-21", "session": "asc", "signedIn": true, "signInTime": "15:12", "signOutTime": "17:40", "casual": false },
    { "firstName": "Maryam", "surname": "Ali", "dob": "2019-07-14", "date": "2026-10-21", "session": "bsc", "signedIn": false, "casual": true }
  ]
}
```

Rules:
- `runType` is `"midweek"` on Wednesdays and `"end_of_week"` on Fridays.
- Dates are `YYYY-MM-DD`. Always include `dob` when OWNA shows it — that's how the dashboard matches a child to their enrolment.
- Include **absent** booked children with `signedIn: false`. Don't leave them out — an absence is information.
- Send the **whole period** each time (re-sending a day is safe; it overwrites).
- The response tells you `children`, `attendance`, `signedIn`, `matched` (children matched to enrolments) and `errors`. A `207` status means it ran with errors — report them. A `404` means the service code is wrong.

**After each run, post a short summary** to the "OWNA data runs" Cowork report: per centre, sessions this week, sign-ins, absences, and `matched`. Flag any centre where `matched` is 0 but children have recently enrolled — that usually means a name or date of birth differs between OWNA and the enrolment form.

## 2. Term materials orders — each term

You already ran Term 4 as a spreadsheet. From now on, the dashboard is the tracker; keep sending it the round.

**When:** whenever the round changes — after you email the centres, after each centre replies (you read their email reply and set `centreHasIt`), when a cart is built, and when Jayden/Daniel checks one out. Sending the whole round again each time is safe: everything updates on its keys.

`POST https://amanaoshc.company/api/cowork/materials`

```json
{
  "round": {
    "key": "2026-T4-weeks-1-4",
    "title": "Term 4 materials (Weeks 1–4)",
    "term": "2026-T4",
    "programStart": "2026-10-12",
    "programEnd": "2026-11-06",
    "repliesDueAt": "2026-10-13T12:00:00+11:00",
    "notes": "Local buys within $30 ($120 at Hoxton Park), receipt to Daniel."
  },
  "centres": [
    { "serviceCode": "AIA-COB", "replyStatus": "replied", "replyAt": "2026-10-12T22:42:00+11:00", "notes": "Thushy replied (cc Tracie)" }
  ],
  "lines": [
    {
      "serviceCode": "AIA-COB",
      "ref": "w2-spray-bottle",
      "week": 2,
      "item": "Spray bottle",
      "qty": 1,
      "unit": null,
      "purpose": "Grow a Chickpea",
      "ifMissing": "hq_order",
      "centreHasIt": "no",
      "orderedAt": null,
      "receivedAt": null,
      "notes": "Label 'water only' on arrival"
    }
  ],
  "carts": [
    {
      "serviceCode": "AIA-COB",
      "retailer": "Kmart",
      "status": "ready",
      "lineCount": 10,
      "total": 65.25,
      "buyLocally": "Clear contact 1 roll; Non-toxic washable paint 1 bottle",
      "otherOrder": "Woolworths week 2: clear cups 11",
      "notes": "Click & Collect nearest the school"
    }
  ]
}
```

Rules:
- `ref` must be stable for a line within a centre, so the same item always updates the same line. Use `w<week>-<item-slug>`, e.g. `w3-marbles`.
- `ifMissing` is where the item goes if the centre doesn't have it: `local_buy` (Week 1 items, bought by the centre within the local-buy limit), `hq_order` (Weeks 2–4, one HQ cart per centre), or `follow_up` (library books, pebbles from the school grounds, recycled boxes from families).
- `centreHasIt` is the centre's answer: `yes`, `no`, `check`, or leave it out if they haven't answered. The dashboard routes the item from that (yes → in stock, check → follow up, no → `ifMissing`). Centres can also answer on the dashboard's Materials Orders page themselves — if a line already has an answer there, don't overwrite it with an older one.
- `replyStatus`: `awaiting`, `reminded`, `partial`, `replied`, `nothing_needed`, `hold`.
- Cart `status`: `draft`, `ready`, `hold`, `checked_out`, `received`, `nothing_needed`. When a cart is checked out, send `"status": "checked_out"` with the final `total` and `checkedOutAt` — the dashboard records that total once as the centre's **program materials** spend, so it comes out of that month's budget (and the budget bank).
- First run: send the whole current Term 4 round from the spreadsheet (all 11 centres, every Order Lines row, every Cart Summary row).

## 3. Receipts for local buys (optional, any time)

When a centre sends a receipt for a local buy, record it against their budget:

`POST https://amanaoshc.company/api/cowork/finance/budget`

```json
{ "serviceCode": "AIA-COB", "items": [ { "name": "Soft footballs (local buy)", "amount": 18.5, "category": "program_materials", "date": "2026-10-13", "notes": "Receipt from Thushy" } ] }
```

Categories: `groceries`, `kitchen`, `sports`, `art_craft`, `furniture`, `technology`, `cleaning`, `safety`, `program_materials`, `other`.

## What the dashboard does with it (so you can check it worked)

- **Financials → Centre breakdown:** sessions, occupancy, revenue, staff cost, spend, bank balance and "data … ago" per centre.
- **Enrolments → Follow-ups:** "First day — did they come?" fills in by itself from sign-ins; "Quiet families" lists families we've checked in with and their answer.
- **Materials Orders** (Operations): the round, each centre's items and carts.
- **Each centre → Finance → Budget:** the budget bank and this month's spend.

Never email families or centres about anything the dashboard already sends (first-day emails, check-ins, reminders). If you think a family needs contacting, say so in your summary instead.
