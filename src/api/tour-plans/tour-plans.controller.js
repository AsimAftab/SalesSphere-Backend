const TourPlan = require('./tour-plans.model');
const BeatPlan = require('../beat-plans/beat-plan.model');
const mongoose = require('mongoose');
const { z } = require('zod');
const { DateTime } = require('luxon');
const { isSystemRole } = require('../../utils/defaultPermissions');
const { canApprove, getHierarchyFilter } = require('../../utils/hierarchyHelper');

// --- Zod Validation Schema ---
const tourPlanSchemaValidation = z.object({
    placeOfVisit: z.string({ required_error: "Place of visit is required" }).min(1, "Place of visit is required"),
    startDate: z.string({ required_error: "Start date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    endDate: z.string({ required_error: "End date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    purposeOfVisit: z.string({ required_error: "Purpose of visit is required" }).min(1, "Purpose of visit is required"),
}).refine(data => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return end >= start;
}, {
    message: "End date must be after or equal to start date",
    path: ["endDate"],
});

// --- Status Update Validation ---
const statusSchemaValidation = z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
    rejectionReason: z.string().optional(),
});

// --- Helper Functions ---

/**
 * Calculate the number of days for a tour (inclusive of start and end dates)
 * @param {Date|string} startDate - Tour start date
 * @param {Date|string} endDate - Tour end date
 * @returns {number} Number of days (inclusive)
 */
const calculateTourDuration = (startDate, endDate) => {
    const start = DateTime.fromJSDate(new Date(startDate));
    const end = DateTime.fromJSDate(new Date(endDate));
    return Math.ceil(end.diff(start, 'days').days) + 1; // +1 to include both start and end days
};

// ============================================
// TOUR PLAN ENDPOINTS
// ============================================

// @desc    Create a new tour plan
// @route   POST /api/v1/tour-plans
// @access  Private (All authenticated users)
exports.createTourPlan = async (req, res, next) => {
    try {
        const { organizationId, _id: userId } = req.user;

        const validatedData = tourPlanSchemaValidation.parse(req.body);

        // Convert dates to Date objects
        const startDate = new Date(validatedData.startDate);
        const endDate = new Date(validatedData.endDate);

        // Validation: End date cannot be in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (endDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Tour end date cannot be in the past'
            });
        }

        // Validation: Check for overlapping tour plans for the same user
        const overlappingTour = await TourPlan.findOne({
            createdBy: userId,
            organizationId: organizationId,
            status: { $in: ['pending', 'approved'] },
            $or: [
                // New tour starts during an existing tour
                { startDate: { $lte: startDate }, endDate: { $gte: startDate } },
                // New tour ends during an existing tour
                { startDate: { $lte: endDate }, endDate: { $gte: endDate } },
                // New tour completely covers an existing tour
                { startDate: { $gte: startDate }, endDate: { $lte: endDate } }
            ]
        });

        if (overlappingTour) {
            return res.status(400).json({
                success: false,
                message: `You already have a tour plan scheduled during these dates (${overlappingTour.startDate.toISOString().split('T')[0]} to ${overlappingTour.endDate.toISOString().split('T')[0]})`
            });
        }

        // Validation: Check for conflicting beat plans
        // Beat plans have schedule.startDate and schedule.endDate fields
        const conflictingBeatPlan = await BeatPlan.findOne({
            organizationId: organizationId,
            status: { $in: ['pending', 'active'] },
            'schedule.startDate': { $lte: endDate },
            'schedule.endDate': { $gte: startDate },
            $or: [
                { employees: userId }, // User is assigned to beat plan
                { createdBy: userId } // Or user created the beat plan
            ]
        });

        if (conflictingBeatPlan) {
            return res.status(400).json({
                success: false,
                message: `You have a beat plan assigned during this tour period (${conflictingBeatPlan.schedule?.startDate?.toISOString().split('T')[0]} to ${conflictingBeatPlan.schedule?.endDate?.toISOString().split('T')[0]})`
            });
        }

        const newTourPlan = await TourPlan.create({
            placeOfVisit: validatedData.placeOfVisit.trim(),
            startDate: startDate,
            endDate: endDate,
            purposeOfVisit: validatedData.purposeOfVisit.trim(),
            organizationId: organizationId,
            createdBy: userId,
            status: 'pending',
        });

        // Populate createdBy for response
        await newTourPlan.populate('createdBy', 'name email');

        res.status(201).json({ success: true, data: newTourPlan });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        console.error("Error creating tour plan:", error);
        next(error);
    }
};

// @desc    Get all tour plans
// @route   GET /api/v1/tour-plans
// @access  Private
exports.getAllTourPlans = async (req, res, next) => {
    try {
        const { organizationId } = req.user;

        const query = { organizationId: organizationId };

        // Apply hierarchy filter (View All vs Supervisor vs Own)
        const hierarchyFilter = await getHierarchyFilter(req.user, 'tourPlan', 'viewAllTourPlans');
        Object.assign(query, hierarchyFilter);

        const tourPlans = await TourPlan.find(query)
            .select('placeOfVisit startDate endDate purposeOfVisit status createdBy approvedBy createdAt')
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate numberOfDays for each tour plan using helper
        const tourPlansWithDays = tourPlans.map(plan => ({
            ...plan,
            numberOfDays: calculateTourDuration(plan.startDate, plan.endDate)
        }));

        res.status(200).json({ success: true, count: tourPlansWithDays.length, data: tourPlansWithDays });
    } catch (error) {
        next(error);
    }
};

// @desc    Get my tour plans (for logged-in user)
// @route   GET /api/v1/tour-plans/my-tour-plans
// @access  Private
exports.getMyTourPlans = async (req, res, next) => {
    try {
        const { organizationId, _id: userId } = req.user;

        const query = { organizationId, createdBy: userId };

        const tourPlans = await TourPlan.find(query)
            .select('placeOfVisit startDate endDate purposeOfVisit status createdBy approvedBy createdAt')
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate numberOfDays for each tour plan using helper
        const tourPlansWithDays = tourPlans.map(plan => ({
            ...plan,
            numberOfDays: calculateTourDuration(plan.startDate, plan.endDate)
        }));

        res.status(200).json({ success: true, count: tourPlansWithDays.length, data: tourPlansWithDays });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single tour plan by ID
// @route   GET /api/v1/tour-plans/:id
// @access  Private
exports.getTourPlanById = async (req, res, next) => {
    try {
        const { organizationId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // Apply hierarchy filter to ensure managers can view subordinate plans
        // Same logic as getAllTourPlans
        const hierarchyFilter = await getHierarchyFilter(req.user, 'tourPlan', 'viewAllTourPlans');
        Object.assign(query, hierarchyFilter);

        const tourPlan = await TourPlan.findOne(query)
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .lean();

        if (!tourPlan) {
            return res.status(404).json({ success: false, message: 'Tour plan not found' });
        }

        // Calculate numberOfDays using helper
        const numberOfDays = calculateTourDuration(tourPlan.startDate, tourPlan.endDate);

        res.status(200).json({ success: true, data: { ...tourPlan, numberOfDays } });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a tour plan
// @route   PUT /api/v1/tour-plans/:id
// @access  Private (Only the creator can update if status is pending)
exports.updateTourPlan = async (req, res, next) => {
    try {
        const { organizationId, _id: userId } = req.user;

        const validatedData = tourPlanSchemaValidation.partial().parse(req.body);

        // Find the tour plan
        const tourPlan = await TourPlan.findOne({
            _id: req.params.id,
            organizationId: organizationId,
            createdBy: userId
        });

        if (!tourPlan) {
            return res.status(404).json({ success: false, message: 'Tour plan not found' });
        }

        // Only allow updates if status is pending
        if (tourPlan.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update a tour plan that has already been processed'
            });
        }

        // Update date fields if provided
        if (validatedData.startDate) {
            validatedData.startDate = new Date(validatedData.startDate);
        }
        if (validatedData.endDate) {
            validatedData.endDate = new Date(validatedData.endDate);
        }

        const updatedTourPlan = await TourPlan.findByIdAndUpdate(
            req.params.id,
            validatedData,
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email');

        res.status(200).json({ success: true, data: updatedTourPlan });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Delete a tour plan
// @route   DELETE /api/v1/tour-plans/:id
// @access  Private (Only the creator can delete if status is pending, Admin/Manager can delete any)
exports.deleteTourPlan = async (req, res, next) => {
    try {
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // If not system role, restrict deletions
        // Managers -> Team's pending plans
        // Users -> Own pending plans
        if (role !== 'admin' && !isSystemRole(role)) {
            // Get hierarchy filter (handles managers seeing subordinates)
            const hierarchyFilter = await getHierarchyFilter(req.user, 'tourPlan', 'delete');
            Object.assign(query, hierarchyFilter);

            // Additionally ensure status is pending for non-admins
            query.status = 'pending';
        }

        const tourPlan = await TourPlan.findOneAndDelete(query);

        if (!tourPlan) {
            return res.status(404).json({
                success: false,
                message: 'Tour plan not found or cannot be deleted'
            });
        }

        res.status(200).json({ success: true, message: 'Tour plan deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Update tour plan status (approve/reject)
// @route   PUT /api/v1/tour-plans/:id/status
// @access  Private (Admin or Supervisor with approval permission)
exports.updateTourPlanStatus = async (req, res, next) => {
    try {
        const { organizationId, _id: userId, role } = req.user;

        const { status, rejectionReason } = statusSchemaValidation.parse(req.body);

        // Validation: rejection reason is required when status is rejected
        if (status === 'rejected' && (!rejectionReason || rejectionReason.trim().length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required when rejecting a tour plan'
            });
        }

        // First, fetch tour plan for authorization checks (before atomic update)
        const tourPlan = await TourPlan.findOne({
            _id: req.params.id,
            organizationId: organizationId
        }).populate('createdBy', 'name email reportsTo role organizationId'); // Populate to check hierarchy

        if (!tourPlan) {
            return res.status(404).json({ success: false, message: 'Tour plan not found' });
        }

        // Don't allow changing status of already processed plans
        if (tourPlan.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot change status of a ${tourPlan.status} tour plan`
            });
        }

        // Hierarchy & Permission Check using canApprove helper
        // This checks if approver is admin OR in the requester's reportsTo array
        const authorized = canApprove(req.user, tourPlan.createdBy, 'tourPlan');

        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to approve this request. You must be the direct supervisor or an admin and have approval permission.'
            });
        }

        // Prevent self-approval for regular users (Admins and system roles can approve their own tour plans)
        const isAdminOrSystem = role === 'admin' || isSystemRole(role);

        if (tourPlan.createdBy._id.toString() === userId.toString() && !isAdminOrSystem) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve your own tour plan'
            });
        }

        // Build update object based on status
        const updateData = {
            status: status,
            approvedAt: new Date()
        };

        if (status === 'approved') {
            updateData.approvedBy = userId;
            updateData.rejectionReason = null; // Clear any previous rejection reason
        } else if (status === 'rejected') {
            // For rejected, we track who processed it but not as an approver
            updateData.approvedBy = userId;
            updateData.rejectionReason = rejectionReason;
        }

        // Atomic update with condition - prevents race condition
        // Only updates if status is still 'pending' (concurrent request protection)
        const updatedPlan = await TourPlan.findOneAndUpdate(
            { _id: req.params.id, status: 'pending', organizationId: organizationId },
            updateData,
            { new: true }
        )
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email');

        if (!updatedPlan) {
            return res.status(400).json({
                success: false,
                message: 'Tour plan was already processed by another request'
            });
        }

        res.status(200).json({ success: true, data: updatedPlan });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Bulk delete tour plans
// @route   DELETE /api/v1/tour-plans/bulk-delete
// @access  Private (Admin, Manager)
exports.bulkDeleteTourPlans = async (req, res, next) => {
    try {
        const { organizationId, role } = req.user;

        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of tour plan IDs'
            });
        }

        // Limit the number of tour plans that can be deleted at once
        if (ids.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 100 tour plans can be deleted at once'
            });
        }

        // 1. Get Hierarchy Filter
        const hierarchyFilter = await getHierarchyFilter(req.user, 'tourPlan', 'delete');

        // 2. Build SECURE query
        const query = {
            _id: { $in: ids },
            organizationId,
            ...hierarchyFilter
        };

        // If not admin/system, ensure we only delete PENDING requests
        if (role !== 'admin' && !isSystemRole(role)) {
            query.status = 'pending';
        }

        const tourPlans = await TourPlan.find(query).select('_id');

        if (tourPlans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No tour plans found matching the provided IDs or you do not have permission to delete them'
            });
        }

        const foundIds = tourPlans.map(tp => tp._id);

        const deleteResult = await TourPlan.deleteMany({
            _id: { $in: foundIds }
        });

        // Find IDs that were not found
        const notFoundIds = ids.filter(
            id => !foundIds.some(fid => fid.toString() === id)
        );

        res.status(200).json({
            success: true,
            message: 'Bulk delete completed',
            data: {
                totalRequested: ids.length,
                tourPlansDeleted: deleteResult.deletedCount,
                notFound: notFoundIds.length,
                notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
            }
        });
    } catch (error) {
        console.error("Error in bulk delete:", error);
        next(error);
    }
};
