# Login Issues on Vercel - Troubleshooting Guide

## Common Login Problems

### Problem 1: "Invalid phone number or password"

**Cause:** User doesn't exist in the Render PostgreSQL database (database not seeded)

**Solution:** Seed the Render database with test users

### Problem 2: "Cannot POST /api/auth/login" or Network Error

**Cause:** CORS issue or backend not running

**Solution:** Check backend health and CORS configuration

### Problem 3: Login button does nothing

**Cause:** JavaScript error or API endpoint mismatch

**Solution:** Check browser console (F12 → Console tab)

---

## Step-by-Step Debugging

### Step 1: Check Browser Console

1. Open Vercel link: https://maidanja-wifi.vercel.app/login.html (or your custom domain)
2. Right-click → **Inspect** → **Console tab**
3. Try to login
4. Look for error messages:
   - `"Invalid phone number or password"` → User doesn't exist
   - `"Failed to fetch"` → Network/CORS error
   - `"Phone must be in format..."` → Validation error

### Step 2: Verify Backend is Running

```bash
curl https://maidanja-wifi.onrender.com/api/health
```

Should return:

```json
{"success":true,"message":"Maidanja WiFi API is running",...}
```

If you get an error, the backend service is down. Restart it on Render dashboard.

### Step 3: Check If Database is Seeded

The Render PostgreSQL database needs to have users. Test with demo credentials:

```bash
curl -X POST https://maidanja-wifi.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "254712345678",
    "password": "user123"
  }'
```

**Expected response if user exists:**

```json
{"success":true,"message":"Login successful.","data":{"token":"...", "user":{...}}}
```

**If you get 401 Unauthorized:**
→ User doesn't exist in database → Need to seed!

---

## Solution: Seed the Render Database

### Option A: Using Remote Connection (Recommended)

If you have PostgreSQL installed locally:

```bash
# Get your Render PostgreSQL connection string
# Go to: https://dashboard.render.com
# Find your PostgreSQL database
# Copy the "External Database URL"

# Run the seed script
PGPASSWORD="your_password" psql -h your-host -U your-user -d your-db < database/seed.sql
```

### Option B: Using Render Dashboard (Web Console)

1. Go to https://dashboard.render.com
2. Click on your PostgreSQL database
3. Go to **Shell** tab
4. Copy the seed.sql content and paste it
5. Execute the commands

### Option C: Manual User Creation

If seeding fails, create a test user manually:

```sql
INSERT INTO users (phone_number, name, password_hash, role)
VALUES (
  '254712345678',
  'Demo User',
  '$2b$12$X7kfS6H0kF6TlZ5lT9mN0OcV4i9zH9sQwB3U6mZgN.3k0aG0Xnpiy',
  'user'
)
ON CONFLICT (phone_number) DO NOTHING;
```

This creates a user with:

- **Phone:** 254712345678
- **Password:** user123
- **Role:** user

---

## How to Login After Seeding

### Test User Credentials (Demo)

```
Phone: 254712345678
Password: user123
```

### Admin Credentials (Demo)

```
Phone: 254700000000
Password: admin123
```

---

## Phone Number Format Rules

Login requires phone in **one of these formats:**

- **International:** `254712345678` (254 + 9 digits)
- **Local:** `0712345678` (will be converted to international)

❌ **These won't work:**

- `+254712345678` (don't include +)
- `712345678` (missing country code or 0)
- `254 712 345 678` (don't include spaces)

---

## Environment Variables Check

Ensure these are set on Render backend:

1. Go to https://dashboard.render.com
2. Select your backend service
3. Click **Environment** → Check these variables exist:
   - `DATABASE_URL` - PostgreSQL connection string
   - `JWT_SECRET` - Random secret for tokens
   - `NODE_ENV` - Set to "production"
   - `CORS_ORIGIN` - Set to "\*" (allows all origins)

If any are missing, add them and **redeploy** the backend.

---

## Complete Debugging Checklist

- [ ] Backend is running: `curl https://maidanja-wifi.onrender.com/api/health` returns 200
- [ ] Can reach login page without errors
- [ ] No CORS errors in browser console
- [ ] Database has users: Test login endpoint with curl
- [ ] Phone number format is correct (254XXXXXXXXX)
- [ ] Vercel frontend has been redeployed (to use updated packages.html)
- [ ] Browser cache cleared (Ctrl+Shift+Delete)

---

## If Still Not Working

Check these in order:

1. **Browser Console Errors** (F12 → Console)
   - Look for any JavaScript errors
   - Look for network errors (red)

2. **Network Tab** (F12 → Network)
   - Click Login
   - Look for POST to `/api/auth/login`
   - Check response status and body

3. **Render Logs**
   - Go to https://dashboard.render.com
   - Select backend service
   - Click **Logs** tab
   - Look for errors when you try to login

4. **Database Connection**
   - Verify `DATABASE_URL` is set correctly
   - Test database connection: `psql $DATABASE_URL`

---

## Quick Start: Minimal Setup

If everything is configured and you just need to login:

```bash
# 1. Make sure Render database is seeded
#    (run seed.sql from database/seed.sql)

# 2. Use test credentials on Vercel
# Phone: 254712345678
# Password: user123

# 3. Should be logged in and see Packages page
```

---

## Support Commands

```bash
# Check backend status
curl https://maidanja-wifi.onrender.com/api/health

# Test packages API
curl https://maidanja-wifi.onrender.com/api/packages

# Test login (after seeding)
curl -X POST https://maidanja-wifi.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"254712345678","password":"user123"}'

# Check Render logs
# https://dashboard.render.com → Select service → Logs tab
```
