-- =====================================================================
-- more_catalog_data.sql  --  extra catalog items and copies for the demo
-- Adds items from the categories Sample_data.sql does not use (videogame, board game,
-- music, newspaper, research paper) and a few more books, so Search and the reports
-- have more to show. It adds ONLY catalog rows and copies: no members, loans, holds
-- or fines, so the demo steps and the triggers behave exactly as before.
--
-- Run order:  schema.sql -> seed_accounts.sql -> trigger_overdue_fine.sql -> Sample_data.sql
--             -> circulation.sql -> trigger_hold_ready.sql -> trigger_hold_completed.sql
--             -> reports.sql -> THIS FILE (it can also go right after Sample_data.sql).
-- Run it ONCE per fresh load. To load everything again, start from library_reset.sql
-- (Sample_data.sql cannot clear these rows by itself because the subtype tables
-- point at them).
-- =====================================================================
USE library;

-- =====================================================================
-- 1. Publishers and authors (new ones only; Sample_data.sql has the first few)
-- =====================================================================
INSERT INTO Publisher (Name) VALUES
    ('Houghton Mifflin'), ('Scribner'), ('Simon & Schuster'), ('McGraw-Hill'),
    ('Nintendo'), ('Mojang Studios'), ('Kosmos'), ('Days of Wonder'),
    ('Apple Records'), ('Epic Records'), ('Houston Chronicle'),
    ('Association for Computing Machinery');

INSERT INTO Author (First_name, Last_name) VALUES
    ('J.R.R.', 'Tolkien'), ('Ray', 'Bradbury'), ('F. Scott', 'Fitzgerald'),
    ('Aldous', 'Huxley'), ('Mary', 'Shelley'), ('Abraham', 'Silberschatz'),
    ('Henry', 'Korth'), ('S.', 'Sudarshan'), ('Edgar F.', 'Codd');

-- =====================================================================
-- 2. Catalog items: a CatalogItem row FIRST, then its subtype row
--    (Item_type is always written explicitly, it has no default)
-- =====================================================================
INSERT INTO CatalogItem (Item_type, Title, Publisher_id, Publication_year, Replacement_cost) VALUES
 ('book',      'The Hobbit',                          (SELECT Publisher_id FROM Publisher WHERE Name='Houghton Mifflin'), 1937, 14.99),
 ('book',      'Fahrenheit 451',                      (SELECT Publisher_id FROM Publisher WHERE Name='Simon & Schuster'), 1953, 13.99),
 ('book',      'The Great Gatsby',                    (SELECT Publisher_id FROM Publisher WHERE Name='Scribner'), 1925, 12.99),
 ('book',      'Brave New World',                     (SELECT Publisher_id FROM Publisher WHERE Name='HarperCollins'), 1932, 13.49),
 ('book',      'Frankenstein',                        (SELECT Publisher_id FROM Publisher WHERE Name='Penguin Books'), 1818, 9.99),
 ('book',      'Database System Concepts',            (SELECT Publisher_id FROM Publisher WHERE Name='McGraw-Hill'), 2019, 89.99),
 ('videogame', 'The Legend of Zelda: Breath of the Wild', (SELECT Publisher_id FROM Publisher WHERE Name='Nintendo'), 2017, 59.99),
 ('videogame', 'Minecraft',                           (SELECT Publisher_id FROM Publisher WHERE Name='Mojang Studios'), 2011, 29.99),
 ('boardgame', 'Catan',                               (SELECT Publisher_id FROM Publisher WHERE Name='Kosmos'), 1995, 44.99),
 ('boardgame', 'Ticket to Ride',                      (SELECT Publisher_id FROM Publisher WHERE Name='Days of Wonder'), 2004, 54.99),
 ('music',     'Abbey Road',                          (SELECT Publisher_id FROM Publisher WHERE Name='Apple Records'), 1969, 14.99),
 ('music',     'Thriller',                            (SELECT Publisher_id FROM Publisher WHERE Name='Epic Records'), 1982, 12.99),
 ('newspaper', 'Houston Chronicle, October 20, 2026', (SELECT Publisher_id FROM Publisher WHERE Name='Houston Chronicle'), 2026, 3.00),
 ('researchpaper', 'A Relational Model of Data for Large Shared Data Banks', (SELECT Publisher_id FROM Publisher WHERE Name='Association for Computing Machinery'), 1970, 25.00);

-- Books
INSERT INTO Book (Item_id, Item_type, Isbn, Genre)
SELECT Item_id, 'book',
       CASE Title WHEN 'The Hobbit' THEN '9780000000097' WHEN 'Fahrenheit 451' THEN '9780000000103'
                  WHEN 'The Great Gatsby' THEN '9780000000110' WHEN 'Brave New World' THEN '9780000000127'
                  WHEN 'Frankenstein' THEN '9780000000134' WHEN 'Database System Concepts' THEN '9780000000141' END,
       CASE Title WHEN 'The Hobbit' THEN 'Fantasy' WHEN 'Fahrenheit 451' THEN 'Dystopian'
                  WHEN 'The Great Gatsby' THEN 'Classic' WHEN 'Brave New World' THEN 'Dystopian'
                  WHEN 'Frankenstein' THEN 'Gothic' WHEN 'Database System Concepts' THEN 'Textbook' END
FROM CatalogItem
WHERE Title IN ('The Hobbit', 'Fahrenheit 451', 'The Great Gatsby', 'Brave New World',
                'Frankenstein', 'Database System Concepts');

-- Video games
INSERT INTO Videogame (Item_id, Item_type, Platform, Developer, Esrb_rating)
SELECT Item_id, 'videogame',
       CASE Title WHEN 'Minecraft' THEN 'Multi-platform' ELSE 'Nintendo Switch' END,
       CASE Title WHEN 'Minecraft' THEN 'Mojang Studios' ELSE 'Nintendo' END,
       'E10+'
FROM CatalogItem WHERE Item_type = 'videogame' AND Title IN ('The Legend of Zelda: Breath of the Wild', 'Minecraft');

-- Board games
INSERT INTO BoardGame (Item_id, Item_type, Min_players, Max_players, Designer)
SELECT Item_id, 'boardgame',
       CASE Title WHEN 'Catan' THEN 3 ELSE 2 END,
       CASE Title WHEN 'Catan' THEN 4 ELSE 5 END,
       CASE Title WHEN 'Catan' THEN 'Klaus Teuber' ELSE 'Alan R. Moon' END
FROM CatalogItem WHERE Item_type = 'boardgame' AND Title IN ('Catan', 'Ticket to Ride');

-- Music
INSERT INTO Music (Item_id, Item_type, Artist, Track_count)
SELECT Item_id, 'music',
       CASE Title WHEN 'Abbey Road' THEN 'The Beatles' ELSE 'Michael Jackson' END,
       CASE Title WHEN 'Abbey Road' THEN 17 ELSE 9 END
FROM CatalogItem WHERE Item_type = 'music' AND Title IN ('Abbey Road', 'Thriller');

-- Newspaper (Edition left empty = the only edition; not a historical issue)
INSERT INTO Newspaper (Item_id, Item_type, Newspaper_name, Issue_date, Edition, Is_historical)
SELECT Item_id, 'newspaper', 'Houston Chronicle', '2026-10-20', '', FALSE
FROM CatalogItem WHERE Title = 'Houston Chronicle, October 20, 2026';

-- Research paper (Codd's 1970 paper that started relational databases)
INSERT INTO ResearchPaper (Item_id, Item_type, Doi, Journal_name, Volume, Issue, Page_range)
SELECT Item_id, 'researchpaper', '10.1145/362384.362685',
       'Communications of the ACM', '13', '6', '377-387'
FROM CatalogItem WHERE Title = 'A Relational Model of Data for Large Shared Data Banks';

-- =====================================================================
-- 3. Who wrote what
-- =====================================================================
INSERT INTO BookAuthor (Item_id, Author_id) VALUES
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Hobbit'),                 (SELECT Author_id FROM Author WHERE Last_name='Tolkien')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Fahrenheit 451'),             (SELECT Author_id FROM Author WHERE Last_name='Bradbury')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Great Gatsby'),           (SELECT Author_id FROM Author WHERE Last_name='Fitzgerald')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Brave New World'),            (SELECT Author_id FROM Author WHERE Last_name='Huxley')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Frankenstein'),               (SELECT Author_id FROM Author WHERE Last_name='Shelley')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Database System Concepts'),   (SELECT Author_id FROM Author WHERE Last_name='Silberschatz')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Database System Concepts'),   (SELECT Author_id FROM Author WHERE Last_name='Korth')),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Database System Concepts'),   (SELECT Author_id FROM Author WHERE Last_name='Sudarshan'));

INSERT INTO PaperAuthor (Item_id, Author_id) VALUES
 ((SELECT Item_id FROM CatalogItem WHERE Title='A Relational Model of Data for Large Shared Data Banks'),
  (SELECT Author_id FROM Author WHERE Last_name='Codd'));

-- =====================================================================
-- 4. Physical copies. All start 'available' (no loans are created here).
--    Barcodes continue after the existing LIB-0001..0016 and LIB-0101..0103.
-- =====================================================================
INSERT INTO Copy (Item_id, Barcode, `Condition`, Shelf_location, Date_acquired) VALUES
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Hobbit'),                'LIB-0017', 'good', 'FIC-TOL', '2024-01-10'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Hobbit'),                'LIB-0018', 'new',  'FIC-TOL', '2025-02-14'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Fahrenheit 451'),            'LIB-0019', 'good', 'FIC-BRA', '2023-09-05'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Fahrenheit 451'),            'LIB-0020', 'worn', 'FIC-BRA', '2021-03-22'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Great Gatsby'),          'LIB-0021', 'good', 'FIC-FIT', '2023-05-17'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Great Gatsby'),          'LIB-0022', 'good', 'FIC-FIT', '2023-05-17'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Brave New World'),           'LIB-0023', 'good', 'FIC-HUX', '2022-08-09'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Brave New World'),           'LIB-0024', 'good', 'FIC-HUX', '2022-08-09'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Frankenstein'),              'LIB-0025', 'worn', 'FIC-SHE', '2020-10-30'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Database System Concepts'),  'LIB-0026', 'new',  'TXT-DB',  '2025-08-18'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Database System Concepts'),  'LIB-0027', 'good', 'TXT-DB',  '2025-08-18'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Database System Concepts'),  'LIB-0028', 'good', 'TXT-DB',  '2025-08-18'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Legend of Zelda: Breath of the Wild'), 'LIB-0201', 'good', 'GAME-A', '2024-11-20'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='The Legend of Zelda: Breath of the Wild'), 'LIB-0202', 'good', 'GAME-A', '2024-11-20'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Minecraft'),                 'LIB-0203', 'new',  'GAME-B', '2025-01-12'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Catan'),                     'LIB-0301', 'good', 'BOARD-A', '2023-12-01'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Ticket to Ride'),            'LIB-0302', 'good', 'BOARD-A', '2023-12-01'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Ticket to Ride'),            'LIB-0303', 'worn', 'BOARD-A', '2021-12-15'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Abbey Road'),                'LIB-0401', 'good', 'CD-A', '2022-04-04'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Thriller'),                  'LIB-0402', 'good', 'CD-A', '2022-04-04'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='Houston Chronicle, October 20, 2026'), 'LIB-0501', 'new', 'NEWS-A', '2026-10-20'),
 ((SELECT Item_id FROM CatalogItem WHERE Title='A Relational Model of Data for Large Shared Data Banks'), 'LIB-0601', 'good', 'PAPER-A', '2024-09-01');
