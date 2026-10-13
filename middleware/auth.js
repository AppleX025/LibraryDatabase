const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ message: 'You must be logged in.' });
};

const isStaff = (req, res, next) => {
  if (req.session && req.session.userId && req.session.isStaff) return next();
  return res.status(403).json({ message: 'You must be staff to access this page.' });
};

module.exports = { isAuthenticated, isStaff };