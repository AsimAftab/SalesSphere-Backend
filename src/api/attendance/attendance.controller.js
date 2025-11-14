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

// Returns a JS Date representing the start of day for storage
// dateOrIso can be a Date object or an ISO date string. Defaults to now if not provided.
// Returns: Date object at UTC midnight with LOCAL date components
const getStartOfDayInOrgTZ = (dateOrIso = new Date(), timezone = 'Asia/Kolkata') => {
  const dt = (dateOrIso instanceof Date)
    ? DateTime.fromJSDate(dateOrIso, { zone: timezone })
    : DateTime.fromISO(String(dateOrIso), { zone: timezone });

  // Extract date components in the org's timezone
  const { year, month, day } = dt.startOf('day');

  // Return as UTC midnight with those date components
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// Parse date string in various formats and return start of day
// Accepts: "2025-11-12", "2025-11-12T10:30:00", ISO strings, etc.
// Returns: Date object representing the local date at UTC midnight (for storage)
// NOTE: We store the LOCAL date as UTC midnight to work with the pre-save hook
const parseDateToOrgTZ = (dateStr, timezone = 'Asia/Kolkata') => {
  if (!dateStr) throw new Error('Date is required');

  const dateString = String(dateStr).trim();

  // CRITICAL FIX: For date-only strings (YYYY-MM-DD), explicitly parse components
  // and create a Date at UTC midnight with those exact date components
  const isoDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const year = parseInt(isoDateMatch[1], 10);
    const month = parseInt(isoDateMatch[2], 10);
    const day = parseInt(isoDateMatch[3], 10);

    // Validate the date is valid in the org's timezone
    const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });

    if (!dt.isValid) {
      throw new Error(`Invalid date: ${dateString}. Please check the year, month, and day values.`);
    }

    // Return a Date object at UTC midnight with the LOCAL date components
    // This prevents the pre-save hook from changing the date
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  // Try ISO date format with time (YYYY-MM-DDTHH:MM:SS)
  let dt = DateTime.fromISO(dateString, { zone: timezone });

  // If that fails, try fromSQL format
  if (!dt.isValid) {
    dt = DateTime.fromSQL(dateString, { zone: timezone });
  }

  // If still invalid, try parsing as JS Date then convert to org timezone
  if (!dt.isValid) {
    const jsDate = new Date(dateString);
    if (isNaN(jsDate.getTime())) {
      throw new Error(`Invalid date format: ${dateString}. Expected formats: YYYY-MM-DD, ISO 8601, or valid date string.`);
    }
    dt = DateTime.fromJSDate(jsDate, { zone: timezone });
  }

  if (!dt.isValid) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  // Extract date components and return as UTC midnight
  const { year, month, day } = dt;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// Validate date string format using Luxon
const isValidDateString = (dateStr) => {
  if (!dateStr) return false;
  const dt = DateTime.fromISO(String(dateStr));
  return dt.isValid || DateTime.fromSQL(String(dateStr)).isValid || !isNaN(Date.parse(String(dateStr)));
};

// Returns start of today in organization's timezone for storage
const getStartOfTodayInOrgTZ = (timezone = 'Asia/Kolkata') => {
  const dt = DateTime.now().setZone(timezone).startOf('day');
  const { year, month, day } = dt;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// Returns start and end of a month in the org timezone for date range queries
const getMonthRangeInOrgTZ = (year, month, timezone = 'Asia/Kolkata') => {
  // Start of month: first day at UTC midnight
  const startDt = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone });
  const start = new Date(Date.UTC(startDt.year, startDt.month - 1, startDt.day, 0, 0, 0, 0));

  // End of month: last day at UTC 23:59:59.999
  const endDt = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone }).endOf('month');
  const end = new Date(Date.UTC(endDt.year, endDt.month - 1, endDt.day, 23, 59, 59, 999));

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
    // Use UTC zone since date is stored as UTC midnight with local date components
    const todayDayOfWeek = DateTime.fromJSDate(today, { zone: 'UTC' }).weekday % 7;
    if (todayDayOfWeek === weeklyOffDayNumber) {
      return res.status(400).json({
        success: false,
        message: `Today is ${weeklyOffDay}, the organization's weekly off day. You cannot check in on this day.`,
        weeklyOffDay: weeklyOffDay
      });
    }

    const checkInTime = new Date();

    // Validate check-in time window (2 hours before to 30 minutes after orgCheckInTime)
    const orgCheckInTime = organization.checkInTime;
    if (orgCheckInTime) {
      try {
        const { hours: checkInH, minutes: checkInM } = parseTimeString(orgCheckInTime);
        const checkInDT = DateTime.fromJSDate(checkInTime).setZone(timezone);
        const scheduledCheckInDT = checkInDT.set({ hour: checkInH, minute: checkInM, second: 0, millisecond: 0 });

        // Earliest allowed: 2 hours before scheduled check-in
        const earliestAllowedCheckIn = scheduledCheckInDT.minus({ hours: 2 });

        // Latest allowed: 30 minutes after scheduled check-in (grace period)
        const latestAllowedCheckIn = scheduledCheckInDT.plus({ minutes: 30 });

        if (checkInDT < earliestAllowedCheckIn) {
          const earliestTimeStr = earliestAllowedCheckIn.toFormat('HH:mm');
          return res.status(400).json({
            success: false,
            message: `Check-in is not allowed yet. You can check in starting from ${earliestTimeStr} (2 hours before scheduled check-in time).`,
            earliestAllowedCheckIn: earliestTimeStr,
            scheduledCheckInTime: orgCheckInTime,
            currentTime: checkInDT.toFormat('HH:mm')
          });
        }

        if (checkInDT > latestAllowedCheckIn) {
          const latestTimeStr = latestAllowedCheckIn.toFormat('HH:mm');
          return res.status(400).json({
            success: false,
            message: `Check-in window has closed. Latest allowed check-in time was ${latestTimeStr} (30 minutes after scheduled check-in time). Please contact your administrator.`,
            latestAllowedCheckIn: latestTimeStr,
            scheduledCheckInTime: orgCheckInTime,
            currentTime: checkInDT.toFormat('HH:mm')
          });
        }
      } catch (err) {
        // If parseTimeString fails, continue without validation (fallback)
        console.error('Invalid check-in time format:', err);
      }
    }

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
      expectedCheckInTime: organization?.checkInTime || null,
      organizationTimezone: timezone // For frontend to convert times to local timezone
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

      // CRITICAL FIX: For half-day checkout, enforce UPPER LIMIT
      // Users should NOT be able to checkout after halfDayCheckOutTime and claim it's a half-day
      if (isHalfDay) {
        // Add grace period of 15 minutes AFTER halfDayCheckOutTime
        const latestAllowedHalfDayCheckout = expectedCheckOutDT.plus({ minutes: 15 });

        if (checkOutDT > latestAllowedHalfDayCheckout) {
          const latestTimeStr = latestAllowedHalfDayCheckout.toFormat('HH:mm');
          const fullDayTime = organization.checkOutTime;

          if (fullDayTime) {
            return res.status(400).json({
              success: false,
              message: `Half-day checkout window has closed (latest allowed: ${latestTimeStr}). You can only checkout as full-day now. Please retry without the 'isHalfDay' flag.`,
              halfDayCheckoutClosedAt: latestTimeStr,
              scheduledHalfDayTime: expectedTime,
              fullDayCheckoutTime: fullDayTime,
              currentTime: checkOutDT.toFormat('HH:mm')
            });
          } else {
            return res.status(400).json({
              success: false,
              message: `Half-day checkout window has closed (latest allowed: ${latestTimeStr}).`,
              halfDayCheckoutClosedAt: latestTimeStr,
              scheduledHalfDayTime: expectedTime,
              currentTime: checkOutDT.toFormat('HH:mm')
            });
          }
        }
      }

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
            // Add grace period of 15 minutes AFTER halfDayCheckOutTime
            const latestHalfAllowed = halfDayDT.plus({ minutes: 15 });
            const halfAllowedStr = earliestHalfAllowed.toFormat('HH:mm');

            // Check if half-day window has passed (including grace period)
            if (checkOutDT > latestHalfAllowed) {
              // Half-day checkout window has closed - cannot use fallback
              return res.status(400).json({
                success: false,
                message: `You can only check out after ${fullAllowedStr}. Full-day checkout is allowed 30 minutes before the scheduled time (${expectedTime}). Half-day checkout window has closed.`,
                allowedFrom: fullAllowedStr,
                scheduledCheckout: expectedTime,
                checkoutType: 'full-day',
                canUseHalfDayFallback: false
              });
            }

            if (checkOutDT >= earliestHalfAllowed) {
              // Within half-day window - offer fallback
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
              // Too early for both - but half-day will be available later
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
              checkoutType: 'full-day',
              canUseHalfDayFallback: false
            });
          }
        } else {
          const allowedTimeStr = earliestAllowedCheckout.toFormat('HH:mm');
          return res.status(400).json({
            success: false,
            message: `You can only check out after ${allowedTimeStr}. Full-day checkout is allowed 30 minutes before the scheduled time (${expectedTime}).`,
            allowedFrom: allowedTimeStr,
            scheduledCheckout: expectedTime,
            checkoutType: 'full-day',
            canUseHalfDayFallback: false
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
      canUseHalfDayFallback: false,
      organizationTimezone: timezone // For frontend to convert times to local timezone
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

    // Fetch organization timezone and time settings
    const organization = await Organization.findById(orgObjectId).select('timezone checkInTime checkOutTime halfDayCheckOutTime');
    const timezone = organization?.timezone || 'Asia/Kolkata';
    const today = getStartOfTodayInOrgTZ(timezone);

    const record = await Attendance.findOne({
      employee: userId,
      date: today,
      organizationId: orgObjectId,
    });

    if (!record) return res.status(200).json({
      success: true,
      data: null,
      message: 'Not marked',
      organizationTimezone: timezone,
      organizationCheckInTime: organization?.checkInTime || null,
      organizationCheckOutTime: organization?.checkOutTime || null,
      organizationHalfDayCheckOutTime: organization?.halfDayCheckOutTime || null
    });

    res.status(200).json({
      success: true,
      data: record,
      organizationTimezone: timezone, // For frontend to convert times to local timezone
      organizationCheckInTime: organization?.checkInTime || null,
      organizationCheckOutTime: organization?.checkOutTime || null,
      organizationHalfDayCheckOutTime: organization?.halfDayCheckOutTime || null
    });
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
      // Extract date from UTC (date is stored as UTC midnight with local date components)
      const localDate = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate(); // YYYY-MM-DD
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
      else if (record.status === 'L') { summary.leave++; summary.workingDays += 1; }
      else if (record.status === 'W') { summary.weeklyOff++; summary.workingDays += 1; }
    }

    // Fill in weekly offs and not marked
    const daysInMonth = DateTime.fromJSDate(endDate, { zone: 'UTC' }).day;
    for (let day = 1; day <= daysInMonth; day++) {
      if (!attendanceByDate[day]) {
        const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });
        const dayOfWeek = dt.weekday % 7; // convert 1..7 -> 1..6,0
        if (dayOfWeek === weeklyOffDayNumber) {
          attendanceByDate[day] = { status: 'W', checkInTime: null, checkOutTime: null, notes: null };
          summary.weeklyOff++;
        } else {
          // Add not marked days with a status so they appear in the response
          attendanceByDate[day] = { status: 'NA', checkInTime: null, checkOutTime: null, notes: null };
          summary.notMarked++;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        month, year, weeklyOffDay, attendance: attendanceByDate, summary
      },
      organizationTimezone: timezone // For frontend to convert times to local timezone
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
      // Extract date from UTC (date is stored as UTC midnight with local date components)
      const dateIso = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate(); // YYYY-MM-DD
      const key = `${record.employee.toString()}-${dateIso}`;
      attendanceMap.set(key, record);
    }

    const report = [];
    const summary = {};

    const daysInMonth = DateTime.fromJSDate(endDate, { zone: 'UTC' }).day;

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
        else if (status === 'L') { summary[empId].leave += 1; summary[empId].workingDays += 1; }
        else if (status === 'W') { summary[empId].weeklyOff += 1; summary[empId].workingDays += 1; }
      }

      report.push({ employee, records: dailyRecords, totalWorkingDays: summary[empId].workingDays });
    }

    res.status(200).json({
      success: true,
      data: {
        month,
        year,
        weeklyOffDay,
        report,
        summary
      },
      organizationTimezone: timezone // For frontend to convert times to local timezone
    });

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
    date: z.string().refine(val => isValidDateString(val), { message: "Invalid date format. Expected YYYY-MM-DD or ISO 8601 format" }),
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

    // Use new robust date parser
    let recordDate;
    try {
      recordDate = parseDateToOrgTZ(date, timezone);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        hint: "Please use format: YYYY-MM-DD (e.g., 2025-11-12)"
      });
    }

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
    employeeId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), { message: "Invalid employee ID format" }),
    date: z.string().refine(val => isValidDateString(val), { message: "Invalid date format. Expected YYYY-MM-DD or ISO 8601 format" }),
    status: z.enum(['P', 'A', 'W', 'L', 'H']),
    notes: z.string().optional(),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { organizationId, _id: adminUserId, role: adminRole } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const { employeeId, date, status, notes } = adminMarkSchema.parse(req.body);

    const employee = await User.findOne({ _id: employeeId, organizationId: orgObjectId }).select('role name');
    if (!employee) return res.status(404).json({ success: false, message: "Employee not found in your organization." });

    if (adminRole === 'manager' && employee.role === 'manager') {
      return res.status(403).json({ success: false, message: "Managers are not authorized to modify the attendance of other managers." });
    }

    const organization = await Organization.findById(orgObjectId).select('checkInTime checkOutTime halfDayCheckOutTime weeklyOffDay timezone');
    if (!organization) return res.status(404).json({ success: false, message: "Organization not found." });

    const timezone = organization.timezone || 'Asia/Kolkata';

    // Use new robust date parser
    let recordDate;
    try {
      recordDate = parseDateToOrgTZ(date, timezone);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        hint: "Please use format: YYYY-MM-DD (e.g., 2025-11-12)"
      });
    }

    // Validate weekly off rule
    const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weeklyOffDay = organization.weeklyOffDay || 'Saturday';
    const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];
    // Use UTC zone since date is stored as UTC midnight with local date components
    const recordDayOfWeek = DateTime.fromJSDate(recordDate, { zone: 'UTC' }).weekday % 7;
    if (recordDayOfWeek === weeklyOffDayNumber && status !== 'W') {
      return res.status(400).json({
        success: false,
        message: `${weeklyOffDay} is the organization's weekly off day. Cannot mark attendance as '${status}' on this day.`,
        weeklyOffDay,
        date: recordDate.toISOString().split('T')[0]
      });
    }

    // CRITICAL FIX: Handle duplicate records caused by timezone inconsistencies
    // Delete ALL existing records for this employee on this date (to handle duplicates)
    // Search within the entire day range, not just exact UTC instant
    const endOfRecordDate = DateTime.fromJSDate(recordDate, { zone: timezone })
      .endOf('day').toUTC().toJSDate();

    await Attendance.deleteMany({
      employee: employeeId,
      organizationId: orgObjectId,
      date: { $gte: recordDate, $lte: endOfRecordDate }
    });

    // Now create a fresh record with consistent date
    const newRecord = await Attendance.create({
      employee: employeeId,
      date: recordDate,
      organizationId: orgObjectId,
      status,
      markedBy: adminUserId,
      notes: notes || undefined,
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
    });

    const updatedRecord = newRecord;

    // Format the response with helpful info (extract from UTC since date is stored as UTC midnight)
    const localDateStr = DateTime.fromJSDate(recordDate, { zone: 'UTC' }).toFormat('yyyy-MM-dd');
    const dayOfWeek = DateTime.fromJSDate(recordDate, { zone: 'UTC' }).toFormat('EEEE');

    res.status(200).json({
      success: true,
      message: `Attendance marked successfully for ${employee.name} on ${localDateStr} (${dayOfWeek})`,
      data: updatedRecord,
      debug: {
        requestedDate: date,
        parsedDate: localDateStr,
        dayOfWeek: dayOfWeek,
        timezone: timezone
      }
    });
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
    date: z.string().refine(val => isValidDateString(val), { message: "Invalid date format. Expected YYYY-MM-DD or ISO 8601 format" }),
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

    // Use new robust date parser
    let holidayDate;
    try {
      holidayDate = parseDateToOrgTZ(date, timezone);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        hint: "Please use format: YYYY-MM-DD (e.g., 2025-11-12)"
      });
    }

    // Prevent marking holiday on weekly off day
    const weeklyOffDay = organization.weeklyOffDay || 'Saturday';
    const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];
    // Use UTC zone since date is stored as UTC midnight with local date components
    const holidayDayOfWeek = DateTime.fromJSDate(holidayDate, { zone: 'UTC' }).weekday % 7;
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

// @desc    Search own attendance records with filters (status, location, date range)
// @route   GET /api/v1/attendance/search
// @access  Private (Admin, Manager, Salesperson) - users can only see their own data
exports.searchAttendance = async (req, res, next) => {
  const searchSchema = z.object({
    // Status filter - can be single status or comma-separated list
    status: z.string().optional(),

    // Date range filters - can use either month/year OR startDate/endDate
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2020).max(2100).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),

    // Employee filter
    employeeId: z.string().optional(),
    employeeName: z.string().optional(),

    // Location filter (requires all three: latitude, longitude, radius in km)
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    radius: z.coerce.number().positive().optional().default(5), // radius in kilometers

    // Pagination
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),

    // Sort
    sortBy: z.enum(['date', 'checkInTime', 'checkOutTime', 'status']).optional().default('date'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  });

  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { organizationId, _id: userId, role: userRole } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const params = searchSchema.parse(req.query);
    const {
      status, month, year, startDate, endDate,
      employeeId, employeeName,
      latitude, longitude, radius,
      page, limit, sortBy, sortOrder
    } = params;

    // Fetch organization timezone
    const organization = await Organization.findById(orgObjectId).select('timezone');
    const timezone = organization?.timezone || 'Asia/Kolkata';

    // Build query
    const query = { organizationId: orgObjectId };

    // IMPORTANT: All users (salesperson, manager, admin) can only see their own attendance
    // This endpoint is for the mobile app where everyone tracks their own attendance
    query.employee = userId;

    // 1. Status filter
    if (status) {
      const statuses = status.split(',').map(s => s.trim().toUpperCase());
      const validStatuses = statuses.filter(s => ['P', 'A', 'W', 'L', 'H'].includes(s));
      if (validStatuses.length > 0) {
        query.status = validStatuses.length === 1 ? validStatuses[0] : { $in: validStatuses };
      }
    }

    // 2. Date range filter
    let dateStart, dateEnd;

    if (month && year) {
      // Use month/year range
      const range = getMonthRangeInOrgTZ(year, month, timezone);
      dateStart = range.start;
      dateEnd = range.end;
    } else if (startDate || endDate) {
      // Use custom date range
      try {
        if (startDate) {
          dateStart = parseDateToOrgTZ(startDate, timezone);
        }
        if (endDate) {
          dateEnd = parseDateToOrgTZ(endDate, timezone);
          // Set to end of day (using UTC since date is stored as UTC midnight)
          const dt = DateTime.fromJSDate(dateEnd, { zone: 'UTC' });
          dateEnd = new Date(Date.UTC(dt.year, dt.month - 1, dt.day, 23, 59, 59, 999));
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
          hint: "Please use format: YYYY-MM-DD (e.g., 2025-11-12)"
        });
      }
    }

    if (dateStart || dateEnd) {
      query.date = {};
      if (dateStart) query.date.$gte = dateStart;
      if (dateEnd) query.date.$lte = dateEnd;
    }

    // 4. Location filter (if latitude and longitude are provided)
    // Note: This requires geospatial data. We'll filter in-memory after query
    // For better performance, consider adding a 2dsphere index on checkInLocation
    const hasLocationFilter = latitude !== undefined && longitude !== undefined;

    // Execute base query
    const skip = (page - 1) * limit;
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Query attendance records
    let records = await Attendance.find(query)
      .populate('employee', 'name email role avatarUrl phone')
      .populate('markedBy', 'name email role')
      .sort(sortObj)
      .lean();

    // Apply location filter if needed
    if (hasLocationFilter && records.length > 0) {
      records = records.filter(record => {
        if (!record.checkInLocation ||
            record.checkInLocation.latitude === undefined ||
            record.checkInLocation.longitude === undefined) {
          return false;
        }

        // Calculate distance using Haversine formula
        const distance = calculateDistance(
          latitude,
          longitude,
          record.checkInLocation.latitude,
          record.checkInLocation.longitude
        );

        return distance <= radius;
      });
    }

    // Calculate total before pagination
    const total = records.length;

    // Apply pagination
    const paginatedRecords = records.slice(skip, skip + limit);

    // Format response with human-readable data
    const formattedRecords = paginatedRecords.map(record => {
      // Extract date from UTC (date is stored as UTC midnight with local date components)
      const recordDate = DateTime.fromJSDate(record.date, { zone: 'UTC' });

      // Calculate hours worked if both check-in and check-out exist
      let hoursWorked = null;
      if (record.checkInTime && record.checkOutTime) {
        const diffMs = new Date(record.checkOutTime) - new Date(record.checkInTime);
        hoursWorked = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10; // Round to 1 decimal
      }

      return {
        _id: record._id,
        employee: record.employee,
        date: recordDate.toISODate(), // YYYY-MM-DD
        dayOfWeek: recordDate.toFormat('EEEE'), // Monday, Tuesday, etc.
        status: record.status,
        statusText: getStatusText(record.status),
        checkInTime: record.checkInTime,
        checkOutTime: record.checkOutTime,
        hoursWorked,
        checkInLocation: record.checkInLocation,
        checkOutLocation: record.checkOutLocation,
        checkInAddress: record.checkInAddress,
        checkOutAddress: record.checkOutAddress,
        notes: record.notes,
        markedBy: record.markedBy,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };
    });

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: formattedRecords,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        status: status ? status.split(',') : 'all',
        dateRange: dateStart && dateEnd ? {
          start: DateTime.fromJSDate(dateStart, { zone: 'UTC' }).toISODate(),
          end: DateTime.fromJSDate(dateEnd, { zone: 'UTC' }).toISODate()
        } : null,
        location: hasLocationFilter ? { latitude, longitude, radius } : null
      },
      organizationTimezone: timezone // For frontend to convert times to local timezone
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

// Helper function to calculate distance between two coordinates using Haversine formula
// Returns distance in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Helper function to convert status code to readable text
function getStatusText(status) {
  const statusMap = {
    'P': 'Present',
    'A': 'Absent',
    'W': 'Weekly Off',
    'L': 'Leave',
    'H': 'Half Day'
  };
  return statusMap[status] || status;
}
