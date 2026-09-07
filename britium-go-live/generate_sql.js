import fs from 'fs';
const sqlData = `BEGIN;
UPDATE public.be_portal_pickup_requests SET corrected_latitude = 19.7431, corrected_longitude = 96.1132 WHERE pickup_id = 'P0905-KSC-003-010' OR deliver_id = 'P0905-KSC-003-010' OR waybill_no = 'P0905-KSC-003-010';
UPDATE public.be_portal_pickup_requests SET corrected_latitude = 16.8833, corrected_longitude = 96.2233 WHERE pickup_id = 'P0905-KSC-003-012' OR deliver_id = 'P0905-KSC-003-012' OR waybill_no = 'P0905-KSC-003-012';
UPDATE public.be_portal_pickup_requests SET corrected_latitude = 16.7891, corrected_longitude = 96.195 WHERE pickup_id = 'P0905-KSC-003-014' OR deliver_id = 'P0905-KSC-003-014' OR waybill_no = 'P0905-KSC-003-014';
UPDATE public.be_portal_pickup_requests SET corrected_latitude = 16.8858584, corrected_longitude = 96.0998174 WHERE pickup_id = 'P0905-KSC-003-019' OR deliver_id = 'P0905-KSC-003-019' OR waybill_no = 'P0905-KSC-003-019';
COMMIT;`;
fs.writeFileSync('update_coordinates_batch2.sql', sqlData);
console.log('✅ SQL file generated perfectly!');
