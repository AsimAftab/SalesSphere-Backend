const TourPlan = require('./tour-plans.model');
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

// ============================================
// TOUR PLAN ENDPOINTS
// ============================================

// @desc    Create a new tour plan
// @route   POST /api/v1/tour-plans
// @access  Private (All authenticated users)
exports.createTourPlan = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const validatedData = tourPlanSchemaValidation.parse(req.body);

        const newTourPlan = await TourPlan.create({
            placeOfVisit: validatedData.placeOfVisit,
            startDate: new Date(validatedData.startDate),
            endDate: new Date(validatedData.endDate),
            purposeOfVisit: validatedData.purposeOfVisit,
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
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

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

        // Calculate numberOfDays for each tour plan using luxon
        const tourPlansWithDays = tourPlans.map(plan => {
            const startDate = DateTime.fromJSDate(new Date(plan.startDate));
            const endDate = DateTime.fromJSDate(new Date(plan.endDate));
            const numberOfDays = Math.ceil(endDate.diff(startDate, 'days').days) + 1; // +1 to include both start and end days
            return { ...plan, numberOfDays };
        });

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
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const query = { organizationId, createdBy: userId };

        const tourPlans = await TourPlan.find(query)
            .select('placeOfVisit startDate endDate purposeOfVisit status createdBy approvedBy createdAt')
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate numberOfDays for each tour plan using luxon
        const tourPlansWithDays = tourPlans.map(plan => {
            const startDate = DateTime.fromJSDate(new Date(plan.startDate));
            const endDate = DateTime.fromJSDate(new Date(plan.endDate));
            const numberOfDays = Math.ceil(endDate.diff(startDate, 'days').days) + 1;
            return { ...plan, numberOfDays };
        });

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
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // Non-system users can only see their own tour plans
        // Note: Permission check happens at route level for viewList/viewDetails
        if (role !== 'admin' && !isSystemRole(role)) {
            query.createdBy = userId;
        }

        const tourPlan = await TourPlan.findOne(query)
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .lean();

        if (!tourPlan) {
            return res.status(404).json({ success: false, message: 'Tour plan not found' });
        }

        // Calculate numberOfDays using luxon
        const startDate = DateTime.fromJSDate(new Date(tourPlan.startDate));
        const endDate = DateTime.fromJSDate(new Date(tourPlan.endDate));
        const numberOfDays = Math.ceil(endDate.diff(startDate, 'days').days) + 1; // +1 to include both start and end days

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
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
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
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // If not system role, restrict to own pending plans
        // Note: Permission check happens at route level for delete permission
        if (role !== 'admin' && !isSystemRole(role)) {
            query.createdBy = userId;
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
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const { status, rejectionReason } = statusSchemaValidation.parse(req.body);

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
        const adminRoles = ['admin', 'superadmin', 'developer'];
        const isAdminOrSystem = adminRoles.includes(req.user.role);

        if (tourPlan.createdBy._id.toString() === userId.toString() && !isAdminOrSystem) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve your own tour plan'
            });
        }

        // Update status
        tourPlan.status = status;

        if (status === 'approved') {
            tourPlan.approvedBy = userId;
            tourPlan.approvedAt = new Date();
        } else if (status === 'rejected') {
            tourPlan.approvedBy = userId;
            tourPlan.approvedAt = new Date();
            if (rejectionReason) {
                tourPlan.rejectionReason = rejectionReason;
            }
        }

        await tourPlan.save();

        const updatedPlan = await TourPlan.findById(tourPlan._id)
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email');

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
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

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

        // Validate all IDs
        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length !== ids.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more invalid tour plan IDs'
            });
        }

        // Find all tour plans matching the IDs and belonging to this organization
        const tourPlans = await TourPlan.find({
            _id: { $in: validIds },
            organizationId: organizationId
        }).select('_id');

        if (tourPlans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No tour plans found matching the provided IDs'
            });
        }

        // Delete tour plans from database
        const deleteResult = await TourPlan.deleteMany({
            _id: { $in: tourPlans.map(p => p._id) },
            organizationId: organizationId
        });

        // Find IDs that were not found
        const notFoundIds = validIds.filter(
            id => !tourPlans.some(p => p._id.toString() === id)
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
