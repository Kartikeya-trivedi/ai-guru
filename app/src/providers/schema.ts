/**
 * JSON Schema translation between provider dialects.
 *
 * Our schemas are written for Gemini, which accepts a plain subset of JSON
 * Schema and treats anything outside `required` as genuinely optional.
 * OpenAI-style structured outputs (which Groq implements) are stricter in
 * strict mode: every object must set `additionalProperties: false`, and every
 * declared property must appear in `required`. Optionality is expressed by
 * letting the value be null instead of by leaving it out.
 *
 * The alternative was Groq's best-effort mode, which accepts our schemas
 * as-is but, in their own words, may return valid JSON that does not match
 * them. Assessment output drives the depth controller and the final report,
 * so "usually the right shape" is not good enough — we translate instead.
 */

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Widen a schema node so null is an accepted value. */
function nullable(node: Node): Node {
  const t = node.type;
  if (typeof t === "string") return { ...node, type: [t, "null"] };
  if (Array.isArray(t)) return t.includes("null") ? node : { ...node, type: [...t, "null"] };
  // No declared type (anyOf, $ref, ...) — leave it be rather than guess.
  return node;
}

/**
 * Rewrite a Gemini-style schema into one strict-mode will accept, preserving
 * which fields were genuinely optional by making those nullable.
 */
export function toStrictSchema(schema: object): object {
  if (!isNode(schema)) return schema;
  const node: Node = { ...schema };

  if (node.type === "array" && isNode(node.items)) {
    node.items = toStrictSchema(node.items);
    return node;
  }

  if (!isNode(node.properties)) return node;

  const wasRequired = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
  const keys = Object.keys(node.properties);
  const properties: Node = {};

  for (const key of keys) {
    const child = node.properties[key];
    const converted = isNode(child) ? toStrictSchema(child) : child;
    properties[key] =
      wasRequired.has(key) || !isNode(converted) ? converted : nullable(converted);
  }

  node.properties = properties;
  // Strict mode demands every property be required; optionality now lives in
  // the nullable types above.
  node.required = keys;
  node.additionalProperties = false;
  return node;
}

/**
 * Drop nulls that strict mode produced for fields our types call optional.
 *
 * Without this, a schema-optional string arrives as `null` rather than
 * absent, and every downstream `?? fallback` silently stops working.
 */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as unknown as T;
  if (!isNode(value)) return value;
  const out: Node = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null) continue;
    out[k] = stripNulls(v);
  }
  return out as T;
}
