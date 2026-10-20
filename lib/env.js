// lib/env.js - reads the .env file into process.env (replaces dotenv)
//
// The .env file holds settings that differ from computer to computer and must
// not be shared on GitHub (database password, session secret, port). Each line
// looks like:   NAME=value
// After loadEnv() runs, the rest of the code reads them as process.env.NAME.
//
// Settings that already exist (for example the ones Azure supplies) are NOT
// replaced, so the hosting settings always win over a .env file.

const fs = require('fs');
const path = require('path');

// loadEnv(): reads the .env file in the project's main folder, if there is one.
// On Azure there is no .env file and that is fine: the settings come from the
// app settings instead.
function loadEnv(file) {
  // Default: the .env file next to app.js, whatever folder the app was started from
  const envFile = file || path.join(__dirname, '..', '.env');

  let text;
  try {
    text = fs.readFileSync(envFile, 'utf8');
  } catch (err) {
    return;                                      // no .env file: nothing to load
  }

  // Windows saves lines ending in \r\n, so split on both kinds of line ending
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();

    // Skip blank lines and comments (lines starting with #)
    if (line === '' || line.startsWith('#')) continue;

    // "export NAME=value" is also allowed, as in shell scripts
    if (line.startsWith('export ')) line = line.slice(7).trim();

    // Split at the FIRST "=" only, because a value (such as a password) may contain "="
    const equals = line.indexOf('=');
    if (equals === -1) continue;                 // not a NAME=value line

    const name = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();

    // A value wrapped in quotes keeps everything inside them, spaces and # included
    const first = value[0];
    if ((first === '"' || first === "'") && value.length >= 2 && value.endsWith(first)) {
      value = value.slice(1, -1);
    } else {
      // Unquoted: a space followed by # starts a comment, e.g.  PORT=3000 # my port
      const comment = value.search(/\s#/);
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    // Do not replace a setting that already exists
    if (name !== '' && process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

module.exports = { loadEnv };
