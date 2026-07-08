import { describe, expect, it } from "vitest";

import { buildEventStartAtConstraint, buildEventStartAtFilter } from "../lib/server/network-events";

describe("network event date filters", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  it("omits startAt entirely for an unbounded all query", () => {
    expect(buildEventStartAtFilter({ when: "all", from: null, to: null, now })).toEqual({ ok: true, filter: undefined });
  });

  it("builds upcoming, past, and explicit ranges with valid BSON date constraints", () => {
    expect(buildEventStartAtFilter({ when: "upcoming", from: null, to: null, now })).toEqual({ ok: true, filter: { $type: "date", $gte: now } });
    expect(buildEventStartAtFilter({ when: "past", from: null, to: null, now })).toEqual({ ok: true, filter: { $type: "date", $lt: now } });
    const from = "2026-08-01T00:00:00.000Z";
    const to = "2026-08-31T23:59:59.000Z";
    expect(buildEventStartAtFilter({ when: "all", from, to, now })).toEqual({ ok: true, filter: { $type: "date", $gte: new Date(from), $lte: new Date(to) } });
  });

  it("treats empty date parameters as absent and rejects invalid ranges", () => {
    expect(buildEventStartAtFilter({ when: "all", from: " ", to: "", now })).toEqual({ ok: true, filter: undefined });
    expect(buildEventStartAtFilter({ when: "all", from: "not-a-date", to: null, now })).toEqual({ ok: false, error: "invalid_from_date" });
    expect(buildEventStartAtFilter({ when: "all", from: "2026-09-01", to: "2026-08-01", now })).toEqual({ ok: false, error: "invalid_date_range" });
  });

  it("allows undated drafts only in the owner scope and requires dates publicly", () => {
    expect(buildEventStartAtConstraint(undefined, true)).toEqual({ $or: [{ startAt: { $type: "date" } }, { startAt: { $exists: false } }, { startAt: null }] });
    expect(buildEventStartAtConstraint(undefined, false)).toEqual({ startAt: { $type: "date" } });
    const filter = { $type: "date", $gte: now };
    expect(buildEventStartAtConstraint(filter, true)).toEqual({ startAt: filter });
  });
});
