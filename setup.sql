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
-- 2. Create Inventory Table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS nm_mart_inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_token TEXT REFERENCES users(unique_token) ON DELETE CASCADE,
    inventory_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_nm_mart_inventory_user_token'
    ) THEN
        CREATE INDEX idx_nm_mart_inventory_user_token ON nm_mart_inventory(user_token);
    END IF;
END $$;

-- Enable RLS on inventory table
ALTER TABLE nm_mart_inventory ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. Create RLS Policies (use DO blocks for idempotency)
-- ============================================

-- Everyone can read the users table (for login)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'users' AND policyname = 'Anyone can read users'
    ) THEN
        CREATE POLICY "Anyone can read users"
        ON users
        FOR SELECT
        USING (true);
    END IF;
END $$;

-- Everyone can insert into users table (for signup)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'users' AND policyname = 'Anyone can insert users'
    ) THEN
        CREATE POLICY "Anyone can insert users"
        ON users
        FOR INSERT
        WITH CHECK (true);
    END IF;
END $$;

-- IMPORTANT: Since we're using custom token auth (not Supabase Auth),
-- we'll rely on our application-level security (which already checks user_token)
-- But we can still enable RLS as an extra layer

-- Allow all operations for now (application will handle filtering)
-- In production, you'd want to use Supabase Auth with custom JWT claims
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'nm_mart_inventory' AND policyname = 'Enable all operations (application handles security)'
    ) THEN
        CREATE POLICY "Enable all operations (application handles security)"
        ON nm_mart_inventory
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;
