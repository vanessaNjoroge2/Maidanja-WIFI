-- Migration: Add token_version for JWT invalidation on logout
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

-- Create index for faster lookups
CREATE INDEX idx_users_token_version ON users(id, token_version);
