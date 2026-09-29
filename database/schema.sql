-- ( create a database called library)
CREATE DATABASE IF NOT EXISTS library;
-- select it so every table I create next goes inside it
USE library;


CREATE TABLE Publisher (
    Publisher_id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
    Name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE CatalogItem (
    item_id   INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
    item_type ENUM('book', 'videogame','boardgame','dvd','music')  NOT NULL,
    Title VARCHAR(255) NOT NULL,
    Publisher_id INT NULL,
    Publication_year SMALLINT NULL,
    Replacement_cost NUMERIC(6,2) NULL,
    CHECK (Replacement_cost >= 0),
    FOREIGN KEY(Publisher_id) REFERENCES Publisher(publisher_id) 
);


CREATE TABLE Author(
    Author_id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
    First_name VARCHAR(50) NOT NULL,
    Last_name VARCHAR(50) NOT NULL
);

CREATE TABLE BookAuthor(
    Item_id INT NOT NULL,
    Author_id INT NOT NULL,
    PRIMARY KEY(Item_id, Author_id),
    FOREIGN KEY(Item_id) REFERENCES CatalogItem(item_id),
    FOREIGN KEY(Author_id) REFERENCES Author(Author_id)
);

CREATE TABLE Book (
    Item_id INT NOT NULL,
    Isbn VARCHAR(13) UNIQUE,
    Genre VARCHAR(50),
    PRIMARY KEY (Item_id),
    CONSTRAINT fk_book_catalogitem
        FOREIGN KEY (Item_id) REFERENCES CatalogItem(Item_id),
    CONSTRAINT chk_book_isbn
        CHECK (
            Isbn IS NULL
            OR Isbn REGEXP '^[0-9]{13}$'
            OR Isbn REGEXP '^[0-9]{9}[0-9Xx]$'
        )
);

CREATE TABLE Videogame (
    Item_id INT NOT NULL,
    Platform VARCHAR(30),
    Developer VARCHAR(100),
    Esrb_rating VARCHAR(10),
    PRIMARY KEY (Item_id),
    CONSTRAINT fk_videogame_catalogitem
        FOREIGN KEY (Item_id) REFERENCES CatalogItem(Item_id)
);

CREATE TABLE BoardGame (
    Item_id INT NOT NULL,
    Min_players SMALLINT,
    Max_players SMALLINT,
    Designer VARCHAR(100),
    PRIMARY KEY (Item_id),
    CONSTRAINT fk_boardgame_catalogitem
        FOREIGN KEY (Item_id) REFERENCES CatalogItem(Item_id),
    CONSTRAINT chk_boardgame_min_players
        CHECK (Min_players IS NULL OR Min_players > 0),
    CONSTRAINT chk_boardgame_max_players
        CHECK (Max_players IS NULL OR Max_players > 0),
    CONSTRAINT chk_boardgame_player_range
        CHECK (
            Min_players IS NULL
            OR Max_players IS NULL
            OR Max_players >= Min_players
        )
);

CREATE TABLE DVD (
    Item_id INT NOT NULL,
    Runtime_minutes SMALLINT,
    Director VARCHAR(100),
    Mpaa_rating VARCHAR(10),
    
    PRIMARY KEY (Item_id),
    FOREIGN KEY (Item_id) REFERENCES CatalogItem(Item_id)
);

CREATE TABLE Music (
    Item_id INT NOT NULL,
    Artist VARCHAR(100),
    Track_count SMALLINT,
    PRIMARY KEY (Item_id),
	FOREIGN KEY (Item_id) REFERENCES CatalogItem(Item_id)
);

CREATE TABLE Copy (
    Copy_id INT AUTO_INCREMENT NOT NULL,
    Item_id INT NOT NULL,
    Barcode VARCHAR(20) NOT NULL UNIQUE,
    `Condition` ENUM('new', 'good', 'worn', 'damaged') NOT NULL,
    Shelf_location VARCHAR(30),
    Status ENUM('available', 'on loan', 'lost', 'withdrawn') NOT NULL DEFAULT 'available',
    Date_acquired DATE NOT NULL,
    
    PRIMARY KEY (Copy_id),
	FOREIGN KEY (Item_id) REFERENCES CatalogItem(Item_id)
);