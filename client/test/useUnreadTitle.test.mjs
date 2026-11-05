import test from "node:test";
import assert from "node:assert/strict";

import { titleWithUnread } from "../src/components/navigation/useUnreadTitle.js";

const BASE = "KRONOS-SPACE · Tu tiempo Tu espacio Tu dominio";

test("sin avisos deja el título limpio", () => {
  assert.equal(titleWithUnread(0, BASE), BASE);
  assert.equal(titleWithUnread(undefined, BASE), BASE);
  assert.equal(titleWithUnread(-2, BASE), BASE);
});

test("antepone la cifra", () => {
  assert.equal(titleWithUnread(4, BASE), `(4) ${BASE}`);
});

test("capa en 99+", () => {
  assert.equal(titleWithUnread(320, BASE), `(99+) ${BASE}`);
});

test("no acumula paréntesis al recalcular sobre un título ya marcado", () => {
  const once = titleWithUnread(3, BASE);
  assert.equal(titleWithUnread(3, once), once);
  assert.equal(titleWithUnread(0, once), BASE);
});

test("tolera títulos ajenos", () => {
  assert.equal(titleWithUnread(1, "Otra página"), "(1) Otra página");
});
