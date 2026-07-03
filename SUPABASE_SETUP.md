# Supabase Setup Guide

Follow these steps to set up your Supabase project for multi-user access:

## 1. Update your Database Table

Go to your Supabase Dashboard → SQL Editor → New Query

Run this SQL to update your `nm_mart_inventory` table:

```sql
-- Add user_id column if it doesn't exist
ALTER TABLE nm_mart_inventory 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create an index on user_id for better performance
CREATE INDEX IF NOT EXISTS idx_nm_mart_inventory_user_id ON nm_mart_inventory(user_id);
```

## 2. Enable Row Level Security (RLS)

Go to Supabase Dashboard → Table Editor → `nm_mart_inventory`

Click on "RLS disabled" and enable RLS.

## 3. Add RLS Policies

Run these SQL queries in the SQL Editor:

### Policy 1: Users can read their own data
```sql
CREATE POLICY "Users can view their own inventory"
ON nm_mart_inventory
FOR SELECT
USING (auth.uid() = user_id);
```

### Policy 2: Users can insert their own data
```sql
CREATE POLICY "Users can insert their own inventory"
ON nm_mart_inventory
FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

### Policy 3: Users can update their own data
```sql
CREATE POLICY "Users can update their own inventory"
ON nm_mart_inventory
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

## 4. Enable Email Auth

Go to Supabase Dashboard → Authentication → Providers → Email

Enable Email provider and configure as needed.

## 5. (Optional) Disable Email Confirmation (for testing)

If you want to skip email confirmation during development:

Go to Authentication → Providers → Email → Disable "Confirm email"

## Done!

Now your app is ready for multiple users, each with their own private inventory!
