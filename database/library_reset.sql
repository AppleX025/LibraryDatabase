-- =====================================================================
-- Library Database — RESET (development only)
--
-- WARNING: this DELETES EVERY TABLE AND ALL DATA in the library database.
-- Run it only when you want to start over, then run library_schema.sql.
--
-- Tables are dropped children-first, because MySQL will not drop a table
-- while another table still points at it.
-- =====================================================================

USE library;

DROP TABLE IF EXISTS Notification;
DROP TABLE IF EXISTS Fine;
DROP TABLE IF EXISTS Hold;
DROP TABLE IF EXISTS Loan;
DROP TABLE IF EXISTS Copy;
DROP TABLE IF EXISTS PaperAuthor;
DROP TABLE IF EXISTS ResearchPaper;
DROP TABLE IF EXISTS Newspaper;
DROP TABLE IF EXISTS Music;
DROP TABLE IF EXISTS DVD;
DROP TABLE IF EXISTS BoardGame;
DROP TABLE IF EXISTS Videogame;
DROP TABLE IF EXISTS BookAuthor;
DROP TABLE IF EXISTS Book;
DROP TABLE IF EXISTS CatalogItem;
DROP TABLE IF EXISTS Member;
DROP TABLE IF EXISTS Staff;
DROP TABLE IF EXISTS MemberType;
DROP TABLE IF EXISTS Author;
DROP TABLE IF EXISTS Publisher;
