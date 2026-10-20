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

module.exports = { addRequestHelpers, addResponseHelpers };
