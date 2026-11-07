-- =====================================================================
-- trigger_catalog_rules.sql  --  rule (semantic) triggers for the catalog
--
-- Run order: this is the LAST file to load, after more_catalog_data.sql
--   (the rules check every insert and edit, so the sample data goes in first).
-- Safe to run more than once (it drops the old versions first).
--
-- What is in here: three RULE triggers. They run BEFORE a row is saved and,
-- when a catalog rule is broken, stop it with an error (SIGNAL SQLSTATE '45000').
-- The text after MESSAGE_TEXT is what the user sees (128 characters at most).
--   1. trg_catalog_rule_insert   BEFORE INSERT on CatalogItem
--   2. trg_catalog_rule_update   BEFORE UPDATE on CatalogItem
--   3. trg_newspaper_rule_insert BEFORE INSERT on Newspaper
--
-- Catalog rules:
--   - the publication year cannot be in the future (empty is allowed)
--   - every item needs a replacement cost
--   - a research paper costs between $174 and $425
--   - a HISTORICAL newspaper costs between $150 and $425
-- (The price of a newspaper lives in CatalogItem, but "historical" lives in
-- Newspaper, so the newspaper rule needs a look at the other table.)
-- =====================================================================
USE library;

DROP TRIGGER IF EXISTS trg_catalog_rule_insert;
DROP TRIGGER IF EXISTS trg_catalog_rule_update;
DROP TRIGGER IF EXISTS trg_newspaper_rule_insert;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Trigger 1: trg_catalog_rule_insert
-- Checks a NEW catalog item before it is saved.
-- NEW means "the row that is about to be saved".
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_catalog_rule_insert
BEFORE INSERT ON CatalogItem
FOR EACH ROW
BEGIN
    -- Rule 1: no future year (a missing year is fine, so test for NULL first).
    IF NEW.Publication_year IS NOT NULL AND NEW.Publication_year > YEAR(CURDATE()) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: the publication year cannot be in the future.';
    END IF;

    -- Rule 2: the replacement cost is required (the column itself allows NULL).
    IF NEW.Replacement_cost IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: every item needs a replacement cost.';
    END IF;

    -- Rule 3: research papers have a fixed price range.
    IF NEW.Item_type = 'researchpaper' AND NEW.Replacement_cost NOT BETWEEN 174 AND 425 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: a research paper must cost between $174 and $425.';
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Trigger 2: trg_catalog_rule_update
-- The same three rules when an item is EDITED, plus the historical
-- newspaper price rule. (A soft delete is also an UPDATE, so it passes
-- through here too: that is why every item in the sample data must follow
-- the rules.)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_catalog_rule_update
BEFORE UPDATE ON CatalogItem
FOR EACH ROW
BEGIN
    DECLARE v_historical BOOLEAN;        -- is this item a historical newspaper issue?

    IF NEW.Publication_year IS NOT NULL AND NEW.Publication_year > YEAR(CURDATE()) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: the publication year cannot be in the future.';
    END IF;

    IF NEW.Replacement_cost IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: every item needs a replacement cost.';
    END IF;

    IF NEW.Item_type = 'researchpaper' AND NEW.Replacement_cost NOT BETWEEN 174 AND 425 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: a research paper must cost between $174 and $425.';
    END IF;

    -- Rule 4: "historical" is stored in the Newspaper table. For an item that
    -- is not a newspaper the subquery finds no row, and COALESCE makes that FALSE.
    SET v_historical = COALESCE(
        (SELECT n.Is_historical FROM Newspaper n WHERE n.Item_id = NEW.Item_id), FALSE);

    IF NEW.Item_type = 'newspaper' AND v_historical = TRUE
       AND NEW.Replacement_cost NOT BETWEEN 150 AND 425 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: a historical newspaper must cost between $150 and $425.';
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Trigger 3: trg_newspaper_rule_insert
-- When a newspaper row is added, its CatalogItem row already exists (the app
-- saves the item first, then the newspaper details), so the price is read
-- from there. A historical issue must be priced $150 - $425.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_newspaper_rule_insert
BEFORE INSERT ON Newspaper
FOR EACH ROW
BEGIN
    DECLARE v_cost DECIMAL(6,2);         -- price of the item this issue belongs to

    SELECT Replacement_cost INTO v_cost FROM CatalogItem WHERE Item_id = NEW.Item_id;

    IF NEW.Is_historical = TRUE AND v_cost NOT BETWEEN 150 AND 425 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rule: a historical newspaper must cost between $150 and $425.';
    END IF;
END$$

DELIMITER ;
