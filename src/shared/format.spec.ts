import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fmt, serializeDeterministicJson, writeDeterministicJson } from "./format.js";

/**
 * Exact-case matrix for the D-35 numeric format regime + the D-23/D-24
 * deterministic JSON serializer (`src/shared/format.ts`).
 *
 * Every assertion in the `fmt()` matrix uses only values that are exact in
 * IEEE-754 binary floating-point (`0`, `2.5`, `1/3`, `1/2`, integer
 * values) or that are exact by the ECMA-262 `toFixed(4)` contract. The
 * non-exact case `0.1 + 0.2` is included because it is the canonical
 * shortest-roundtrip trap (`JSON.stringify` emits `"0.30000000000000004"`)
 * that D-35 was introduced to bypass.
 *
 * This file is the test guarantee that D-23 (byte-for-byte idempotence)
 * and D-35 (canonical decimal format) hold for every Phase 3 producer of
 * bytes. The serializer assertions cover (i) compactness — no whitespace
 * emitted, (ii) key insertion order, (iii) every float via `fmt()`, (iv)
 * the trailing-`\n` byte discipline (D-24 + Pitfall 9).
 */

describe("fmt() — D-35 canonical decimal formatter", () => {
  it("whole-number integers", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(1)).toBe("1");
    expect(fmt(100)).toBe("100");
    expect(fmt(2048)).toBe("2048");
  });

  it("exact binary fractions (1/2, 1/4, 1/8, 1/16, 1/32, 1/64)", () => {
    expect(fmt(0.5)).toBe("0.5");
    expect(fmt(0.25)).toBe("0.25");
    expect(fmt(0.125)).toBe("0.125");
    expect(fmt(0.0625)).toBe("0.0625");
  });

  it("toFixed(4) rounds before strip (cross-engine ECMA-262 contract)", () => {
    expect(fmt(0.03125)).toBe("0.0313");
    expect(fmt(0.015625)).toBe("0.0156");
  });

  it("exact-binary positive floats in [1, 10)", () => {
    expect(fmt(1.5)).toBe("1.5");
    expect(fmt(2.5)).toBe("2.5");
    expect(fmt(3.5)).toBe("3.5");
    expect(fmt(2.25)).toBe("2.25");
  });

  it("non-exact floats are rounded by toFixed(4) then stripped (D-35)", () => {
    expect(fmt(0.1 + 0.2)).toBe("0.3");
    expect(fmt(0.1)).toBe("0.1");
    expect(fmt(1 / 3)).toBe("0.3333");
    expect(fmt(2 / 3)).toBe("0.6667");
  });

  it("negative exact-binary fractions", () => {
    expect(fmt(-0.5)).toBe("-0.5");
    expect(fmt(-2.5)).toBe("-2.5");
    expect(fmt(-1 / 3)).toBe("-0.3333");
  });

  it("negative zero maps to '0' (D-35 normalization)", () => {
    expect(fmt(-0)).toBe("0");
    expect(fmt(-0.0)).toBe("0");
  });

  it("values below the 4-decimal threshold collapse to '0' (residual '-0' remapped)", () => {
    expect(fmt(0.00001)).toBe("0");
    expect(fmt(-0.00001)).toBe("0");
  });

  it("trailing zeros are stripped, dangling dot is removed", () => {
    expect(fmt(1.1)).toBe("1.1");
    expect(fmt(1.1 + 0)).toBe("1.1");
  });

  it("the largest in-bounds value at the 1e21 guard is rejected", () => {
    expect(() => fmt(1e21)).toThrow(/outside project bounds/);
    expect(() => fmt(-1e21)).toThrow(/outside project bounds/);
    expect(() => fmt(2e21)).toThrow(/outside project bounds/);
  });

  it("a value just below the 1e21 guard formats normally", () => {
    expect(fmt(2 ** 50)).toBe("1125899906842624");
    expect(fmt(2 ** 60)).toBe("1152921504606846976");
  });

  it("NaN is rejected (non-finite guard)", () => {
    expect(() => fmt(Number.NaN)).toThrow(/non-finite input/);
  });

  it("Infinity and -Infinity are rejected (non-finite guard)", () => {
    expect(() => fmt(Number.POSITIVE_INFINITY)).toThrow(/non-finite input/);
    expect(() => fmt(Number.NEGATIVE_INFINITY)).toThrow(/non-finite input/);
  });
});

describe("serializeDeterministicJson() — D-23/D-24 compact walker", () => {
  it("primitives", () => {
    expect(serializeDeterministicJson(null)).toBe("null");
    expect(serializeDeterministicJson(true)).toBe("true");
    expect(serializeDeterministicJson(false)).toBe("false");
    expect(serializeDeterministicJson(0)).toBe("0");
    expect(serializeDeterministicJson(2.5)).toBe("2.5");
    expect(serializeDeterministicJson(0.1 + 0.2)).toBe("0.3");
    expect(serializeDeterministicJson("hello")).toBe('"hello"');
  });

  it("negative zero normalizes to '0' inside the tree", () => {
    expect(serializeDeterministicJson(-0)).toBe("0");
    expect(serializeDeterministicJson({ x: -0 })).toBe('{"x":0}');
  });

  it("floats are routed through fmt() — no shortest-roundtrip leakage", () => {
    expect(serializeDeterministicJson({ v: 0.1 + 0.2 })).toBe('{"v":0.3}');
    expect(serializeDeterministicJson({ v: 1 / 3 })).toBe('{"v":0.3333}');
    expect(serializeDeterministicJson({ v: 100 })).toBe('{"v":100}');
  });

  it("compact (no whitespace at any nesting level)", () => {
    const obj = {
      a: 1,
      b: [1, 2, 3],
      c: { d: 4, e: [5, 6] },
    };
    const out = serializeDeterministicJson(obj);
    expect(out).not.toMatch(/\s/);
    expect(out).toBe('{"a":1,"b":[1,2,3],"c":{"d":4,"e":[5,6]}}');
  });

  it("preserves key insertion order (no implicit sort)", () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(serializeDeterministicJson(obj)).toBe('{"z":1,"a":2,"m":3}');
  });

  it("string escaping is the standard JSON contract", () => {
    expect(serializeDeterministicJson("a\nb")).toBe('"a\\nb"');
    expect(serializeDeterministicJson('say "hi"')).toBe('"say \\"hi\\""');
    expect(serializeDeterministicJson("with \\backslash")).toBe('"with \\\\backslash"');
    expect(serializeDeterministicJson("tab\there")).toBe('"tab\\there"');
    expect(serializeDeterministicJson("\u0001")).toBe('"\\u0001"');
  });

  it("nested arrays + objects in one tree", () => {
    const tree = {
      type: "fade",
      params: { amplitude: 0.5, loop: [0, 1, 2] },
      flags: [true, false, null],
    };
    expect(serializeDeterministicJson(tree)).toBe(
      '{"type":"fade","params":{"amplitude":0.5,"loop":[0,1,2]},"flags":[true,false,null]}',
    );
  });

  it("NaN/Infinity at any depth fails loud", () => {
    expect(() => serializeDeterministicJson({ x: Number.NaN })).toThrow(/non-finite input/);
    expect(() => serializeDeterministicJson([Number.POSITIVE_INFINITY])).toThrow(
      /non-finite input/,
    );
  });

  it("unsupported value types fail loud (no silent undefined substitution)", () => {
    expect(() => serializeDeterministicJson(undefined)).toThrow(/unsupported value/);
    expect(() => serializeDeterministicJson(() => 0)).toThrow(/unsupported value/);
    expect(() => serializeDeterministicJson(Symbol("s"))).toThrow(/unsupported value/);
  });
});

describe("writeDeterministicJson() — file writer", () => {
  it("writes compact JSON terminated by exactly one 0x0a byte (D-24 + Pitfall 9)", () => {
    const dir = mkdtempSync(join(tmpdir(), "format-spec-"));
    const file = join(dir, "out.json");
    writeDeterministicJson(file, { a: 1, b: [2, 3] });
    const buf = readFileSync(file);
    expect(buf.length).toBe('{"a":1,"b":[2,3]}\n'.length);
    expect(buf[buf.length - 1]).toBe(0x0a);
    expect(buf.toString("utf-8")).toBe('{"a":1,"b":[2,3]}\n');
  });

  it("roundtrip is byte-exact against serializeDeterministicJson + '\\n'", () => {
    const dir = mkdtempSync(join(tmpdir(), "format-spec-"));
    const file = join(dir, "out.json");
    const value = { a: 0.1 + 0.2, b: "hello", c: [1, 2, 3] };
    writeDeterministicJson(file, value);
    const fileBytes = readFileSync(file);
    const expected = `${serializeDeterministicJson(value)}\n`;
    expect(fileBytes.toString("utf-8")).toBe(expected);
  });

  it("floats via fmt() survive the file hop", () => {
    const dir = mkdtempSync(join(tmpdir(), "format-spec-"));
    const file = join(dir, "out.json");
    writeDeterministicJson(file, { x: 0.1 + 0.2, y: 1 / 3 });
    const text = readFileSync(file, "utf-8");
    expect(text).toBe('{"x":0.3,"y":0.3333}\n');
  });

  it("writeFileSync fails loud on a bad path (does not silently drop)", () => {
    expect(() => writeDeterministicJson("/this/path/does/not/exist/x.json", {})).toThrow();
  });

  it("is stable across multiple invocations (determinism, D-23)", () => {
    const dir = mkdtempSync(join(tmpdir(), "format-spec-"));
    const a = join(dir, "a.json");
    const b = join(dir, "b.json");
    const value = { z: 1, a: 2, n: { nested: [0.1, 0.2, 0.3] } };
    writeDeterministicJson(a, value);
    writeDeterministicJson(b, value);
    expect(readFileSync(a).equals(readFileSync(b))).toBe(true);
  });
});
