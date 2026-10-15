-- =====================================================================
-- sample_data.sql  --  realistic fake data for development and demos
-- Run order:  schema.sql  ->  seed_accounts.sql  ->  trigger_overdue_fine.sql  ->  this file
-- Every account here uses the password  testpass123  (same bcrypt hash as seed_accounts.sql).
-- Safe to run again: the RESET section clears the sample rows first
-- (it keeps the two accounts from seed_accounts.sql: staff@test.com and testmember).
-- Dates are relative to today (CURDATE()), so overdue/not-due stay correct whenever it runs.
-- =====================================================================
USE library;

-- Workbench's "safe update mode" blocks DELETE/UPDATE without a key in WHERE; turn it off for this script.
SET SQL_SAFE_UPDATES = 0;

-- =====================================================================
-- 0. RESET: remove old sample rows, children before parents (foreign keys use RESTRICT)
-- =====================================================================
DELETE FROM Notification;
DELETE FROM Fine;
DELETE FROM Hold;
DELETE FROM Loan;
DELETE FROM Copy;
DELETE FROM BookAuthor;
DELETE FROM Book;
DELETE FROM DVD;
DELETE FROM CatalogItem;
DELETE FROM Author;
DELETE FROM Publisher;
DELETE FROM Member WHERE Username <> 'testmember';
DELETE FROM Staff  WHERE Email <> 'staff@test.com';

-- =====================================================================
-- 1. Member types and staff
-- =====================================================================
-- The four member types and limits from the mini-world (Max_renewals 999 = no renewal limit).
-- seed_accounts.sql already creates these; ON DUPLICATE KEY UPDATE keeps them correct if this file is run alone.
-- The mini-world does not state a renewal limit for Staff; 999 (unlimited) is assumed.
INSERT INTO MemberType (Type_name, Max_loans, Max_media_loans, Max_renewals) VALUES
    ('Student',  99,  5, 999),
    ('Faculty', 400, 10, 999),
    ('Staff',   199, 10, 999),
    ('Alumni',   10,  4,   1)
AS new_type   -- alias for the incoming row (replaces the deprecated VALUES() function; needs MySQL 8.0.19+)
ON DUPLICATE KEY UPDATE Max_loans       = new_type.Max_loans,
                        Max_media_loans = new_type.Max_media_loans,
                        Max_renewals    = new_type.Max_renewals;

-- A second staff member (used as the person who checks items back IN).
INSERT INTO Staff (First_name, Last_name, Email, Password_hash) VALUES
    ('Maria', 'Lopez', 'librarian@test.com',
     '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa');

-- Handy shortcuts for the staff IDs (session variables, used in the loan inserts below)
SET @staff_out = (SELECT Staff_id FROM Staff WHERE Email = 'staff@test.com');
SET @staff_in  = (SELECT Staff_id FROM Staff WHERE Email = 'librarian@test.com');

-- =====================================================================
-- 2. Members (all password: testpass123)
-- =====================================================================
INSERT INTO Member (Member_type_id, Username, First_name, Last_name, Email, Phone, City, State, Zip_code, Password_hash)
VALUES
 ((SELECT Member_type_id FROM MemberType WHERE Type_name='Student'),   'alice_r', 'Alice', 'Rivera',  'alice@test.com', '713-555-0101', 'Houston', 'TX', '77004', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa'),
 ((SELECT Member_type_id FROM MemberType WHERE Type_name='Student'),   'bob_m',   'Bob',   'Martin',  'bob@test.com',   '713-555-0102', 'Houston', 'TX', '77005', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa'),
 ((SELECT Member_type_id FROM MemberType WHERE Type_name='Faculty'),   'carla_f', 'Carla', 'Fernandez','carla@test.com', '713-555-0103', 'Houston', 'TX', '77004', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa'),
 ((SELECT Member_type_id FROM MemberType WHERE Type_name='Alumni'),    'dan_c',   'Dan',   'Chen',    'dan@test.com',   '713-555-0104', 'Katy',    'TX', '77449', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa'),
 ((SELECT Member_type_id FROM MemberType WHERE Type_name='Student'),   'eva_s',   'Eva',   'Singh',   'eva@test.com',   '713-555-0105', 'Houston', 'TX', '77023', '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa');

-- A library employee who also borrows: a member of type 'Staff', linked to her Staff record (Staff_id).
-- (Different email from her staff login, so the login form finds the right account.)
INSERT INTO Member (Member_type_id, Staff_id, Username, First_name, Last_name, Email, Password_hash)
VALUES ((SELECT Member_type_id FROM MemberType WHERE Type_name='Staff'),
        (SELECT Staff_id FROM Staff WHERE Email='librarian@test.com'),
        'maria_staff', 'Maria', 'Lopez', 'maria.member@test.com',
        '$2b$10$XU20uDDaEmPh.e0A7NAYleCBjDkOFV.v/5YNHoXU/gOZZ8EClaiRa');

SET @testmember = (SELECT Member_id FROM Member WHERE Username = 'testmember');
SET @alice = (SELECT Member_id FROM Member WHERE Username = 'alice_r');
SET @bob   = (SELECT Member_id FROM Member WHERE Username = 'bob_m');
SET @carla = (SELECT Member_id FROM Member WHERE Username = 'carla_f');
SET @dan   = (SELECT Member_id FROM Member WHERE Username = 'dan_c');
SET @eva   = (SELECT Member_id FROM Member WHERE Username = 'eva_s');

-- =====================================================================
-- 3. Publishers, authors
-- =====================================================================
INSERT INTO Publisher (Name) VALUES
    ('Penguin Books'), ('HarperCollins'), ('Scholastic'), ('Ace Books'), ('Universal Pictures Home Entertainment');

INSERT INTO Author (First_name, Last_name) VALUES
    ('George', 'Orwell'), ('Harper', 'Lee'), ('J.K.', 'Rowling'),
    ('Frank', 'Herbert'), ('Jane', 'Austen'), ('Agatha', 'Christie');

-- =====================================================================
-- 4. Catalog: each item is a CatalogItem row FIRST, then its subtype row (Book / DVD)
--    Item_type is always written explicitly (it has no default).
-- =====================================================================
INSERT INTO CatalogItem (Item_type, Title, Publisher_id, Publication_year, Replacement_cost) VALUES
 ('book', '1984',                               (SELECT Publisher_id FROM Publisher WHERE Name='Penguin Books'), 1949, 12.99),
 ('book', 'To Kill a Mockingbird',              (SELECT Publisher_id FROM Publisher WHERE Name='HarperCollins'), 1960, 14.99),
 ('book', 'Harry Potter and the Sorcerer''s Stone', (SELECT Publisher_id FROM Publisher WHERE Name='Scholastic'), 1997, 18.99),
 ('book', 'Dune',                               (SELECT Publisher_id FROM Publisher WHERE Name='Ace Books'), 1965, 16.99),
 ('book', 'Pride and Prejudice',                (SELECT Publisher_id FROM Publisher WHERE Name='Penguin Books'), 1813, 9.99),
 ('book', 'Murder on the Orient Express',       (SELECT Publisher_id FROM Publisher WHERE Name='HarperCollins'), 1934, 11.99),
 ('book', 'Animal Farm',                        (SELECT Publisher_id FROM Publisher WHERE Name='Penguin Books'), 1945, 10.99),
 ('book', 'Emma',                               (SELECT Publisher_id FROM Publisher WHERE Name='Penguin Books'), 1815, 9.99),
 ('dvd',  'Jurassic Park',                      (SELECT Publisher_id FROM Publisher WHERE Name='Universal Pictures Home Entertainment'), 1993, 19.99),
 ('dvd',  'The Shawshank Redemption',           (SELECT Publisher_id FROM Publisher WHERE Name='Universal Pictures Home Entertainment'), 1994, 17.99);

-- Subtype rows: same Item_id and Item_type as the CatalogItem row
INSERT INTO Book (Item_id, Item_type, Isbn, Genre)
SELECT Item_id, 'book',
       CASE Title WHEN '1984' THEN '9780000000011' WHEN 'To Kill a Mockingbird' THEN '9780000000028'
                  WHEN 'Harry Potter and the Sorcerer''s Stone' THEN '9780000000035' WHEN 'Dune' THEN '9780000000042'
                  WHEN 'Pride and Prejudice' THEN '9780000000059' WHEN 'Murder on the Orient Express' THEN '9780000000066'
                  WHEN 'Animal Farm' THEN '9780000000073' WHEN 'Emma' THEN '9780000000080' END,
       CASE Title WHEN '1984' THEN 'Dystopian' WHEN 'To Kill a Mockingbird' THEN 'Classic'
                  WHEN 'Harry Potter and the Sorcerer''s Stone' THEN 'Fantasy' WHEN 'Dune' THEN 'Science Fiction'
                  WHEN 'Pride and Prejudice' THEN 'Romance' WHEN 'Murder on the Orient Express' THEN 'Mystery'
                  WHEN 'Animal Farm' THEN 'Satire' WHEN 'Emma' THEN 'Romance' END
FROM CatalogItem WHERE Item_type = 'book';

INSERT INTO DVD (Item_id, Item_type, Runtime_minutes, Director, Mpaa_rating)
SELECT Item_id, 'dvd',
       CASE Title WHEN 'Jurassic Park' THEN 127 ELSE 142 END,
       CASE Title WHEN 'Jurassic Park' THEN 'Steven Spielberg' ELSE 'Frank Darabont' END,
       CASE Title WHEN 'Jurassic Park' THEN 'PG-13' ELSE 'R' END
FROM CatalogItem WHERE Item_type = 'dvd';

-- Who wrote what
INSERT INTO BookAuthor (Item_id, Author_id) VALUES
 ((SELECT Item_id FROM CatalogItem WHERE Title='1984'),                  (SELECT Author_id FROM Author WHERE Last_name='Orwell')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Animal Farm'),           (SELECT Author_id FROM Author WHERE Last_name='Orwell')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='To Kill a Mockingbird'),(SELECT Author_id FROM Author WHERE Last_name='Lee')),
 ((SELECT Item_id FROM CatalogItem WHERE Title LIKE 'Harry Potter%'),    (SELECT Author_id FROM Author WHERE Last_name='Rowling')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Dune'),                  (SELECT Author_id FROM Author WHERE Last_name='Herbert')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Pride and Prejudice'),   (SELECT Author_id FROM Author WHERE Last_name='Austen')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Emma'),                  (SELECT Author_id FROM Author WHERE Last_name='Austen')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Murder on the Orient Express'), (SELECT Author_id FROM Author WHERE Last_name='Christie'));

-- =====================================================================
-- 5. Physical copies (two per book, DVDs 2 + 1). Barcode identifies each copy.
--    All start as 'available'; section 9 flips copies with open loans to 'on loan'.
-- =====================================================================
INSERT INTO Copy (Item_id, Barcode, `Condition`, Shelf_location, Date_acquired) VALUES
 ((SELECT Item_id FROM CatalogItem WHERE Title='1984'), 'LIB-0001', 'good', 'FIC-ORW', '2023-01-15'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='1984'), 'LIB-0002', 'good', 'FIC-ORW', '2023-01-15'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='To Kill a Mockingbird'), 'LIB-0003', 'good', 'FIC-LEE', '2023-02-01'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='To Kill a Mockingbird'), 'LIB-0004', 'worn', 'FIC-LEE', '2021-09-10'),
 ((SELECT Item_id FROM CatalogItem WHERE Title LIKE 'Harry Potter%'), 'LIB-0005', 'good', 'FIC-ROW', '2023-03-05'),
 ((SELECT Item_id FROM CatalogItem WHERE Title LIKE 'Harry Potter%'), 'LIB-0006', 'new',  'FIC-ROW', '2024-08-20'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Dune'), 'LIB-0007', 'good', 'SCI-HER', '2023-04-12'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Dune'), 'LIB-0008', 'good', 'SCI-HER', '2023-04-12'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Pride and Prejudice'), 'LIB-0009', 'good', 'FIC-AUS', '2022-05-30'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Pride and Prejudice'), 'LIB-0010', 'good', 'FIC-AUS', '2022-05-30'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Murder on the Orient Express'), 'LIB-0011', 'good', 'MYS-CHR', '2023-06-18'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Murder on the Orient Express'), 'LIB-0012', 'worn', 'MYS-CHR', '2020-11-02'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Animal Farm'), 'LIB-0013', 'good', 'FIC-ORW', '2023-01-15'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Animal Farm'), 'LIB-0014', 'good', 'FIC-ORW', '2023-01-15'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Emma'), 'LIB-0015', 'good', 'FIC-AUS', '2022-05-30'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Emma'), 'LIB-0016', 'good', 'FIC-AUS', '2022-05-30'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Jurassic Park'), 'LIB-0101', 'good', 'DVD-A', '2022-10-01'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Jurassic Park'), 'LIB-0102', 'good', 'DVD-A', '2022-10-01'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Shawshank Redemption'), 'LIB-0103', 'good', 'DVD-B', '2022-10-01');

-- =====================================================================
-- 6. Loans that were returned ON TIME (history; they make 1984 and Dune the "most borrowed")
--    Standard loan = 14 days. Columns: copy, member, out-staff, type, checkout, due, returned, in-staff
-- =====================================================================
INSERT INTO Loan (Copy_id, Member_id, Staff_id, Loan_type, Checkout_date, Due_date, Return_date, Return_staff_id) VALUES
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0001'), @alice, @staff_out, 'standard', NOW() - INTERVAL 60 DAY, CURDATE() - INTERVAL 46 DAY, CURDATE() - INTERVAL 50 DAY, @staff_in),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0001'), @bob,   @staff_out, 'standard', NOW() - INTERVAL 45 DAY, CURDATE() - INTERVAL 31 DAY, CURDATE() - INTERVAL 40 DAY, @staff_in),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0001'), @carla, @staff_out, 'standard', NOW() - INTERVAL 35 DAY, CURDATE() - INTERVAL 21 DAY, CURDATE() - INTERVAL 25 DAY, @staff_in),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0007'), @dan,   @staff_out, 'standard', NOW() - INTERVAL 50 DAY, CURDATE() - INTERVAL 36 DAY, CURDATE() - INTERVAL 42 DAY, @staff_in),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0008'), @eva,   @staff_out, 'standard', NOW() - INTERVAL 30 DAY, CURDATE() - INTERVAL 16 DAY, CURDATE() - INTERVAL 20 DAY, @staff_in),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0005'), @alice, @staff_out, 'standard', NOW() - INTERVAL 28 DAY, CURDATE() - INTERVAL 14 DAY, CURDATE() - INTERVAL 18 DAY, @staff_in),
 -- a SHORT loan (3 days, no renewals) on a DVD
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0101'), @bob,   @staff_out, 'short',    NOW() - INTERVAL 20 DAY, CURDATE() - INTERVAL 17 DAY, CURDATE() - INTERVAL 18 DAY, @staff_in);

-- =====================================================================
-- 7. Loans that come back LATE. Step 1: create them as OPEN loans.
--    Step 2 (right after): record the return with an UPDATE; the trigger then adds the fine + notification.
-- =====================================================================
INSERT INTO Loan (Copy_id, Member_id, Staff_id, Loan_type, Checkout_date, Due_date) VALUES
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0003'), @alice,      @staff_out, 'standard', NOW() - INTERVAL 45 DAY, CURDATE() - INTERVAL 31 DAY),  -- will be 6 days late
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0004'), @bob,        @staff_out, 'standard', NOW() - INTERVAL 60 DAY, CURDATE() - INTERVAL 46 DAY),  -- 43 days late -> fine capped at $10
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0009'), @carla,      @staff_out, 'standard', NOW() - INTERVAL 30 DAY, CURDATE() - INTERVAL 16 DAY),  -- 10 days late (+ damaged)
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0010'), @testmember, @staff_out, 'standard', NOW() - INTERVAL 25 DAY, CURDATE() - INTERVAL 11 DAY);  -- 9 days late, fine left unpaid

-- Record each return (Return_date and Return_staff_id must be filled together). Each UPDATE fires the trigger.
UPDATE Loan SET Return_date = CURDATE() - INTERVAL 25 DAY, Return_staff_id = @staff_in
 WHERE Copy_id = (SELECT Copy_id FROM Copy WHERE Barcode='LIB-0003') AND Return_date IS NULL;
UPDATE Loan SET Return_date = CURDATE() - INTERVAL 3 DAY,  Return_staff_id = @staff_in
 WHERE Copy_id = (SELECT Copy_id FROM Copy WHERE Barcode='LIB-0004') AND Return_date IS NULL;
UPDATE Loan SET Return_date = CURDATE() - INTERVAL 6 DAY,  Return_staff_id = @staff_in
 WHERE Copy_id = (SELECT Copy_id FROM Copy WHERE Barcode='LIB-0009') AND Return_date IS NULL;
UPDATE Loan SET Return_date = CURDATE() - INTERVAL 2 DAY,  Return_staff_id = @staff_in
 WHERE Copy_id = (SELECT Copy_id FROM Copy WHERE Barcode='LIB-0010') AND Return_date IS NULL;

-- =====================================================================
-- 8. Loans that are still OPEN: three overdue (for the overdue report) and four not yet due
-- =====================================================================
INSERT INTO Loan (Copy_id, Member_id, Staff_id, Loan_type, Checkout_date, Due_date) VALUES
 -- overdue
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0011'), @testmember, @staff_out, 'standard', NOW() - INTERVAL 30 DAY, CURDATE() - INTERVAL 16 DAY),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0013'), @dan,        @staff_out, 'standard', NOW() - INTERVAL 20 DAY, CURDATE() - INTERVAL 6 DAY),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0002'), @eva,        @staff_out, 'standard', NOW() - INTERVAL 18 DAY, CURDATE() - INTERVAL 4 DAY),
 -- not yet due
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0006'), @alice,      @staff_out, 'standard', NOW() - INTERVAL 3 DAY,  CURDATE() + INTERVAL 11 DAY),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0014'), @carla,      @staff_out, 'standard', NOW() - INTERVAL 10 DAY, CURDATE() + INTERVAL 4 DAY),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0102'), @bob,        @staff_out, 'short',    NOW() - INTERVAL 2 DAY,  CURDATE() + INTERVAL 1 DAY),
 ((SELECT Copy_id FROM Copy WHERE Barcode='LIB-0012'), @eva,        @staff_out, 'standard', NOW() - INTERVAL 1 DAY,  CURDATE() + INTERVAL 13 DAY);

-- A copy with an open loan is 'on loan' (the app keeps this in sync; here we set it once)
UPDATE Copy c JOIN Loan l ON l.Copy_id = c.Copy_id AND l.Return_date IS NULL
   SET c.Status = 'on loan';

-- =====================================================================
-- 9. Fines. The trigger already created 4 overdue fines (section 7). Make them look realistic:
-- =====================================================================
-- Date the fine on the day the item came back (the trigger uses today's date by default)
UPDATE Fine f JOIN Loan l ON l.Loan_id = f.Loan_id SET f.Date_assessed = l.Return_date
 WHERE l.Return_date IS NOT NULL;

-- Alice's late return was paid (Is_paid and Date_paid must agree)
UPDATE Fine f JOIN Loan l ON l.Loan_id = f.Loan_id
   SET f.Is_paid = TRUE, f.Date_paid = CURDATE()
 WHERE l.Copy_id = (SELECT Copy_id FROM Copy WHERE Barcode='LIB-0003') AND f.Fine_type = 'overdue';

-- Carla returned LIB-0009 damaged: mark the copy and add a 'damaged' fine = replacement cost
UPDATE Copy SET `Condition` = 'damaged' WHERE Barcode = 'LIB-0009';
INSERT INTO Fine (Loan_id, Fine_type, Amount, Date_assessed)
SELECT l.Loan_id, 'damaged', ci.Replacement_cost, l.Return_date
  FROM Loan l JOIN Copy c ON c.Copy_id = l.Copy_id JOIN CatalogItem ci ON ci.Item_id = c.Item_id
 WHERE c.Barcode = 'LIB-0009';

-- Mini-world rule: an overdue fine also exists while the item is STILL OUT past its due date
-- ($0.35 per day, capped at $10). Create those for the three open overdue loans, dated today.
-- If one of these loans is returned later, the trigger raises the existing fine instead of adding a second.
INSERT INTO Fine (Loan_id, Fine_type, Amount, Date_assessed)
SELECT Loan_id, 'overdue', LEAST(DATEDIFF(CURDATE(), Due_date) * 0.35, 10.00), CURDATE()
  FROM Loan
 WHERE Return_date IS NULL AND Due_date < CURDATE();

-- =====================================================================
-- 10. Holds (one waiting, one ready) and extra notifications
--     (the 4 'fine_assessed' notifications were already added by the trigger)
-- =====================================================================
-- Alice waits for Animal Farm (both copies are on loan)
INSERT INTO Hold (Item_id, Member_id, Status)
VALUES ((SELECT Item_id FROM CatalogItem WHERE Title='Animal Farm'), @alice, 'Active');
-- Bob's hold on Emma is ready: copy LIB-0015 is set aside for the 2-day pickup window
INSERT INTO Hold (Item_id, Member_id, Reserved_copy_id, Status, Expiry_date)
VALUES ((SELECT Item_id FROM CatalogItem WHERE Title='Emma'), @bob,
        (SELECT Copy_id FROM Copy WHERE Barcode='LIB-0015'), 'Ready', CURDATE() + INTERVAL 2 DAY);

INSERT INTO Notification (Member_id, Notification_type, Message, Is_read) VALUES
 (@bob,        'hold_ready', 'Your hold on Emma is ready for pickup. It will be held for 2 days.', FALSE),
 (@carla,      'due_soon',   'Animal Farm is due in 4 days.', FALSE),
 (@testmember, 'overdue',    'Murder on the Orient Express is overdue. Please return it as soon as possible.', FALSE),
 (@dan,        'overdue',    'Animal Farm is overdue. Please return it as soon as possible.', FALSE),
 (@eva,        'overdue',    '1984 is overdue. Please return it as soon as possible.', TRUE);

SET SQL_SAFE_UPDATES = 1;

-- Quick check (read the three numbers in the result):
SELECT (SELECT COUNT(*) FROM Loan)         AS loans,
       (SELECT COUNT(*) FROM Fine)         AS fines,
       (SELECT COUNT(*) FROM Notification) AS notifications;