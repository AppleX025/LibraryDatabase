// lib/session.js - login sessions (replaces express-session)
//
// How a login is remembered:
//   1. After a successful login, the route stores values on req.session
//      (req.session.userId = 5, req.session.isStaff = true, ...).
//   2. At the end of that response this file notices the session now has data,
//      keeps it in the server's memory under a random ID, and sends the browser
//      a cookie containing that ID plus a signature.
//   3. On every later request the browser sends the cookie back; this file checks
//      the signature, finds the saved data, and puts it on req.session again.
//
// The signature (made with SESSION_SECRET) means a visitor cannot invent or edit a
// cookie to pretend to be someone else: without the secret they cannot sign one.
//
// Sessions live in the server's memory, so everyone is logged out when the app
// restarts. That is fine for this project.

const crypto = require('crypto');

// createSession({ secret }): builds the step that app.js adds with app.use(...).
// secret:  the SESSION_SECRET text used to sign cookies
// options: cookieName, maxAgeSeconds (how long an idle session lasts)
function createSession(options) {
  const secret = options && options.secret;
  const cookieName = (options && options.cookieName) || 'library.sid';
  const maxAgeSeconds = (options && options.maxAgeSeconds) || 8 * 60 * 60;   // 8 hours

  // Without a secret anyone could forge a login cookie, so refuse to start.
  if (typeof secret !== 'string' || secret === '') {
    throw new Error('SESSION_SECRET is not set. Add a line SESSION_SECRET=<any long random text> to the .env file (or the Azure app settings).');
  }

  // Every saved session: id -> { data: the req.session object, expires: time in ms }
  const store = new Map();

  // Every few minutes, forget sessions nobody has used for a long time.
  // unref() lets the app exit normally even though this timer is still running.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of store) {
      if (entry.expires <= now) store.delete(id);
    }
  }, 15 * 60 * 1000);
  cleanup.unref();

  // sign(id): the signature that goes after the ID in the cookie
  function sign(id) {
    return crypto.createHmac('sha256', secret).update(id).digest('base64url');
  }

  // Reads the session ID out of the request's cookies.
  // Returns the ID if the cookie is there AND its signature is genuine, otherwise null.
  function readSessionId(req) {
    const header = req.headers.cookie;
    if (!header) return null;

    // The Cookie header looks like:  a=1; library.sid=<id>.<signature>; b=2
    for (const piece of header.split(';')) {
      const equals = piece.indexOf('=');
      if (equals === -1) continue;
      if (piece.slice(0, equals).trim() !== cookieName) continue;

      const value = piece.slice(equals + 1).trim();
      const dot = value.lastIndexOf('.');
      if (dot === -1) return null;

      const id = value.slice(0, dot);
      const given = Buffer.from(value.slice(dot + 1));
      const expected = Buffer.from(sign(id));

      // timingSafeEqual needs equal lengths, and answers in the same time
      // however many characters match
      if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return id;
      return null;
    }
    return null;
  }

  // The cookie text. Each part, in order:
  //   Path=/        sent with every address on the site
  //   HttpOnly      page scripts cannot read it (protects against stolen logins)
  //   SameSite=Lax  not sent along with requests started by other websites
  //   Max-Age       how many seconds the browser keeps it (0 deletes it)
  //   Secure        only over https; added when the site is served over https
  function cookieText(value, seconds, secure) {
    return cookieName + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + seconds + (secure ? '; Secure' : '');
  }

  // Adds a Set-Cookie header without removing any that are already there
  function addCookie(res, text) {
    const existing = res.getHeader('Set-Cookie');
    if (!existing) res.setHeader('Set-Cookie', text);
    else res.setHeader('Set-Cookie', [].concat(existing, text));
  }

  // The step itself
  return function sessionStep(req, res, next) {
    // Find this visitor's saved session, if the cookie is genuine and has not expired
    let id = readSessionId(req);
    const entry = id ? store.get(id) : undefined;

    let session;
    if (entry && entry.expires > Date.now()) {
      session = entry.data;                      // a returning visitor
    } else {
      if (entry) store.delete(id);               // it expired
      id = null;
      session = {};                              // a new visitor: empty until something is stored
    }

    // True when the connection is https. Azure ends the https connection itself and
    // tells the app through the X-Forwarded-Proto header.
    const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const secure = Boolean(req.socket && req.socket.encrypted) || forwarded === 'https';

    let destroyed = false;                       // set when the route calls req.session.destroy()

    // req.session.destroy(callback): used by logout. Forgets the session on the server.
    // It is added so it does not count as session data. (The route calls it straight
    // away, in the same request, so two requests of one visitor cannot get it mixed up.)
    Object.defineProperty(session, 'destroy', {
      enumerable: false,
      configurable: true,
      value: function (callback) {
        destroyed = true;
        if (id) store.delete(id);
        // Replace the session with an empty one, so code that runs afterwards and
        // reads req.session.userId gets "not logged in" instead of an error.
        req.session = {};
        if (typeof callback === 'function') callback();
      }
    });

    req.session = session;

    // Saving happens just before the response is sent, because that is the last
    // moment a cookie can still be added to it. Wrapping res.end runs the saving
    // code first, whichever route (or error) ends the response.
    const originalEnd = res.end;
    let finished = false;
    res.end = function (...args) {
      if (!finished) {
        finished = true;
        if (!res.headersSent) {
          if (destroyed) {
            // Logged out: tell the browser to throw the cookie away
            if (id) addCookie(res, cookieText('', 0, secure));
          } else if (Object.keys(req.session).length > 0) {
            // The session has data (someone is logged in): save it and give the cookie
            if (!id) id = crypto.randomBytes(24).toString('base64url');
            store.set(id, { data: req.session, expires: Date.now() + maxAgeSeconds * 1000 });
            addCookie(res, cookieText(id + '.' + sign(id), maxAgeSeconds, secure));
          } else if (id) {
            // Everything was removed from the session: forget it
            store.delete(id);
            addCookie(res, cookieText('', 0, secure));
          }
        }
      }
      return originalEnd.apply(res, args);
    };

    next();
  };
}

module.exports = { createSession };
