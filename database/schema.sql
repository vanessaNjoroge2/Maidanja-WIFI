-- ============================================================
-- Maidanja WiFi - PostgreSQL Database Schema (FIXED)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
CREATE TYPE session_status AS ENUM ('active', 'expired', 'paused', 'disconnected');

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(15) NOT NULL UNIQUE,
    name            VARCHAR(100),
    password_hash   VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'user',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PACKAGES
-- ============================================================

CREATE TABLE packages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    duration_hours  INTEGER NOT NULL CHECK (duration_hours > 0),
    price_kes       DECIMAL(10,2) NOT NULL CHECK (price_kes > 0),
    speed_mbps      INTEGER NOT NULL CHECK (speed_mbps > 0),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    package_id                  UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    phone_number                VARCHAR(15) NOT NULL,
    amount_kes                  DECIMAL(10,2) NOT NULL,
    mpesa_checkout_request_id   VARCHAR(100) UNIQUE,
    mpesa_merchant_request_id   VARCHAR(100),
    mpesa_receipt_number        VARCHAR(50),
    mpesa_transaction_date      VARCHAR(20),
    status                      payment_status NOT NULL DEFAULT 'pending',
    failure_reason              TEXT,
    created_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HOTSPOT USERS
-- ============================================================

CREATE TABLE hotspot_users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number            VARCHAR(15) NOT NULL,
    username                VARCHAR(100) NOT NULL UNIQUE,
    password_hash           VARCHAR(255) NOT NULL,
    uplink_max_limit_mbps   INTEGER,
    downlink_max_limit_mbps INTEGER,
    mikrotik_synced         BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at               TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SESSIONS
-- ============================================================

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    package_id      UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    payment_id      UUID REFERENCES payments(id) ON DELETE RESTRICT, -- can be NULL for manual sessions
    hotspot_user_id UUID REFERENCES hotspot_users(id) ON DELETE SET NULL,
    phone_number    VARCHAR(15),
    mac_address     VARCHAR(17),
    ip_address      VARCHAR(45),
    started_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    status          session_status NOT NULL DEFAULT 'active',
    data_used_mb    DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUNCTION (NO $$ VERSION - FIXED)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS '
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
';

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_packages_updated_at
BEFORE UPDATE ON packages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEW
-- ============================================================

CREATE OR REPLACE VIEW active_sessions_view AS
SELECT
    s.id,
    s.user_id,
    u.phone_number,
    u.name,
    p.name AS package_name,
    p.speed_mbps,
    s.started_at,
    s.expires_at,
    EXTRACT(EPOCH FROM (s.expires_at - NOW())) / 3600 AS hours_remaining,
    s.data_used_mb,
    s.ip_address,
    s.mac_address
FROM sessions s
JOIN users u ON s.user_id = u.id
JOIN packages p ON s.package_id = p.id
WHERE s.status = 'active'
AND s.expires_at > NOW();

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

SELECT 'Schema created successfully!' AS status;