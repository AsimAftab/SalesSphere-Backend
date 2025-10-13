const jwt = require('jsonwebtoken');
const User = require('../api/users/user.model');

const protect = async (req, res, next) => {
    let token;

    // 1. Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    try {
        // 2. Verify the token's signature
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 3. Check if the user for the token still exists
        const currentUser = await User.findById(decoded.id).select('-password');
        if (!currentUser) {
            return res.status(401).json({ message: 'The user belonging to this token no longer exists' });
        }

        // 4. Grant access to the protected route
        req.user = currentUser;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Not authorized, token is invalid or has expired' });
    }
};

const restrictTo = (...roles) => {
    return (req, res, next) => {
        // This function assumes 'protect' has already run and attached req.user
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'You do not have permission to perform this action' });
        }
        next();
    };
};

module.exports = { protect, restrictTo };