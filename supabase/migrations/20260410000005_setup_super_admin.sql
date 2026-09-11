-- First, let's check if the user exists in auth.users
-- If they exist, we'll update their profile
-- If not, we need to create them through the application

-- Create a function to safely upsert the super admin profile
CREATE OR REPLACE FUNCTION create_super_admin_profile()
RETURNS void AS $$
DECLARE
  admin_user_id UUID;
  admin_email TEXT := 'md@britiumexpress.com';
BEGIN
  -- Try to find the user in auth.users
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = admin_email;

  IF admin_user_id IS NOT NULL THEN
    -- User exists, update their profile
    INSERT INTO public.user_profiles (
      id,
      email,
      full_name,
      role,
      is_active
    ) VALUES (
      admin_user_id,
      admin_email,
      'Managing Director',
      'super-admin',
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      role = 'super-admin',
      full_name = 'Managing Director',
      is_active = true,
      updated_at = NOW();

    RAISE NOTICE 'Super admin profile updated for user ID: %', admin_user_id;
  ELSE
    RAISE NOTICE 'User does not exist in auth.users. Please create the user first through signup or Supabase dashboard.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function
SELECT create_super_admin_profile();

-- Clean up
DROP FUNCTION create_super_admin_profile();