# SKYJACK Financial Intelligence

A financial investigation prototype built for Business Technologies Guelph’s **Prompt to Pitch 2026**, where our team placed **second overall**. Finance has the costs; Trade has shipment and customs records. We built a workflow that helps a reviewer connect those records, understand why a cost was flagged, and prepare an evidence-backed management brief.

This is a student case competition project, not a SKYJACK product or a connection to its systems. Use synthetic demonstration data only.

## What to explore

- **Data Gateway:** Import sample ledger or customs CSV/XLSX files, map columns, and review validation results before using the data.
- **Investigations:** Start from a flagged cost, trace related records in the financial digital thread, and follow the review or approval workflow.
- **Ask SKYJACK:** Ask a question about the in-app evidence. The interface offers a deterministic lookup when Gemini is unavailable.
- **Report Studio:** Preview a management brief and export a PowerPoint or spreadsheet for offline review.

## How it works

| Layer | Implementation |
| --- | --- |
| Interface | React, TypeScript and Vite; dedicated views for intake, investigations, approvals and reporting |
| Financial logic | [Ingestion](src/domain/ingestionPipeline.ts), [rules](src/domain/rulesEngine.ts) and the [digital thread](src/domain/digitalThreadBuilder.ts) are separate from the views, so the review flow does not depend on an AI response |
| AI | [Express endpoints](server.ts) call Gemini server-side. [Grounded queries](src/domain/groundedQueryService.ts) assemble context from app records and the [client service](src/services/aiService.ts) validates grounded responses and supports a non-AI lookup |
| Identity and storage | Supabase Auth and [server-assigned roles](supabase/migrations/) support configured demo sign-in. [Demo workflow state](src/repositories/costIntelligenceRepo.ts) persists in browser storage, not in a shared financial database |

The design choice I’d highlight: a financial review needs numbers people can trace. We use rules and record relationships for the findings, and AI for explanation. AI output is not an approval or a source of financial truth.

## Run locally

The repository has a Bun lockfile.

```bash
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). To go past sign-in, use a dedicated Supabase demo project, apply the checked-in [migrations](supabase/migrations/), set the URL and publishable-key variables in `.env`, and provision the demo roles with `bun run scripts/provision-demo-users.ts` using that project's server-side provisioning variables. See [`.env.example`](.env.example) for the list. Gemini is optional, and its key belongs on the server only.

```bash
bun run lint
bun run check:opportunity-scope
bun run check:auth-access
bun run build
```

There is no production ERP or customs integration. Review state and approvals demonstrate the experience; they are not a production-grade audit trail.
