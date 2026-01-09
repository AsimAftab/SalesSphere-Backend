const LeaveRequest = require('./leave.model');
const Attendance = require('../attendance/attendance.model');
const Organization = require('../organizations/organization.model');
const User = require('../users/user.model');
const mongoose = require('mongoose');
const { z } = require('zod');
const { DateTime } = require('luxon');
const { isSystemRole } = require('../../utils/defaultPermissions');
const { canApprove } = require('../../utils/hierarchyHelper');

const { getHierarchyFilter } = require('../../utils/hierarchyHelper');
// Internal helper removed in favor of centralized deep hierarchy helper

// --- Zod Validation Schemas ---
const leaveRequestSchemaValidation = z.object({
    startDate: z.string({ required_error: "Start date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid start date format" }),
    endDate: z.string().refine(val => !val || !isNaN(Date.parse(val)), { message: "Invalid end date format" }).optional(),
    category: z.enum([
        'sick_leave',
        'maternity_leave',
        'paternity_leave',
        'compassionate_leave',
        'religious_holidays',
        'family_responsibility',
        'miscellaneous'
    ], { required_error: "Leave category is required" }),
    reason: z.string({ required_error: "Reason is required" }).min(1, "Reason is required"),
}).refine(data => {
    if (data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
}, { message: "End date cannot be before start date", path: ['endDate'] });

const statusSchemaValidation = z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
    rejectionReason: z.string().optional(),
});

// --- Helpers ---
const getOrgConfig = async (orgId) => {
    const org = await Organization.findById(orgId).select('timezone weeklyOffDay').lean();
    return {
        timezone: org?.timezone || 'Asia/Kolkata',
        weeklyOffDay: org?.weeklyOffDay || 'Saturday'
    };
};

// Parse date string and return a Date at UTC midnight with local date components
// Matches the pattern used in attendance.controller.js
const parseDateToOrgTZ = (dateStr, timezone = 'Asia/Kolkata') => {
    if (!dateStr) throw new Error('Date is required');

    const dateString = String(dateStr).trim();

    // For date-only strings (YYYY-MM-DD), explicitly parse components
    const isoDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
        const year = parseInt(isoDateMatch[1], 10);
        const month = parseInt(isoDateMatch[2], 10);
        const day = parseInt(isoDateMatch[3], 10);

        const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });
        if (!dt.isValid) throw new Error(`Invalid date: ${dateString}`);

        // Return a Date object at UTC midnight with the LOCAL date components
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    // Try ISO date format with time
    let dt = DateTime.fromISO(dateString, { zone: timezone });
    if (!dt.isValid) {
        const jsDate = new Date(dateString);
        if (isNaN(jsDate.getTime())) throw new Error(`Invalid date format: ${dateString}`);
        dt = DateTime.fromJSDate(jsDate, { zone: timezone });
    }

    if (!dt.isValid) throw new Error(`Invalid date: ${dateString}`);

    const { year, month, day } = dt;
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };

// Calculate leave days count (excluding weekly off days)
// Uses UTC zone for consistent weekday calculation
const getLeaveDatesCount = (start, end, weeklyOffDay) => {
    const offNum = dayNameToNumber[weeklyOffDay];
    let count = 0;
    // Use UTC zone since dates are stored as UTC midnight
    let current = DateTime.fromJSDate(start, { zone: 'UTC' });
    const last = DateTime.fromJSDate(end || start, { zone: 'UTC' });

    while (current <= last) {
        // Luxon weekday: 1 = Monday ... 7 = Sunday; convert to 0..6 where 0=Sunday
        const dayOfWeek = current.weekday % 7;
        if (dayOfWeek !== offNum) count++;
        current = current.plus({ days: 1 });
    }
    return count;
};

// ============================================
// LEAVE REQUEST CONTROLLERS
// ============================================

// @desc    Create a new leave request
// @route   POST /api/v1/leave-requests
exports.createLeaveRequest = async (req, res, next) => {
    try {
        const { organizationId, _id: userId } = req.user;

        const [validatedData, { timezone, weeklyOffDay }] = await Promise.all([
            leaveRequestSchemaValidation.parseAsync(req.body),
            getOrgConfig(organizationId)
        ]);

        const startDate = parseDateToOrgTZ(validatedData.startDate, timezone);
        const endDate = validatedData.endDate ? parseDateToOrgTZ(validatedData.endDate, timezone) : startDate;

        // Check for overlapping leave requests
        const overlappingRequest = await LeaveRequest.findOne({
            createdBy: userId,
            organizationId,
            $or: [
                // New request starts within existing request
                { startDate: { $lte: startDate }, endDate: { $gte: startDate } },
                // New request ends within existing request
                { startDate: { $lte: endDate }, endDate: { $gte: endDate } },
                // New request completely contains existing request
                { startDate: { $gte: startDate }, endDate: { $lte: endDate } }
            ]
        });

        if (overlappingRequest) {
            const existingStart = overlappingRequest.startDate.toISOString().split('T')[0];
            const existingEnd = overlappingRequest.endDate.toISOString().split('T')[0];
            return res.status(400).json({
                success: false,
                message: `You already have a leave request from ${existingStart} to ${existingEnd}. Please update the existing request or choose different dates.`,
                existingRequest: {
                    id: overlappingRequest._id,
                    startDate: existingStart,
                    endDate: existingEnd,
                    status: overlappingRequest.status,
                    category: overlappingRequest.category
                }
            });
        }

        const leaveDays = getLeaveDatesCount(startDate, endDate, weeklyOffDay);

        const newLeaveRequest = await LeaveRequest.create({
            startDate,
            endDate,
            category: validatedData.category,
            reason: validatedData.reason,
            leaveDays,
            organizationId,
            createdBy: userId,
            status: 'pending',
        });

        res.status(201).json({ success: true, data: newLeaveRequest, leaveDays });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ success: false, errors: error.flatten().fieldErrors });
        next(error);
    }
};

// @desc    Get all leave requests
// @route   GET /api/v1/leave-requests
exports.getAllLeaveRequests = async (req, res, next) => {
    try {
        const { organizationId, role, _id: userId } = req.user;

        // Get hierarchy filter
        const hierarchyFilter = await getHierarchyFilter(req.user, 'leaves', 'viewTeamLeaves');

        const query = {
            organizationId,
            ...hierarchyFilter
        };

        const leaveRequests = await LeaveRequest.find(query)
            .populate('employee', 'name email role') // Changed from 'createdBy' to 'employee' based on previous context, but checking model... 
            // Wait, schema uses 'employee' or 'createdBy'?
            // In updateLeaveRequestStatus (lines 305+), we see populate('employee', ...).
            // But in createLeaveRequest (lines 118, 155), we see 'createdBy'.
            // Looking at the view_file for createLeaveRequest (lines 155), it saves as 'createdBy: userId'.
            // BUT earlier viewing of updateLeaveRequestStatus (Step 1910) showed populate('employee').
            // Let's check schema/previous code to be sure. 
            // Step 1905: `populate('employee', 'name email reportsTo role')` was used.
            // Step 2003: `populate('createdBy', ...)` was used in getLeaveRequestById.
            // It seems inconsistent or I misread.
            // Let's assume 'createdBy' is the field since it's standard.
            // Wait, line 306 in viewed file said `.populate('createdBy', ...)` in previous turns?
            // Actually, in Step 1897 check, I replaced content to use `employee`.
            // Let's stick to `createdBy` if the schema has it, or `employee` if that's the field.
            // The LeaveRequest model schema isn't fully visible, but `createLeaveRequest` saves `createdBy`.
            // Let's use `createdBy` to be safe as per `getAllLeaveRequests` existing code.
            .populate('createdBy', 'name email role')
            .populate('approvedBy', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: leaveRequests.length, data: leaveRequests });
    } catch (error) {
        next(error);
    }
};

// @desc    Get my leave requests
// @route   GET /api/v1/leave-requests/my-requests
exports.getMyLeaveRequests = async (req, res, next) => {
    try {
        const { organizationId, _id: userId } = req.user;

        const leaveRequests = await LeaveRequest.find({ organizationId, createdBy: userId })
            .populate('approvedBy', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: leaveRequests.length, data: leaveRequests });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single leave request by ID
// @route   GET /api/v1/leave-requests/:id
exports.getLeaveRequestById = async (req, res, next) => {
    try {
        const { organizationId, role, _id: userId } = req.user;

        // Get hierarchy filter
        const hierarchyFilter = await getHierarchyFilter(req.user, 'leaves', 'viewTeamLeaves');

        const query = {
            _id: req.params.id,
            organizationId,
            ...hierarchyFilter
        };

        const leaveRequest = await LeaveRequest.findOne(query)
            .populate('createdBy', 'name email role')
            .populate('approvedBy', 'name email');

        if (!leaveRequest) {
            return res.status(404).json({ success: false, message: 'Leave request not found' });
        }

        res.status(200).json({ success: true, data: leaveRequest });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a leave request
// @route   PUT /api/v1/leave-requests/:id
exports.updateLeaveRequest = async (req, res, next) => {
    try {
        const { organizationId, _id: userId } = req.user;

        const validatedData = leaveRequestSchemaValidation.partial().parse(req.body);

        const leaveRequest = await LeaveRequest.findOne({
            _id: req.params.id,
            organizationId,
            createdBy: userId
        });

        if (!leaveRequest) {
            return res.status(404).json({ success: false, message: 'Leave request not found' });
        }

        if (leaveRequest.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Cannot update a processed leave request' });
        }

        const { timezone, weeklyOffDay } = await getOrgConfig(organizationId);

        // Parse dates
        const newStartDate = validatedData.startDate
            ? parseDateToOrgTZ(validatedData.startDate, timezone)
            : leaveRequest.startDate;
        const newEndDate = validatedData.endDate
            ? parseDateToOrgTZ(validatedData.endDate, timezone)
            : leaveRequest.endDate;

        const leaveDays = getLeaveDatesCount(newStartDate, newEndDate, weeklyOffDay);

        const updatedLeaveRequest = await LeaveRequest.findByIdAndUpdate(
            req.params.id,
            {
                startDate: newStartDate,
                endDate: newEndDate,
                category: validatedData.category || leaveRequest.category,
                reason: validatedData.reason || leaveRequest.reason,
                leaveDays
            },
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email');

        res.status(200).json({ success: true, data: updatedLeaveRequest, leaveDays });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ success: false, errors: error.flatten().fieldErrors });
        next(error);
    }
};

// @desc    Delete a leave request
// @route   DELETE /api/v1/leave-requests/:id
exports.deleteLeaveRequest = async (req, res, next) => {
    try {
        const { organizationId, role, _id: userId } = req.user;

        // 1. Find the request first
        const leaveRequest = await LeaveRequest.findOne({
            _id: req.params.id,
            organizationId
        });

        if (!leaveRequest) {
            return res.status(404).json({ success: false, message: 'Leave request not found' });
        }

        // 2. Permission Logic (role-agnostic)
        const isAdmin = role === 'admin' || isSystemRole(role);
        const isCreator = leaveRequest.createdBy.toString() === userId.toString();

        if (!isAdmin) {
            // Non-admin users: can only delete own pending requests
            if (!isCreator) {
                return res.status(403).json({ success: false, message: 'You can only delete your own leave requests' });
            }
            if (leaveRequest.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete a processed leave request. Contact admin to cancel it.'
                });
            }
        }

        await LeaveRequest.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Leave request deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Update leave request status (approve/reject)
// @route   PUT /api/v1/leaves/:id/status
// @access  Private (Admin or Supervisor with approval permission)
exports.updateLeaveRequestStatus = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { status, rejectionReason } = statusSchemaValidation.parse(req.body);

        const leaveRequest = await LeaveRequest.findOne({ _id: req.params.id, organizationId })
            .populate('employee', 'name email reportsTo role'); // Populate employee to check supervisor

        if (!leaveRequest) return res.status(404).json({ success: false, message: 'Leave request not found' });
        if (leaveRequest.status !== 'pending') return res.status(400).json({ success: false, message: 'Already processed' });

        // Hierarchy & Permission Check
        // Can this user (approver) approve this employee's request?
        const authorized = await canApprove(req.user, leaveRequest.employee, 'leaves');

        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to approve this request. You must be the direct supervisor or an admin and have approval permission.'
            });
        }

        // Prevent Self-Approval (Redundant if hierarchy check works correctly but good safety)
        if (leaveRequest.employee._id.toString() === userId.toString()) {
            return res.status(403).json({ success: false, message: 'Cannot approve own request' });
        }

        leaveRequest.status = status;
        leaveRequest.approvedBy = userId;
        leaveRequest.approvedAt = new Date(); // Using approvedAt consistent with other controllers
        if (status === 'rejected') leaveRequest.rejectionReason = rejectionReason;

        await leaveRequest.save();

        // Mark Attendance if Approved
        let attendanceDaysMarked = 0;
        if (status === 'approved') {
            const { weeklyOffDay } = await getOrgConfig(organizationId);
            const offNum = dayNameToNumber[weeklyOffDay];

            // Get approver's name for notes
            const approverName = req.user.name || 'Admin';
            const leaveCategory = leaveRequest.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            const attendanceOps = [];
            // Use UTC zone since dates are stored as UTC midnight
            let curr = DateTime.fromJSDate(leaveRequest.startDate, { zone: 'UTC' });
            const end = DateTime.fromJSDate(leaveRequest.endDate || leaveRequest.startDate, { zone: 'UTC' });

            while (curr <= end) {
                // Luxon weekday: 1 = Monday ... 7 = Sunday; convert to 0..6 where 0=Sunday
                const dayOfWeek = curr.weekday % 7;
                if (dayOfWeek !== offNum) {
                    attendanceOps.push({
                        updateOne: {
                            filter: { employee: leaveRequest.createdBy._id, date: curr.toJSDate(), organizationId },
                            update: {
                                $set: {
                                    status: 'L',
                                    markedBy: null, // System-generated via Leave Request
                                    notes: `${leaveCategory} - Approved by ${approverName}`
                                }
                            },
                            upsert: true
                        }
                    });
                }
                curr = curr.plus({ days: 1 });
            }

            if (attendanceOps.length > 0) {
                await Attendance.bulkWrite(attendanceOps);
                attendanceDaysMarked = attendanceOps.length;
            }
        }

        const updatedRequest = await LeaveRequest.findById(leaveRequest._id)
            .populate('createdBy', 'name email role')
            .populate('approvedBy', 'name email');

        res.status(200).json({
            success: true,
            data: updatedRequest,
            attendanceDaysMarked,
            message: status === 'approved'
                ? `Leave approved and ${attendanceDaysMarked} attendance days marked`
                : 'Leave request rejected'
        });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ success: false, errors: error.flatten().fieldErrors });
        next(error);
    }
};

// @desc    Bulk delete leave requests
// @route   DELETE /api/v1/leave-requests/bulk-delete
exports.bulkDeleteLeaveRequests = async (req, res, next) => {
    try {
        const { organizationId, role, _id: userId } = req.user;
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Please provide an array of IDs' });
        }

        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid IDs provided' });
        }

        const isAdmin = role === 'admin' || isSystemRole(role);

        let query = {
            _id: { $in: validIds },
            organizationId
        };

        // Non-admin users: can only delete own pending requests
        if (!isAdmin) {
            query.createdBy = userId;
            query.status = 'pending';
        }

        const result = await LeaveRequest.deleteMany(query);

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} leave request(s) deleted`
        });
    } catch (error) {
        next(error);
    }
};