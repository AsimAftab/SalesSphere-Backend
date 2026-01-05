// src/api/subscriptions/subscription.controller.js
// CRUD operations for Subscription Plans (Superadmin only)

const SubscriptionPlan = require('./subscriptionPlan.model');
const Organization = require('../organizations/organization.model');
const { isSystemRole } = require('../../utils/defaultPermissions');

/**
 * @desc    Get all subscription plans (system plans + custom plans for specific org)
 * @route   GET /api/v1/subscriptions/plans
 * @access  Superadmin / Developer
 */
exports.getAllPlans = async (req, res) => {
    try {
        const query = { isActive: true };

        // If not system role, only show system plans (no custom plans of other orgs)
        if (!isSystemRole(req.user.role)) {
            query.$or = [
                { isSystemPlan: true },
                { organizationId: req.user.organizationId }
            ];
        }

        const plans = await SubscriptionPlan.find(query).sort({ tier: 1 });

        res.status(200).json({
            status: 'success',
            count: plans.length,
            data: plans
        });
    } catch (error) {
        console.error('Get all plans error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch subscription plans'
        });
    }
};

/**
 * @desc    Get a single subscription plan by ID
 * @route   GET /api/v1/subscriptions/plans/:id
 * @access  Superadmin / Developer
 */
exports.getPlanById = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                status: 'error',
                message: 'Subscription plan not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: plan
        });
    } catch (error) {
        console.error('Get plan by ID error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch subscription plan'
        });
    }
};

/**
 * @desc    Create a new subscription plan
 * @route   POST /api/v1/subscriptions/plans
 * @access  Superadmin only
 */
exports.createPlan = async (req, res) => {
    try {
        const { name, tier, description, enabledModules, maxEmployees, price, organizationId } = req.body;

        // Validate required fields
        if (!name || !tier || !enabledModules || !maxEmployees) {
            return res.status(400).json({
                status: 'error',
                message: 'Name, tier, enabledModules, and maxEmployees are required'
            });
        }

        // Only superadmin can create system plans
        if (req.body.isSystemPlan && req.user.role !== 'superadmin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only superadmin can create system plans'
            });
        }

        const plan = await SubscriptionPlan.create({
            name,
            tier,
            description,
            enabledModules,
            maxEmployees,
            price: price || {},
            organizationId: tier === 'custom' ? organizationId : null,
            isSystemPlan: tier !== 'custom'
        });

        res.status(201).json({
            status: 'success',
            message: 'Subscription plan created successfully',
            data: plan
        });
    } catch (error) {
        console.error('Create plan error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to create subscription plan'
        });
    }
};

/**
 * @desc    Update a subscription plan
 * @route   PUT /api/v1/subscriptions/plans/:id
 * @access  Superadmin only
 */
exports.updatePlan = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                status: 'error',
                message: 'Subscription plan not found'
            });
        }

        // Only superadmin can modify system plans
        if (plan.isSystemPlan && req.user.role !== 'superadmin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only superadmin can modify system plans'
            });
        }

        const { name, description, enabledModules, maxEmployees, price, isActive } = req.body;

        // Update fields if provided
        if (name) plan.name = name;
        if (description !== undefined) plan.description = description;
        if (enabledModules) plan.enabledModules = enabledModules;
        if (maxEmployees) plan.maxEmployees = maxEmployees;
        if (price) plan.price = { ...plan.price, ...price };
        if (isActive !== undefined) plan.isActive = isActive;

        await plan.save();

        res.status(200).json({
            status: 'success',
            message: 'Subscription plan updated successfully',
            data: plan
        });
    } catch (error) {
        console.error('Update plan error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to update subscription plan'
        });
    }
};

/**
 * @desc    Delete a subscription plan (soft delete - set isActive to false)
 * @route   DELETE /api/v1/subscriptions/plans/:id
 * @access  Superadmin only
 */
exports.deletePlan = async (req, res) => {
    try {
        const plan = await SubscriptionPlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                status: 'error',
                message: 'Subscription plan not found'
            });
        }

        // Cannot delete system plans
        if (plan.isSystemPlan) {
            return res.status(403).json({
                status: 'error',
                message: 'System plans cannot be deleted. You can only deactivate them.'
            });
        }

        // Check if any organization is using this plan
        const orgUsingPlan = await Organization.findOne({ subscriptionPlanId: plan._id });
        if (orgUsingPlan) {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot delete plan. It is currently in use by an organization.'
            });
        }

        // Soft delete
        plan.isActive = false;
        await plan.save();

        res.status(200).json({
            status: 'success',
            message: 'Subscription plan deleted successfully'
        });
    } catch (error) {
        console.error('Delete plan error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to delete subscription plan'
        });
    }
};

/**
 * @desc    Create a custom plan for a specific organization
 * @route   POST /api/v1/subscriptions/plans/custom
 * @access  Superadmin only
 */
exports.createCustomPlan = async (req, res) => {
    try {
        const { organizationId, name, enabledModules, maxEmployees, price } = req.body;

        if (!organizationId || !name || !enabledModules || !maxEmployees) {
            return res.status(400).json({
                status: 'error',
                message: 'organizationId, name, enabledModules, and maxEmployees are required'
            });
        }

        // Check if organization exists
        const org = await Organization.findById(organizationId);
        if (!org) {
            return res.status(404).json({
                status: 'error',
                message: 'Organization not found'
            });
        }

        // Create custom plan for this org
        const customPlan = await SubscriptionPlan.create({
            name,
            tier: 'custom',
            description: `Custom plan for ${org.name}`,
            enabledModules,
            maxEmployees,
            price: price || {},
            organizationId,
            isSystemPlan: false
        });

        // Optionally assign this plan to the organization immediately
        org.subscriptionPlanId = customPlan._id;
        await org.save();

        res.status(201).json({
            status: 'success',
            message: 'Custom plan created and assigned to organization',
            data: customPlan
        });
    } catch (error) {
        console.error('Create custom plan error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to create custom plan'
        });
    }
};

/**
 * @desc    Get all custom plans with organization details
 * @route   GET /api/v1/subscriptions/plans/custom
 * @access  Superadmin / Developer
 */
exports.getCustomPlans = async (req, res) => {
    try {
        const customPlans = await SubscriptionPlan.find({
            tier: 'custom',
            isActive: true
        }).populate({
            path: 'organizationId',
            select: 'name panVatNumber phone address isActive subscriptionEndDate'
        }).sort({ createdAt: -1 });

        res.status(200).json({
            status: 'success',
            count: customPlans.length,
            data: customPlans
        });
    } catch (error) {
        console.error('Get custom plans error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch custom plans'
        });
    }
};
