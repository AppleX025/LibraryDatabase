-- Test accounts for development. Password for all of them: testpass123
-- Logins: staff@test.com (staff), admin@test.com (administrator), testmember (member).
-- Run after schema.sql. Safe to run more than once.
-- (A)

USE library;

-- The four member types and borrowing limits from the mini-world.
-- Max_renewals 999 means "no renewal limit". The mini-world gives no renewal limit for Staff,
-- so Staff uses 999 (unlimited) until the team decides otherwise.
-- ON DUPLICATE KEY UPDATE: if a type already exists (for example from an older copy of this file
-- that used placeholder limits), its limits are corrected instead of being skipped.
INSERT INTO MemberType (Type_name, Max_loans, Max_media_loans, Max_renewals) VALUES
    ('Student',  99,  5, 999),   -- 99 items, 5 media, no renewal limit
    ('Faculty', 400, 10, 999),   -- 400 items, 10 media, no renewal limit
    ('Staff',   199, 10, 999),   -- 199 items, 10 media (library employees who also borrow)
    ('Alumni',   10,  4,   1)    -- 10 items, 4 media, renewals capped at 1
AS new_type   -- alias for the incoming row (replaces the deprecated VALUES() function; needs MySQL 8.0.19+)
ON DUPLICATE KEY UPDATE Max_loans       = new_type.Max_loans,
                        Max_media_loans = new_type.Max_media_loans,
                        Max_renewals    = new_type.Max_renewals;

-- Two staff logins. Both can check items in and out and take payment on fines;
-- only the administrator (Is_admin = TRUE) can also waive a fine.
INSERT IGNORE INTO Staff (First_name, Last_name, Email, Password_hash, Is_admin)
VALUES ('Test', 'Staff', 'staff@test.com', 'scrypt$16384$8$1$JG+7+zy280HD4QEEQ9q/2w==$iQaSC2GQcAYpn8DjB8cfTgOWH6USvJ8S4uerZHN6uzqA0tN5ktjwYkXldlw607IPaEntZ3fYrrJlj6r33hRkAA==', FALSE),
       ('Test', 'Admin', 'admin@test.com', 'scrypt$16384$8$1$JG+7+zy280HD4QEEQ9q/2w==$iQaSC2GQcAYpn8DjB8cfTgOWH6USvJ8S4uerZHN6uzqA0tN5ktjwYkXldlw607IPaEntZ3fYrrJlj6r33hRkAA==', TRUE);

INSERT IGNORE INTO Member (Member_type_id, Username, First_name, Last_name, Email, Password_hash)
VALUES ((SELECT Member_type_id FROM MemberType WHERE Type_name = 'Student'),
        'testmember', 'Test', 'Member', 'member@test.com', 'scrypt$16384$8$1$JG+7+zy280HD4QEEQ9q/2w==$iQaSC2GQcAYpn8DjB8cfTgOWH6USvJ8S4uerZHN6uzqA0tN5ktjwYkXldlw607IPaEntZ3fYrrJlj6r33hRkAA==');