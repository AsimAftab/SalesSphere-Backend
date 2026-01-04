// src/api/auth/auth.route.js
// Authentication routes - permission-based access

const express = require('express');
const {
  register,
  registerSuperAdmin,
  login,
  logout,
  forgotPassword,
  resetPassword,
  contactAdmin,
  scheduleDemo,
  checkAuthStatus,
  refreshToken,
} = require('./auth.controller');
const { protect, requireSystemRole } = require('../../middlewares/auth.middleware');

const router = express.Router();

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/forgotpassword', forgotPassword);
router.patch('/resetpassword/:token', resetPassword);
router.post('/contact-admin', contactAdmin);
router.post('/schedule-demo', scheduleDemo);

// ============================================
// PROTECTED ROUTES (auth required)
// ============================================
router.post('/logout', protect, logout);
router.get('/check-status', protect, checkAuthStatus);

// ============================================
// SYSTEM ROUTES (superadmin only)
// ============================================
// Register new organization - superadmin only
router.post('/register', protect, requireSystemRole(), register);
// Register superadmin (first-time setup only)
router.post('/register/superadmin', registerSuperAdmin);

module.exports = router;
