// src/middlewares/auth.middleware.js
// Authentication and permission middleware

const jwt = require('jsonwebtoken');
const User = require('../api/users/user.model');
const { getDefaultPermissions, isSystemRole, ADMIN_DEFAULT_PERMISSIONS } = require('../utils/defaultPermissions');

// Import permission middleware
const {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireSystemRole,
  requireOrgAdmin,
  attachPermissions
} = require('./permission.middleware');

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
 * @desc    Legacy role-based access control (maps old roles to new system)
 * @note    For transition - gradually migrate to requirePermission()
 * 
 * Role mapping:
 * - superadmin, developer -> System roles (always allowed)
 * - admin -> Org admin (full access within org)
 * - manager, salesperson, user -> Check custom role or allow if in list
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

    // Developer has broad access (read/write, limited delete)
    if (userRole === 'developer') {
      if (allowedRoles.includes('superadmin') || allowedRoles.includes('developer')) {
        return next();
      }
      // Allow developer to access routes marked for admin/manager
      if (allowedRoles.includes('admin') || allowedRoles.includes('manager')) {
        return next();
      }
    }

    // Admin has full org access
    if (userRole === 'admin') {
      if (allowedRoles.includes('admin') || allowedRoles.includes('manager') ||
        allowedRoles.includes('salesperson') || allowedRoles.includes('user')) {
        return next();
      }
    }

    // For users with custom roles assigned
    if (req.user.customRoleId && req.user.customRoleId.permissions) {
      // User has a custom role - check if they have relevant permissions
      // Map old roles to permission checks
      if (allowedRoles.includes('manager') || allowedRoles.includes('salesperson') || allowedRoles.includes('user')) {
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

// Export permission middleware
exports.requirePermission = requirePermission;
exports.requireAllPermissions = requireAllPermissions;
exports.requireAnyPermission = requireAnyPermission;
exports.requireSystemRole = requireSystemRole;
exports.requireOrgAdmin = requireOrgAdmin;
exports.attachPermissions = attachPermissions;
