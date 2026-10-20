// lib/router.js - our own small router (replaces express.Router())
//
// A router keeps a list of routes. Each route is:
//   - a method (GET, POST, ...) or "any method" for router.use(),
//   - an address pattern such as '/items/:id/copies',
//   - one or more handler functions to run when a request fits.
//
// Route files use it like this:
//   const { Router } = require('../lib/router');
//   const router = Router();
//   router.get('/items/:id', isStaff, (req, res) => { ... });
//   module.exports = router;
//
// This file only uses plain JavaScript: no packages and no server. The server
// (lib/app.js) calls the router once for every request and gives it req and res.
// By then req.method, req.path (the address without the "?" part) are filled in.


// ---------------------------------------------------------------------
// matchPath: does a request address fit a route's pattern?
// ---------------------------------------------------------------------

// Makes an address easier to compare:
//   - "/items/" and "/items" are treated as the same address.
//   - An empty address (what is left after a mounted prefix is removed) is "/".
function normalizePath(path) {
  // The root address "/" keeps its slash; any other address loses a trailing slash.
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  // Nothing at all means the root address.
  if (path === '') {
    path = '/';
  }
  return path;
}

// matchPath(pattern, path)
// pattern: the route's address, e.g. '/items/:id/copies'
// path:    the address the browser asked for, e.g. '/items/7/copies'
// Returns an object of the ":" values it found (e.g. { id: '7' }),
// or null if the path does not fit the pattern.
function matchPath(pattern, path) {
  // Step 1: cut both addresses into pieces at every "/"
  const patternPieces = normalizePath(pattern).split('/');
  const pathPieces = normalizePath(path).split('/');

  // Step 2: different number of pieces means they cannot match
  if (patternPieces.length !== pathPieces.length) {
    return null;
  }

  // This object will collect the ":" values, e.g. { id: '7' }
  const params = {};

  // Step 3: look at the pieces two at a time, using the same position in both lists
  for (let i = 0; i < patternPieces.length; i++) {
    const patternPiece = patternPieces[i];
    const pathPiece = pathPieces[i];

    if (patternPiece.startsWith(':')) {
      // A ":" piece matches anything except nothing: '/items/' must not
      // count as an item whose id is an empty piece of text.
      if (pathPiece === '') {
        return null;
      }

      // Browsers write special characters in addresses as %20 (a space) and so
      // on. decodeURIComponent turns them back into the real characters.
      // It throws an error on broken text such as '%E0%A4%A', and a broken
      // address cannot match any route, so that counts as "no match".
      let value;
      try {
        value = decodeURIComponent(pathPiece);
      } catch (err) {
        return null;
      }

      // Save what was typed under the name after the colon: ':id' becomes the key 'id'.
      params[patternPiece.slice(1)] = value;
    } else if (patternPiece !== pathPiece) {
      // A normal piece must be exactly the same text, otherwise no match
      return null;
    }
  }

  // Step 4: every piece fit, so hand back what we collected
  return params;
}


// ---------------------------------------------------------------------
// Running a route's handler functions
// ---------------------------------------------------------------------

// sendServerError(err, res): used when a handler crashes.
// Logs the real error in the terminal and tells the browser something vague,
// so internal details are not leaked.
function sendServerError(err, res) {
  console.error(err);

  // If the handler had already started sending its answer, a second answer is
  // impossible (Node would throw again). Just make sure the response is closed.
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(500).json({ message: 'Server error.' });
}

// runHandlers(handlers, req, res, done)
// handlers: the list of functions for one route, e.g. [isStaff, myRouteFunction]
// done: what to call when every handler has called next(). The router passes
//       a function that carries on looking at the routes after this one.
function runHandlers(handlers, req, res, done) {
  let index = 0;                          // which handler runs next

  function next() {
    const handler = handlers[index];      // pick the current handler
    index++;                              // so the next call picks the following one

    if (handler === undefined) {          // the list is finished
      return done();                      // hand over to the router
    }

    try {
      // Give the handler its three arguments. Passing our own "next" lets
      // the handler continue the chain by calling next().
      const result = handler(req, res, next);

      // An async handler returns a promise. If it fails later, catch it here.
      if (result && typeof result.catch === 'function') {
        result.catch((err) => sendServerError(err, res));
      }
    } catch (err) {
      // A normal (non-async) handler that crashed straight away
      sendServerError(err, res);
    }
  }

  next();                                 // start with the first handler
}


// ---------------------------------------------------------------------
// Router: the list of routes, plus the function that picks the right one
// ---------------------------------------------------------------------

// Router(): makes a new router. Route files do: const router = Router();
function Router() {
  const routes = [];                      // every route added so far, in order

  // The router itself is a function the app can call with each request.
  function router(req, res, next) {
    let routeIndex = 0;                   // which route to look at next

    // Looks through the routes, starting at routeIndex, for one that fits.
    // It is also what a route's handlers call (through runHandlers) when they
    // all say next(): the search then carries on with the routes after it.
    // That is how router.use(isStaff) lets the later routes run.
    function nextRoute() {
      while (routeIndex < routes.length) {
        const route = routes[routeIndex];
        routeIndex++;

        // '*' (from router.use) fits every method; otherwise the method must be the same.
        if (route.method !== '*' && route.method !== req.method) continue;

        // router.use() has no pattern, so it fits every address.
        let params = {};
        if (route.pattern !== null) {
          params = matchPath(route.pattern, req.path);
          if (params === null) continue;                 // wrong address, skip it
        }

        req.params = params;                             // save the ":" values for the handler
        return runHandlers(route.handlers, req, res, nextRoute);
      }

      // No route (left) fits: let whoever called the router decide what to do
      // (the app answers 404). The check protects against a router called without one.
      if (typeof next === 'function') next();
    }

    nextRoute();
  }

  // Adds one route to the list
  function addRoute(method, pattern, handlers) {
    routes.push({ method, pattern, handlers });
  }

  // "...handlers" collects every argument after the pattern into one list,
  // so router.get('/x', isStaff, myFunction) gives handlers = [isStaff, myFunction]
  router.get = (pattern, ...handlers) => addRoute('GET', pattern, handlers);
  router.post = (pattern, ...handlers) => addRoute('POST', pattern, handlers);
  router.put = (pattern, ...handlers) => addRoute('PUT', pattern, handlers);
  router.patch = (pattern, ...handlers) => addRoute('PATCH', pattern, handlers);
  router.delete = (pattern, ...handlers) => addRoute('DELETE', pattern, handlers);

  // router.use(isStaff): handlers that run for EVERY request that reaches this
  // router, whatever the method or address. They run in the order the routes
  // were added, so a use() written first guards all the routes below it.
  router.use = (...handlers) => addRoute('*', null, handlers);

  return router;
}

// Other files import Router to build route files; matchPath is exported so it
// can be tested on its own.
module.exports = { Router, matchPath };
