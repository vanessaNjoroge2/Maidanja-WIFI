-- ============================================================
-- Maidanja WiFi - Database Seed Data
-- Run AFTER schema.sql: psql -U postgres -f database/seed.sql
-- NOTE: Change ADMIN_PASSWORD below before running in production!
-- ============================================================

-- ============================================================
-- SEED PACKAGES
-- ============================================================

INSERT INTO packages (name, duration_hours, price_kes, speed_mbps, description, sort_order, is_active) VALUES
    ('Student Package',         24,   20,  5,  '2GB high-speed data for studying. Valid 24 hours.', 1, TRUE),
    ('30 Minutes Unlimited',    0.5,  5,   3,  '30 minutes of unlimited browsing.', 2, TRUE),
    ('1 Hour Unlimited',        1,    10,  5,  '1 hour of unlimited browsing.', 3, TRUE),
    ('2 Hours Unlimited',       2,    15,  8,  '2 hours of unlimited browsing.', 4, TRUE),
    ('3 Hours Unlimited',       3,    20,  10, '3 hours of unlimited browsing.', 5, TRUE),
    ('12 Hours Unlimited',      12,   55,  15, '12 hours of unlimited browsing.', 6, TRUE),
    ('1 Day Unlimited',         24,   80,  20, '24 hours of unlimited browsing.', 7, TRUE),
    ('1 Week Unlimited',        168,  200, 25, '7 days of unlimited browsing.', 8, TRUE),
    ('2 Weeks Unlimited',       336,  350, 30, '2 weeks of unlimited browsing.', 9, TRUE),
    ('1 Month Unlimited',       720,  600, 40, '30 days of unlimited browsing.', 10, TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED ADMIN USER
-- Password: admin123  (hashed with bcrypt, 12 salt rounds)
-- CHANGE THIS PASSWORD IN PRODUCTION via the .env file or direct DB update
-- Hash generated with: bcrypt.hashSync('admin123', 12)
-- ============================================================

INSERT INTO users (phone_number, name, password_hash, role) VALUES
    ('254700000000', 'Maidanja Admin', '$2a$12$A3T3jqPLO7LJaoNh/X0idOS/eChJBpl89Et4XqBDDOgRZoOoytqf6', 'admin')
ON CONFLICT (phone_number) DO NOTHING;

-- ============================================================
-- SEED DEMO USER (for testing)
-- Password: user123
-- ============================================================

INSERT INTO users (phone_number, name, password_hash, role) VALUES
    ('254712345678', 'Demo User', '$2a$12$0ffNzAS5P6RRlCEmGC4Y8ebXCEXhWCQBjUiF1.VIA2yHI21ktoHl2', 'user')
ON CONFLICT (phone_number) DO NOTHING;

SELECT 'Seed data inserted successfully!' AS status;
SELECT 'Packages seeded: ' || COUNT(*) AS info FROM packages;
SELECT 'Users seeded: ' || COUNT(*) AS info FROM users;
