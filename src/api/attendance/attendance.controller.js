const Attendance = require('./attendance.model');
const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');
const { z } = require('zod');
const mongoose = require('mongoose');

// Helper to get the start of the current day, ignoring time (in UTC)
const getStartOfToday = () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today;
};

// Helper to get the start of a given day (in UTC)
const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

// Helper to parse time string (HH:MM) to hours and minutes
const parseTimeString = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
};

// Helper to check if employee is late for check-in
const isLateCheckIn = (checkInTime, organizationCheckInTime) => {
    if (!organizationCheckInTime) return false;

    const checkInDate = new Date(checkInTime);
    const { hours, minutes } = parseTimeString(organizationCheckInTime);

    const expectedCheckIn = new Date(checkInDate);
    expectedCheckIn.setHours(hours, minutes, 0, 0);

    return checkInDate > expectedCheckIn;
};

// Helper to check if employee is early for check-out
const isEarlyCheckOut = (checkOutTime, organizationCheckOutTime) => {
    if (!organizationCheckOutTime) return false;

    const checkOutDate = new Date(checkOutTime);
    const { hours, minutes } = parseTimeString(organizationCheckOutTime);

    const expectedCheckOut = new Date(checkOutDate);
    expectedCheckOut.setHours(hours, minutes, 0, 0);

    return checkOutDate < expectedCheckOut;
};


// --- 1. FOR THE APP (Salesperson / Manager) ---

// @desc    Check-in for the currently logged-in user
// @route   POST /api/v1/attendance/check-in
// @access  Private (Salesperson, Manager)
exports.checkIn = async (req, res, next) => {
    const checkInSchema = z.object({
        latitude: z.number(),
        longitude: z.number(),
        address: z.string().min(1, "Address is required"),
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { _id: userId, organizationId } = req.user;

        const { latitude, longitude, address } = checkInSchema.parse(req.body);
        const today = getStartOfToday();

        // Check if a record exists and if user is already checked in
        const existingRecord = await Attendance.findOne({
            employee: userId,
            date: today,
            organizationId: organizationId,
        });

        if (existingRecord && existingRecord.checkInTime) {
            return res.status(400).json({ success: false, message: 'You have already checked in today.' });
        }

        // Fetch organization settings to get expected check-in time
        const organization = await Organization.findById(organizationId).select('checkInTime checkOutTime halfDayCheckOutTime weeklyOffDay');

        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Validate: Prevent check-in on weekly off days
        const weeklyOffDay = organization.weeklyOffDay || 'Saturday';
        const dayNameToNumber = {
            'Sunday': 0,
            'Monday': 1,
            'Tuesday': 2,
            'Wednesday': 3,
            'Thursday': 4,
            'Friday': 5,
            'Saturday': 6
        };
        const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];
        const todayDayOfWeek = today.getUTCDay();

        if (todayDayOfWeek === weeklyOffDayNumber) {
            return res.status(400).json({
                success: false,
                message: `Today is ${weeklyOffDay}, the organization's weekly off day. You cannot check in on this day.`,
                weeklyOffDay: weeklyOffDay
            });
        }

        const checkInTime = new Date();

        // If record exists (e.g., admin marked 'L'), it will be updated.
        // If not, it will be created (upsert).
        const updatedRecord = await Attendance.findOneAndUpdate(
            {
                employee: userId,
                date: today,
                organizationId: organizationId,
            },
            {
                $set: {
                    status: 'P', // Mark as Present
                    checkInTime: checkInTime,
                    checkInLocation: { latitude, longitude },
                    checkInAddress: address,
                    markedBy: userId, // Marked by self
                    // Store organization settings at time of check-in
                    orgCheckInTime: organization.checkInTime,
                    orgCheckOutTime: organization.checkOutTime,
                    orgHalfDayCheckOutTime: organization.halfDayCheckOutTime,
                    orgWeeklyOffDay: organization.weeklyOffDay,
                    // Clear any potential check-out time (if admin was editing)
                    checkOutTime: null,
                    checkOutLocation: null,
                    checkOutAddress: null,
                }
            },
            { new: true, upsert: true, runValidators: true }
        );

        // Calculate if the employee is late
        const isLate = organization ? isLateCheckIn(checkInTime, organization.checkInTime) : false;

        res.status(201).json({
            success: true,
            data: updatedRecord,
            isLate: isLate,
            expectedCheckInTime: organization?.checkInTime || null
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        if (error.code === 11000) {
             return res.status(400).json({ success: false, message: 'Attendance already marked for today.' });
        }
        next(error);
    }
};

// @desc    Check-out for the currently logged-in user
// @route   PUT /api/v1/attendance/check-out
// @access  Private (Salesperson, Manager)
exports.checkOut = async (req, res, next) => {
    const checkOutSchema = z.object({
        latitude: z.number(),
        longitude: z.number(),
        address: z.string().min(1, "Address is required"),
        isHalfDay: z.boolean().optional().default(false), // Optional: true for half-day checkout
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { _id: userId, organizationId } = req.user;
        const today = getStartOfToday();

        const { latitude, longitude, address, isHalfDay } = checkOutSchema.parse(req.body);

        // Find the record to check out
        const existingRecord = await Attendance.findOne({
            employee: userId,
            date: today,
            organizationId: organizationId,
        });

        if (!existingRecord || !existingRecord.checkInTime) {
            return res.status(400).json({ success: false, message: "You have not checked in yet." });
        }

        if (existingRecord.checkOutTime) {
            return res.status(400).json({ success: false, message: "You have already checked out today." });
        }

        // Fetch organization settings to get expected check-out time
        const organization = await Organization.findById(organizationId).select('checkInTime checkOutTime halfDayCheckOutTime');

        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const checkOutTime = new Date();

        // Determine which checkout time to use based on isHalfDay flag
        let expectedTime;
        let checkoutType;

        if (isHalfDay) {
            // Half-day checkout validation
            expectedTime = organization.halfDayCheckOutTime;
            checkoutType = 'half-day';

            if (!expectedTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Half-day checkout time is not configured for your organization.'
                });
            }
        } else {
            // Full-day checkout validation
            expectedTime = organization.checkOutTime;
            checkoutType = 'full-day';

            if (!expectedTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Checkout time is not configured for your organization.'
                });
            }
        }

        // Validate checkout time - only allow 30 minutes before scheduled checkout
        const { hours, minutes } = parseTimeString(expectedTime);
        const expectedCheckOut = new Date(checkOutTime);
        expectedCheckOut.setHours(hours, minutes, 0, 0);

        // Calculate earliest allowed checkout (30 minutes before scheduled time)
        const earliestAllowedCheckout = new Date(expectedCheckOut);
        earliestAllowedCheckout.setMinutes(earliestAllowedCheckout.getMinutes() - 30);

        if (checkOutTime < earliestAllowedCheckout) {
            const allowedTime = `${String(earliestAllowedCheckout.getHours()).padStart(2, '0')}:${String(earliestAllowedCheckout.getMinutes()).padStart(2, '0')}`;
            return res.status(400).json({
                success: false,
                message: `You can only check out after ${allowedTime}. ${checkoutType === 'half-day' ? 'Half-day' : 'Full-day'} checkout is allowed 30 minutes before the scheduled time (${expectedTime}).`,
                allowedFrom: allowedTime,
                scheduledCheckout: expectedTime,
                checkoutType: checkoutType
            });
        }

        // Update the record with check-out info
        existingRecord.checkOutTime = checkOutTime;
        existingRecord.checkOutLocation = { latitude, longitude };
        existingRecord.checkOutAddress = address;

        // Set status based on checkout type
        if (isHalfDay) {
            existingRecord.status = 'H'; // Half Day
        }
        // If full-day, status remains 'P' (Present)

        await existingRecord.save();

        // Calculate if the employee is leaving early
        const isEarly = isEarlyCheckOut(checkOutTime, expectedTime);

        res.status(200).json({
            success: true,
            data: existingRecord,
            isEarly: isEarly,
            expectedCheckOutTime: expectedTime,
            checkoutType: checkoutType
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};


// @desc    Get the logged-in user's attendance status for today
// @route   GET /api/v1/attendance/status/today
// @access  Private (Salesperson, Manager)
exports.getMyStatusToday = async (req, res, next) => {
// ... (This function remains unchanged, it works as-is)
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { _id: userId, organizationId } = req.user;
        const today = getStartOfToday();

        const record = await Attendance.findOne({
            employee: userId,
            date: today,
            organizationId: organizationId,
        });

        if (!record) {
            return res.status(200).json({ success: true, data: null, message: 'Not marked' });
        }

        res.status(200).json({ success: true, data: record });
    } catch (error) {
        next(error);
    }
};


// --- 2. FOR THE WEB (Admin / Manager) ---

// @desc    Get the monthly attendance report
// @route   GET /api/v1/attendance/report
// @access  Private (Admin, Manager)
exports.getAttendanceReport = async (req, res, next) => {
// ... (This function remains unchanged, it works as-is)
    const reportQuerySchema = z.object({
        month: z.coerce.number().int().min(1).max(12),
        year: z.coerce.number().int().min(2020).max(2100),
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { month, year } = reportQuerySchema.parse(req.query);

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        endDate.setHours(23, 59, 59, 999);

        // Fetch organization to get weekly off day
        const organization = await Organization.findById(organizationId).select('weeklyOffDay');
        const weeklyOffDay = organization?.weeklyOffDay || 'Saturday';

        // Map day names to JavaScript day numbers (0 = Sunday, 6 = Saturday)
        const dayNameToNumber = {
            'Sunday': 0,
            'Monday': 1,
            'Tuesday': 2,
            'Wednesday': 3,
            'Thursday': 4,
            'Friday': 5,
            'Saturday': 6
        };
        const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];

        const employees = await User.find({
            organizationId: organizationId,
            role: { $in: ['salesperson', 'manager'] }
        }).select('name email role').lean();

        if (employees.length === 0) {
            return res.status(200).json({ success: true, data: { report: [], summary: [] } });
        }

        const records = await Attendance.find({
            organizationId: organizationId,
            date: { $gte: startDate, $lte: endDate }
        }).lean();

        const attendanceMap = new Map();
        for (const record of records) {
            const dateString = record.date.toISOString().split('T')[0];
            const key = `${record.employee.toString()}-${dateString}`;
            attendanceMap.set(key, record.status);
        }

        const report = [];
        const summary = {};

        for (const employee of employees) {
            const empId = employee._id.toString();
            summary[empId] = { workingDays: 0, present: 0, absent: 0, leave: 0, halfDay: 0, weeklyOff: 0 };
            const dailyRecords = {};

            for (let day = 1; day <= endDate.getDate(); day++) {
                const date = new Date(Date.UTC(year, month - 1, day));
                const dateString = date.toISOString().split('T')[0];
                const key = `${empId}-${dateString}`;

                // Check if attendance record exists
                let status = attendanceMap.get(key);

                // If no record exists, check if it's a weekly off day
                if (!status) {
                    const dayOfWeek = date.getUTCDay();
                    if (dayOfWeek === weeklyOffDayNumber) {
                        status = 'W'; // Weekly Off
                    } else {
                        status = 'A'; // Absent
                    }
                }

                dailyRecords[day] = status;

                if (status === 'P') {
                    summary[empId].workingDays += 1;
                    summary[empId].present += 1;
                } else if (status === 'H') {
                    summary[empId].workingDays += 0.5;
                    summary[empId].halfDay += 1;
                } else if (status === 'A') {
                    summary[empId].absent += 1;
                } else if (status === 'L') {
                    summary[empId].leave += 1;
                } else if (status === 'W') {
                    summary[empId].weeklyOff += 1;
                }
            }

            report.push({
                employee: employee,
                records: dailyRecords,
                totalWorkingDays: summary[empId].workingDays,
            });
        }

        res.status(200).json({ success: true, data: { report, summary } });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Get detailed attendance for a specific employee on a specific date
// @route   GET /api/v1/attendance/employee/:employeeId/date/:date
// @access  Private (Admin, Manager)
exports.getEmployeeAttendanceByDate = async (req, res, next) => {
    const dateParamSchema = z.object({
        employeeId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), {
            message: "Invalid employee ID"
        }),
        date: z.string().refine(val => !isNaN(Date.parse(val)), {
            message: "Invalid date format"
        }),
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { employeeId, date } = dateParamSchema.parse(req.params);

        // Verify employee belongs to the same organization
        const employee = await User.findOne({
            _id: employeeId,
            organizationId: organizationId
        }).select('name email role');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found in your organization."
            });
        }

        const recordDate = getStartOfDay(date);

        // Fetch the attendance record
        const attendanceRecord = await Attendance.findOne({
            employee: employeeId,
            date: recordDate,
            organizationId: organizationId,
        }).populate('markedBy', 'name email role');

        if (!attendanceRecord) {
            // No record found - return default absent status
            return res.status(200).json({
                success: true,
                data: {
                    employee: employee,
                    date: recordDate.toISOString().split('T')[0],
                    status: 'A', // Absent (no record)
                    checkInTime: null,
                    checkOutTime: null,
                    checkInLocation: null,
                    checkOutLocation: null,
                    checkInAddress: null,
                    checkOutAddress: null,
                    notes: null,
                    markedBy: null,
                    orgSettings: null
                }
            });
        }

        // Return full attendance details
        res.status(200).json({
            success: true,
            data: {
                employee: employee,
                date: attendanceRecord.date.toISOString().split('T')[0],
                status: attendanceRecord.status,
                checkInTime: attendanceRecord.checkInTime,
                checkOutTime: attendanceRecord.checkOutTime,
                checkInLocation: attendanceRecord.checkInLocation,
                checkOutLocation: attendanceRecord.checkOutLocation,
                checkInAddress: attendanceRecord.checkInAddress,
                checkOutAddress: attendanceRecord.checkOutAddress,
                notes: attendanceRecord.notes,
                markedBy: attendanceRecord.markedBy,
                orgSettings: {
                    checkInTime: attendanceRecord.orgCheckInTime,
                    checkOutTime: attendanceRecord.orgCheckOutTime,
                    halfDayCheckOutTime: attendanceRecord.orgHalfDayCheckOutTime,
                    weeklyOffDay: attendanceRecord.orgWeeklyOffDay
                },
                createdAt: attendanceRecord.createdAt,
                updatedAt: attendanceRecord.updatedAt
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: error.flatten().fieldErrors
            });
        }
        next(error);
    }
};

// @desc    Admin manually marks attendance
// @route   PUT /api/v1/attendance/admin/mark
// @access  Private (Admin, Manager)
exports.adminMarkAttendance = async (req, res, next) => {
// ... (This function is updated to clear check-in/out times)
    const adminMarkSchema = z.object({
        employeeId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val)),
        date: z.string().refine(val => !isNaN(Date.parse(val))),
        status: z.enum(['P', 'A', 'W', 'L', 'H']),
        notes: z.string().optional(),
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: adminUserId, role: adminRole } = req.user;

        const { employeeId, date, status, notes } = adminMarkSchema.parse(req.body);
        
        const employee = await User.findOne({ _id: employeeId, organizationId: organizationId }).select('role');
        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found in your organization." });
        }
        const employeeRole = employee.role;

        if (adminRole === 'manager' && employeeRole === 'manager') {
            return res.status(403).json({ 
                success: false, 
                message: "Managers are not authorized to modify the attendance of other managers."
            });
        }
        
        const recordDate = getStartOfDay(date);

        // Fetch organization settings
        const organization = await Organization.findById(organizationId).select('checkInTime checkOutTime halfDayCheckOutTime weeklyOffDay');

        if (!organization) {
            return res.status(404).json({ success: false, message: "Organization not found." });
        }

        // Validate: Prevent marking non-weekly-off status on weekly off days
        const weeklyOffDay = organization.weeklyOffDay || 'Saturday';
        const dayNameToNumber = {
            'Sunday': 0,
            'Monday': 1,
            'Tuesday': 2,
            'Wednesday': 3,
            'Thursday': 4,
            'Friday': 5,
            'Saturday': 6
        };
        const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];
        const recordDayOfWeek = recordDate.getUTCDay();

        // If trying to mark a status other than 'W' on a weekly off day, reject it
        if (recordDayOfWeek === weeklyOffDayNumber && status !== 'W') {
            return res.status(400).json({
                success: false,
                message: `${weeklyOffDay} is the organization's weekly off day. Cannot mark attendance as '${status}' on this day.`,
                weeklyOffDay: weeklyOffDay,
                date: recordDate.toISOString().split('T')[0]
            });
        }

        // When an admin marks status (e.g., 'Leave' or 'Weekly Off'),
        // we should clear the check-in/out times as they are no longer relevant.
        const update = {
            $set: {
                status: status,
                markedBy: adminUserId,
                // Store organization settings
                orgCheckInTime: organization.checkInTime,
                orgCheckOutTime: organization.checkOutTime,
                orgHalfDayCheckOutTime: organization.halfDayCheckOutTime,
                orgWeeklyOffDay: organization.weeklyOffDay,
                // Clear check-in/out data
                checkInTime: null,
                checkOutTime: null,
                checkInLocation: null,
                checkOutLocation: null,
                checkInAddress: null,
                checkOutAddress: null,
            }
        };

        // Add notes if provided
        if (notes) {
            update.$set.notes = notes;
        }

        const updatedRecord = await Attendance.findOneAndUpdate(
            {
                employee: employeeId,
                date: recordDate,
                organizationId: organizationId,
            },
            update,
            { new: true, upsert: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: updatedRecord });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// --- NEW FUNCTION for "Automatic Absent" ---

// @desc    Mark all un-marked employees as 'Absent' for today
// @route   POST /api/v1/attendance/admin/mark-absentees
// @access  Private (Admin)
exports.adminMarkAbsentees = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: adminUserId } = req.user;
        const today = getStartOfToday();

        // 1. Find all employees (salesperson, manager)
        const allEmployees = await User.find({
            organizationId: organizationId,
            role: { $in: ['salesperson', 'manager'] }
        }).select('_id').lean();

        if (allEmployees.length === 0) {
            return res.status(200).json({ success: true, message: "No employees found to mark." });
        }
        const allEmployeeIds = allEmployees.map(e => e._id);

        // 2. Find all attendance records for today
        const presentRecords = await Attendance.find({
            organizationId: organizationId,
            date: today
        }).select('employee').lean();
        
        // 3. Find who is missing
        const presentEmployeeIds = new Set(presentRecords.map(r => r.employee.toString()));
        
        const absentEmployeeIds = allEmployeeIds.filter(id => !presentEmployeeIds.has(id.toString()));

        if (absentEmployeeIds.length === 0) {
            return res.status(200).json({ success: true, message: "All employees have attendance marked." });
        }

        // 4. Create "Absent" records for all missing employees
        const newAbsentRecords = absentEmployeeIds.map(employeeId => ({
            employee: employeeId,
            date: today,
            status: 'A', // Marked as Absent
            markedBy: adminUserId,
            organizationId: organizationId
        }));
        
        // Use insertMany for bulk creation
        await Attendance.insertMany(newAbsentRecords, { ordered: false }); // 'ordered: false' continues even if one fails

        res.status(201).json({ 
            success: true, 
            message: `Successfully marked ${newAbsentRecords.length} employees as absent.` 
        });

    } catch (error) {
        // Handle bulk write errors (e.g., if a record was created in a race condition)
        if (error.code === 11000) {
             return res.status(400).json({ success: false, message: 'Some attendance records may have already been marked.' });
        }
        next(error);
    }
};

// @desc    Mark all employees as on holiday for a specific date (bulk holiday marking)
// @route   POST /api/v1/attendance/admin/mark-holiday
// @access  Private (Admin only)
exports.adminMarkHoliday = async (req, res, next) => {
    const holidaySchema = z.object({
        date: z.string().refine(val => !isNaN(Date.parse(val)), {
            message: "Invalid date format"
        }),
        occasionName: z.string().min(1, "Occasion name is required").max(100),
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: adminUserId } = req.user;

        // Validate request body
        const { date, occasionName } = holidaySchema.parse(req.body);
        const holidayDate = getStartOfDay(date);

        // Fetch organization settings
        const organization = await Organization.findById(organizationId).select('checkInTime checkOutTime halfDayCheckOutTime weeklyOffDay');

        if (!organization) {
            return res.status(404).json({ success: false, message: "Organization not found." });
        }

        // Find all active employees in the organization
        const allEmployees = await User.find({
            organizationId: organizationId,
            role: { $in: ['salesperson', 'manager', 'developer', 'user', 'admin'] },
            isActive: true
        }).select('_id name').lean();

        if (allEmployees.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No employees found to mark holiday."
            });
        }

        // Check if any attendance records already exist for this date
        const existingRecords = await Attendance.find({
            organizationId: organizationId,
            date: holidayDate
        }).select('employee').lean();

        const existingEmployeeIds = new Set(existingRecords.map(r => r.employee.toString()));

        // Prepare bulk operations
        const bulkOps = allEmployees.map(employee => {
            const empId = employee._id.toString();

            return {
                updateOne: {
                    filter: {
                        employee: employee._id,
                        date: holidayDate,
                        organizationId: organizationId
                    },
                    update: {
                        $set: {
                            status: 'L', // Leave (Paid Holiday)
                            notes: `Holiday: ${occasionName}`,
                            markedBy: adminUserId,
                            // Store organization settings
                            orgCheckInTime: organization.checkInTime,
                            orgCheckOutTime: organization.checkOutTime,
                            orgHalfDayCheckOutTime: organization.halfDayCheckOutTime,
                            orgWeeklyOffDay: organization.weeklyOffDay,
                            // Clear check-in/out data
                            checkInTime: null,
                            checkOutTime: null,
                            checkInLocation: null,
                            checkOutLocation: null,
                            checkInAddress: null,
                            checkOutAddress: null,
                        }
                    },
                    upsert: true
                }
            };
        });

        // Execute bulk write operation
        const result = await Attendance.bulkWrite(bulkOps);

        res.status(200).json({
            success: true,
            message: `Holiday "${occasionName}" marked for all employees on ${holidayDate.toISOString().split('T')[0]}`,
            data: {
                occasionName,
                date: holidayDate,
                totalEmployees: allEmployees.length,
                recordsUpdated: result.modifiedCount,
                recordsCreated: result.upsertedCount
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: error.flatten().fieldErrors
            });
        }
        next(error);
    }
};