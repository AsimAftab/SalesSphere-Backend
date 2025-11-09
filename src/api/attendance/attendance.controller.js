const Attendance = require('./attendance.model');
const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');
const { z } = require('zod');
const mongoose = require('mongoose');

// Helper to get the start of the current day, ignoring time
const getStartOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

// Helper to get the start of a given day
const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
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
        notes: z.string().optional(),
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { _id: userId, organizationId } = req.user;

        const { latitude, longitude, notes } = checkInSchema.parse(req.body);
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
        const organization = await Organization.findById(organizationId).select('checkInTime checkOutTime');

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
                    markedBy: userId, // Marked by self
                    notes: notes,
                    // Clear any potential check-out time (if admin was editing)
                    checkOutTime: null,
                    checkOutLocation: null,
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
    });

    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { _id: userId, organizationId } = req.user;
        const today = getStartOfToday();

        const { latitude, longitude } = checkOutSchema.parse(req.body);

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
        const organization = await Organization.findById(organizationId).select('checkInTime checkOutTime');

        const checkOutTime = new Date();

        // Update the record with check-out info
        existingRecord.checkOutTime = checkOutTime;
        existingRecord.checkOutLocation = { latitude, longitude };

        await existingRecord.save();

        // Calculate if the employee is leaving early
        const isEarly = organization ? isEarlyCheckOut(checkOutTime, organization.checkOutTime) : false;

        res.status(200).json({
            success: true,
            data: existingRecord,
            isEarly: isEarly,
            expectedCheckOutTime: organization?.checkOutTime || null
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
                const date = new Date(year, month - 1, day);
                const dateString = date.toISOString().split('T')[0];
                const key = `${empId}-${dateString}`;
                
                const status = attendanceMap.get(key) || 'A'; 
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
        
        // When an admin marks status (e.g., 'Leave' or 'Weekly Off'),
        // we should clear the check-in/out times as they are no longer relevant.
        const update = {
            $set: {
                status: status,
                notes: notes,
                markedBy: adminUserId,
                checkInTime: null,
                checkOutTime: null,
                checkInLocation: null,
                checkOutLocation: null,
            }
        };

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
            markedBy: adminUserId, // Or a system ID
            notes: "Automatically marked absent at end of day.",
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