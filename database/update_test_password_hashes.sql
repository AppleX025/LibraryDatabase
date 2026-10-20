-- =====================================================================
-- update_test_password_hashes.sql
-- For a database that was loaded BEFORE the app stopped using bcrypt.
-- (A fresh load of seed_accounts.sql and Sample_data.sql already has the new hashes.)
--
-- Why: the app now checks passwords with Node's built-in scrypt (lib/password.js)
-- instead of the bcrypt package, and the two kinds of stored hash are not
-- interchangeable. Old test accounts would be refused at login until their hash
-- is replaced.
--
-- What it does: gives the sample test accounts the password  testpass123  again,
-- stored in the new format. Only the known test accounts are touched.
--
-- Safe to run more than once.
-- =====================================================================
USE library;

SET @hash = 'scrypt$16384$8$1$JG+7+zy280HD4QEEQ9q/2w==$iQaSC2GQcAYpn8DjB8cfTgOWH6USvJ8S4uerZHN6uzqA0tN5ktjwYkXldlw607IPaEntZ3fYrrJlj6r33hRkAA==';

UPDATE Staff
   SET Password_hash = @hash
 WHERE Email IN ('staff@test.com', 'admin@test.com', 'librarian@test.com');

UPDATE Member
   SET Password_hash = @hash
 WHERE Username IN ('testmember', 'alice_r', 'bob_m', 'carla_f', 'dan_c', 'eva_s', 'maria_staff', 'staff_member', 'admin_member');
