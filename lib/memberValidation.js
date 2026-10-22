// lib/memberValidation.js - shared checks for member fields.
// Used by the register route (routes/auth.js) and by the staff edit route (routes/members.js),
// so both apply exactly the same rules.
// The checks return a message in plain English, or null when everything is fine.

// The member types a person may choose on the web pages.
// Staff is never listed: library employees are linked to a staff account by an administrator.
const ALLOWED_TYPES = ['Student', 'Faculty', 'Alumni'];


// clean(value)
// Turns what the page sent into something safe to store:
//   undefined, null, or blank text  ->  null (stored as "empty" in the database)
//   anything else                   ->  the text with spaces trimmed off both ends

function clean(value) {
  // Nothing was sent at all, so there is no value.
  if (value === undefined || value === null) return null;
  // String(...) makes sure numbers or other types become text before trim() is used.
  const text = String(value).trim();
  // Text that was only spaces counts as empty.
  return text === '' ? null : text;
}


// validateMemberFields(data)
// Checks the values of one member. "data" holds values that were already passed through clean().
// Returns a message for the FIRST problem found, or null when every value is acceptable.
// The rules match the CHECK rules in schema.sql, so the database never has to refuse a value.
function validateMemberFields(data) {
  // Email is required. The pattern means: some characters with no @ or spaces,
  // then @, then more characters, then a dot, then more characters (name@example.com).
  // In the pattern, [^@\s]+ is "one or more characters that are not @ and not a space".
  if (!data.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
    return 'Please enter a valid email address, like name@example.com.';
  }

  // Phone is optional, so it is only checked when something was typed.
  // Two rules: it needs at least one digit (/[0-9]/), and it may only contain
  // digits, spaces and the symbols ( ) + - . (the second pattern).
  // The "!" in front of each test means "this rule is NOT satisfied".
  if (data.phone && (!/[0-9]/.test(data.phone) || !/^[0-9() .+-]+$/.test(data.phone))) {
    return 'The phone number needs at least one digit and can only contain digits, spaces and ( ) + - . characters.';
  }

  // Maximum lengths, matching the column sizes in schema.sql. Without this check,
  // MySQL would refuse a too-long value with a confusing error.
  // Each entry is [name of the field, longest allowed length, label shown in the message].
  const limits = [['email', 100, 'Email'], ['firstName', 50, 'First name'], ['lastName', 50, 'Last name'],
                  ['phone', 20, 'Phone'], ['street', 100, 'Street'], ['city', 50, 'City']];
  // Go through the list. data[field] looks up the value by its name (for example data['email']).
  // "data[field] &&" skips fields that are empty (null), because those have no length.
  for (const [field, max, label] of limits) {
    if (data[field] && data[field].length > max) return `${label} must be ${max} characters or fewer.`;
  }
  // Username is checked separately because only the register form has one
  // (staff cannot change a username when editing, so it is missing there).
  if (data.username && data.username.length > 30) return 'The username must be 30 characters or fewer.';

  // Zip code is optional. Allowed: 5 digits (12345) or 5 digits, a dash and 4 digits (12345-6789).
  // \d means a digit, and the (-\d{4})? part is the optional dash-and-4-digits ending.
  if (data.zip && !/^\d{5}(-\d{4})?$/.test(data.zip)) {
    return 'The zip code must look like 12345 or 12345-6789.';
  }

  // State is optional. It must be exactly two CAPITAL letters (TX, not tx or Texas).
  // The pages convert what was typed to capitals before sending it.
  if (data.state && !/^[A-Z]{2}$/.test(data.state)) {
    return 'The state must be 2 capital letters, like TX.';
  }

  // Both names are required (the database refuses blank names).
  if (!data.firstName || !data.lastName) {
    return 'First name and last name are required.';
  }

  // The member type must be one of the allowed types. This also blocks Staff,
  // even if someone sends it by hand without using the page.
  if (!ALLOWED_TYPES.includes(data.memberType)) {
    return 'Member type must be Student, Faculty or Alumni.';
  }

  // Nothing was wrong.
  return null;
}


// databaseRuleMessage(err)
// A last safety net. If MySQL itself refuses a value (even though the checks above passed),
// the route calls this to turn MySQL's error into a plain message for the person.
// It returns a message, or null when the error is not one of these (then the route answers
// with a general "server error" instead).
function databaseRuleMessage(err) {
  // No error given, nothing to explain.
  if (!err) return null;

  // MySQL says "data too long" when a value does not fit its column.
  if (err.code === 'ER_DATA_TOO_LONG') return 'One of the values is too long.';

  // 3819 is MySQL's error number for "a CHECK rule from schema.sql was broken".
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.errno === 3819) {
    // MySQL's message names the rule that was broken, for example
    // "Check constraint 'ck_member_zip_format' is violated."
    // The rule names in schema.sql contain email, phone, zip or state, so looking for
    // those words tells us which field to complain about. "|| ''" avoids a crash if there is no message.
    const text = err.sqlMessage || '';
    if (text.includes('email')) return 'Please enter a valid email address, like name@example.com.';
    if (text.includes('phone')) return 'The phone number needs at least one digit and can only contain digits, spaces and ( ) + - . characters.';
    if (text.includes('zip')) return 'The zip code must look like 12345 or 12345-6789.';
    if (text.includes('state')) return 'The state must be 2 capital letters, like TX.';
    // Some other rule was broken (for example a blank name): give a general message.
    return 'One of the values is not allowed. Please check what you typed.';
  }

  // Not a rule error, so this function has nothing to say.
  return null;
}

// Export these so other files can use them with:
//   const { clean, validateMemberFields, databaseRuleMessage } = require('../lib/memberValidation');
module.exports = { ALLOWED_TYPES, clean, validateMemberFields, databaseRuleMessage };