import assert from "node:assert/strict";
import test from "node:test";
import { reservationBucketKeys } from "../services/booking";

test("reservation buckets share a key for overlapping appointment intervals", () => {
  const first = reservationBucketKeys(
    new Date("2026-05-10T10:00:00Z"),
    new Date("2026-05-10T11:00:00Z"),
  );
  const overlapping = reservationBucketKeys(
    new Date("2026-05-10T10:45:00Z"),
    new Date("2026-05-10T11:45:00Z"),
  );
  assert.ok(first.some((bucket) => overlapping.includes(bucket)));
});

test("back-to-back appointment intervals do not share a bucket", () => {
  const first = reservationBucketKeys(
    new Date("2026-05-10T10:00:00Z"),
    new Date("2026-05-10T11:00:00Z"),
  );
  const next = reservationBucketKeys(
    new Date("2026-05-10T11:00:00Z"),
    new Date("2026-05-10T12:00:00Z"),
  );
  assert.equal(first.some((bucket) => next.includes(bucket)), false);
});
