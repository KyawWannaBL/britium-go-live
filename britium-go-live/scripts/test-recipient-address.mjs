import assert from "node:assert/strict";
import test from "node:test";
import { formatRecipientAddress, mergeAddressLandmarks } from "../src/lib/recipientAddress.ts";

test("sorts a Yangon flat and street corner while preserving the delivery landmark", () => {
  const result = formatRecipientAddress("Yangon, Lanmadaw Township, Ward 5, at the corner of Anawrahta Road and Bo Moe Gyo Street, Flat 7, Room 4, No. 145, near City Mart");
  assert.equal(result.address, "Room 4, Flat 7, No. 145, at the corner of Anawrahta Road and Bo Moe Gyo Street, Ward 5, Lanmadaw Township, Yangon");
  assert.deepEqual(result.landmarks, ["near City Mart"]);
});

test("keeps Mandalay cross streets and a nearby numbered street in the address", () => {
  const result = formatRecipientAddress("Pyigyitagon Township, close to 58th Street, No. 145, between 115st and 116 st, (Ya) Ward, Mandalay");
  assert.equal(result.address, "No. 145, between 115st and 116 st, close to 58th Street, (Ya) Ward, Pyigyitagon Township, Mandalay");
  assert.deepEqual(result.landmarks, []);
});

test("retains Burmese spelling and extracts shop directions", () => {
  const result = formatRecipientAddress("မန္တလေးမြို့၊ ပြည်ကြီးတံခွန်မြို့နယ်၊ (ယ) ရပ်ကွက်၊ (၁၁၅) လမ်းနှင့် (၁၁၆) လမ်းကြား၊ (၅၈) လမ်းအနီး၊ အမှတ် ၃၈-ဒီ၊ စတိုးဆိုင်ဘေး");
  assert.equal(result.address, "အမှတ် ၃၈-ဒီ, (၁၁၅) လမ်းနှင့် (၁၁၆) လမ်းကြား, (၅၈) လမ်းအနီး, (ယ) ရပ်ကွက်, ပြည်ကြီးတံခွန်မြို့နယ်, မန္တလေးမြို့");
  assert.deepEqual(result.landmarks, ["စတိုးဆိုင်ဘေး"]);
});

test("handles common unpunctuated labels and skips missing components", () => {
  assert.equal(formatRecipientAddress("No. 145 Anawrahta Road Ward 5 Lanmadaw Township Yangon").address,
    "No. 145, Anawrahta Road, Ward 5, Lanmadaw Township, Yangon");
  assert.equal(formatRecipientAddress("အမှတ် (၅) အနော်ရထာလမ်း ၅ ရပ်ကွက် လမ်းမတော်မြို့နယ် ရန်ကုန်").address,
    "အမှတ် (၅), အနော်ရထာလမ်း, ၅ ရပ်ကွက်, လမ်းမတော်မြို့နယ်, ရန်ကုန်");
  assert.equal(formatRecipientAddress("East Dagon, No. 2", "East Dagon").address, "No. 2, East Dagon");
  assert.equal(formatRecipientAddress("No. 2", "East Dagon").address, "No. 2");
  assert.equal(formatRecipientAddress("Near the tea shop").address, "");
});

test("retains a street named after a market but removes shop directions on a street", () => {
  const result = formatRecipientAddress("No. 5, Old Market Road near City Mart on 58th Street, Yangon");
  assert.equal(result.address, "No. 5, Old Market Road, Yangon");
  assert.deepEqual(result.landmarks, ["near City Mart on 58th Street"]);
  assert.equal(formatRecipientAddress("Golden Residence, Yangon").needsReview, true);
});

test("replaces only generated remarks and preserves operator edits and fee instructions", () => {
  assert.equal(mergeAddressLandmarks("Call on arrival\nNear the school\n[COD_FEE_ELECTION:COLLECT]", ["Near the school"], ["Opposite the market"]),
    "Call on arrival\n[COD_FEE_ELECTION:COLLECT]\nOpposite the market");
  assert.equal(mergeAddressLandmarks("Near the blue school gate", ["Near the school"], ["Opposite the market"]),
    "Near the blue school gate\nOpposite the market");
});
