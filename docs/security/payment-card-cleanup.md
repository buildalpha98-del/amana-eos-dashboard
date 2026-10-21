# Historical card data: inventory and cleanup plan

Security brief 2026-10-21, batch 2 (finding S04). **This plan has not been run in production.** Running it there is a separate, reviewed change that needs Daniel's sign-off.

## Why

Before 2026-10-02, families could pay by card. Two legacy write paths took a full card number and a security code (CCV): the staff payment edit and parent self-service. Both were encrypted into `EnrolmentSubmission.paymentDetails.raw`, and the staff reveal decrypted and returned them.

Retaining a card security code after authorisation is prohibited even when encrypted (PCI SSC). Batch 2 closes every write path and stops the reveal from returning card fields. This plan covers the values that may already be stored.

## Where card data can be

| Place | What may be there | How it's handled |
| --- | --- | --- |
| `EnrolmentSubmission.paymentDetails.raw` (encrypted) | Full card number, name, expiry, CCV (`ccv` or `cardCcv`) | The script removes `raw` from card records |
| `EnrolmentSubmission.paymentDetails` (open mask) | Normally `lastFour`, `cardType`, `expiryMonth`, `expiryYear`. A degraded write could have left more. | The script removes every card key except `lastFour` and `cardType` |
| Duplicated enrolments (`/api/enrolments/[id]/duplicate`) | A copy of the same `paymentDetails` | Covered: every row is scanned |
| Application logs | None expected: routes logged the method only | Spot-check the Vercel log retention window. Logs age out on their own. |
| CSV exports and printed enrolment PDFs | Masks only (`lastFour`, `cardType`) | No action. The PDF never printed a full number. |
| Database backups and point-in-time recovery (Neon) | Copies of the rows above until they age out of retention | Record the retention window. Don't restore a pre-cleanup backup into a live environment without re-running the cleanup. |
| Neon branches and preview databases | Copies of production taken before cleanup | List the branches, delete any stale ones, and re-run the cleanup on any that must be kept |

`EnrolmentDraft` never held payment details: payment isn't part of the draft. The `Payment` model records how a payment was received, never a card number.

## The script

`scripts/payment-card-inventory.ts` (see its header):

- **Dry run by default.** It classifies every record as `bank_only`, `card_data`, `card_keys_in_open_mask`, `no_encrypted_copy` or `undecryptable`.
- **Report contents.** `--report=` writes record IDs, classifications and the *names* of card keys found. It never writes values.
- **`--apply --actor=<userId>`** removes card data from card records only and writes one `ActivityLog` row per record (`payment_card_data_removed`).
- **Bank records are excluded by construction.** A `bank_account` record whose copy also holds card values is *held for manual review*, not changed.
- **Undecryptable records are reported and never changed.** If many appear, the wrong `FIELD_ENCRYPTION_KEY` is loaded: stop.
- **Local only.** It refuses any `DATABASE_URL` that isn't `localhost`/`127.0.0.1`, with no override flag.

### Synthetic rehearsal (21 Oct 2026, local `amana_local`, throwaway key)

Five synthetic records: one bank, two encrypted card records (public-form and portal key names), one card number left in the open mask, and one bank record that also held a CCV.

| Step | Result |
| --- | --- |
| Dry run | 5 scanned. `bank_only` 1, `card_data` 3, `card_keys_in_open_mask` 1. 4 candidates. |
| `--apply` with no `--actor` | Refused |
| `--apply --actor` | 3 cleaned. 1 held for review (the bank record with a CCV). |
| Reconcile (dry run again) | `bank_only` 1, `no_encrypted_copy` 3, `card_data` 1 (the held record). The bank record was untouched. |
| Wrong key | All encrypted records read `undecryptable`, and nothing changed |

The synthetic rows were deleted afterwards.

## Production execution (not done — needs a reviewed change)

1. Take a fresh Neon backup or branch and record its ID and retention window.
2. Create an isolated Neon branch from production. Run the **dry run** against it from a machine with the production `FIELD_ENCRYPTION_KEY`. This needs a reviewed change to the script's host guard for that one branch.
3. Review the report with Daniel:
   - candidate count;
   - any `undecryptable` rows;
   - any bank records held for manual review.
4. Decide what to tell the affected families, if anything, with the responsible adviser.
5. Run `--apply --actor=<Daniel's id>` against production in a supervised window, then dry-run again to reconcile (expect zero `card_data` candidates apart from records held for review).
6. Handle held records by hand. Bank details stay; any card value is removed.
7. Delete stale Neon branches taken before the cleanup. Note when backup retention will have aged out the old copies.
8. Record the outcome (counts, date, actor, backup ID) in this file.

Valid bank details and other financial records are kept throughout. Any future card payments must use a payment provider's hosted collection and tokens.
