// src/middlewares/auth.middleware.js
// Authentication middleware
// For granular permissions, use compositeAccess.middleware.js directly

const jwt = require('jsonwebtoken');
const User = require('../api/users/user.model');
const Organization = require('../api/organizations/organization.model');
const { isSystemRole } = require('../utils/defaultPermissions');

// Import from compositeAccess (the new unified permission system)
const {
  checkAccess,
  checkAnyAccess,
  checkAllAccess,
  checkModuleAccess,
  requireSystemRole,
  requireOrgAdmin
} = require('./compositeAccess.middleware');

/**
 * @desc    Protect routes by checking for a valid token
 * @usage   router.use(protect) or router.get('/path', protect, handler)
 */
exports.protect = async (req, res, next) => {
  let token;

  // Support both cookies (web) and Bearer token (mobile)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Not authorized, no token provided'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user with customRoleId populated for permission checking
    const user = await User.findById(decoded.id)
      .select('-password')
      .populate('customRoleId');

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized, user not found'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        status: 'error',
        message: 'Your account has been deactivated. Please contact admin.'
      });
    }

    req.user = user;

    // Attach effective permissions to request
    req.permissions = user.getEffectivePermissions();

    // For org users, attach organization with subscription plan (prevents redundant DB queries)
    if (user.organizationId && !isSystemRole(user.role)) {
      const org = await Organization.findById(user.organizationId)
        .populate('subscriptionPlanId')
        .lean();

      if (org) {
        req.organization = org;
      }
    }

    return next();
  } catch (err) {
    console.error('Auth protect error:', err && err.message ? err.message : err);
    return res.status(401).json({
      status: 'error',
      message: 'Not authorized, token invalid or expired'
    });
  }
};

/**
 * @desc    Legacy role-based access control
 * @deprecated Use checkAccess() from compositeAccess.middleware.js for granular features
 */
exports.restrictTo = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'User information missing. Ensure protect middleware runs first.'
      });
    }

    const userRole = req.user.role;

    // Superadmin can do anything
    if (userRole === 'superadmin') {
      return next();
    }

    // Developer has broad access
    if (userRole === 'developer') {
      if (allowedRoles.includes('superadmin') || allowedRoles.includes('developer') || allowedRoles.includes('admin')) {
        return next();
      }
    }

    // Admin has full org access
    if (userRole === 'admin') {
      if (allowedRoles.includes('admin') || allowedRoles.includes('user')) {
        return next();
      }
    }

    // For users with custom roles
    if (req.user.customRoleId && req.user.customRoleId.permissions) {
      if (allowedRoles.includes('user')) {
        return next();
      }
    }

    // Direct base role match
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      status: 'error',
      message: 'You do not have permission to perform this action'
    });
  };
};

// Export compositeAccess middleware (the new granular permission system)
exports.checkAccess = checkAccess;
exports.checkAnyAccess = checkAnyAccess;
exports.checkAllAccess = checkAllAccess;
exports.checkModuleAccess = checkModuleAccess;
exports.requireSystemRole = requireSystemRole;
exports.requireOrgAdmin = requireOrgAdmin;
