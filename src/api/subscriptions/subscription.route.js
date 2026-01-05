// src/api/subscriptions/subscription.route.js
// Routes for Subscription Plan management

const express = require('express');
const router = express.Router();
const subscriptionController = require('./subscription.controller');
const { protect, requireSystemRole } = require('../../middlewares/auth.middleware');

// All routes require authentication
router.use(protect);

// Get all plans (system roles + admins can see their org's custom plans)
router.get('/plans', subscriptionController.getAllPlans);

// --- IMPORTANT: Specific routes MUST come BEFORE parameterized routes ---

// Get all custom plans with organization details (Superadmin)
router.get('/plans/custom', requireSystemRole(), subscriptionController.getCustomPlans);

// Create custom plan for a specific organization (Superadmin)
router.post('/plans/custom', requireSystemRole(), subscriptionController.createCustomPlan);

// Get single plan by ID (must come AFTER /plans/custom)
router.get('/plans/:id', subscriptionController.getPlanById);

// --- Superadmin Only Routes ---

// Create a new plan
router.post('/plans', requireSystemRole(), subscriptionController.createPlan);

// Update a plan
router.put('/plans/:id', requireSystemRole(), subscriptionController.updatePlan);

// Delete a plan (soft delete)
router.delete('/plans/:id', requireSystemRole(), subscriptionController.deletePlan);

module.exports = router;
