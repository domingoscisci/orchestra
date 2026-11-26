import { expect, test } from "bun:test";
import { canonicalizePanelBundle } from "../scripts/canonicalize-panel.ts";

const linuxOutput = 'new RegExp("^[ \t]+|(?<![ \t])[ \t]+$","g")';
const canonicalOutput = 'new RegExp("^[ \\t]+|(?<![ \\t])[ \t]+$","g")';

test("canonicalizes platform-specific panel regex escaping", () => {
  expect(canonicalizePanelBundle(linuxOutput)).toBe(canonicalOutput);
});

test("leaves already canonical panel output unchanged", () => {
  expect(canonicalizePanelBundle(canonicalOutput)).toBe(canonicalOutput);
});

test("fails closed when the expected panel regex is missing", () => {
  expect(() => canonicalizePanelBundle("unexpected output")).toThrow(
    "Unexpected panel bundle whitespace-regex output",
  );
});
