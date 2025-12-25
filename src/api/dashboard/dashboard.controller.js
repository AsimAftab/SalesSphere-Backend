// controllers/dashboard.controller.js
const mongoose = require('mongoose');
const User = require('../users/user.model');
const { DateTime } = require('luxon'); // npm i luxon

// Luxon helper: get UTC start/end instants for "date" in timeZone
function getUTCRangeForDateInTimeZone(date = new Date(), timeZone = 'UTC') {
  const dtInZone = DateTime.fromJSDate(date, { zone: timeZone });
  const startUTC = dtInZone.startOf('day').toUTC().toJSDate();
  const endUTC = dtInZone.plus({ days: 1 }).startOf('day').toUTC().toJSDate();
  return { startUTC, endUTC };
}

function toObjectIdIfNeeded(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(id);
}

// =============================
// GET /api/v1/dashboard/stats
// =============================
// Fast, index-friendly: compute UTC window via Luxon and use createdAt range.
// Includes ALL invoices (no status filter) for today's totals, per your request.
exports.getDashboardStats = async (req, res) => {
  try {
    const { organizationId } = req.user;
    if (!organizationId)
      return res.status(400).json({ success: false, message: 'organizationId missing' });

    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const Invoice = require('../invoice/invoice.model');
    const Party = require('../parties/party.model');
    const Organization = require('../organizations/organization.model');

    // fetch org timezone
    const orgData = await Organization.findById(orgObjectId).select('timezone');
    const timezone = orgData?.timezone || 'UTC';

    // compute UTC range for org-local "today" (fast & indexable)
    const { startUTC: today, endUTC: tomorrow } = getUTCRangeForDateInTimeZone(new Date(), timezone);

    // DEBUG (enable while testing)
    // console.log('getDashboardStats range', timezone, today.toISOString(), tomorrow.toISOString());

    // 1) Total parties created today (index-friendly)
    const totalPartiesToday = await Party.countDocuments({
      organizationId: orgObjectId,
      createdAt: { $gte: today, $lt: tomorrow }
    });

    // 2) Today's invoices (ALL statuses included)
    const invoiceMatch = {
      organizationId: orgObjectId,
      createdAt: { $gte: today, $lt: tomorrow },
      // no status filter — includes pending/completed/rejected/etc.
    };

    // Sum totals using aggregation (ensures correct numeric sum)
    const todayAgg = await Invoice.aggregate([
      { $match: invoiceMatch },
      { $group: { _id: null, totalSalesToday: { $sum: { $ifNull: ['$totalAmount', 0] } }, totalOrdersToday: { $sum: 1 } } }
    ]);
    const totalSalesToday = todayAgg[0]?.totalSalesToday || 0;
    const totalOrdersToday = todayAgg[0]?.totalOrdersToday || 0;

    // 3) Pending orders (global count across all time) - exclude estimates
    const pendingOrders = await Invoice.countDocuments({
      organizationId: orgObjectId,
      status: 'pending',
      isEstimate: false
    });

    return res.status(200).json({
      success: true,
      data: {
        timezone,
        totalPartiesToday,
        totalSalesToday,
        totalOrdersToday,
        pendingOrders,
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// =============================
// GET /api/v1/dashboard/team-performance
// =============================
// Uses Luxon range (same approach) — excludes 'rejected' as before.
exports.getTeamPerformance = async (req, res) => {
  try {
    const { organizationId } = req.user;
    if (!organizationId) return res.status(400).json({ success: false, message: 'organizationId missing' });

    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const Invoice = require('../invoice/invoice.model');
    const Organization = require('../organizations/organization.model');

    // Get org timezone dynamically
    const orgData = await Organization.findById(orgObjectId).select('timezone');
    const timezone = orgData?.timezone || 'UTC';

    const { startUTC: today, endUTC: tomorrow } = getUTCRangeForDateInTimeZone(new Date(), timezone);

    const performance = await Invoice.aggregate([
      {
        $match: {
          organizationId: orgObjectId,
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $ne: 'rejected' }
        }
      },
      {
        $group: {
          _id: '$createdBy',
          totalSales: { $sum: { $ifNull: ['$totalAmount', 0] } },
          totalOrders: { $sum: 1 },
          completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$userInfo.name',
          email: '$userInfo.email',
          role: '$userInfo.role',
          avatarUrl: '$userInfo.avatarUrl',
          sales: '$totalSales',
          orders: '$totalOrders',
          completedOrders: 1,
          pendingOrders: 1
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 10 }
    ]);

    return res.status(200).json({
      success: true,
      timezone,
      count: performance.length,
      data: performance
    });
  } catch (error) {
    console.error('Error fetching team performance:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// =============================
// GET /api/v1/dashboard/attendance-summary
// =============================
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { organizationId } = req.user;
    if (!organizationId) return res.status(400).json({ success: false, message: 'organizationId missing' });

    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const Attendance = require('../attendance/attendance.model');
    const Organization = require('../organizations/organization.model');

    // Get org timezone
    const orgData = await Organization.findById(orgObjectId).select('timezone');
    const timezone = orgData?.timezone || 'UTC';

    // Get UTC range for today in org timezone
    const { startUTC: today, endUTC: tomorrow } = getUTCRangeForDateInTimeZone(new Date(), timezone);

    // Get total team strength (active employees in organization, excluding admin/superadmin/developer)
    const teamStrength = await User.countDocuments({
      organizationId: orgObjectId,
      isActive: true,
      role: { $nin: ['superadmin', 'developer', 'admin'] }
    });

    // Get today's attendance records
    const attendanceRecords = await Attendance.aggregate([
      {
        $match: {
          organizationId: orgObjectId,
          date: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Process attendance counts
    let present = 0;
    let absent = 0;
    let onLeave = 0;
    let halfDay = 0;
    let weeklyOff = 0;

    attendanceRecords.forEach(record => {
      switch (record._id) {
        case 'P':
          present = record.count;
          break;
        case 'A':
          absent = record.count;
          break;
        case 'L':
          onLeave = record.count;
          break;
        case 'H':
          halfDay = record.count;
          break;
        case 'W':
          weeklyOff = record.count;
          break;
      }
    });

    // Calculate attendance rate (present + half day / team strength * 100)
    const attendanceRate = teamStrength > 0
      ? ((present + halfDay * 0.5) / teamStrength * 100).toFixed(2)
      : 0;

    const summary = {
      teamStrength,
      present,
      absent,
      onLeave,
      halfDay,
      weeklyOff,
      attendanceRate: parseFloat(attendanceRate),
    };

    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// =============================
// GET /api/v1/dashboard/sales-trend
// =============================
// Pre-filter by UTC window (Luxon) then group by local date in Mongo ($dateToString + timezone)
exports.getSalesTrend = async (req, res) => {
  try {
    const { organizationId } = req.user;
    if (!organizationId) return res.status(400).json({ success: false, message: 'organizationId missing' });

    const orgObjectId = toObjectIdIfNeeded(organizationId);

    const Organization = require('../organizations/organization.model');
    const Invoice = require('../invoice/invoice.model');

    const orgData = await Organization.findById(orgObjectId).select('timezone');
    const timezone = orgData?.timezone || 'UTC';

    // compute startUTC for 7-day window (include today)
    const now = new Date();
    const sevenDaysAgo = DateTime.fromJSDate(now, { zone: timezone }).minus({ days: 6 }).startOf('day').toUTC().toJSDate();
    const { startUTC: startWindow } = { startUTC: sevenDaysAgo };

    // DEBUG
    // console.log('getSalesTrend startWindow UTC:', startWindow.toISOString(), 'timezone:', timezone);

    const salesData = await Invoice.aggregate([
      // pre-filter by UTC to reduce scanned docs (index-friendly)
      {
        $match: {
          organizationId: orgObjectId,
          createdAt: { $gte: startWindow },
          status: { $ne: 'rejected' } // exclude rejected for trends; change if you want all statuses
        }
      },
      // group by org-local date string
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone } },
          totalSales: { $sum: { $ifNull: ["$totalAmount", 0] } }
        }
      },
      { $project: { _id: 0, date: "$_id", sales: "$totalSales" } },
      { $sort: { date: 1 } }
    ]);

    return res.status(200).json({ success: true, timezone, data: salesData });
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
