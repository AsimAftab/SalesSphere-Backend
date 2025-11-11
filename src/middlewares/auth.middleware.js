const jwt = require('jsonwebtoken');
const User = require('../api/users/user.model'); // Adjust path as needed

// @desc    Protect routes by checking for a valid token
exports.protect = async (req, res, next) => {
  let token;

  // --- HYBRID AUTH: Support both cookies (web) and Bearer token (mobile) ---
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // --- END HYBRID AUTH ---

  if (!token) {
    // No token -> don't proceed to restrictTo
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user (remove password)
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    req.user = user;
    return next();
  } catch (err) {
    // Helpful debug log — remove or reduce in production
    console.error('Auth protect error:', err && err.message ? err.message : err);
    return res.status(401).json({ message: 'Not authorized, token invalid or expired' });
  }
};

// @desc    Grant access to specific roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // Defensive: ensure protect ran and attached req.user
    if (!req.user) {
      return res.status(401).json({
        message: 'User information missing from request. Ensure authentication middleware (protect) runs before this middleware.'
      });
    }

    // Defensive: ensure role exists on user
    if (!req.user.role) {
      // Optionally log this for debugging — user exists but has no role
      console.warn('restrictTo: req.user exists but no role property found', { userId: req.user._id });
      return res.status(403).json({ message: 'Access denied: no role assigned to user' });
    }

    // Authorization check
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action'
      });
    }

    return next();
  };
};
