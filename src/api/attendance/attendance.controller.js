// controllers/attendance.controller.js
const Attendance = require('./attendance.model');
const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');
const { z } = require('zod');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

/* ======================
   Helpers & Timezone utils
   ====================== */

// Convert string or ObjectId to mongoose.Types.ObjectId (safe)
function toObjectIdIfNeeded(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
}

// Returns a JS Date (UTC instant) representing the start of `dateOrIso` in `timezone`
// dateOrIso can be a Date object or an ISO date string. Defaults to now if not provided.
const getStartOfDayInOrgTZ = (dateOrIso = new Date(), timezone = 'Asia/Kolkata') => {
  const dt = (dateOrIso instanceof Date)
    ? DateTime.fromJSDate(dateOrIso, { zone: timezone })
    : DateTime.fromISO(String(dateOrIso), { zone: timezone });
  return dt.startOf('day').toUTC().toJSDate();
};

// Returns start of today in organization's timezone as JS Date (UTC instant)
const getStartOfTodayInOrgTZ = (timezone = 'Asia/Kolkata') => {
  return DateTime.now().setZone(timezone).startOf('day').toUTC().toJSDate();
};

// Returns start and end of a month in the org timezone as JS Dates (UTC instants)
const getMonthRangeInOrgTZ = (year, month, timezone = 'Asia/Kolkata') => {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone }).startOf('day').toUTC().toJSDate();
  const end = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone }).endOf('month').endOf('day').toUTC().toJSDate();
  return { start, end };
};

// Parse time string "HH:MM" and validate
const parseTimeString = (timeStr) => {
  if (typeof timeStr !== 'string') throw new Error('Invalid time format');
  const match = timeStr.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new Error('Invalid time format. Expected HH:MM (24-hour).');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return { hours, minutes };
};

// Check lateness and early checkout using organization TZ
const isLateCheckIn = (checkInTime, organizationCheckInTime, timezone = 'Asia/Kolkata') => {
  if (!organizationCheckInTime || !checkInTime) return false;
  const checkInDT = DateTime.fromJSDate(new Date(checkInTime), { zone: timezone });
  const [h, m] = organizationCheckInTime.split(':').map(Number);
  const expected = checkInDT.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  return checkInDT > expected;
};

const isEarlyCheckOut = (checkOutTime, organizationCheckOutTime, timezone = 'Asia/Kolkata') => {
  if (!organizationCheckOutTime || !checkOutTime) return false;
  const checkOutDT = DateTime.fromJSDate(new Date(checkOutTime), { zone: timezone });
  const [h, m] = organizationCheckOutTime.split(':').map(Number);
  const expected = checkOutDT.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  return checkOutDT < expected;
};

/* ======================
   1. FOR THE APP (Salesperson / Manager)
   ====================== */

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
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { latitude, longitude, address } = checkInSchema.parse(req.body);

    // Fetch organization settings to get timezone and check-in time
    const organization = await Organization.findById(orgObjectId).select('checkInTime checkOutTime halfDayCheckOutTime weeklyOffDay timezone');

    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    // Use organization's timezone to calculate "today"
    const timezone = organization.timezone || 'Asia/Kolkata';
    const today = getStartOfTodayInOrgTZ(timezone);

    // Check if a record exists and if user is already checked in
    const existingRecord = await Attendance.findOne({
      employee: userId,
      date: today,
      organizationId: orgObjectId,
    });

    if (existingRecord && existingRecord.checkInTime) {
      return res.status(400).json({ success: false, message: 'You have already checked in today.' });
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
    // Luxon weekday: 1 = Monday ... 7 = Sunday; convert to 0..6 where 0=Sunday
    const todayDayOfWeek = DateTime.fromJSDate(today).setZone(timezone).weekday % 7;
    if (todayDayOfWeek === weeklyOffDayNumber) {
      return res.status(400).json({
        success: false,
        message: `Today is ${weeklyOffDay}, the organization's weekly off day. You cannot check in on this day.`,
        weeklyOffDay: weeklyOffDay
      });
    }

    const checkInTime = new Date();

    // Upsert attendance (create if not exists)
    const updatedRecord = await Attendance.findOneAndUpdate(
      {
        employee: userId,
        date: today,
        organizationId: orgObjectId,
      },
      {
        $set: {
          status: 'P',
          checkInTime: checkInTime,
          checkInLocation: { latitude, longitude },
          checkInAddress: address,
          markedBy: userId,
          // store snapshot of org settings
          orgCheckInTime: organization.checkInTime,
          orgCheckOutTime: organization.checkOutTime,
          orgHalfDayCheckOutTime: organization.halfDayCheckOutTime,
          orgWeeklyOffDay: organization.weeklyOffDay,
          // clear checkout fields (in case)
          checkOutTime: null,
          checkOutLocation: null,
          checkOutAddress: null,
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    // Calculate if the employee is late (use org timezone)
    const isLate = isLateCheckIn(checkInTime, organization.checkInTime, timezone);

    res.status(201).json({
      success: true,
      data: updatedRecord,
      isLate,
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
    isHalfDay: z.boolean().optional().default(false),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { _id: userId, organizationId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { latitude, longitude, address, isHalfDay } = checkOutSchema.parse(req.body);

    // Fetch organization settings (includes halfDayCheckOutTime)
    const organization = await Organization.findById(orgObjectId).select('checkInTime checkOutTime halfDayCheckOutTime timezone');

    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    // Org timezone and today's date (UTC instant for that local midnight)
    const timezone = organization.timezone || 'Asia/Kolkata';
    const today = getStartOfTodayInOrgTZ(timezone);

    // Find today's attendance record
    const existingRecord = await Attendance.findOne({
      employee: userId,
      date: today,
      organizationId: orgObjectId,
    });

    if (!existingRecord || !existingRecord.checkInTime) {
      return res.status(400).json({ success: false, message: "You have not checked in yet." });
    }
    if (existingRecord.checkOutTime) {
      return res.status(400).json({ success: false, message: "You have already checked out today." });
    }

    const checkOutTime = new Date();

    // Choose expected time based on requested type
    let expectedTime;
    let checkoutType;
    if (isHalfDay) {
      expectedTime = organization.halfDayCheckOutTime;
      checkoutType = 'half-day';
      if (!expectedTime) {
        return res.status(400).json({ success: false, message: 'Half-day checkout time is not configured for your organization.' });
      }
    } else {
      expectedTime = organization.checkOutTime;
      checkoutType = 'full-day';
      if (!expectedTime) {
        return res.status(400).json({ success: false, message: 'Checkout time is not configured for your organization.' });
      }
    }

    // Validate allowed time windows (30 minutes before scheduled time)
    try {
      const { hours: expH, minutes: expM } = parseTimeString(expectedTime);
      const checkOutDT = DateTime.fromJSDate(checkOutTime).setZone(timezone);
      const expectedCheckOutDT = checkOutDT.set({ hour: expH, minute: expM, second: 0, millisecond: 0 });
      const earliestAllowedCheckout = expectedCheckOutDT.minus({ minutes: 30 });

      if (checkOutDT < earliestAllowedCheckout) {
        // Too early for requested checkout type.
        // If user requested half-day explicitly -> return error.
        if (isHalfDay) {
          const allowedTimeStr = earliestAllowedCheckout.toFormat('HH:mm');
          return res.status(400).json({
            success: false,
            message: `You can only check out after ${allowedTimeStr}. Half-day checkout is allowed 30 minutes before the scheduled half-day time (${expectedTime}).`,
            allowedFrom: allowedTimeStr,
            scheduledCheckout: expectedTime,
            checkoutType
          });
        }

        // User attempted full-day but is too early. Suggest half-day fallback if configured.
        const halfDayTime = organization.halfDayCheckOutTime;
        const fullAllowedStr = earliestAllowedCheckout.toFormat('HH:mm');
        if (halfDayTime) {
          try {
            const { hours: halfH, minutes: halfM } = parseTimeString(halfDayTime);
            const halfDayDT = checkOutDT.set({ hour: halfH, minute: halfM, second: 0, millisecond: 0 });
            const earliestHalfAllowed = halfDayDT.minus({ minutes: 30 });
            const halfAllowedStr = earliestHalfAllowed.toFormat('HH:mm');

            if (checkOutDT >= earliestHalfAllowed) {
              return res.status(400).json({
                success: false,
                message: `Full-day checkout is not allowed yet (allowed from ${fullAllowedStr}). Half-day checkout is available from ${halfAllowedStr}. Would you like to checkout as half-day now?`,
                allowedFrom: fullAllowedStr,
                scheduledCheckout: expectedTime,
                checkoutType: 'full-day',
                canUseHalfDayFallback: true,
                halfDayAllowedFrom: halfAllowedStr,
                halfDayScheduledTime: halfDayTime
              });
            } else {
              return res.status(400).json({
                success: false,
                message: `You can only check out after ${fullAllowedStr}. Half-day checkout becomes available at ${halfAllowedStr}.`,
                allowedFrom: fullAllowedStr,
                scheduledCheckout: expectedTime,
                checkoutType: 'full-day',
                canUseHalfDayFallback: true,
                halfDayAllowedFrom: halfAllowedStr,
                halfDayScheduledTime: halfDayTime
              });
            }
          } catch (err) {
            const allowedTimeStr = earliestAllowedCheckout.toFormat('HH:mm');
            return res.status(400).json({
              success: false,
              message: `You can only check out after ${allowedTimeStr}. Full-day checkout is allowed 30 minutes before the scheduled time (${expectedTime}).`,
              allowedFrom: allowedTimeStr,
              scheduledCheckout: expectedTime,
              checkoutType: 'full-day'
            });
          }
        } else {
          const allowedTimeStr = earliestAllowedCheckout.toFormat('HH:mm');
          return res.status(400).json({
            success: false,
            message: `You can only check out after ${allowedTimeStr}. Full-day checkout is allowed 30 minutes before the scheduled time (${expectedTime}).`,
            allowedFrom: allowedTimeStr,
            scheduledCheckout: expectedTime,
            checkoutType: 'full-day'
          });
        }
      }
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid scheduled checkout time configured for organization.' });
    }

    // Passed allowed-time checks (or user explicitly requested half-day)
    // Use an atomic update to avoid race conditions where two requests attempt checkout simultaneously.
    const updateFields = {
      checkOutTime: checkOutTime,
      checkOutLocation: { latitude, longitude },
      checkOutAddress: address
    };
    if (isHalfDay) updateFields.status = 'H';

    const updated = await Attendance.findOneAndUpdate(
      { _id: existingRecord._id, checkOutTime: null }, // only update if checkOutTime is still null
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      // someone else already checked out concurrently
      return res.status(409).json({ success: false, message: 'Checkout already processed by another request.' });
    }

    // Determine if leaving early relative to expectedTime (the requested expectedTime)
    const isEarly = isEarlyCheckOut(checkOutTime, expectedTime, timezone);

    res.status(200).json({
      success: true,
      data: updated,
      isEarly,
      expectedCheckOutTime: expectedTime,
      checkoutType,
      canUseHalfDayFallback: false
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
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { _id: userId, organizationId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    // Fetch organization timezone
    const organization = await Organization.findById(orgObjectId).select('timezone');
    const timezone = organization?.timezone || 'Asia/Kolkata';
    const today = getStartOfTodayInOrgTZ(timezone);

    const record = await Attendance.findOne({
      employee: userId,
      date: today,
      organizationId: orgObjectId,
    });

    if (!record) return res.status(200).json({ success: true, data: null, message: 'Not marked' });

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
};

// @desc    Get the logged-in user's monthly attendance report
// @route   GET /api/v1/attendance/my-monthly-report
// @access  Private (Salesperson, Manager)
exports.getMyMonthlyReport = async (req, res, next) => {
  const reportQuerySchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2100),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { _id: userId, organizationId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { month, year } = reportQuerySchema.parse(req.query);

    // Fetch organization to get weekly off and timezone
    const organization = await Organization.findById(orgObjectId).select('weeklyOffDay timezone');
    const weeklyOffDay = organization?.weeklyOffDay || 'Saturday';
    const timezone = organization?.timezone || 'Asia/Kolkata';

    // Compute month start/end in org timezone (as UTC instants)
    const { start: startDate, end: endDate } = getMonthRangeInOrgTZ(year, month, timezone);

    // Map day names to numbers (0=Sunday .. 6=Saturday)
    const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];

    // Fetch attendance records for user in the month
    const records = await Attendance.find({
      employee: userId,
      organizationId: orgObjectId,
      date: { $gte: startDate, $lte: endDate }
    }).select('date status checkInTime checkOutTime notes').lean();

    // Build map and summary
    const attendanceByDate = {};
    const summary = {
      totalDays: DateTime.fromJSDate(endDate).setZone(timezone).day,
      present: 0,
      absent: 0,
      leave: 0,
      halfDay: 0,
      weeklyOff: 0,
      notMarked: 0,
      workingDays: 0
    };

    for (const record of records) {
      // Convert record.date (UTC) into org-local day-of-month
      const localDate = DateTime.fromJSDate(record.date, { zone: timezone }).toISODate(); // YYYY-MM-DD
      const day = Number(localDate.split('-')[2]);
      attendanceByDate[day] = {
        status: record.status,
        checkInTime: record.checkInTime,
        checkOutTime: record.checkOutTime,
        notes: record.notes
      };
      if (record.status === 'P') { summary.present++; summary.workingDays += 1; }
      else if (record.status === 'H') { summary.halfDay++; summary.workingDays += 0.5; }
      else if (record.status === 'A') { summary.absent++; }
      else if (record.status === 'L') { summary.leave++; }
      else if (record.status === 'W') { summary.weeklyOff++; }
    }

    // Fill in weekly offs and not marked
    const daysInMonth = DateTime.fromJSDate(endDate, { zone: timezone }).day;
    for (let day = 1; day <= daysInMonth; day++) {
      if (!attendanceByDate[day]) {
        const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });
        const dayOfWeek = dt.weekday % 7; // convert 1..7 -> 1..6,0
        if (dayOfWeek === weeklyOffDayNumber) {
          attendanceByDate[day] = { status: 'W', checkInTime: null, checkOutTime: null, notes: null };
          summary.weeklyOff++;
        } else {
          summary.notMarked++;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        month, year, weeklyOffDay, attendance: attendanceByDate, summary
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
    }
    next(error);
  }
};

/* ======================
   2. FOR THE WEB (Admin / Manager)
   ====================== */

// @desc    Get the monthly attendance report
// @route   GET /api/v1/attendance/report
// @access  Private (Admin, Manager)
exports.getAttendanceReport = async (req, res, next) => {
  const reportQuerySchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2100),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { organizationId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { month, year } = reportQuerySchema.parse(req.query);

    // Fetch organization to get weekly off day and timezone
    const organization = await Organization.findById(orgObjectId).select('weeklyOffDay timezone');
    const weeklyOffDay = organization?.weeklyOffDay || 'Saturday';
    const timezone = organization?.timezone || 'Asia/Kolkata';

    // Compute month range in org timezone
    const { start: startDate, end: endDate } = getMonthRangeInOrgTZ(year, month, timezone);

    // Map day names to JS numbers
    const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];

    const employees = await User.find({
      organizationId: orgObjectId,
      role: { $in: ['salesperson', 'manager'] }
    }).select('name email role').lean();

    if (employees.length === 0) {
      return res.status(200).json({ success: true, data: { report: [], summary: [] } });
    }

    const records = await Attendance.find({
      organizationId: orgObjectId,
      date: { $gte: startDate, $lte: endDate }
    }).lean();

    // Build attendanceMap keyed by employeeId-dateISO
    const attendanceMap = new Map();
    for (const record of records) {
      const dateIso = DateTime.fromJSDate(record.date, { zone: timezone }).toISODate(); // YYYY-MM-DD
      const key = `${record.employee.toString()}-${dateIso}`;
      attendanceMap.set(key, record);
    }

    const report = [];
    const summary = {};

    const daysInMonth = DateTime.fromJSDate(endDate, { zone: timezone }).day;

    for (const employee of employees) {
      const empId = employee._id.toString();
      summary[empId] = { workingDays: 0, present: 0, absent: 0, leave: 0, halfDay: 0, weeklyOff: 0 };
      const dailyRecords = {};

      for (let day = 1; day <= daysInMonth; day++) {
        const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });
        const dateIso = dt.toISODate(); // YYYY-MM-DD
        const key = `${empId}-${dateIso}`;

        const record = attendanceMap.get(key);
        let status;

        if (record) {
          status = record.status;
        } else {
          const dayOfWeek = dt.weekday % 7;
          if (dayOfWeek === weeklyOffDayNumber) status = 'W';
          else status = 'NA'; // absent/not marked
        }

        dailyRecords[day] = status;

        if (status === 'P') { summary[empId].workingDays += 1; summary[empId].present += 1; }
        else if (status === 'H') { summary[empId].workingDays += 0.5; summary[empId].halfDay += 1; }
        else if (status === 'A' || status === 'NA') { summary[empId].absent += 1; }
        else if (status === 'L') { summary[empId].leave += 1; }
        else if (status === 'W') { summary[empId].weeklyOff += 1; }
      }

      report.push({ employee, records: dailyRecords, totalWorkingDays: summary[empId].workingDays });
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
    employeeId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), { message: "Invalid employee ID" }),
    date: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { organizationId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { employeeId, date } = dateParamSchema.parse(req.params);

    // Fetch organization timezone
    const organization = await Organization.findById(orgObjectId).select('timezone');
    const timezone = organization?.timezone || 'Asia/Kolkata';

    // Verify employee belongs to the same org
    const employee = await User.findOne({ _id: employeeId, organizationId: orgObjectId }).select('name email role');
    if (!employee) return res.status(404).json({ success: false, message: "Employee not found in your organization." });

    const recordDate = getStartOfDayInOrgTZ(date, timezone);

    const attendanceRecord = await Attendance.findOne({
      employee: employeeId,
      date: recordDate,
      organizationId: orgObjectId,
    }).populate('markedBy', 'name email role');

    if (!attendanceRecord) {
      return res.status(200).json({
        success: true,
        data: {
          employee,
          date: recordDate.toISOString().split('T')[0],
          status: 'A',
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

    res.status(200).json({
      success: true,
      data: {
        employee,
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
      return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
    }
    next(error);
  }
};

// @desc    Admin manually marks attendance
// @route   PUT /api/v1/attendance/admin/mark
// @access  Private (Admin, Manager)
exports.adminMarkAttendance = async (req, res, next) => {
  const adminMarkSchema = z.object({
    employeeId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val)),
    date: z.string().refine(val => !isNaN(Date.parse(val))),
    status: z.enum(['P', 'A', 'W', 'L', 'H']),
    notes: z.string().optional(),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { organizationId, _id: adminUserId, role: adminRole } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { employeeId, date, status, notes } = adminMarkSchema.parse(req.body);

    const employee = await User.findOne({ _id: employeeId, organizationId: orgObjectId }).select('role');
    if (!employee) return res.status(404).json({ success: false, message: "Employee not found in your organization." });

    if (adminRole === 'manager' && employee.role === 'manager') {
      return res.status(403).json({ success: false, message: "Managers are not authorized to modify the attendance of other managers." });
    }

    const organization = await Organization.findById(orgObjectId).select('checkInTime checkOutTime halfDayCheckOutTime weeklyOffDay timezone');
    if (!organization) return res.status(404).json({ success: false, message: "Organization not found." });

    const timezone = organization.timezone || 'Asia/Kolkata';
    const recordDate = getStartOfDayInOrgTZ(date, timezone);

    // Validate weekly off rule
    const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weeklyOffDay = organization.weeklyOffDay || 'Saturday';
    const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];
    const recordDayOfWeek = DateTime.fromJSDate(recordDate).setZone(timezone).weekday % 7;
    if (recordDayOfWeek === weeklyOffDayNumber && status !== 'W') {
      return res.status(400).json({
        success: false,
        message: `${weeklyOffDay} is the organization's weekly off day. Cannot mark attendance as '${status}' on this day.`,
        weeklyOffDay,
        date: recordDate.toISOString().split('T')[0]
      });
    }

    const update = {
      $set: {
        status,
        markedBy: adminUserId,
        orgCheckInTime: organization.checkInTime,
        orgCheckOutTime: organization.checkOutTime,
        orgHalfDayCheckOutTime: organization.halfDayCheckOutTime,
        orgWeeklyOffDay: organization.weeklyOffDay,
        // Clear check-in/out times since admin marking overrides
        checkInTime: null,
        checkOutTime: null,
        checkInLocation: null,
        checkOutLocation: null,
        checkInAddress: null,
        checkOutAddress: null,
      }
    };
    if (notes) update.$set.notes = notes;

    const updatedRecord = await Attendance.findOneAndUpdate(
      { employee: employeeId, date: recordDate, organizationId: orgObjectId },
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

// @desc    Mark all un-marked employees as 'Absent' for today (Admin only)
// @route   POST /api/v1/attendance/admin/mark-absentees
// @access  Private (Admin)
exports.adminMarkAbsentees = async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { organizationId, _id: adminUserId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const organization = await Organization.findById(orgObjectId).select('timezone');
    const timezone = organization?.timezone || 'Asia/Kolkata';
    const today = getStartOfTodayInOrgTZ(timezone);

    // 1) All employees in org
    const allEmployees = await User.find({
      organizationId: orgObjectId,
      role: { $in: ['salesperson', 'manager'] }
    }).select('_id').lean();

    if (allEmployees.length === 0) return res.status(200).json({ success: true, message: "No employees found to mark." });

    const allEmployeeIds = allEmployees.map(e => e._id);

    // 2) Existing attendance records for today
    const presentRecords = await Attendance.find({ organizationId: orgObjectId, date: today }).select('employee').lean();
    const presentEmployeeIds = new Set(presentRecords.map(r => r.employee.toString()));

    // 3) Missing employees
    const absentEmployeeIds = allEmployeeIds.filter(id => !presentEmployeeIds.has(id.toString()));
    if (absentEmployeeIds.length === 0) return res.status(200).json({ success: true, message: "All employees have attendance marked." });

    // 4) Bulk insert absent records (ordered:false to continue on duplicates)
    const newAbsentRecords = absentEmployeeIds.map(employeeId => ({
      employee: employeeId,
      date: today,
      status: 'A',
      markedBy: adminUserId,
      organizationId: orgObjectId
    }));

    try {
      await Attendance.insertMany(newAbsentRecords, { ordered: false });
    } catch (err) {
      // handle possible duplicate key errors due to race conditions; still respond success
      if (err.code !== 11000) throw err;
    }

    res.status(201).json({ success: true, message: `Successfully marked ${newAbsentRecords.length} employees as absent.` });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark all employees as on holiday for a specific date (bulk holiday marking)
// @route   POST /api/v1/attendance/admin/mark-holiday
// @access  Private (Admin only)
exports.adminMarkHoliday = async (req, res, next) => {
  const holidaySchema = z.object({
    date: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    occasionName: z.string().min(1, "Occasion name is required").max(100),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { organizationId, _id: adminUserId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { date, occasionName } = holidaySchema.parse(req.body);

    const organization = await Organization.findById(orgObjectId).select('checkInTime checkOutTime halfDayCheckOutTime weeklyOffDay timezone');
    if (!organization) return res.status(404).json({ success: false, message: "Organization not found." });

    const timezone = organization.timezone || 'Asia/Kolkata';
    const holidayDate = getStartOfDayInOrgTZ(date, timezone);

    // Prevent marking holiday on weekly off day
    const weeklyOffDay = organization.weeklyOffDay || 'Saturday';
    const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];
    const holidayDayOfWeek = DateTime.fromJSDate(holidayDate).setZone(timezone).weekday % 7;
    if (holidayDayOfWeek === weeklyOffDayNumber) {
      return res.status(400).json({
        success: false,
        message: `Cannot mark holiday on ${weeklyOffDay}. This is the organization's weekly off day and cannot be modified.`,
        weeklyOffDay,
        date: holidayDate.toISOString().split('T')[0]
      });
    }

    // Find all active employees
    const allEmployees = await User.find({
      organizationId: orgObjectId,
      role: { $in: ['salesperson', 'manager', 'developer', 'user', 'admin'] },
      isActive: true
    }).select('_id name').lean();

    if (allEmployees.length === 0) {
      return res.status(200).json({ success: true, message: "No employees found to mark holiday." });
    }

    // Bulk upsert: set status 'L' (Leave) and clear check-in/out fields
    const bulkOps = allEmployees.map(employee => ({
      updateOne: {
        filter: { employee: employee._id, date: holidayDate, organizationId: orgObjectId },
        update: {
          $set: {
            status: 'L',
            notes: `Holiday: ${occasionName}`,
            markedBy: adminUserId,
            orgCheckInTime: organization.checkInTime,
            orgCheckOutTime: organization.checkOutTime,
            orgHalfDayCheckOutTime: organization.halfDayCheckOutTime,
            orgWeeklyOffDay: organization.weeklyOffDay,
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
    }));

    const result = await Attendance.bulkWrite(bulkOps);

    res.status(200).json({
      success: true,
      message: `Holiday "${occasionName}" marked for all employees on ${holidayDate.toISOString().split('T')[0]}`,
      data: {
        occasionName,
        date: holidayDate,
        totalEmployees: allEmployees.length,
        recordsUpdated: result.modifiedCount || 0,
        recordsCreated: result.upsertedCount || 0
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
    }
    next(error);
  }
};
