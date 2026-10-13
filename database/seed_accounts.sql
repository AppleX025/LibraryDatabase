-- Test accounts for development. Password for both: testpass123
-- Run after schema.sql. Safe to run more than once.
-- (A)

USE library;

INSERT IGNORE INTO MemberType (Type_name, Max_loans, Max_media_loans, Max_renewals)
VALUES ('Student', 5, 2, 2);

INSERT IGNORE INTO Staff (First_name, Last_name, Email, Password_hash)
VALUES ('Test', 'Staff', 'staff@test.com', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa');

INSERT IGNORE INTO Member (Member_type_id, Username, First_name, Last_name, Email, Password_hash)
VALUES ((SELECT Member_type_id FROM MemberType WHERE Type_name = 'Student'),
        'testmember', 'Test', 'Member', 'member@test.com', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa');