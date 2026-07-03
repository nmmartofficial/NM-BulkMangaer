-- ============================================
-- NM MART - Bulk Inventory Manager
-- Supabase Database Setup
-- ============================================

-- ============================================
-- 1. Create Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    mobile TEXT NOT NULL UNIQUE,
    unique_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Update Inventory Table
-- ============================================
-- Add user_token column if not exists
ALTER TABLE nm_mart_inventory 
ADD COLUMN IF NOT EXISTS user_token TEXT REFERENCES users(unique_token) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_nm_mart_inventory_user_token ON nm_mart_inventory(user_token);

-- ============================================
-- 3. Create RLS Policies
-- ============================================

-- Everyone can read the users table (for login)
CREATE POLICY IF NOT EXISTS "Anyone can read users"
ON users
FOR SELECT
USING (true);

-- Everyone can insert into users table (for signup)
CREATE POLICY IF NOT EXISTS "Anyone can insert users"
ON users
FOR INSERT
WITH CHECK (true);

-- Everyone can read inventory
CREATE POLICY IF NOT EXISTS "Inventory read access"
ON nm_mart_inventory
FOR SELECT
USING (true);

-- Everyone can write inventory
CREATE POLICY IF NOT EXISTS "Inventory write access"
ON nm_mart_inventory
FOR ALL
USING (true)
WITH CHECK (true);
