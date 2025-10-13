const express = require('express');
const userController = require('./user.controller');
const { protect } = require('../../middlewares/auth.middleware');
const router = express.Router();
router.use(protect);
// User routes
router.get('/', userController.getAllUsers);
router.get('/:id',userController.getUserById);
router.put('/:id',userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
