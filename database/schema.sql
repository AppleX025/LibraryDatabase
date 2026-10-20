-- ( create a database called library)
CREATE DATABASE IF NOT EXISTS library;
-- select it so every table I create next goes inside it
USE library;

-- Foreign key rule: every foreign key uses ON DELETE RESTRICT ON UPDATE RESTRICT.
-- The system soft-deletes (Is_active / Status columns) and never hard-deletes history,
-- so MySQL should refuse to remove or re-key a row that other rows still point to.

-- =====================================================================
-- 1. Publisher
-- =====================================================================
CREATE TABLE Publisher (
    Publisher_id INT AUTO_INCREMENT NOT NULL,
    Name VARCHAR(100) NOT NULL,

    PRIMARY KEY (Publisher_id),
    CONSTRAINT uq_publisher_name UNIQUE (Name)
);

-- =====================================================================
-- 2. Author
-- =====================================================================

CREATE TABLE Author(
    Author_id INT AUTO_INCREMENT NOT NULL,
    First_name VARCHAR(50) NOT NULL,
    Last_name VARCHAR(50) NOT NULL,

    PRIMARY KEY (Author_id) 
);

-- =====================================================================
-- 3. MemberType — borrowing limits for each kind of member
-- =====================================================================
CREATE TABLE MemberType (
    Member_type_id  INT AUTO_INCREMENT NOT NULL,
    Type_name       VARCHAR(20) NOT NULL,            -- e.g. Student, Faculty, Staff, Alumni
    Max_loans       INT NOT NULL,                    -- most items a member may borrow at once
    Max_media_loans INT NOT NULL,                    -- most media items (videogame, DVD, music, board game)
    Max_renewals    INT NOT NULL,                    -- renewals allowed per loan (999 = unlimited)

    PRIMARY KEY (Member_type_id),
    CONSTRAINT uq_membertype_type_name UNIQUE (Type_name),
    CONSTRAINT ck_membertype_name_not_blank CHECK (TRIM(Type_name) <> ''),
    CONSTRAINT ck_membertype_max_loans CHECK (Max_loans > 0),
    CONSTRAINT ck_membertype_max_media_loans CHECK (Max_media_loans > 0),
    CONSTRAINT ck_membertype_max_renewals CHECK (Max_renewals >= 0),
    CONSTRAINT ck_membertype_media_within_loans CHECK (Max_media_loans <= Max_loans)
);

-- =====================================================================
-- 4. Staff — library employees who operate checkout, check-in, member records
-- =====================================================================
CREATE TABLE Staff (
    Staff_id      INT AUTO_INCREMENT NOT NULL,
    First_name    VARCHAR(50) NOT NULL,
    Last_name     VARCHAR(50) NOT NULL,
    Email         VARCHAR(100) NOT NULL,
    Password_hash VARCHAR(255) NOT NULL,             -- never the plain password
    Is_active     BOOLEAN NOT NULL DEFAULT TRUE,     -- false = account deactivated
    Is_admin      BOOLEAN NOT NULL DEFAULT FALSE,    -- true = administrator: staff who may also waive fines

    PRIMARY KEY (Staff_id),
    CONSTRAINT uq_staff_email UNIQUE (Email),
    CONSTRAINT ck_staff_first_name_not_blank CHECK (TRIM(First_name) <> ''),
    CONSTRAINT ck_staff_last_name_not_blank CHECK (TRIM(Last_name) <> ''),
    CONSTRAINT ck_staff_email_not_blank CHECK (TRIM(Email) <> ''),
    CONSTRAINT ck_staff_password_not_blank CHECK (TRIM(Password_hash) <> ''),
    CONSTRAINT ck_staff_email_format
        CHECK (Email REGEXP '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
                                                     -- something@something.something, no spaces
);

-- =====================================================================
-- 5. Member — a person registered to borrow
-- =====================================================================
CREATE TABLE Member (
    Member_id       INT AUTO_INCREMENT NOT NULL,
    Member_type_id  INT NOT NULL,                    -- which kind of member (limits come from here)
    Staff_id        INT NULL,                        -- only set when a library employee also borrows
    Username        VARCHAR(30) NOT NULL,
    First_name      VARCHAR(50) NOT NULL,
    Last_name       VARCHAR(50) NOT NULL,
    Email           VARCHAR(100) NOT NULL,
    Phone           VARCHAR(20) NULL,                -- optional
    Street          VARCHAR(100) NULL,               -- optional
    City            VARCHAR(50) NULL,                -- optional
    State           VARCHAR(2) NULL,                 -- optional, two capital letters
    Zip_code        VARCHAR(10) NULL,                -- optional
    Password_hash   VARCHAR(255) NOT NULL,
    Date_registered DATE NOT NULL DEFAULT (CURRENT_DATE),   -- today unless told otherwise
    Is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    PRIMARY KEY (Member_id),
    CONSTRAINT fk_member_membertype FOREIGN KEY (Member_type_id)
        REFERENCES MemberType(Member_type_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_member_staff FOREIGN KEY (Staff_id)
        REFERENCES Staff(Staff_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_member_username UNIQUE (Username),
    CONSTRAINT uq_member_email UNIQUE (Email),
    CONSTRAINT uq_member_staff UNIQUE (Staff_id),    -- one employee = at most one member record
    CONSTRAINT ck_member_username_not_blank CHECK (TRIM(Username) <> ''),
    CONSTRAINT ck_member_first_name_not_blank CHECK (TRIM(First_name) <> ''),
    CONSTRAINT ck_member_last_name_not_blank CHECK (TRIM(Last_name) <> ''),
    CONSTRAINT ck_member_email_not_blank CHECK (TRIM(Email) <> ''),
    CONSTRAINT ck_member_password_not_blank CHECK (TRIM(Password_hash) <> ''),
    CONSTRAINT ck_member_email_format
        CHECK (Email REGEXP '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
    CONSTRAINT ck_member_phone_has_digit CHECK (Phone IS NULL OR Phone REGEXP '[0-9]'),
    CONSTRAINT ck_member_phone_symbols CHECK (Phone IS NULL OR Phone REGEXP '^[0-9() .+-]+$'),
    CONSTRAINT ck_member_zip_format
        CHECK (Zip_code IS NULL OR Zip_code REGEXP '^[0-9]{5}(-[0-9]{4})?$'),  -- 12345 or 12345-6789
    CONSTRAINT ck_member_state_format
        CHECK (State IS NULL OR REGEXP_LIKE(State, '^[A-Z]{2}$', 'c'))         -- 'c' = case-sensitive
);

-- =====================================================================
-- 6. CatalogItem — the supertype: fields common to every item
-- =====================================================================
CREATE TABLE CatalogItem (
    Item_id   INT AUTO_INCREMENT NOT NULL,
    Item_type ENUM('book', 'videogame','boardgame','dvd','music','newspaper','researchpaper')  NOT NULL,
    Title VARCHAR(255) NOT NULL,
    Publisher_id INT NULL,
    Publication_year SMALLINT NULL,
    Replacement_cost NUMERIC(6,2) NULL,
    
    PRIMARY KEY (Item_id),
    CONSTRAINT fk_catalogitem_publisher FOREIGN KEY (Publisher_id)
        REFERENCES Publisher(Publisher_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_catalogitem_id_type UNIQUE (Item_id, Item_type),
    CONSTRAINT ck_catalogitem_title_not_blank CHECK (TRIM(Title) <> ''),
    CONSTRAINT ck_catalogitem_replacement_cost CHECK (Replacement_cost >= 0),
    CONSTRAINT ck_catalogitem_publication_year CHECK (Publication_year IS NULL OR Publication_year BETWEEN 1400 AND 2100)
);

-- =====================================================================
-- 7. Book — subtype of CatalogItem (Item_type = 'book')
-- =====================================================================
CREATE TABLE Book (
    Item_id INT NOT NULL,
    Item_type ENUM('book', 'videogame','boardgame','dvd','music','newspaper','researchpaper') 
              NOT NULL,
    Isbn VARCHAR(13) NULL,
    Genre VARCHAR(50) NULL,
    PRIMARY KEY (Item_id),
    CONSTRAINT fk_book_catalogitem FOREIGN KEY (Item_id, Item_type) 
        REFERENCES CatalogItem(Item_id, Item_type)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_book_isbn UNIQUE (Isbn),
    CONSTRAINT ck_book_type CHECK (Item_type = 'book'),
    CONSTRAINT ck_book_isbn_format
        CHECK (
            Isbn IS NULL
            OR Isbn REGEXP '^[0-9]{13}$'            -- ISBN-13: 13 digits
            OR Isbn REGEXP '^[0-9]{9}[0-9Xx]$' )    -- ISBN-10: 9 digits plus a digit or X
);
-- =====================================================================
-- 8. BookAuthor — which authors wrote which books (many-to-many)
-- =====================================================================
CREATE TABLE BookAuthor(
    Item_id INT NOT NULL,
    Author_id INT NOT NULL,
    PRIMARY KEY(Item_id, Author_id),
    CONSTRAINT fk_bookauthor_book FOREIGN KEY (Item_id) 
        REFERENCES Book(Item_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_bookauthor_author FOREIGN KEY (Author_id) 
        REFERENCES Author(Author_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- =====================================================================
-- 9. Videogame — subtype of CatalogItem (Item_type = 'videogame')
-- =====================================================================
CREATE TABLE Videogame (
    Item_id INT NOT NULL,
    Item_type ENUM('book', 'videogame','boardgame','dvd','music','newspaper','researchpaper') 
              NOT NULL,
    Platform    VARCHAR(30)  NULL,
    Developer   VARCHAR(100) NULL,
    Esrb_rating VARCHAR(10)  NULL,
    PRIMARY KEY (Item_id),
    CONSTRAINT fk_videogame_catalogitem FOREIGN KEY (Item_id, Item_type) 
        REFERENCES CatalogItem(Item_id, Item_type)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_videogame_type CHECK (Item_type = 'videogame')
);

-- =====================================================================
-- 10. BoardGame — subtype of CatalogItem (Item_type = 'boardgame')
-- =====================================================================
CREATE TABLE BoardGame (
    Item_id     INT NOT NULL,
    Item_type   ENUM('book','videogame','boardgame','dvd','music','newspaper','researchpaper')
                NOT NULL ,
    Min_players SMALLINT NULL,
    Max_players SMALLINT NULL,
    Designer    VARCHAR(100) NULL,

    PRIMARY KEY (Item_id),
    CONSTRAINT fk_boardgame_catalogitem FOREIGN KEY (Item_id, Item_type)
        REFERENCES CatalogItem(Item_id, Item_type)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_boardgame_type CHECK (Item_type = 'boardgame'),
    CONSTRAINT ck_boardgame_min_players CHECK (Min_players IS NULL OR Min_players > 0),
    CONSTRAINT ck_boardgame_max_players CHECK (Max_players IS NULL OR Max_players > 0),
    CONSTRAINT ck_boardgame_player_range
        CHECK (Min_players IS NULL OR Max_players IS NULL OR Max_players >= Min_players)
                                                     -- the maximum cannot be below the minimum
);

-- =====================================================================
-- 11. DVD — subtype of CatalogItem (Item_type = 'dvd')
-- =====================================================================
CREATE TABLE DVD (
    Item_id         INT NOT NULL,
    Item_type       ENUM('book','videogame','boardgame','dvd','music','newspaper','researchpaper')
                    NOT NULL,
    Runtime_minutes SMALLINT NULL,
    Director        VARCHAR(100) NULL,
    Mpaa_rating     VARCHAR(10) NULL,

    PRIMARY KEY (Item_id),
    CONSTRAINT fk_dvd_catalogitem FOREIGN KEY (Item_id, Item_type)
        REFERENCES CatalogItem(Item_id, Item_type)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_dvd_type CHECK (Item_type = 'dvd')
);


-- =====================================================================
-- 12. Music — subtype of CatalogItem (Item_type = 'music')
-- =====================================================================
CREATE TABLE Music (
    Item_id     INT NOT NULL,
    Item_type   ENUM('book','videogame','boardgame','dvd','music','newspaper','researchpaper')
                NOT NULL    ,
    Artist      VARCHAR(100) NULL,
    Track_count SMALLINT NULL,

    PRIMARY KEY (Item_id),
    CONSTRAINT fk_music_catalogitem FOREIGN KEY (Item_id, Item_type)
        REFERENCES CatalogItem(Item_id, Item_type)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_music_type CHECK (Item_type = 'music')
);


-- =====================================================================
-- 13. Newspaper — subtype of CatalogItem; one row per ISSUE
-- =====================================================================
CREATE TABLE Newspaper (
    Item_id        INT NOT NULL,
    Item_type      ENUM('book','videogame','boardgame','dvd','music','newspaper','researchpaper')
                   NOT NULL,
    Newspaper_name VARCHAR(100) NOT NULL,            -- e.g. the paper's name
    Issue_date     DATE NOT NULL,                    -- which day's issue this is
    Edition        VARCHAR(30) NOT NULL DEFAULT '',  -- empty = the only edition (not NULL, so duplicates are caught)
    Is_historical  BOOLEAN NOT NULL DEFAULT FALSE,   -- true = historical issue (priced $150-$425 by the app)

    PRIMARY KEY (Item_id),
    CONSTRAINT fk_newspaper_catalogitem FOREIGN KEY (Item_id, Item_type)
        REFERENCES CatalogItem(Item_id, Item_type)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_newspaper_issue UNIQUE (Newspaper_name, Issue_date, Edition),
                                                     -- the same issue cannot be entered twice
    CONSTRAINT ck_newspaper_type CHECK (Item_type = 'newspaper'),
    CONSTRAINT ck_newspaper_name_not_blank CHECK (TRIM(Newspaper_name) <> ''),
    INDEX idx_newspaper_issue_date (Issue_date)      -- makes searching by date fast
);


-- =====================================================================
-- 14. ResearchPaper — subtype of CatalogItem (Item_type = 'researchpaper')
-- =====================================================================
CREATE TABLE ResearchPaper (
    Item_id      INT NOT NULL,
    Item_type    ENUM('book','videogame','boardgame','dvd','music','newspaper','researchpaper')
                 NOT NULL,
    Doi          VARCHAR(100) NULL,                  -- optional, unique when present
    Journal_name VARCHAR(150) NULL,
    Volume       VARCHAR(20) NULL,
    Issue        VARCHAR(20) NULL,
    Page_range   VARCHAR(20) NULL,

    PRIMARY KEY (Item_id),
    CONSTRAINT fk_researchpaper_catalogitem FOREIGN KEY (Item_id, Item_type)
        REFERENCES CatalogItem(Item_id, Item_type)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_researchpaper_doi UNIQUE (Doi),
    CONSTRAINT ck_researchpaper_type CHECK (Item_type = 'researchpaper')
);


-- =====================================================================
-- 15. PaperAuthor — which authors wrote which research papers (many-to-many)
-- =====================================================================
CREATE TABLE PaperAuthor (
    Item_id   INT NOT NULL,                          -- the research paper
    Author_id INT NOT NULL,                          -- the author

    PRIMARY KEY (Item_id, Author_id),
    CONSTRAINT fk_paperauthor_researchpaper FOREIGN KEY (Item_id)
        REFERENCES ResearchPaper(Item_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_paperauthor_author FOREIGN KEY (Author_id)
        REFERENCES Author(Author_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);


-- =====================================================================
-- 16. Copy — one physical copy of a catalog item
-- =====================================================================
CREATE TABLE Copy (
    Copy_id        INT AUTO_INCREMENT NOT NULL,
    Item_id        INT NOT NULL,                     -- which catalog item this is a copy of
    Barcode        VARCHAR(20) NOT NULL,
    `Condition`    ENUM('new','good','worn','damaged') NOT NULL,   -- backticks: Condition is a reserved word
    Shelf_location VARCHAR(30) NULL,
    Status         ENUM('available','on loan','lost','withdrawn') NOT NULL DEFAULT 'available',
    Date_acquired  DATE NOT NULL,

    PRIMARY KEY (Copy_id),
    CONSTRAINT fk_copy_catalogitem FOREIGN KEY (Item_id)
        REFERENCES CatalogItem(Item_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_copy_barcode UNIQUE (Barcode)      -- every copy has its own barcode
);


-- =====================================================================
-- 17. Loan
-- =====================================================================
CREATE TABLE Loan (
    Loan_id         INT AUTO_INCREMENT NOT NULL,
    Copy_id         INT NOT NULL,                    -- the copy that was lent
    Member_id       INT NOT NULL,                    -- who borrowed it
    Staff_id        INT NOT NULL,                    -- staff who checked it OUT
    Return_staff_id INT NULL,                        -- staff who checked it IN (empty until returned)
    Loan_type       ENUM('short','standard') NOT NULL,   -- short = 3 days, no renewal; standard = 14 days
    Checkout_date   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Due_date        DATE NOT NULL,
    Return_date     DATE NULL,                       -- empty while the loan is open
    Renewal_count   SMALLINT NOT NULL DEFAULT 0,
    Open_copy_id    INT GENERATED ALWAYS AS (IF(Return_date IS NULL, Copy_id, NULL)) STORED,
                                                     -- helper filled in by MySQL: the copy's ID while the loan is
                                                     -- open, empty once returned. Never write to it.

    PRIMARY KEY (Loan_id),
    CONSTRAINT fk_loan_copy FOREIGN KEY (Copy_id)
        REFERENCES Copy(Copy_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_loan_member FOREIGN KEY (Member_id)
        REFERENCES Member(Member_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_loan_checkout_staff FOREIGN KEY (Staff_id)
        REFERENCES Staff(Staff_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_loan_return_staff FOREIGN KEY (Return_staff_id)
        REFERENCES Staff(Staff_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_loan_open_copy UNIQUE (Open_copy_id),
                                                     -- a copy can have at most ONE open loan (empty values never clash)
    CONSTRAINT ck_loan_due_after_checkout CHECK (Due_date > Checkout_date),
                                                     -- due at least the day after checkout
    CONSTRAINT ck_loan_return_not_before_checkout CHECK (Return_date + INTERVAL 1 DAY > Checkout_date),
                                                     -- a same-day return is allowed
    CONSTRAINT ck_loan_renewal_count CHECK (Renewal_count >= 0),
    CONSTRAINT ck_loan_return_staff_pair CHECK ((Return_date IS NULL) = (Return_staff_id IS NULL)),
                                                     -- return date and check-in staff are filled in together
    CONSTRAINT ck_loan_short_no_renewal CHECK (Loan_type <> 'short' OR Renewal_count = 0),
                                                     -- short loans cannot be renewed
    CONSTRAINT ck_loan_short_due_window CHECK (Loan_type <> 'short' OR Due_date <= Checkout_date + INTERVAL 3 DAY),
                                                     -- short loan: due within 3 days
    CONSTRAINT ck_loan_standard_due_window
        CHECK (Loan_type <> 'standard' OR Due_date <= Checkout_date + INTERVAL (14 * (Renewal_count + 1)) DAY)
                                                     -- standard loan: 14 days, plus 14 more for each renewal
);


-- =====================================================================
-- 18. Hold
-- =====================================================================
CREATE TABLE Hold (
    Hold_id          INT AUTO_INCREMENT NOT NULL,
    Item_id          INT NOT NULL,                   -- holds are placed on the item, not on one copy
    Member_id        INT NOT NULL,
    Reserved_copy_id INT NULL,                       -- the specific copy set aside once the hold is Ready
    Hold_date        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Status           ENUM('Active','Ready','Expired','Cancelled','Completed') NOT NULL DEFAULT 'Active',
    Expiry_date      DATE NULL,
    Is_open          TINYINT GENERATED ALWAYS AS (IF(Status IN ('Active','Ready'), 1, NULL)) STORED,
                                                     -- helper filled in by MySQL: 1 while the hold is still open.
                                                     -- Never write to it.

    PRIMARY KEY (Hold_id),
    CONSTRAINT fk_hold_catalogitem FOREIGN KEY (Item_id)
        REFERENCES CatalogItem(Item_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_hold_member FOREIGN KEY (Member_id)
        REFERENCES Member(Member_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_hold_reserved_copy FOREIGN KEY (Reserved_copy_id)
        REFERENCES Copy(Copy_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_hold_one_open_per_member_item UNIQUE (Item_id, Member_id, Is_open),
                                                     -- one open hold per member and item (old holds can pile up)
    CONSTRAINT ck_hold_ready_needs_copy CHECK (Status <> 'Ready' OR Reserved_copy_id IS NOT NULL),
                                                     -- a Ready hold must name its copy
    CONSTRAINT ck_hold_expiry_not_before_hold CHECK (Expiry_date + INTERVAL 1 DAY > Hold_date)
);


-- =====================================================================
-- 19. Fine
-- =====================================================================
CREATE TABLE Fine (
    Fine_id       INT AUTO_INCREMENT NOT NULL,
    Loan_id       INT NOT NULL,                      -- fines belong to a loan, not directly to a member
    Fine_type     ENUM('overdue','damaged','lost') NOT NULL,
    Amount        NUMERIC(6,2) NOT NULL,
    Date_assessed DATE NOT NULL DEFAULT (CURRENT_DATE),
    Date_paid     DATE NULL,                         -- empty until paid
    Is_paid       BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (Fine_id),
    CONSTRAINT fk_fine_loan FOREIGN KEY (Loan_id)
        REFERENCES Loan(Loan_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_fine_loan_type UNIQUE (Loan_id, Fine_type),
                                                     -- at most one fine of each type per loan
    CONSTRAINT ck_fine_amount CHECK (Amount >= 0),
    CONSTRAINT ck_fine_paid_after_assessed CHECK (Date_paid >= Date_assessed),
    CONSTRAINT ck_fine_paid_matches_date
        CHECK ((Is_paid = TRUE AND Date_paid IS NOT NULL) OR (Is_paid = FALSE AND Date_paid IS NULL))
                                                     -- "paid" and "date paid" always agree
);


-- =====================================================================
-- 20. Notification
-- =====================================================================
CREATE TABLE Notification (
    Notification_id   INT AUTO_INCREMENT NOT NULL,
    Member_id         INT NOT NULL,
    Notification_type ENUM('hold_ready','due_soon','overdue','fine_assessed') NOT NULL,
    Channel           ENUM('in_app','email','postal') NOT NULL DEFAULT 'in_app',
    Message           VARCHAR(255) NOT NULL,
    Date_sent         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Is_read           BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (Notification_id),
    CONSTRAINT fk_notification_member FOREIGN KEY (Member_id)
        REFERENCES Member(Member_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);