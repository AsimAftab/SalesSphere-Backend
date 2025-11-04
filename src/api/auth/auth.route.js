const express = require('express');
const { 
  register, 
  login, 
  forgotPassword, // <-- Added
  resetPassword   // <-- Added
} = require('./auth.controller');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// --- ADDED NEW ROUTES ---
router.post('/forgotpassword', forgotPassword);
router.patch('/resetpassword/:token', resetPassword);
// ------------------------

module.exports = router;