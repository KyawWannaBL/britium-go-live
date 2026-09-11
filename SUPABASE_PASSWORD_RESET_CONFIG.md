# Supabase Configuration Guide for Password Reset

## Issue
When users click the password reset link from their email, they are redirected to `https://www.britiumexpress.com/auth/sign-in` instead of your actual deployment URL (e.g., `https://decs4vm5im.skywork.website`).

## Root Cause
The Supabase Site URL is configured to point to `https://www.britiumexpress.com` instead of your actual deployment URL.

## Solution

### Option 1: Update Supabase Site URL (RECOMMENDED)

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Update Site URL**
   - Go to: **Authentication** → **URL Configuration**
   - Update **Site URL** to your current deployment URL:
     ```
     https://decs4vm5im.skywork.website
     ```
   - Click **Save**

3. **Update Redirect URLs**
   - In the same section, add these to **Redirect URLs**:
     ```
     https://decs4vm5im.skywork.website/**
     http://localhost:5173/**
     http://localhost:3000/**
     ```
   - Click **Save**

4. **Test Password Reset**
   - Request a new password reset
   - Click the link in the email
   - You should now be redirected to the correct URL

### Option 2: Use Custom Domain (PRODUCTION)

If you want to use `https://www.britiumexpress.com` as your permanent URL:

1. **Configure Custom Domain in Vercel/Netlify**
   - Add `www.britiumexpress.com` as a custom domain
   - Configure DNS records as instructed
   - Wait for SSL certificate to be issued

2. **Update Supabase URLs**
   - Site URL: `https://www.britiumexpress.com`
   - Redirect URLs: `https://www.britiumexpress.com/**`

3. **Deploy to Custom Domain**
   - Your app will be accessible at the custom domain
   - Password reset links will work correctly

### Option 3: Use Auth Redirect Page (TEMPORARY WORKAROUND)

If you can't change Supabase settings immediately:

1. **Create a redirect page** at `https://www.britiumexpress.com/auth/sign-in`
   - Use the `/workspace/britium_express/public/auth-redirect.html` file
   - This page will extract the token and redirect to your actual deployment

2. **How it works**:
   - User clicks reset link → lands on `britiumexpress.app/auth/sign-in#token`
   - Redirect page extracts token
   - Redirects to `decs4vm5im.skywork.website/#/reset-password#token`
   - ResetPassword page processes the token

## Current Implementation

The ResetPassword component has been updated to handle tokens from multiple sources:

```typescript
// Handles these formats:
// 1. #/reset-password#access_token=xxx (HashRouter)
// 2. #access_token=xxx (direct from email)
// 3. ?access_token=xxx (query string format)
```

## Testing Password Reset

### Step 1: Request Password Reset
```bash
# Using the login page
1. Go to https://decs4vm5im.skywork.website/#/login
2. Click "Forgot password?"
3. Enter email: md@britiumexpress.com
4. Click "Send Reset Link"
```

### Step 2: Check Email
- Check the email inbox for md@britiumexpress.com
- Look for "Reset Your Password" email from Supabase

### Step 3: Click Reset Link
- Click the link in the email
- **Expected behavior**:
  - If Site URL is correct: Redirects to your app's reset password page
  - If Site URL is wrong: Redirects to britiumexpress.app (needs fixing)

### Step 4: Reset Password
- Enter new password (min 6 characters)
- Confirm password
- Click "Reset Password"
- Should redirect to login page

## Troubleshooting

### Error: "Invalid or expired reset link"

**Cause**: Token has expired (valid for 1 hour) or session setup failed

**Solution**:
1. Request a new password reset link
2. Click the link within 1 hour
3. Check browser console for errors

### Error: "Failed to verify reset link"

**Cause**: Token format is incorrect or Supabase session setup failed

**Solution**:
1. Check browser console for detailed error
2. Verify Supabase project is accessible
3. Request a new reset link

### Redirects to wrong domain

**Cause**: Supabase Site URL is misconfigured

**Solution**:
1. Update Site URL in Supabase Dashboard (see Option 1 above)
2. Or use custom domain (see Option 2 above)

## Email Configuration (Production)

For production, you should configure custom email templates:

1. **Go to Supabase Dashboard**
   - **Authentication** → **Email Templates**

2. **Update "Reset Password" Template**
   - Replace `{{ .SiteURL }}` with your actual domain
   - Customize the email design
   - Add your branding

3. **Example Template**:
   ```html
   <h2>Reset Your Password</h2>
   <p>Click the link below to reset your password:</p>
   <p><a href="https://decs4vm5im.skywork.website/#/reset-password#{{ .Token }}">Reset Password</a></p>
   <p>This link expires in 1 hour.</p>
   ```

## Security Notes

- Reset tokens are valid for 1 hour only
- Tokens are single-use (cannot be reused)
- HTTPS is required for production
- Never share reset links
- Tokens are automatically invalidated after password change

## Next Steps

1. ✅ Update Supabase Site URL to match your deployment
2. ✅ Test password reset flow end-to-end
3. ✅ Configure custom email templates (optional)
4. ✅ Set up custom domain (for production)
5. ✅ Test on mobile devices

## Support

If you continue to have issues:
1. Check browser console for errors
2. Check Supabase logs in Dashboard
3. Verify email delivery (check spam folder)
4. Ensure Site URL matches your deployment URL exactly
