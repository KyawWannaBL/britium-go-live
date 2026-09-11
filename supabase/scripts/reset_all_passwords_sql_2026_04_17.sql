
-- Add email column to user_profiles if it doesn't exist
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing profiles to have emails where missing
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND (up.email IS NULL OR up.email = '');

-- Now update all auth user passwords using Supabase's built-in encrypted password approach
-- We'll use the crypt function with bcrypt
UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumAdmin2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'admin@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumSuper2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'supervisor@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumWarehouse2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'warehouse@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumDriver2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'driver@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumMerchant2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'merchant@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumFinance2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'finance@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumWayplan2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'wayplan@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumHR2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'hr@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumCustomer2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'customer@britiumexpress.com';

UPDATE auth.users 
SET 
  encrypted_password = crypt('BritiumMD2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'md@britiumexpress.com';

-- Show how many auth users we have to confirm
SELECT email, email_confirmed_at IS NOT NULL as confirmed
FROM auth.users 
WHERE email LIKE '%@britiumexpress.com'
ORDER BY email;
