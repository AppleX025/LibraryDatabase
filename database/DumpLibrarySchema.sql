CREATE DATABASE  IF NOT EXISTS `library` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `library`;
-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: library
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `author`
--

DROP TABLE IF EXISTS `author`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `author` (
  `Author_id` int NOT NULL AUTO_INCREMENT,
  `First_name` varchar(50) NOT NULL,
  `Last_name` varchar(50) NOT NULL,
  PRIMARY KEY (`Author_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `author`
--

LOCK TABLES `author` WRITE;
/*!40000 ALTER TABLE `author` DISABLE KEYS */;
/*!40000 ALTER TABLE `author` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `boardgame`
--

DROP TABLE IF EXISTS `boardgame`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `boardgame` (
  `Item_id` int NOT NULL,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Min_players` smallint DEFAULT NULL,
  `Max_players` smallint DEFAULT NULL,
  `Designer` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`Item_id`),
  KEY `fk_boardgame_catalogitem` (`Item_id`,`Item_type`),
  CONSTRAINT `fk_boardgame_catalogitem` FOREIGN KEY (`Item_id`, `Item_type`) REFERENCES `catalogitem` (`Item_id`, `Item_type`),
  CONSTRAINT `ck_boardgame_max_players` CHECK (((`Max_players` is null) or (`Max_players` > 0))),
  CONSTRAINT `ck_boardgame_min_players` CHECK (((`Min_players` is null) or (`Min_players` > 0))),
  CONSTRAINT `ck_boardgame_player_range` CHECK (((`Min_players` is null) or (`Max_players` is null) or (`Max_players` >= `Min_players`))),
  CONSTRAINT `ck_boardgame_type` CHECK ((`Item_type` = _utf8mb4'boardgame'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `boardgame`
--

LOCK TABLES `boardgame` WRITE;
/*!40000 ALTER TABLE `boardgame` DISABLE KEYS */;
/*!40000 ALTER TABLE `boardgame` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `book`
--

DROP TABLE IF EXISTS `book`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `book` (
  `Item_id` int NOT NULL,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Isbn` varchar(13) DEFAULT NULL,
  `Genre` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`Item_id`),
  UNIQUE KEY `uq_book_isbn` (`Isbn`),
  KEY `fk_book_catalogitem` (`Item_id`,`Item_type`),
  CONSTRAINT `fk_book_catalogitem` FOREIGN KEY (`Item_id`, `Item_type`) REFERENCES `catalogitem` (`Item_id`, `Item_type`),
  CONSTRAINT `ck_book_isbn_format` CHECK (((`Isbn` is null) or regexp_like(`Isbn`,_utf8mb4'^[0-9]{13}$') or regexp_like(`Isbn`,_utf8mb4'^[0-9]{9}[0-9Xx]$'))),
  CONSTRAINT `ck_book_type` CHECK ((`Item_type` = _utf8mb4'book'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `book`
--

LOCK TABLES `book` WRITE;
/*!40000 ALTER TABLE `book` DISABLE KEYS */;
/*!40000 ALTER TABLE `book` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookauthor`
--

DROP TABLE IF EXISTS `bookauthor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookauthor` (
  `Item_id` int NOT NULL,
  `Author_id` int NOT NULL,
  PRIMARY KEY (`Item_id`,`Author_id`),
  KEY `fk_bookauthor_author` (`Author_id`),
  CONSTRAINT `fk_bookauthor_author` FOREIGN KEY (`Author_id`) REFERENCES `author` (`Author_id`),
  CONSTRAINT `fk_bookauthor_book` FOREIGN KEY (`Item_id`) REFERENCES `book` (`Item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookauthor`
--

LOCK TABLES `bookauthor` WRITE;
/*!40000 ALTER TABLE `bookauthor` DISABLE KEYS */;
/*!40000 ALTER TABLE `bookauthor` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `catalogitem`
--

DROP TABLE IF EXISTS `catalogitem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `catalogitem` (
  `Item_id` int NOT NULL AUTO_INCREMENT,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Title` varchar(255) NOT NULL,
  `Publisher_id` int DEFAULT NULL,
  `Publication_year` smallint DEFAULT NULL,
  `Replacement_cost` decimal(6,2) DEFAULT NULL,
  PRIMARY KEY (`Item_id`),
  UNIQUE KEY `uq_catalogitem_id_type` (`Item_id`,`Item_type`),
  KEY `fk_catalogitem_publisher` (`Publisher_id`),
  CONSTRAINT `fk_catalogitem_publisher` FOREIGN KEY (`Publisher_id`) REFERENCES `publisher` (`Publisher_id`),
  CONSTRAINT `ck_catalogitem_publication_year` CHECK (((`Publication_year` is null) or (`Publication_year` between 1400 and 2100))),
  CONSTRAINT `ck_catalogitem_replacement_cost` CHECK ((`Replacement_cost` >= 0)),
  CONSTRAINT `ck_catalogitem_title_not_blank` CHECK ((trim(`Title`) <> _utf8mb4''))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `catalogitem`
--

LOCK TABLES `catalogitem` WRITE;
/*!40000 ALTER TABLE `catalogitem` DISABLE KEYS */;
/*!40000 ALTER TABLE `catalogitem` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `copy`
--

DROP TABLE IF EXISTS `copy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `copy` (
  `Copy_id` int NOT NULL AUTO_INCREMENT,
  `Item_id` int NOT NULL,
  `Barcode` varchar(20) NOT NULL,
  `Condition` enum('new','good','worn','damaged') NOT NULL,
  `Shelf_location` varchar(30) DEFAULT NULL,
  `Status` enum('available','on loan','lost','withdrawn') NOT NULL DEFAULT 'available',
  `Date_acquired` date NOT NULL,
  PRIMARY KEY (`Copy_id`),
  UNIQUE KEY `uq_copy_barcode` (`Barcode`),
  KEY `fk_copy_catalogitem` (`Item_id`),
  CONSTRAINT `fk_copy_catalogitem` FOREIGN KEY (`Item_id`) REFERENCES `catalogitem` (`Item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `copy`
--

LOCK TABLES `copy` WRITE;
/*!40000 ALTER TABLE `copy` DISABLE KEYS */;
/*!40000 ALTER TABLE `copy` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dvd`
--

DROP TABLE IF EXISTS `dvd`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dvd` (
  `Item_id` int NOT NULL,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Runtime_minutes` smallint DEFAULT NULL,
  `Director` varchar(100) DEFAULT NULL,
  `Mpaa_rating` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`Item_id`),
  KEY `fk_dvd_catalogitem` (`Item_id`,`Item_type`),
  CONSTRAINT `fk_dvd_catalogitem` FOREIGN KEY (`Item_id`, `Item_type`) REFERENCES `catalogitem` (`Item_id`, `Item_type`),
  CONSTRAINT `ck_dvd_type` CHECK ((`Item_type` = _utf8mb4'dvd'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dvd`
--

LOCK TABLES `dvd` WRITE;
/*!40000 ALTER TABLE `dvd` DISABLE KEYS */;
/*!40000 ALTER TABLE `dvd` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fine`
--

DROP TABLE IF EXISTS `fine`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fine` (
  `Fine_id` int NOT NULL AUTO_INCREMENT,
  `Loan_id` int NOT NULL,
  `Fine_type` enum('overdue','damaged','lost') NOT NULL,
  `Amount` decimal(6,2) NOT NULL,
  `Date_assessed` date NOT NULL DEFAULT (curdate()),
  `Date_paid` date DEFAULT NULL,
  `Is_paid` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Fine_id`),
  UNIQUE KEY `uq_fine_loan_type` (`Loan_id`,`Fine_type`),
  CONSTRAINT `fk_fine_loan` FOREIGN KEY (`Loan_id`) REFERENCES `loan` (`Loan_id`),
  CONSTRAINT `ck_fine_amount` CHECK ((`Amount` >= 0)),
  CONSTRAINT `ck_fine_paid_after_assessed` CHECK ((`Date_paid` >= `Date_assessed`)),
  CONSTRAINT `ck_fine_paid_matches_date` CHECK ((((`Is_paid` = true) and (`Date_paid` is not null)) or ((`Is_paid` = false) and (`Date_paid` is null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fine`
--

LOCK TABLES `fine` WRITE;
/*!40000 ALTER TABLE `fine` DISABLE KEYS */;
/*!40000 ALTER TABLE `fine` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hold`
--

DROP TABLE IF EXISTS `hold`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hold` (
  `Hold_id` int NOT NULL AUTO_INCREMENT,
  `Item_id` int NOT NULL,
  `Member_id` int NOT NULL,
  `Reserved_copy_id` int DEFAULT NULL,
  `Hold_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Status` enum('Active','Ready','Expired','Cancelled','Completed') NOT NULL DEFAULT 'Active',
  `Expiry_date` date DEFAULT NULL,
  `Is_open` tinyint GENERATED ALWAYS AS (if((`Status` in (_utf8mb4'Active',_utf8mb4'Ready')),1,NULL)) STORED,
  PRIMARY KEY (`Hold_id`),
  UNIQUE KEY `uq_hold_one_open_per_member_item` (`Item_id`,`Member_id`,`Is_open`),
  KEY `fk_hold_member` (`Member_id`),
  KEY `fk_hold_reserved_copy` (`Reserved_copy_id`),
  CONSTRAINT `fk_hold_catalogitem` FOREIGN KEY (`Item_id`) REFERENCES `catalogitem` (`Item_id`),
  CONSTRAINT `fk_hold_member` FOREIGN KEY (`Member_id`) REFERENCES `member` (`Member_id`),
  CONSTRAINT `fk_hold_reserved_copy` FOREIGN KEY (`Reserved_copy_id`) REFERENCES `copy` (`Copy_id`),
  CONSTRAINT `ck_hold_expiry_not_before_hold` CHECK (((`Expiry_date` + interval 1 day) > `Hold_date`)),
  CONSTRAINT `ck_hold_ready_needs_copy` CHECK (((`Status` <> _utf8mb4'Ready') or (`Reserved_copy_id` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hold`
--

LOCK TABLES `hold` WRITE;
/*!40000 ALTER TABLE `hold` DISABLE KEYS */;
/*!40000 ALTER TABLE `hold` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `loan`
--

DROP TABLE IF EXISTS `loan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loan` (
  `Loan_id` int NOT NULL AUTO_INCREMENT,
  `Copy_id` int NOT NULL,
  `Member_id` int NOT NULL,
  `Staff_id` int NOT NULL,
  `Return_staff_id` int DEFAULT NULL,
  `Loan_type` enum('short','standard') NOT NULL,
  `Checkout_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Due_date` date NOT NULL,
  `Return_date` date DEFAULT NULL,
  `Renewal_count` smallint NOT NULL DEFAULT '0',
  `Open_copy_id` int GENERATED ALWAYS AS (if((`Return_date` is null),`Copy_id`,NULL)) STORED,
  PRIMARY KEY (`Loan_id`),
  UNIQUE KEY `uq_loan_open_copy` (`Open_copy_id`),
  KEY `fk_loan_copy` (`Copy_id`),
  KEY `fk_loan_member` (`Member_id`),
  KEY `fk_loan_checkout_staff` (`Staff_id`),
  KEY `fk_loan_return_staff` (`Return_staff_id`),
  CONSTRAINT `fk_loan_checkout_staff` FOREIGN KEY (`Staff_id`) REFERENCES `staff` (`Staff_id`),
  CONSTRAINT `fk_loan_copy` FOREIGN KEY (`Copy_id`) REFERENCES `copy` (`Copy_id`),
  CONSTRAINT `fk_loan_member` FOREIGN KEY (`Member_id`) REFERENCES `member` (`Member_id`),
  CONSTRAINT `fk_loan_return_staff` FOREIGN KEY (`Return_staff_id`) REFERENCES `staff` (`Staff_id`),
  CONSTRAINT `ck_loan_due_after_checkout` CHECK ((`Due_date` > `Checkout_date`)),
  CONSTRAINT `ck_loan_renewal_count` CHECK ((`Renewal_count` >= 0)),
  CONSTRAINT `ck_loan_return_not_before_checkout` CHECK (((`Return_date` + interval 1 day) > `Checkout_date`)),
  CONSTRAINT `ck_loan_return_staff_pair` CHECK (((`Return_date` is null) = (`Return_staff_id` is null))),
  CONSTRAINT `ck_loan_short_due_window` CHECK (((`Loan_type` <> _utf8mb4'short') or (`Due_date` <= (`Checkout_date` + interval 3 day)))),
  CONSTRAINT `ck_loan_short_no_renewal` CHECK (((`Loan_type` <> _utf8mb4'short') or (`Renewal_count` = 0))),
  CONSTRAINT `ck_loan_standard_due_window` CHECK (((`Loan_type` <> _utf8mb4'standard') or (`Due_date` <= (`Checkout_date` + interval (14 * (`Renewal_count` + 1)) day))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loan`
--

LOCK TABLES `loan` WRITE;
/*!40000 ALTER TABLE `loan` DISABLE KEYS */;
/*!40000 ALTER TABLE `loan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `member`
--

DROP TABLE IF EXISTS `member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `member` (
  `Member_id` int NOT NULL AUTO_INCREMENT,
  `Member_type_id` int NOT NULL,
  `Staff_id` int DEFAULT NULL,
  `Username` varchar(30) NOT NULL,
  `First_name` varchar(50) NOT NULL,
  `Last_name` varchar(50) NOT NULL,
  `Email` varchar(100) NOT NULL,
  `Phone` varchar(20) DEFAULT NULL,
  `Street` varchar(100) DEFAULT NULL,
  `City` varchar(50) DEFAULT NULL,
  `State` varchar(2) DEFAULT NULL,
  `Zip_code` varchar(10) DEFAULT NULL,
  `Password_hash` varchar(255) NOT NULL,
  `Date_registered` date NOT NULL DEFAULT (curdate()),
  `Is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`Member_id`),
  UNIQUE KEY `uq_member_username` (`Username`),
  UNIQUE KEY `uq_member_email` (`Email`),
  UNIQUE KEY `uq_member_staff` (`Staff_id`),
  KEY `fk_member_membertype` (`Member_type_id`),
  CONSTRAINT `fk_member_membertype` FOREIGN KEY (`Member_type_id`) REFERENCES `membertype` (`Member_type_id`),
  CONSTRAINT `fk_member_staff` FOREIGN KEY (`Staff_id`) REFERENCES `staff` (`Staff_id`),
  CONSTRAINT `ck_member_email_format` CHECK (regexp_like(`Email`,_utf8mb4'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')),
  CONSTRAINT `ck_member_email_not_blank` CHECK ((trim(`Email`) <> _utf8mb4'')),
  CONSTRAINT `ck_member_first_name_not_blank` CHECK ((trim(`First_name`) <> _utf8mb4'')),
  CONSTRAINT `ck_member_last_name_not_blank` CHECK ((trim(`Last_name`) <> _utf8mb4'')),
  CONSTRAINT `ck_member_password_not_blank` CHECK ((trim(`Password_hash`) <> _utf8mb4'')),
  CONSTRAINT `ck_member_phone_has_digit` CHECK (((`Phone` is null) or regexp_like(`Phone`,_utf8mb4'[0-9]'))),
  CONSTRAINT `ck_member_phone_symbols` CHECK (((`Phone` is null) or regexp_like(`Phone`,_utf8mb4'^[0-9() .+-]+$'))),
  CONSTRAINT `ck_member_state_format` CHECK (((`State` is null) or regexp_like(`State`,_utf8mb4'^[A-Z]{2}$',_utf8mb4'c'))),
  CONSTRAINT `ck_member_username_not_blank` CHECK ((trim(`Username`) <> _utf8mb4'')),
  CONSTRAINT `ck_member_zip_format` CHECK (((`Zip_code` is null) or regexp_like(`Zip_code`,_utf8mb4'^[0-9]{5}(-[0-9]{4})?$')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `member`
--

LOCK TABLES `member` WRITE;
/*!40000 ALTER TABLE `member` DISABLE KEYS */;
/*!40000 ALTER TABLE `member` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `membertype`
--

DROP TABLE IF EXISTS `membertype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `membertype` (
  `Member_type_id` int NOT NULL AUTO_INCREMENT,
  `Type_name` varchar(20) NOT NULL,
  `Max_loans` int NOT NULL,
  `Max_media_loans` int NOT NULL,
  `Max_renewals` int NOT NULL,
  PRIMARY KEY (`Member_type_id`),
  UNIQUE KEY `uq_membertype_type_name` (`Type_name`),
  CONSTRAINT `ck_membertype_max_loans` CHECK ((`Max_loans` > 0)),
  CONSTRAINT `ck_membertype_max_media_loans` CHECK ((`Max_media_loans` > 0)),
  CONSTRAINT `ck_membertype_max_renewals` CHECK ((`Max_renewals` >= 0)),
  CONSTRAINT `ck_membertype_media_within_loans` CHECK ((`Max_media_loans` <= `Max_loans`)),
  CONSTRAINT `ck_membertype_name_not_blank` CHECK ((trim(`Type_name`) <> _utf8mb4''))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `membertype`
--

LOCK TABLES `membertype` WRITE;
/*!40000 ALTER TABLE `membertype` DISABLE KEYS */;
/*!40000 ALTER TABLE `membertype` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `music`
--

DROP TABLE IF EXISTS `music`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `music` (
  `Item_id` int NOT NULL,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Artist` varchar(100) DEFAULT NULL,
  `Track_count` smallint DEFAULT NULL,
  PRIMARY KEY (`Item_id`),
  KEY `fk_music_catalogitem` (`Item_id`,`Item_type`),
  CONSTRAINT `fk_music_catalogitem` FOREIGN KEY (`Item_id`, `Item_type`) REFERENCES `catalogitem` (`Item_id`, `Item_type`),
  CONSTRAINT `ck_music_type` CHECK ((`Item_type` = _utf8mb4'music'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `music`
--

LOCK TABLES `music` WRITE;
/*!40000 ALTER TABLE `music` DISABLE KEYS */;
/*!40000 ALTER TABLE `music` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `newspaper`
--

DROP TABLE IF EXISTS `newspaper`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `newspaper` (
  `Item_id` int NOT NULL,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Newspaper_name` varchar(100) NOT NULL,
  `Issue_date` date NOT NULL,
  `Edition` varchar(30) NOT NULL DEFAULT '',
  `Is_historical` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Item_id`),
  UNIQUE KEY `uq_newspaper_issue` (`Newspaper_name`,`Issue_date`,`Edition`),
  KEY `fk_newspaper_catalogitem` (`Item_id`,`Item_type`),
  KEY `idx_newspaper_issue_date` (`Issue_date`),
  CONSTRAINT `fk_newspaper_catalogitem` FOREIGN KEY (`Item_id`, `Item_type`) REFERENCES `catalogitem` (`Item_id`, `Item_type`),
  CONSTRAINT `ck_newspaper_name_not_blank` CHECK ((trim(`Newspaper_name`) <> _utf8mb4'')),
  CONSTRAINT `ck_newspaper_type` CHECK ((`Item_type` = _utf8mb4'newspaper'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `newspaper`
--

LOCK TABLES `newspaper` WRITE;
/*!40000 ALTER TABLE `newspaper` DISABLE KEYS */;
/*!40000 ALTER TABLE `newspaper` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification`
--

DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification` (
  `Notification_id` int NOT NULL AUTO_INCREMENT,
  `Member_id` int NOT NULL,
  `Notification_type` enum('hold_ready','due_soon','overdue','fine_assessed') NOT NULL,
  `Channel` enum('in_app','email','postal') NOT NULL DEFAULT 'in_app',
  `Message` varchar(255) NOT NULL,
  `Date_sent` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Is_read` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Notification_id`),
  KEY `fk_notification_member` (`Member_id`),
  CONSTRAINT `fk_notification_member` FOREIGN KEY (`Member_id`) REFERENCES `member` (`Member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification`
--

LOCK TABLES `notification` WRITE;
/*!40000 ALTER TABLE `notification` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `paperauthor`
--

DROP TABLE IF EXISTS `paperauthor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `paperauthor` (
  `Item_id` int NOT NULL,
  `Author_id` int NOT NULL,
  PRIMARY KEY (`Item_id`,`Author_id`),
  KEY `fk_paperauthor_author` (`Author_id`),
  CONSTRAINT `fk_paperauthor_author` FOREIGN KEY (`Author_id`) REFERENCES `author` (`Author_id`),
  CONSTRAINT `fk_paperauthor_researchpaper` FOREIGN KEY (`Item_id`) REFERENCES `researchpaper` (`Item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `paperauthor`
--

LOCK TABLES `paperauthor` WRITE;
/*!40000 ALTER TABLE `paperauthor` DISABLE KEYS */;
/*!40000 ALTER TABLE `paperauthor` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `publisher`
--

DROP TABLE IF EXISTS `publisher`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publisher` (
  `Publisher_id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(100) NOT NULL,
  PRIMARY KEY (`Publisher_id`),
  UNIQUE KEY `uq_publisher_name` (`Name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `publisher`
--

LOCK TABLES `publisher` WRITE;
/*!40000 ALTER TABLE `publisher` DISABLE KEYS */;
/*!40000 ALTER TABLE `publisher` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `researchpaper`
--

DROP TABLE IF EXISTS `researchpaper`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `researchpaper` (
  `Item_id` int NOT NULL,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Doi` varchar(100) DEFAULT NULL,
  `Journal_name` varchar(150) DEFAULT NULL,
  `Volume` varchar(20) DEFAULT NULL,
  `Issue` varchar(20) DEFAULT NULL,
  `Page_range` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`Item_id`),
  UNIQUE KEY `uq_researchpaper_doi` (`Doi`),
  KEY `fk_researchpaper_catalogitem` (`Item_id`,`Item_type`),
  CONSTRAINT `fk_researchpaper_catalogitem` FOREIGN KEY (`Item_id`, `Item_type`) REFERENCES `catalogitem` (`Item_id`, `Item_type`),
  CONSTRAINT `ck_researchpaper_type` CHECK ((`Item_type` = _utf8mb4'researchpaper'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `researchpaper`
--

LOCK TABLES `researchpaper` WRITE;
/*!40000 ALTER TABLE `researchpaper` DISABLE KEYS */;
/*!40000 ALTER TABLE `researchpaper` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff`
--

DROP TABLE IF EXISTS `staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff` (
  `Staff_id` int NOT NULL AUTO_INCREMENT,
  `First_name` varchar(50) NOT NULL,
  `Last_name` varchar(50) NOT NULL,
  `Email` varchar(100) NOT NULL,
  `Password_hash` varchar(255) NOT NULL,
  `Is_active` tinyint(1) NOT NULL DEFAULT '1',
  `Is_admin` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`Staff_id`),
  UNIQUE KEY `uq_staff_email` (`Email`),
  CONSTRAINT `ck_staff_email_format` CHECK (regexp_like(`Email`,_utf8mb4'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')),
  CONSTRAINT `ck_staff_email_not_blank` CHECK ((trim(`Email`) <> _utf8mb4'')),
  CONSTRAINT `ck_staff_first_name_not_blank` CHECK ((trim(`First_name`) <> _utf8mb4'')),
  CONSTRAINT `ck_staff_last_name_not_blank` CHECK ((trim(`Last_name`) <> _utf8mb4'')),
  CONSTRAINT `ck_staff_password_not_blank` CHECK ((trim(`Password_hash`) <> _utf8mb4''))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff`
--

LOCK TABLES `staff` WRITE;
/*!40000 ALTER TABLE `staff` DISABLE KEYS */;
/*!40000 ALTER TABLE `staff` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `videogame`
--

DROP TABLE IF EXISTS `videogame`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `videogame` (
  `Item_id` int NOT NULL,
  `Item_type` enum('book','videogame','boardgame','dvd','music','newspaper','researchpaper') NOT NULL,
  `Platform` varchar(30) DEFAULT NULL,
  `Developer` varchar(100) DEFAULT NULL,
  `Esrb_rating` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`Item_id`),
  KEY `fk_videogame_catalogitem` (`Item_id`,`Item_type`),
  CONSTRAINT `fk_videogame_catalogitem` FOREIGN KEY (`Item_id`, `Item_type`) REFERENCES `catalogitem` (`Item_id`, `Item_type`),
  CONSTRAINT `ck_videogame_type` CHECK ((`Item_type` = _utf8mb4'videogame'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `videogame`
--

LOCK TABLES `videogame` WRITE;
/*!40000 ALTER TABLE `videogame` DISABLE KEYS */;
/*!40000 ALTER TABLE `videogame` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-01 20:35:15
