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
} = require('./auth.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const router = express.Router();

// Authentication Routes
router.post('/register', register);
router.post('/register/superadmin', registerSuperAdmin);
router.post('/login', login);
router.post('/logout', logout);

// Password Management Routes
router.post('/forgotpassword', forgotPassword);
router.patch('/resetpassword/:token', resetPassword);

// Admin Contact Route
router.post('/contact-admin', contactAdmin); 
// Demo Scheduling Route
router.post('/schedule-demo', scheduleDemo);

// Check Authentication Status Route
router.get('/check-status', protect, checkAuthStatus);

module.exports = router;
