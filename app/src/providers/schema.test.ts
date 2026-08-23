import { describe, it, expect } from "vitest";
import { toStrictSchema, stripNulls } from "./schema";
import { ASSESSMENT_SCHEMA } from "../engine/assess";

/**
 * These conversions are invisible when they go wrong: a mis-translated
 * schema produces a request Groq rejects, or worse, output that parses but
 * drops the field the depth controller reads. Both surface as "the interview
 * went weird", not as an error.
 */

describe("toStrictSchema", () => {
  it("requires every property and forbids extras, as strict mode demands", () => {
    const out = toStrictSchema({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    }) as Record<string, unknown>;

    expect(out.required).toEqual(["a", "b"]);
    expect(out.additionalProperties).toBe(false);
  });

  it("preserves optionality by making once-optional fields nullable", () => {
    const out = toStrictSchema({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    }) as { properties: Record<string, { type: unknown }> };

    // 'a' was required, so it stays a plain string.
    expect(out.properties.a.type).toBe("string");
    // 'b' was optional; strict mode has no optional, so null carries it.
    expect(out.properties.b.type).toEqual(["number", "null"]);
  });

  it("recurses into nested objects and array items", () => {
    const out = toStrictSchema({
      type: "object",
      properties: {
        list: {
          type: "array",
          items: { type: "object", properties: { x: { type: "string" } }, required: [] },
        },
      },
      required: ["list"],
    }) as any;

    const item = out.properties.list.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["x"]);
    expect(item.properties.x.type).toEqual(["string", "null"]);
  });

  it("converts the real assessment schema without losing the enum", () => {
    // This is the schema that decides drill vs. move on, so it is the one
    // that actually matters.
    const out = toStrictSchema(ASSESSMENT_SCHEMA as unknown as object) as any;

    expect(out.required).toEqual(["quality", "note", "suggestedProbe", "atKnowledgeLimit"]);
    // quality was required: enum intact, not widened to null.
    expect(out.properties.quality.enum).toContain("evasive");
    expect(out.properties.quality.type).toBe("string");
    // suggestedProbe was optional: now nullable rather than absent.
    expect(out.properties.suggestedProbe.type).toEqual(["string", "null"]);
  });

  it("does not double-add null when a type is already nullable", () => {
    const out = toStrictSchema({
      type: "object",
      properties: { a: { type: ["string", "null"] } },
      required: [],
    }) as any;
    expect(out.properties.a.type).toEqual(["string", "null"]);
  });
});

describe("stripNulls", () => {
  it("drops the nulls strict mode emits for optional fields", () => {
    // Without this, `assessment.suggestedProbe` is null rather than absent
    // and every `?? fallback` downstream silently stops firing.
    expect(stripNulls({ quality: "strong", suggestedProbe: null })).toEqual({ quality: "strong" });
  });

  it("recurses through nested objects and arrays", () => {
    expect(stripNulls({ a: [{ b: null, c: 1 }], d: { e: null } })).toEqual({ a: [{ c: 1 }], d: {} });
  });

  it("leaves falsy-but-real values alone", () => {
    expect(stripNulls({ n: 0, s: "", b: false })).toEqual({ n: 0, s: "", b: false });
  });
});
