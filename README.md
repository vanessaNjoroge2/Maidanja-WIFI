# Maidanja WiFi — Full-Stack Hotspot Platform

A production-ready WiFi hotspot management system with M-Pesa payment integration built with Node.js, Express, PostgreSQL, and vanilla HTML/CSS/Tailwind.

---

## ✨ Features

- **User Authentication** — Secure JWT-based login & registration
- **WiFi Packages** — Multiple subscription tiers (hourly, daily, weekly, monthly)
- **M-Pesa Integration** — STK Push payments via Safaricom Daraja API
- **MikroTik Hotspot Integration** — Automatic WiFi user creation & bandwidth management
- **Auto-Expiry System** — Sessions automatically disconnect when paid time expires
- **Payment Tracking** — Real-time session management & payment history
- **Admin Dashboard** — KPI monitoring, user management, session control
- **Responsive UI** — Mobile-first design with Tailwind CSS

---

## 🔌 MikroTik Integration (NEW)

Automatic WiFi hotspot management with MikroTik RouterOS:

- **Automatic User Creation** — Creates hotspot users after payment
- **Bandwidth Management** — Per-package speed limits (10 Mbps, 5 Mbps, etc.)
- **Session Auto-Expiry** — Automatically disconnects users when paid time expires
- **Two Operating Modes** — Simulation (development) or Real MikroTik (production)
- **Admin Controls** — Force disconnect, real-time monitoring, bandwidth tracking

For complete documentation, see:
- **[QUICK_START.md](QUICK_START.md)** — 5-minute setup & testing guide
- **[MIKROTIK_INTEGRATION.md](MIKROTIK_INTEGRATION.md)** — Full API documentation
- **[database/migration-001-hotspot.sql](database/migration-001-hotspot.sql)** — Database schema

---

## 📁 Project Structure

```
maidanja-wifi/
├── backend/                           ← Express API server
│   ├── server.js                      ← Entry point, routes setup
│   ├── config/
│   │   └── database.js                ← PostgreSQL connection pool
│   ├── middleware/
│   │   ├── auth.js                    ← JWT verification
│   │   ├── adminOnly.js               ← Admin role guard
│   │   └── errorHandler.js            ← Centralized error responses
│   ├── routes/
│   │   ├── auth.js                    ← Register / Login / Get User
│   │   ├── packages.js                ← WiFi package listing
│   │   ├── payments.js                ← M-Pesa STK Push + callback
│   │   ├── sessions.js                ← Active sessions & history
│   │   ├── hotspot.js                 ← NEW: WiFi credentials & hotspot
│   │   └── admin.js                   ← Admin stats, users, disconnect
│   └── services/
│       ├── mpesa.service.js           ← Daraja API integration
│       └── mikrotikService.js         ← NEW: MikroTik hotspot management
├── frontend/                          ← Static HTML/CSS/JS files
│   ├── index.html                     ← Landing page
│   ├── login.html                     ← Login / Register form
│   ├── packages.html                  ← WiFi packages listing
│   ├── checkout.html                  ← Payment form
│   ├── checkout-loading.html          ← Payment polling screen
│   ├── checkout-success.html          ← Receipt & confirmation
│   ├── success.html                   ← Active session countdown
│   ├── dashboard.html                 ← User history & stats
│   ├── admin.html                     ← Admin KPIs & management
│   └── js/
│       └── api.js                     ← Shared API client
├── database/
│   ├── schema.sql                     ← Full PostgreSQL schema
│   └── seed.sql                       ← Initial packages + admin user
├── .env.example                       ← Environment variables template
├── .gitignore                         ← Git ignore rules
├── package.json                       ← Node.js dependencies & scripts
└── README.md                          ← This file
```

---

## 🛠 Prerequisites

| Tool       | Version | Install Link                                 |
| ---------- | ------- | -------------------------------------------- |
| Node.js    | v18+    | https://nodejs.org                           |
| npm        | v9+     | Included with Node.js                        |
| PostgreSQL | v14+    | https://www.postgresql.org/download/windows/ |
| Git        | Latest  | https://git-scm.com/download/win             |

---

## 🚀 Quick Start

### 1️⃣ Clone & Install Dependencies

```bash
git clone <repository-url>
cd maidanja-wifi
npm install
```

### 2️⃣ Configure Environment Variables

```bash
# Copy template
copy .env.example .env
```

Edit `.env` and fill in your values:

```env
# Server
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maidanja_wifi
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-long-random-secret-at-least-32-chars
JWT_EXPIRES_IN=7d

# M-Pesa (Get these from Safaricom Daraja API)
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=http://localhost:3000/api/payments/callback
```

### 3️⃣ Set Up Database

```bash
# Create database
psql -U postgres -c "CREATE DATABASE maidanja_wifi;"

# Run schema
psql -U postgres -d maidanja_wifi -f database/schema.sql

# Seed initial data (packages + admin user)
psql -U postgres -d maidanja_wifi -f database/seed.sql
```

**Default Admin Credentials:**

- **Phone:** `254700000000`
- **Password:** `admin123`
- **Login URL:** http://localhost:3000/login.html

⚠️ **IMPORTANT:** Change the admin password immediately in production. Access the admin dashboard at `/admin.html` after login.

### 4️⃣ Start the Server

**Development (with auto-restart):**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

Server runs at: **http://localhost:3000**

---

## 📝 Available Scripts

| Script             | Purpose                           | Usage              |
| ------------------ | --------------------------------- | ------------------ |
| `npm start`        | Start production server           | `npm start`        |
| `npm run dev`      | Start with nodemon (auto-restart) | `npm run dev`      |
| `npm run frontend` | Serve frontend separately         | `npm run frontend` |
| `npm run setup-db` | Create database schema            | `npm run setup-db` |
| `npm run seed-db`  | Seed initial data                 | `npm run seed-db`  |

---

## 📚 API Endpoints

### Authentication

- `POST /api/auth/register` — Create new account
- `POST /api/auth/login` — Login & get JWT token
- `GET /api/auth/me` — Get current user profile

### Packages

- `GET /api/packages` — List all WiFi packages
- `GET /api/packages/:id` — Get package details

### Payments

- `POST /api/payments/initiate` — Start M-Pesa payment
- `GET /api/payments/:id` — Check payment status
- `POST /api/payments/callback` — Daraja webhook (internal)

### Sessions

- `GET /api/sessions/active` — Get active session
- `GET /api/sessions/history` — Payment history
- `POST /api/sessions/disconnect` — End session

### Hotspot (NEW - After Payment)

- `POST /api/hotspot/login` — Get WiFi credentials after payment
- `GET /api/hotspot/status` — Check session time remaining
- `POST /api/hotspot/disconnect` — Manual disconnect
- `GET /api/hotspot/health` — System health check

### Admin (Protected)

- `GET /api/admin/stats` — Dashboard KPIs
- `GET /api/admin/users` — All users & usage
- `GET /api/admin/hotspot/sessions` — Active WiFi sessions
- `GET /api/admin/hotspot/stats` — Bandwidth statistics
- `GET /api/admin/hotspot/health` — System health metrics
- `POST /api/admin/hotspot/disconnect/:userId` — Force disconnect user
- `POST /api/admin/disconnect/:sessionId` — Force disconnect session

---

## 🔑 Environment Variables

| Variable                | Required | Default       | Description                    |
| ----------------------- | -------- | ------------- | ------------------------------ |
| `PORT`                  | No       | `3000`        | Server port                    |
| `NODE_ENV`              | No       | `development` | Environment mode               |
| `DB_HOST`               | Yes      | -             | PostgreSQL host                |
| `DB_PORT`               | No       | `5432`        | PostgreSQL port                |
| `DB_NAME`               | Yes      | -             | Database name                  |
| `DB_USER`               | Yes      | -             | Database user                  |
| `DB_PASSWORD`           | Yes      | -             | Database password              |
| `JWT_SECRET`            | Yes      | -             | JWT signing secret (32+ chars) |
| `JWT_EXPIRES_IN`        | No       | `7d`          | Token expiration               |
| `MPESA_CONSUMER_KEY`    | Yes      | -             | Daraja API consumer key        |
| `MPESA_CONSUMER_SECRET` | Yes      | -             | Daraja API consumer secret     |
| `MPESA_SHORTCODE`       | Yes      | -             | M-Pesa shortcode               |
| `MPESA_PASSKEY`         | Yes      | -             | Lipa Na M-Pesa passkey         |
| `MPESA_CALLBACK_URL`    | Yes      | -             | Payment callback URL           |
| `CORS_ORIGIN`           | No       | `*`           | Allowed CORS origins           |

---

## 🔐 Security Best Practices

1. **Never commit `.env`** — Add to `.gitignore` (already configured)
2. **Use strong JWT_SECRET** — Minimum 32 random characters
3. **Change default admin password** — Immediately after setup
4. **Enable HTTPS in production** — Use reverse proxy (nginx/Caddy)
5. **Validate all inputs** — Express-validator configured on all routes
6. **Rate limiting** — Consider adding express-rate-limit in production
7. **CORS restricted** — Set `CORS_ORIGIN` to your domain in production

---

## 🗄️ Database Schema

### Tables

- **users** — User accounts with hashed passwords
- **packages** — WiFi packages (duration, price)
- **payments** — M-Pesa transaction logs
- **sessions** — Active & expired WiFi sessions

See [database/schema.sql](database/schema.sql) for full schema details.

---

## 🧪 Testing the API

### Using cURL:

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"user@example.com",
    "phone":"254712345678",
    "password":"SecurePass123"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"user@example.com",
    "password":"SecurePass123"
  }'

# Get packages
curl http://localhost:3000/api/packages
```

### Using Postman:

1. Import requests into Postman
2. Set `{{BASE_URL}}` variable to `http://localhost:3000`
3. Use returned token in `Authorization: Bearer <token>` header

---

## 🐛 Troubleshooting

### Port 3000 Already in Use

```bash
# Find process using port 3000 (Windows)
netstat -ano | findstr :3000
# Kill process (replace PID with actual number)
taskkill /PID <PID> /F
# Or use different port
set PORT=3001
npm run dev
```

### Database Connection Error

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials in .env
# Ensure database exists
psql -U postgres -l
```

### M-Pesa Payment Not Working

- Verify Daraja API credentials in `.env`
- Check MPESA_CALLBACK_URL is publicly accessible
- Monitor `/api/payments/callback` endpoint logs
- Test with Safaricom sandbox first (recommended)

### CORS Errors

- Update `CORS_ORIGIN` in `.env`
- For development: use `*` or `http://localhost:5000`
- For production: use exact domain

---

## 📦 Dependencies

### Backend (Express API)

- **express** (4.18.2) — Web framework
- **pg** (8.11.3) — PostgreSQL driver
- **jsonwebtoken** (9.0.2) — JWT authentication
- **bcryptjs** (2.4.3) — Password hashing
- **axios** (1.6.2) — HTTP client (M-Pesa API)
- **express-validator** (7.0.1) — Input validation
- **cors** (2.8.5) — Cross-origin requests
- **helmet** (7.1.0) — Security headers
- **morgan** (1.10.0) — HTTP logging
- **dotenv** (16.3.1) — Environment variables
- **uuid** (9.0.1) — Unique ID generation

### Dev Tools

- **nodemon** (3.0.1) — Auto-restart on file changes

---

## 📄 Frontend Libraries

- **Tailwind CSS** — Utility-first CSS framework (CDN)
- **Material Symbols** — Icon library (Google Fonts)
- **Vanilla JS** — No frameworks (lightweight)

---

## 🎯 Production Deployment

### Before Deploying:

1. [ ] Set `NODE_ENV=production`
2. [ ] Use strong, unique `JWT_SECRET`
3. [ ] Change default admin password
4. [ ] Enable HTTPS/SSL
5. [ ] Set proper `CORS_ORIGIN`
6. [ ] Use PostgreSQL managed service (not localhost)
7. [ ] Configure database backups
8. [ ] Set up monitoring & logging
9. [ ] Add rate limiting to API
10. [ ] Test all M-Pesa functionality

### Recommended Hosting

- **Backend:** Heroku, Railway, Render, AWS EC2
- **Database:** AWS RDS, Heroku Postgres, Railway, Render
- **Frontend:** Vercel, Netlify, AWS S3 + CloudFront

---

## 📞 Support & Contribution

For issues, questions, or contributions:

1. Check existing GitHub issues
2. Create detailed bug reports
3. Submit pull requests with tests
4. Follow code style conventions

---

## 📜 License

ISC License — See LICENSE file for details

---

## 🙏 Acknowledgments

- Safaricom Daraja API documentation
- Express.js best practices
- Production Node.js patterns

---

**Last Updated:** May 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅

---

## Default Credentials (from seed.sql)

| Role      | Phone          | Password   |
| --------- | -------------- | ---------- |
| Admin     | `254700000000` | `admin123` |
| Demo User | `254712345678` | `user123`  |

> ⚠️ **Change these passwords immediately in production!**

---

## API Reference

### Auth

| Method | Endpoint             | Auth | Description      |
| ------ | -------------------- | ---- | ---------------- |
| POST   | `/api/auth/register` | No   | Create account   |
| POST   | `/api/auth/login`    | No   | Login, get JWT   |
| GET    | `/api/auth/me`       | JWT  | Get current user |

### Packages

| Method | Endpoint            | Auth  | Description              |
| ------ | ------------------- | ----- | ------------------------ |
| GET    | `/api/packages`     | No    | List all active packages |
| POST   | `/api/packages`     | Admin | Create package           |
| PUT    | `/api/packages/:id` | Admin | Update package           |

### Payments

| Method | Endpoint                   | Auth | Description         |
| ------ | -------------------------- | ---- | ------------------- |
| POST   | `/api/payments/initiate`   | JWT  | Trigger STK Push    |
| GET    | `/api/payments/status/:id` | JWT  | Poll payment status |
| POST   | `/api/payments/callback`   | None | Safaricom webhook   |

### Sessions

| Method | Endpoint                | Auth | Description            |
| ------ | ----------------------- | ---- | ---------------------- |
| GET    | `/api/sessions/active`  | JWT  | Get active session     |
| GET    | `/api/sessions/history` | JWT  | Get past sessions      |
| POST   | `/api/sessions/start`   | JWT  | Manually start session |

### Admin

| Method | Endpoint                    | Auth  | Description               |
| ------ | --------------------------- | ----- | ------------------------- |
| GET    | `/api/admin/stats`          | Admin | KPI dashboard data        |
| GET    | `/api/admin/sessions`       | Admin | All sessions (filterable) |
| GET    | `/api/admin/users`          | Admin | All users (searchable)    |
| GET    | `/api/admin/transactions`   | Admin | All payments              |
| POST   | `/api/admin/disconnect/:id` | Admin | Force-disconnect user     |

---

## M-Pesa (Daraja API) Setup

1. Register at [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Create an app and get **Consumer Key** & **Consumer Secret**
3. Use the **Lipa na M-Pesa Online (Sandbox)** shortcode: `174379`
4. For sandbox testing the default passkey is already set in `.env.example`
5. For the callback URL in sandbox, use [ngrok](https://ngrok.com):
   ```bash
   ngrok http 3000
   # Copy the https URL and set:
   # MPESA_CALLBACK_URL=https://xxxx.ngrok.io/api/payments/callback
   ```

---

## User Flow

```
index.html → packages.html → (login if needed) → checkout.html
    → [STK Push sent to phone]
    → checkout-loading.html (polls every 3s)
    → checkout-success.html (shows receipt)
    → success.html (live countdown timer)
    → dashboard.html (full history)
```

---

## Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "Maidanja WiFi API is running",
  "env": "development"
}
```

---

## Troubleshooting

**`ECONNREFUSED` on startup**
→ PostgreSQL is not running. Start it via Services or:

```bash
net start postgresql-x64-14
```

**`password authentication failed`**
→ Check `DB_PASSWORD` in your `.env` matches your PostgreSQL password.

**M-Pesa STK Push not arriving**
→ Ensure `MPESA_CALLBACK_URL` is publicly accessible (use ngrok in dev).
→ Check `MPESA_ENVIRONMENT=sandbox` for testing.

**`Cannot find module`**
→ Run `npm install` again.
