## SECURITY FIXES — DEPLOYMENT CHECKLIST

### Pre-Deployment Steps

#### 1. Install New Dependencies

```bash
npm install pino pino-pretty bcryptjs
```

#### 2. Apply Database Migration

```sql
-- Run this on your PostgreSQL database:
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_users_token_version ON users(id, token_version);
```

**For Render.com PostgreSQL users:**

- Open your database in Render dashboard
- Go to **Console** tab
- Paste and run the SQL above

#### 3. Verify Environment Variables

Ensure your `.env` file (or Render environment) has:

```
JWT_SECRET=<long-random-string-min-32-chars>
DATABASE_URL=postgresql://...
MPESA_CONSUMER_KEY=<your-key>
MPESA_CONSUMER_SECRET=<your-secret>
MPESA_SHORTCODE=<your-shortcode>
CORS_ORIGIN=https://maidanja-wifi.vercel.app
NODE_ENV=production
```

#### 4. Update Frontend Registration Form (Optional)

Add password requirement hints to the registration form:

```html
<p class="text-xs text-on-surface-variant mt-sm">
  Password must contain: - At least 8 characters - One uppercase letter - One
  number - One special character (!@#$%^&*)
</p>
```

---

### Security Fixes Summary

| Phase | Fix                      | Status  | Impact |
| ----- | ------------------------ | ------- | ------ |
| 2A    | Stronger Password Policy | ✅ DONE | Medium |
| 2B    | Sanitize Pagination      | ✅ DONE | High   |
| 2C    | Hash MikroTik Passwords  | ✅ DONE | High   |
| 2D    | Secure Random Passwords  | ✅ DONE | Medium |
| 3A    | CSP Headers              | ✅ DONE | Medium |
| 3B    | Body Size Limit          | ✅ DONE | Medium |
| 3C    | Auth Hotspot Health      | ✅ DONE | Low    |
| 3D    | Hide Env from Health     | ✅ DONE | Low    |
| 3E    | JWT Logout Invalidation  | ✅ DONE | High   |
| 3F    | Phone-based Rate Limit   | ✅ DONE | High   |
| 3G    | PII Redaction Logger     | ✅ DONE | Medium |
| 3H    | .gitignore body.json     | ✅ DONE | Low    |
| 3I    | Validate Route IDs       | ✅ DONE | High   |

---

### Post-Deployment Verification

#### Test 1: Password Strength

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"0712345678","password":"weak"}'
# Expected: 400 error with password requirement message
```

#### Test 2: Pagination Limits

```bash
curl http://localhost:3000/api/admin/users?limit=999999&page=1 \
  -H "Authorization: Bearer <admin-token>"
# Expected: Returns max 100 results regardless of limit param
```

#### Test 3: Logout Invalidation

```bash
# 1. Log in and copy JWT token
# 2. Call logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <token>"
# 3. Try using old token
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <old-token>"
# Expected: 401 Session expired error
```

#### Test 4: CSP Headers

Open DevTools → Network → click request → Headers → check for `Content-Security-Policy`

#### Test 5: Body Size Limit

```bash
# Create 50KB JSON payload
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '<50KB-json-payload>'
# Expected: 413 Payload Too Large
```

#### Test 6: Admin Route Protection

- Log out completely
- Try accessing `/admin.html`
- Expected: Redirected to `/login.html`

#### Test 7: Rate Limiting (Phone-based)

```bash
# Try 6 logins with same phone number within 15 minutes
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"phone_number":"0712345678","password":"password"}'
done
# Expected: 6th request gets 429 Too Many Requests
```

#### Test 8: Hotspot Health Auth

```bash
curl http://localhost:3000/api/hotspot/health
# Expected: 401 Unauthorized (no token)

curl http://localhost:3000/api/hotspot/health \
  -H "Authorization: Bearer <valid-token>"
# Expected: 200 with health data
```

#### Test 9: Invalid Package ID

```bash
curl http://localhost:3000/api/packages/invalid-uuid
# Expected: 400 Invalid package ID format
```

---

### Rollback Instructions

If any issue arises, you can rollback specific fixes:

**Revert password policy:**

- Edit `backend/routes/auth.js` line 29-34
- Change back to `isLength({ min: 6 })`

**Revert JWT token_version:**

- Keep the migration (backward compatible)
- Remove tokenVersion checks from auth middleware

**Disable CSP (not recommended):**

- Edit `backend/server.js` line 81
- Set back to `helmet({ contentSecurityPolicy: false })`

---

### Monitoring

After deployment, monitor:

1. **Login Errors:** Check logs for `Session expired` — indicates token_version mismatch
2. **CSP Violations:** Browser DevTools → Console (should be clean)
3. **Rate Limit:** Check if legitimate users are being blocked (adjust if needed)
4. **Password Resets:** More users may request password reset due to stricter policy

---

### Documentation Updates Needed

- [ ] Update API docs with new CSP headers
- [ ] Document new password requirements
- [ ] Add logout endpoint to API reference
- [ ] Document rate limiting behavior
- [ ] Update deployment guide with pino logger setup

---

### Next Steps (Future)

1. Migrate all console.log to logger utility in production
2. Add request logging middleware (morgan → pino)
3. Implement JWT refresh tokens for extended sessions
4. Add audit logging for admin actions
5. Implement IP-based rate limiting per endpoint
6. Add monitoring alerts for failed login attempts
