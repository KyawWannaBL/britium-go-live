import assert from 'node:assert/strict';
import { parseLocationReviewWorkbook } from '../src/lib/locationReviewWorkbook.ts';

const pickups = [{ pickup_id: 'P0910-BLK-002', expected_parcels: 2, verified_parcels: 2 }];
const entry = {
  'Delivery Way ID': 'P0910-BLK-002-001', 'Pickup ID': 'P0910-BLK-002', 'Parcel Sequence': '1',
  'Township': 'North Dagon', 'Delivery Address': 'Synthetic test address',
  'Corrected Latitude': '16.9', 'Corrected Longitude': '96.2', 'Action': 'APPLY_CORRECTION',
};
const parse = (entries, allowed = pickups) => parseLocationReviewWorkbook(entries, allowed, new Map(), 'review.xlsx');
// Cold start: no original file, draft, or browser workspace is needed.
const [restored] = parse([entry]);
assert.equal(restored.delivery_way_id, entry['Delivery Way ID']);
assert.equal(restored.delivery_address, entry['Delivery Address']);
assert.equal(restored.latitude, 16.9);
assert.deepEqual(parse([entry]), parse([entry]), 'a retried workbook retains its canonical identities');
assert.throws(() => parse([entry], []), /unavailable/);
assert.throws(() => parse([{ ...entry, 'Parcel Sequence': '2' }]), /must match/);
assert.throws(() => parse([{ ...entry, 'Parcel Sequence': '3', 'Delivery Way ID': 'P0910-BLK-002-003' }]), /authorized quantity/);
assert.throws(() => parse([entry, entry]), /Duplicate/);
assert.throws(() => parse([{ ...entry, 'Corrected Latitude': '' }]), /valid Myanmar/);
assert.throws(() => parse([{ ...entry, Action: 'ACCEPT' }]), /Action must/);
assert.throws(() => parse([{ ...entry, Reason: 'short' }]), /10 characters/);
assert.equal(parse([{ ...entry, Action: 'SKIP_REVIEW', 'Suggested Latitude': '16.8', 'Suggested Longitude': '96.1' }])[0].latitude, 16.8);
assert.equal(parse([{ ...entry, 'Corrected Latitude': '17.1' }])[0].latitude, 17.1);
console.log('PASS: cold-start recovery, retry, identities, permissions, capacity, duplicates, coordinates and actions.');
