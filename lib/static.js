// lib/static.js - serves the files in the public/ folder (replaces express.static)
//
// Usage in app.js:  app.use(serveStatic('public'));
// An address such as /circulation/checkout.html is looked up as the file
// public/circulation/checkout.html and sent to the browser.

const fs = require('fs');       // Node's built-in file reading
const path = require('path');   // Node's built-in tools for working with file paths

// The browser needs to know what kind of file it is getting, and Node does not
// guess. This list turns a file ending into a Content-Type.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2': 'font/woff2'
};

// serveStatic('public') makes a step for app.use(...): if the address matches a
// file inside the folder, send it; otherwise pass the request on with next().
function serveStatic(folder) {
  // The full path to the folder, e.g. /home/site/wwwroot/public
  const root = path.resolve(folder);

  return function (req, res, next) {
    // Only GET (and HEAD, which is GET without the file contents) ask for a file
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // An address that ends in "/" names a folder; the folder's index.html is its page.
    let address = req.path;
    if (address.endsWith('/')) address += 'index.html';

    // The address, e.g. '/circulation/checkout.html', joined onto the folder.
    // decodeURIComponent turns %20 back into a space; it throws on broken text,
    // and a broken address is not one of our files.
    let filePath;
    try {
      address = decodeURIComponent(address);
    } catch (err) {
      return next();
    }

    // A "\0" character is never part of a real file name, and Node refuses to
    // open a path that contains one (it would throw), so skip those addresses.
    if (address.includes('\0')) return next();

    // Hidden files and folders (names starting with ".", such as .env or .git) are
    // never served, even if one ends up inside public/.
    if (address.split('/').some((piece) => piece.startsWith('.'))) return next();

    filePath = path.join(root, address);

    // Safety: an address like /../config/db.js would climb out of public/ and
    // expose other files. Only paths that stay inside the folder are allowed.
    if (!filePath.startsWith(root + path.sep)) return next();

    fs.readFile(filePath, (err, data) => {
      // The file does not exist (or is a folder): not ours, try the next step
      if (err) return next();

      // Look at the file ending (".css") to pick the Content-Type
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.setHeader('Content-Type', type);

      // Ask the browser to check for a newer copy each time, so a changed page or
      // stylesheet shows up straight away instead of an old one from its cache.
      res.setHeader('Cache-Control', 'no-cache');

      res.end(data);                             // send the file's contents
    });
  };
}

module.exports = { serveStatic };
