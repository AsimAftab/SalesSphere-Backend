const express = require('express');
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  contactAdmin, 
  scheduleDemo,
} = require('./auth.controller'); 

const router = express.Router();

// Authentication Routes
router.post('/register', register);
router.post('/login', login);

// Password Management Routes
router.post('/forgotpassword', forgotPassword);
router.patch('/resetpassword/:token', resetPassword);

// Admin Contact Route
router.post('/contact-admin', contactAdmin); 
// Demo Scheduling Route
router.post('/schedule-demo', scheduleDemo);
module.exports = router;
