-- Test accounts for development. Password for both: testpass123
-- Run after schema.sql. Safe to run more than once.
-- (A)

-- ------------------------------------------------------------
-- Select the database. The tables below must already exist,
-- which is why schema.sql has to be run first.
-- ------------------------------------------------------------
USE library;

-- ------------------------------------------------------------
-- 1. Member type
-- ------------------------------------------------------------
-- Every Member row needs a Member_type_id, so this type has to
-- exist before the test member is created.
-- INSERT IGNORE means: if the insert would break a UNIQUE or PRIMARY KEY
-- rule (for example, 'Student' already exists), skip it silently
-- instead of raising an error. This is what makes the script re-runnable.
-- Values: Students can have up to 5 loans at once, 2 of which can be
-- media items, and can renew each loan up to 2 times.
INSERT IGNORE INTO MemberType (Type_name, Max_loans, Max_media_loans, Max_renewals)
VALUES ('Student', 5, 2, 2);

-- ------------------------------------------------------------
-- 2. Test staff account
-- ------------------------------------------------------------
-- Login: staff@test.com / testpass123
-- Staff has no Username column, so staff log in with their email.
-- Password_hash is a bcrypt hash of "testpass123" (the $2b$10$ prefix means
-- bcrypt with cost factor 10). The plain password is never stored;
-- the login route compares input to this hash using bcrypt.compare().
INSERT IGNORE INTO Staff (First_name, Last_name, Email, Password_hash)
VALUES ('Test', 'Staff', 'staff@test.com', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa');

-- ------------------------------------------------------------
-- 3. Test member account
-- ------------------------------------------------------------
-- Login: testmember (or member@test.com) / testpass123
-- The subquery looks up the Member_type_id of 'Student' so we don't
-- hard-code an ID number, which could differ between databases.
-- This is why the MemberType insert comes first.
-- The same bcrypt hash is reused, so both accounts share one password.
INSERT IGNORE INTO Member (Member_type_id, Username, First_name, Last_name, Email, Password_hash)
VALUES ((SELECT Member_type_id FROM MemberType WHERE Type_name = 'Student'),
        'testmember', 'Test', 'Member', 'member@test.com', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa');
