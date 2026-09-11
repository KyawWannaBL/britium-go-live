-- Add routing columns to the parcels table
ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS wayplan_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS delivery_zone VARCHAR(100);
