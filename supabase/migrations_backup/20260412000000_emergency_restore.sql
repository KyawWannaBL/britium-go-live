-- Safe creation of delivery_status
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
        CREATE TYPE "public"."delivery_status" AS ENUM (
            'pending',
            'assigned',
            'picked_up',
            'in_transit',
            'out_for_delivery',
            'delivered',
            'failed',
            'returned',
            'cancelled'
        );
    END IF;
END $$;