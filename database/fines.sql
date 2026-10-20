SELECT f.Fine_id,
       CONCAT(m.First_name, ' ', m.Last_name) AS member_name,        -- the member's first and last name together
       m.Email AS member_email,       -- see how Report 2 in reports.sql gets the email
       ci.Title,
       f.Fine_type,
       f.Amount,
       f.Date_assessed
  FROM Fine f
  JOIN Loan l         ON l.Loan_id   = f.Loan_id
  JOIN Member m       ON m.Member_id = l.Member_id
  JOIN Copy c         ON c.Copy_id   = l.Copy_id
  JOIN CatalogItem ci ON ci.Item_id  = c.Item_id
 WHERE f.Is_paid = FALSE              -- only fines that are still unpaid
 ORDER BY f.Amount DESC;                 -- biggest first (or oldest first, your pick)