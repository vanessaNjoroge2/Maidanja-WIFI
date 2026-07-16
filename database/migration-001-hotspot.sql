-- Database migration script for MikroTik hotspot integration
-- Run this script to add required tables and indexes
-- Usage: psql -U postgres -d maidanja_wifi -f database/migration-001-hotspot.sql

BEGIN;

-- ============================================================================
-- 1. HOTSPOT USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS hotspot_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  uplink_max_limit_mbps INTEGER DEFAULT 10,
  downlink_max_limit_mbps INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  mikrotik_synced BOOLEAN DEFAULT false,
  synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_speed CHECK (uplink_max_limit_mbps > 0 AND downlink_max_limit_mbps > 0)
);

-- ============================================================================
-- 2. ENHANCE SESSIONS TABLE
-- ============================================================================
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hotspot_user_id UUID REFERENCES hotspot_users(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bytes_downloaded BIGINT DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bytes_uploaded BIGINT DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- 3. BANDWIDTH LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bandwidth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotspot_user_id UUID REFERENCES hotspot_users(id) ON DELETE SET NULL,
  
  -- Bandwidth data
  bytes_downloaded BIGINT DEFAULT 0,
  bytes_uploaded BIGINT DEFAULT 0,
  packets_in BIGINT DEFAULT 0,
  packets_out BIGINT DEFAULT 0,
  
  -- Speed metrics
  current_speed_down_kbps NUMERIC(12,2),
  current_speed_up_kbps NUMERIC(12,2),
  
  -- Timestamps
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT valid_period CHECK (period_end > period_start)
);

-- ============================================================================
-- 4. ADMIN LOGS TABLE (for audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  
  -- Action details
  action VARCHAR(100) NOT NULL,
  action_category VARCHAR(50), -- 'session_management', 'user_management', 'system_config'
  target_type VARCHAR(50), -- 'session', 'user', 'hotspot_user'
  target_id UUID,
  
  -- Metadata
  old_values JSONB, -- Previous values if updating
  new_values JSONB, -- New values if updating
  reason VARCHAR(255),
  ip_address INET,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. SYSTEM STATS TABLE (for monitoring)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Active sessions
  active_sessions_count INTEGER,
  
  -- Data
  total_bytes_today BIGINT,
  total_bytes_hour BIGINT,
  total_bytes_minute BIGINT,
  
  -- User metrics
  unique_users_today INTEGER,
  new_users_today INTEGER,
  
  -- Performance
  avg_session_duration_seconds INTEGER,
  median_session_duration_seconds INTEGER,
  
  -- System
  memory_usage_percent NUMERIC(5,2),
  cpu_usage_percent NUMERIC(5,2),
  
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sessions_hotspot_user_id ON sessions(hotspot_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- Hotspot users indexes
CREATE INDEX IF NOT EXISTS idx_hotspot_users_phone ON hotspot_users(phone_number);
CREATE INDEX IF NOT EXISTS idx_hotspot_users_username ON hotspot_users(username);
CREATE INDEX IF NOT EXISTS idx_hotspot_users_is_active ON hotspot_users(is_active);

-- Bandwidth logs indexes
CREATE INDEX IF NOT EXISTS idx_bandwidth_logs_session_id ON bandwidth_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_bandwidth_logs_user_id ON bandwidth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_bandwidth_logs_period_start ON bandwidth_logs(period_start);
CREATE INDEX IF NOT EXISTS idx_bandwidth_logs_created_at ON bandwidth_logs(created_at DESC);

-- Admin logs indexes
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_type ON admin_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);

-- System stats indexes
CREATE INDEX IF NOT EXISTS idx_system_stats_recorded_at ON system_stats(recorded_at DESC);

-- ============================================================================
-- 7. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active sessions with user details
DROP VIEW IF EXISTS active_sessions_view CASCADE;
CREATE OR REPLACE VIEW active_sessions_view AS
SELECT 
  s.id,
  s.user_id,
  s.package_id,
  s.status,
  s.started_at,
  s.expires_at,
  s.bytes_downloaded,
  s.bytes_uploaded,
  u.phone_number,
  u.name,
  p.name AS package_name,
  p.speed_mbps,
  hu.username AS hotspot_username,
  (s.expires_at - NOW()) AS time_remaining,
  EXTRACT(EPOCH FROM (s.expires_at - NOW())) / EXTRACT(EPOCH FROM (s.expires_at - s.started_at)) * 100 AS percent_remaining
FROM sessions s
JOIN users u ON s.user_id = u.id
JOIN packages p ON s.package_id = p.id
LEFT JOIN hotspot_users hu ON s.hotspot_user_id = hu.id
WHERE s.status = 'active' AND s.expires_at > NOW();

-- User session history
CREATE OR REPLACE VIEW user_session_history AS
SELECT 
  s.id,
  s.user_id,
  u.phone_number,
  u.name,
  p.name AS package_name,
  s.status,
  s.started_at,
  s.ended_at,
  (s.ended_at - s.started_at) AS session_duration,
  s.bytes_downloaded,
  s.bytes_uploaded,
  (s.bytes_downloaded + s.bytes_uploaded) / 1024 / 1024 AS total_data_mb
FROM sessions s
JOIN users u ON s.user_id = u.id
JOIN packages p ON s.package_id = p.id
ORDER BY s.started_at DESC;

-- Daily stats
CREATE OR REPLACE VIEW daily_stats_view AS
SELECT 
  DATE(s.started_at) AS date,
  COUNT(DISTINCT s.user_id) AS unique_users,
  COUNT(*) AS total_sessions,
  AVG(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) AS avg_session_seconds,
  SUM(s.bytes_downloaded + s.bytes_uploaded) / 1024 / 1024 / 1024 AS total_data_gb,
  COALESCE(SUM(py.amount_kes) FILTER (WHERE py.status = 'completed'), 0) AS revenue_kes
FROM sessions s
LEFT JOIN payments py ON s.user_id = py.user_id AND DATE(py.updated_at) = DATE(s.started_at)
WHERE s.status IN ('expired', 'disconnected', 'active')
GROUP BY DATE(s.started_at)
ORDER BY date DESC;

-- ============================================================================
-- 8. FUNCTIONS FOR AUTOMATION
-- ============================================================================

-- Update system stats periodically
CREATE OR REPLACE FUNCTION update_system_stats()
RETURNS void AS $$
BEGIN
  INSERT INTO system_stats (
    active_sessions_count,
    total_bytes_hour,
    unique_users_today,
    avg_session_duration_seconds
  )
  SELECT 
    COUNT(*) FILTER (WHERE status = 'active'),
    COALESCE(SUM(bytes_downloaded + bytes_uploaded) FILTER (WHERE started_at > NOW() - INTERVAL '1 hour'), 0),
    COUNT(DISTINCT user_id) FILTER (WHERE DATE(started_at) = CURRENT_DATE),
    AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) FILTER (WHERE ended_at IS NOT NULL)
  FROM sessions;
END;
$$ LANGUAGE plpgsql;

-- Auto-update timestamp on table changes
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for auto-update timestamps
DROP TRIGGER IF EXISTS update_hotspot_users_timestamp ON hotspot_users;
CREATE TRIGGER update_hotspot_users_timestamp
BEFORE UPDATE ON hotspot_users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- 9. INITIAL DATA (optional)
-- ============================================================================

-- No initial data needed - system will create as needed

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to verify migration succeeded
-- ============================================================================

-- Check tables exist
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Check indexes
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public';

-- Check views
-- SELECT viewname FROM pg_views WHERE schemaname = 'public';
