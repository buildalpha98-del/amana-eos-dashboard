# SharePoint knowledge export

The slice-1 importer reads a LOCAL directory of `.md` files, one per SharePoint document,
because the repo has no app-only Graph access yet (spec §5.1/§5.2).

## Producing the export (interactive, via the SharePoint connector in a Claude session)

1. For each tree below, list documents with `sharepoint_search` (paginate with `offset`) and,
   for `.docx`/`.pdf` results, fetch the extracted text with `read_resource` on the result `uri`.
2. Write `knowledge-export/<path>.md` where `<path>` is the SharePoint path after the site root,
   e.g. `Shared Documents/NSW & VIC state policies/Procedures/QA2 Rest Time Procedure OSHC V2.docx.md`.
3. Frontmatter (all five keys required):
   ```
   ---
   id: <SharePoint item id>
   name: <file name>
   webUrl: <result webUrl>
   path: <path after site root>
   lastModified: <ISO>
   ---
   ```
   followed by the extracted text.

The frontmatter `path` is what the importer classifies on, so keep it identical to the on-disk
path minus the `.md` suffix.

Trees to export:
- `NSW Schools/Amana OSHC - NSW Service Approval - Reg 168 Policies and Procedures/{Policies,Procedures}`
- `Shared Documents/NSW & VIC state policies/{Policies,Procedures}`
- `Shared Documents/SOPs/Jayden full SOP/**`
- `NSW Schools/<centre>/**` and `Melbourne Schools/<centre>/**` (centre-specific procedures)

Skip: `Shared Documents/SOPs/Amana OSHC AUDIT/**`, `Amana HR Management Review Audit/**`,
anything named contract / payslip / TFN / candidate / resume / CV / WWCC / passport / visa /
police check, images, spreadsheets. The importer re-applies these rules (`SKIP_DIRS` /
`SKIP_FILES` in `sharepoint-export.ts`), so an over-inclusive export is safe.

`knowledge-export/` at the repo root is git-ignored — the export holds full policy text and
must never be committed.

## Importing

```bash
npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export --dry   # classification tally only
npx tsx --env-file=.env.local scripts/import-sharepoint-knowledge.ts --from ./knowledge-export         # local dev DB
```

Production (explicit opt-in, per CLAUDE.md). ONE command, so the prod URL is scoped to
that process and never lingers in the shell for the next `npx prisma …` (the 2026-07-07
wipe and the 2026-08-31 P3009 were both "prod URL still loaded"):
```bash
DATABASE_URL="$(grep '^PROD_DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" ALLOW_PROD_DB=yes npx tsx scripts/import-sharepoint-knowledge.ts --from ./knowledge-export
```

Re-runs are idempotent: unchanged content is a no-op; a new `V<n>` supersedes the old one;
same-version-different-content shows up under CONFLICTS for Daniel to resolve in SharePoint
(also visible in Settings → AI knowledge → Last sync). `superseded` in the counts is the
store-wide total, not this run's delta. A centre folder that matches no Service (or matches
more than one — "Minaret" vs "Minaret Doveton") lands under UNMAPPED and its source is
adapter-excluded until a matching Service exists, then re-activates on the next import.
