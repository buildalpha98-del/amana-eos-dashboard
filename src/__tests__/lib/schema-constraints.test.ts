import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Schema constraint tests — verify that critical unique constraints
 * and indexes exist in the Prisma schema.
 *
 * These tests catch accidental removal of DB-level constraints during
 * schema edits. They parse the schema file directly rather than testing
 * against a live database.
 *
 * LIMITATION: These tests verify the schema FILE contains the constraint
 * declarations, not that migrations have been applied to the actual DB.
 * A passing test here + a missing migration = constraints in code but
 * not in production. Always run `prisma migrate dev` after schema changes.
 */

const schemaPath = join(process.cwd(), "prisma/schema.prisma");
const schema = readFileSync(schemaPath, "utf-8");

function getModelBlock(modelName: string): string {
  // Find the model start, then match until we find a closing brace at column 0
  // (handles inline `}` in comments like `// { "action-0": true }`)
  const startIdx = schema.indexOf(`model ${modelName} {`);
  if (startIdx === -1) throw new Error(`Model "${modelName}" not found in schema`);
  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < schema.length; i++) {
    if (schema[i] === "{") depth++;
    if (schema[i] === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return schema.slice(startIdx, endIdx);
}

describe("Prisma schema — unique constraints", () => {
  it("Service.code has @unique", () => {
    const block = getModelBlock("Service");
    expect(block).toMatch(/code\s+String\s+@unique/);
  });

  it("User.email has @unique", () => {
    const block = getModelBlock("User");
    expect(block).toMatch(/email\s+String\s+@unique/);
  });

  it("ApiKey.keyHash has @unique", () => {
    const block = getModelBlock("ApiKey");
    expect(block).toMatch(/keyHash\s+String\s+@unique/);
  });

  it("AuditTemplate.name has @unique", () => {
    const block = getModelBlock("AuditTemplate");
    expect(block).toMatch(/name\s+String\s+@unique/);
  });

  it("Policy.title has @unique", () => {
    const block = getModelBlock("Policy");
    expect(block).toMatch(/title\s+String\s+@unique/);
  });

  it("CrmEmailTemplate.name has @unique", () => {
    const block = getModelBlock("CrmEmailTemplate");
    expect(block).toMatch(/name\s+String\s+@unique/);
  });

  it("WhatsAppGroup.whatsappGroupJid has @unique", () => {
    const block = getModelBlock("WhatsAppGroup");
    expect(block).toMatch(/whatsappGroupJid\s+String\s+@unique/);
  });

  it("CronRun has @@unique([cronName, period])", () => {
    const block = getModelBlock("CronRun");
    expect(block).toContain('@@unique([cronName, period])');
  });

  it("EmailTemplate has @@unique([name, category])", () => {
    const block = getModelBlock("EmailTemplate");
    expect(block).toContain('@@unique([name, category])');
  });

  it("Sequence has @@unique([name, type])", () => {
    const block = getModelBlock("Sequence");
    expect(block).toContain('@@unique([name, type])');
  });

  it("Scenario has @@unique([name, createdById])", () => {
    const block = getModelBlock("Scenario");
    expect(block).toContain('@@unique([name, createdById])');
  });

  it("SequenceStep has @@unique([sequenceId, stepNumber])", () => {
    const block = getModelBlock("SequenceStep");
    expect(block).toContain('@@unique([sequenceId, stepNumber])');
  });

  it("SocialAccount.serviceCode has @unique", () => {
    const block = getModelBlock("SocialAccount");
    expect(block).toMatch(/serviceCode\s+String\s+@unique/);
  });
});

describe("Prisma schema — critical indexes", () => {
  it("Todo has compound index on [assigneeId, status]", () => {
    const block = getModelBlock("Todo");
    expect(block).toContain("@@index([assigneeId, status])");
  });

  it("Todo has compound index on [weekOf, serviceId]", () => {
    const block = getModelBlock("Todo");
    expect(block).toContain("@@index([weekOf, serviceId])");
  });

  it("ActivityLog has compound index on [userId, createdAt]", () => {
    const block = getModelBlock("ActivityLog");
    expect(block).toContain("@@index([userId, createdAt])");
  });

  it("DeliveryLog has index on [status]", () => {
    const block = getModelBlock("DeliveryLog");
    expect(block).toContain("@@index([status])");
  });

  it("DeliveryLog has compound index on [channel, status]", () => {
    const block = getModelBlock("DeliveryLog");
    expect(block).toContain("@@index([channel, status])");
  });

  it("Lead has compound index on [pipelineStage, serviceId]", () => {
    const block = getModelBlock("Lead");
    expect(block).toContain("@@index([pipelineStage, serviceId])");
  });

  it("ParentEnquiry has compound index on [serviceId, stage]", () => {
    const block = getModelBlock("ParentEnquiry");
    expect(block).toContain("@@index([serviceId, stage])");
  });

  it("CoworkReport has compound index on [seat, assignedToId]", () => {
    const block = getModelBlock("CoworkReport");
    expect(block).toContain("@@index([seat, assignedToId])");
  });
});
