const jwt = require('jsonwebtoken');
const User = require('../api/users/user.model'); // Adjust path as needed

// @desc    Protect routes by checking for a valid token
exports.protect = async (req, res, next) => {
    let token;

    // --- HYBRID AUTH: Support both cookies (web) and Bearer token (mobile) ---
    // 1. Check for token in HttpOnly cookie (for web browsers)
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    // 2. Check for token in Authorization header (for mobile/Flutter apps)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // --- END HYBRID AUTH ---

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from the token
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
             return res.status(401).json({ message: 'User not found' });
        }

        next();
    } catch (error) {
        return res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

// @desc    Grant access to specific roles
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        // This middleware runs *after* protect, so req.user will exist.
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: 'You do not have permission to perform this action' 
            });
        }
        next();
    };
};