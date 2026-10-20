// lib/password.js - password hashing (replaces bcrypt)
//
// The database never stores a real password, only a "hash": a scrambled
// version that cannot be turned back into the password. To check a login, the
// typed password is scrambled the same way and the two results are compared.
//
// This uses scrypt, a password-hashing method that comes built into Node's
// "crypto" tool, so nothing needs to be installed. It is deliberately slow, so
// guessing millions of passwords takes a long time.
//
// A stored hash looks like:   scrypt$16384$8$1$<salt>$<hash>
//   scrypt              which method made it
//   16384, 8, 1         the cost settings that were used (kept so they can change later)
//   salt                random text mixed into the password, so two people with the
//                       same password get different hashes
//   hash                the scrambled result

const crypto = require('crypto');

// Cost settings. Higher numbers are slower and safer. These are the usual defaults.
const COST = 16384;        // how much work (and memory) one hash takes
const BLOCK_SIZE = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;     // size of the hash in bytes

// Passwords longer than this are refused, so nobody can make the server scramble
// an enormous text. No real password is this long.
const MAX_PASSWORD_LENGTH = 1000;

// scrypt in a "promise" form so it can be used with await.
// (crypto.scrypt normally takes a callback.)
function scrypt(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// hashPassword('secret') -> the text to store in the Password_hash column.
// Used when an account is created (registration, seed data).
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Password must be between 1 and ' + MAX_PASSWORD_LENGTH + ' characters.');
  }

  // A fresh random salt for every password
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLEL });

  return ['scrypt', COST, BLOCK_SIZE, PARALLEL, salt.toString('base64'), key.toString('base64')].join('$');
}

// verifyPassword('typed text', storedHash) -> true if the typed text is the password.
// Used at login. It never throws: anything unexpected (a missing password, a hash
// in another format such as an old bcrypt one) simply counts as "wrong password".
async function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return false;
    if (typeof stored !== 'string') return false;

    // Split the stored text back into its parts
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || expected.length === 0) return false;

    // Scramble the typed password with the same salt and settings...
    const actual = await scrypt(password, salt, expected.length, { N, r, p });

    // ...and compare. timingSafeEqual takes the same time whether the first byte or
    // the last byte differs, so the time taken cannot give hints about the password.
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (err) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
