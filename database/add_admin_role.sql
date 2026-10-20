-- =====================================================================
-- add_admin_role.sql
-- For a database that was loaded BEFORE the administrator role existed.
-- (A fresh load of schema.sql and seed_accounts.sql already includes all of this.)
--
-- What it does:
--   1. Adds the Is_admin column to Staff. Every existing staff row gets FALSE,
--      so nobody becomes an administrator by accident.
--   2. Adds the test administrator login admin@test.com (password testpass123).
--
-- Run it ONCE. Running it a second time stops with "Duplicate column name"
-- on step 1, which is harmless: it means the column is already there.
-- =====================================================================
USE library;

-- Step 1: true/false flag, false for everyone who already exists.
ALTER TABLE Staff
    ADD COLUMN Is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: the test administrator. INSERT IGNORE skips it if the email already exists.
INSERT IGNORE INTO Staff (First_name, Last_name, Email, Password_hash, Is_admin)
VALUES ('Test', 'Admin', 'admin@test.com',
        '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa', TRUE);
