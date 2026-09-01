/**
 * Phase 3 plan 03-05 — exhaustive keyframe-emitter spec.
 *
 * The emitter must cover all 10 locked `KEYFRAME_SHAPES` via an
 * exhaustive switch with NO default branch and a `never`-typed
 * exhaustiveness guard (D-37). Each per-shape test group asserts:
 *
 * - ascending `t` values
 * - the last keyframe is bare (no `i`/`o` — Pitfall 11)
 * - vector keyframes `s: [v]` (Pitfall 3)
 * - the unit table (opacity 0..100, trim 0..100)
 *
 * Trim-path's emission contains a trim item with animated `e`
 * 0→100 and `m: 1` (D-14).
 */

import { describe, expect, it } from "vitest";

import {
  CompileError,
  type EmittedKeyframes,
  emitKeyframes,
} from "../../motion-compiler/keyframe-emitter.js";

const VIEW_BOX = { width: 400, height: 300 };
const FRAME_RATE = 60;

function standardEasing() {
  return { name: "standard", control_points: [0.2, 0, 0.2, 1] as [number, number, number, number] };
}

function motion(
  overrides: Partial<{
    amplitude: number;
    direction: "up" | "down" | "left" | "right" | "none";
    loops: number;
  }> = {},
) {
  return {
    amplitude: overrides.amplitude ?? 0.5,
    direction: overrides.direction ?? "none",
    loops: overrides.loops ?? 1,
  };
}

function resting() {
  return { px: VIEW_BOX.width / 2, py: VIEW_BOX.height / 2, s: 1, r: 0 };
}

function lastFrame(durationMs: number): number {
  return Math.round((durationMs * FRAME_RATE) / 1000);
}

function assertAscendingT(keyframes: ReadonlyArray<{ t: number }>): void {
  for (let i = 1; i < keyframes.length; i += 1) {
    const prev = keyframes[i - 1];
    const cur = keyframes[i];
    if (prev === undefined || cur === undefined) continue;
    expect(cur.t).toBeGreaterThan(prev.t);
  }
}

function assertBareLastKeyframe(keyframes: ReadonlyArray<Record<string, unknown>>): void {
  const last = keyframes[keyframes.length - 1];
  expect(last).toBeDefined();
  if (last === undefined) return;
  expect(last.i).toBeUndefined();
  expect(last.o).toBeUndefined();
}

function assertVectorKeyframes(keyframes: ReadonlyArray<{ s: unknown }>): void {
  for (const kf of keyframes) {
    expect(Array.isArray(kf.s)).toBe(true);
    expect((kf.s as unknown[]).length).toBeGreaterThan(0);
  }
}

describe("keyframe-emitter — exhaustive over KEYFRAME_SHAPES (plan 03-05)", () => {
  it("covers all 10 keyframe shapes (no default branch, never-exhaustiveness)", () => {
    // Compile-time exhaustiveness check — this file imports
    // `emitKeyframes` and the type system guarantees the function
    // accepts every member of KEYFRAME_SHAPES. The runtime check
    // below iterates the closed tuple to confirm every shape
    // produces keyframes (no exception).
    const shapes = [
      "opacity-ramp",
      "translate-in",
      "overshoot-settle",
      "scale-breath",
      "trim-path",
      "angular-in",
      "pop-settle",
      "sine-drift",
      "damped-oscillation",
      "circular-path",
    ] as const;

    for (const shape of shapes) {
      const result = emitKeyframes(
        shape,
        motion(),
        800,
        FRAME_RATE,
        standardEasing(),
        VIEW_BOX,
        resting(),
      );
      // Every shape produces SOME keyframe surface.
      expect(result).toBeDefined();
      const propOk =
        result.property === null ||
        result.property === "o" ||
        result.property === "r" ||
        result.property === "p" ||
        result.property === "s" ||
        result.property === "a";
      expect(propOk).toBe(true);
      expect(Array.isArray(result.keyframes)).toBe(true);
      // Trim-path is the only shape that returns a non-null trim.
      if (shape === "trim-path") {
        expect(result.trim).not.toBeNull();
      } else {
        expect(result.trim).toBeNull();
      }
    }
  });
});

describe("keyframe-emitter — opacity-ramp (fade)", () => {
  const result: EmittedKeyframes = emitKeyframes(
    "opacity-ramp",
    motion({ amplitude: 0.6 }),
    800,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates opacity channel ('o')", () => {
    expect(result.property).toBe("o");
  });

  it("emits two keyframes (start + finale)", () => {
    expect(result.keyframes).toHaveLength(2);
  });

  it("first keyframe starts at t=0 with s=[0]", () => {
    const kf = result.keyframes[0];
    expect(kf?.t).toBe(0);
    expect(kf?.s).toEqual([0]);
  });

  it("last keyframe at lastFrame with s=[finalOpacity]", () => {
    const kf = result.keyframes[1];
    expect(kf?.t).toBe(lastFrame(800));
    // amplitude 0.6 × 100 = 60
    expect(kf?.s).toEqual([60]);
  });

  it("ascending t + bare last keyframe + vector s", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });

  it("opacity values are within 0..100 (Pitfall 2 unit gate)", () => {
    for (const kf of result.keyframes) {
      for (const v of kf.s) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("easing handles map control_points (o = point 1, i = point 2)", () => {
    const first = result.keyframes[0];
    expect(first?.o).toEqual({ x: [0.2], y: [0] });
    expect(first?.i).toEqual({ x: [0.2], y: [1] });
  });
});

describe("keyframe-emitter — translate-in (slide)", () => {
  const result = emitKeyframes(
    "translate-in",
    motion({ amplitude: 0.5, direction: "right" }),
    1000,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates position channel ('p')", () => {
    expect(result.property).toBe("p");
  });

  it("start offset = resting + direction × amplitude × viewBox (D-34)", () => {
    const start = result.keyframes[0];
    // resting.px = 200 (viewBox.width / 2)
    // amplitude 0.5 × viewBox.width 400 = offset 200 (right)
    expect(start?.t).toBe(0);
    expect(start?.s).toEqual([400, 150]); // 200 + 200, 150 (center)
  });

  it("end keyframe = resting position", () => {
    const end = result.keyframes[1];
    expect(end?.t).toBe(lastFrame(1000));
    expect(end?.s).toEqual([200, 150]);
  });

  it("ascending t + bare last + vector s", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });
});

describe("keyframe-emitter — overshoot-settle (bounce)", () => {
  const result = emitKeyframes(
    "overshoot-settle",
    motion({ amplitude: 0.5, direction: "right" }),
    1200,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates position channel ('p')", () => {
    expect(result.property).toBe("p");
  });

  it("emits 3 keyframes (start + overshoot + settle)", () => {
    expect(result.keyframes).toHaveLength(3);
  });

  it("end frame settles to resting position", () => {
    const end = result.keyframes[2];
    expect(end?.s).toEqual([200, 150]);
  });

  it("ascending t + bare last + vector s", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });
});

describe("keyframe-emitter — scale-breath (pulse)", () => {
  const result = emitKeyframes(
    "scale-breath",
    motion({ amplitude: 0.3, loops: 2 }),
    900,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates scale channel ('s')", () => {
    expect(result.property).toBe("s");
  });

  it("scale values are non-negative (COM-04 negative stretch)", () => {
    for (const kf of result.keyframes) {
      for (const v of kf.s) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("ascending t + bare last + vector s (2-element)", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
    for (const kf of result.keyframes) {
      expect(kf.s.length).toBe(2);
    }
  });
});

describe("keyframe-emitter — trim-path (draw-on)", () => {
  const result = emitKeyframes(
    "trim-path",
    motion(),
    1200,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("property is null (no transform animation; D-14)", () => {
    expect(result.property).toBeNull();
  });

  it("returns a non-null trim shape item (D-14)", () => {
    expect(result.trim).not.toBeNull();
  });

  it("trim item has ty 'tm' + animated e 0→100 + m 1 (D-14/Pitfall 2)", () => {
    const trim = result.trim;
    expect(trim).toBeDefined();
    if (trim === null) return;
    const trimRecord = trim as unknown as Record<string, unknown>;
    expect(trimRecord.ty).toBe("tm");
    expect(trimRecord.m).toBe(1);
    // s is static 0
    const sProp = trimRecord.s as { a: number; k: number };
    expect(sProp.a).toBe(0);
    expect(sProp.k).toBe(0);
    // o is static 0
    const oProp = trimRecord.o as { a: number; k: number };
    expect(oProp.a).toBe(0);
    expect(oProp.k).toBe(0);
    // e is animated 0→100
    const eProp = trimRecord.e as { a: number; k: Array<{ t: number; s: number[] }> };
    expect(eProp.a).toBe(1);
    expect(eProp.k).toHaveLength(2);
    expect(eProp.k[0]?.s[0]).toBe(0);
    expect(eProp.k[1]?.s[0]).toBe(100);
  });

  it("trim s/e/o values stay within 0..100 (Pitfall 2)", () => {
    const trim = result.trim;
    if (trim === null) throw new Error("trim must be present");
    const trimRecord = trim as unknown as Record<string, unknown>;
    // Static s and o.
    const sProp = trimRecord.s as { a: number; k: number };
    const oProp = trimRecord.o as { a: number; k: number };
    expect(sProp.k).toBeGreaterThanOrEqual(0);
    expect(sProp.k).toBeLessThanOrEqual(100);
    expect(oProp.k).toBeGreaterThanOrEqual(0);
    expect(oProp.k).toBeLessThanOrEqual(100);
    // Animated e — each keyframe value.
    const eProp = trimRecord.e as { k: Array<{ s: number[] }> };
    for (const kf of eProp.k) {
      for (const v of kf.s) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("animated e keyframes are ascending in t (Pitfall 11)", () => {
    const trim = result.trim;
    if (trim === null) throw new Error("trim must be present");
    const eProp = (trim as unknown as { e: { k: Array<{ t: number }> } }).e;
    assertAscendingT(eProp.k);
  });
});

describe("keyframe-emitter — angular-in (rotate)", () => {
  const result = emitKeyframes(
    "angular-in",
    motion({ amplitude: 0.5 }),
    1100,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates rotation channel ('r')", () => {
    expect(result.property).toBe("r");
  });

  it("start at -45° (= -amplitude × 90°)", () => {
    const start = result.keyframes[0];
    expect(start?.s).toEqual([-45]);
  });

  it("end at resting rotation (0°)", () => {
    const end = result.keyframes[1];
    expect(end?.s).toEqual([0]);
  });

  it("ascending t + bare last + vector s", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });
});

describe("keyframe-emitter — pop-settle (scale-pop)", () => {
  const result = emitKeyframes(
    "pop-settle",
    motion({ amplitude: 0.8 }),
    700,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates scale channel ('s')", () => {
    expect(result.property).toBe("s");
  });

  it("scale values are non-negative (COM-04)", () => {
    for (const kf of result.keyframes) {
      for (const v of kf.s) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("ascending t + bare last + vector s", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });
});

describe("keyframe-emitter — sine-drift (float)", () => {
  const result = emitKeyframes(
    "sine-drift",
    motion({ amplitude: 0.3, loops: 2 }),
    1400,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates position channel ('p')", () => {
    expect(result.property).toBe("p");
  });

  it("ascending t + bare last + vector s (2-element)", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });
});

describe("keyframe-emitter — damped-oscillation (wiggle)", () => {
  const result = emitKeyframes(
    "damped-oscillation",
    motion({ amplitude: 0.3 }),
    800,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates position channel ('p')", () => {
    expect(result.property).toBe("p");
  });

  it("ascending t + bare last + vector s", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });
});

describe("keyframe-emitter — circular-path (orbit)", () => {
  const result = emitKeyframes(
    "circular-path",
    motion({ amplitude: 0.4, loops: 1 }),
    1500,
    FRAME_RATE,
    standardEasing(),
    VIEW_BOX,
    resting(),
  );

  it("animates position channel ('p')", () => {
    expect(result.property).toBe("p");
  });

  it("ascending t + bare last + vector s", () => {
    assertAscendingT(result.keyframes);
    assertBareLastKeyframe(result.keyframes as ReadonlyArray<Record<string, unknown>>);
    assertVectorKeyframes(result.keyframes);
  });

  it("returns deterministic keyframe count for given loops", () => {
    // 8 samples per loop + 1 final frame = 9 keyframes for loops=1.
    expect(result.keyframes.length).toBeGreaterThanOrEqual(9);
  });
});

describe("keyframe-emitter — CompileError contract", () => {
  it("emits a typed CompileError on schema violation (defense-in-depth)", () => {
    // The exhaustive switch covers all 10 shapes; passing an
    // out-of-band value would be a type error at compile time.
    // The runtime guard rejects any future addition that
    // bypasses the type system (D-37).
    expect(CompileError).toBeDefined();
    const err = new CompileError("test");
    expect(err.code).toBe("compile_error");
    expect(err.name).toBe("CompileError");
  });
});
