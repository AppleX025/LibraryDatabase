// lib/app.js - the small web server that replaces express()
//
// Node's built-in web server hands us each request as a plain object with very
// little on it. This file adds the tools our route files expect (req.path,
// req.query, res.status(), res.json(), ...) so they can be written the same way
// Express routes are.

const http = require('http');   // Node's built-in web server (comes with Node, no install)

// addRequestHelpers(req): adds req.path and req.query, which our routes expect.
function addRequestHelpers(req) {
  // req.url looks like "/api/circulation/open-loans?member=eva_s".
  // The URL tool needs a full address, so a made-up start is put in front of it.
  // Gluing the text on (instead of passing it as a second argument) matters for an
  // address that starts with "//": it would be read as a website name and the real
  // path would be lost. Glued on, it stays an ordinary path that matches no route.
  // A normal request address always starts with "/". Anything else (such as "*")
  // would be glued onto the made-up start as part of the website name and give a
  // wrong path, so it is refused. The server catches this error and answers 400
  // (see createApp).
  if (!req.url.startsWith('/')) {
    throw new Error('Unreadable address: ' + req.url);
  }
  const url = new URL('http://localhost' + req.url);

  // Only the part before the "?", e.g. "/api/circulation/open-loans"
  req.path = url.pathname;

  // The part after the "?", turned into an object: { member: 'eva_s' }
  // If the same name appears twice (?a=1&a=2) the last one wins.
  req.query = Object.fromEntries(url.searchParams);
}

// addResponseHelpers(res): adds res.status(), res.json(), res.send() and res.redirect().
function addResponseHelpers(res) {
  // res.status(404) sets the code and gives res back, so calls can be chained:
  // res.status(404).json({ ... })
  res.status = function (code) {
    res.statusCode = code;          // Node's built-in property that holds the status code
    return res;                     // give res back so ".json(...)" can follow
  };

  // res.json(data) sends an object to the browser as JSON text
  res.json = function (data) {
    // charset=utf-8 tells the browser how to read accented letters in titles and names
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));  // object -> text, then send it
  };

  // res.send(text) sends text. It is treated as a web page, which is what
  // the simple test routes in app.js send.
  res.send = function (text) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(text);
  };

  // res.redirect('/search.html') tells the browser to go to another address
  res.redirect = function (location) {
    res.statusCode = 302;                       // 302 = "go here instead"
    res.setHeader('Location', location);
    res.end();
  };
}

// readBody(req): reads whatever the page sent along with the request and puts
// it on req.body. Returns a promise that gives true if all went well, or false
// if the body was broken or too big (the server then answers 400).
const MAX_BODY_SIZE = 1000000;     // about 1 MB; more than any form in this app needs

function readBody(req) {
  return new Promise((resolve) => {
    // GET requests carry no body: nothing to read
    if (req.method === 'GET') {
      req.body = {};
      return resolve(true);
    }

    const chunks = [];             // the data arrives in pieces; they are kept here
    let size = 0;                  // how many bytes have arrived so far
    let tooBig = false;            // becomes true if the body goes over the limit

    // Runs every time a piece of data arrives
    req.on('data', (piece) => {
      size += piece.length;
      if (size > MAX_BODY_SIZE) {
        tooBig = true;             // stop keeping data, but keep reading until the end
      } else {
        chunks.push(piece);        // keep the piece
      }
    });

    // Runs once, when all the data has arrived
    req.on('end', () => {
      if (tooBig) return resolve(false);

      // Glue the pieces into one block of bytes, then read it as text
      const text = Buffer.concat(chunks).toString('utf8');

      // Header that says what kind of data it is, e.g. "application/json; charset=utf-8".
      // Lower-cased so "Application/JSON" is recognised too.
      const type = (req.headers['content-type'] || '').toLowerCase();

      if (type.includes('application/json')) {
        try {
          // An empty body is fine; otherwise turn the JSON text into an object
          req.body = text === '' ? {} : JSON.parse(text);
        } catch (err) {
          return resolve(false);   // the text was not valid JSON
        }

        // Valid JSON can still be a lone number, text or null. Route code such as
        // "const { username } = req.body" would crash on those, so only an object
        // (or a list) is accepted.
        if (typeof req.body !== 'object' || req.body === null) {
          return resolve(false);
        }
      } else if (type.includes('application/x-www-form-urlencoded')) {
        // Form data looks like: username=eva_s&password=abc
        req.body = Object.fromEntries(new URLSearchParams(text));
      } else {
        req.body = {};
      }

      resolve(true);
    });

    // The connection broke while reading
    req.on('error', () => resolve(false));
  });
}

module.exports = { addRequestHelpers, addResponseHelpers, readBody };
