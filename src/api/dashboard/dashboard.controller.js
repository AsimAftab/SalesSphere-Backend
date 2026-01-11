// src/api/dashboard/dashboard.controller.js
const mongoose = require('mongoose');
const User = require('../users/user.model');
const { DateTime } = require('luxon');
const { getHierarchyFilter, getAllSubordinateIds } = require('../../utils/hierarchyHelper');
const { isSystemRole } = require('../../utils/defaultPermissions');
// Import the permission checker to safely check roles/permissions
const { checkRoleFeaturePermission } = require('../../middlewares/compositeAccess.middleware');

// Models
const Invoice = require('../invoice/invoice.model');
const Party = require('../parties/party.model');
const Attendance = require('../attendance/attendance.model');

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
exports.getDashboardStats = async (req, res) => {
  try {
    const { organizationId } = req.user;
    if (!organizationId) return res.status(400).json({ success: false, message: 'organizationId missing' });

    const orgObjectId = toObjectIdIfNeeded(organizationId);
    const timezone = req.organization?.timezone || 'UTC';
    const { startUTC: today, endUTC: tomorrow } = getUTCRangeForDateInTimeZone(new Date(), timezone);

    // --- HIERARCHY FILTERS ---
    // 1. Parties: 'viewAllParties' or implicit team view
    const partyAccessFilter = await getHierarchyFilter(req.user, 'parties', 'viewAllParties');

    // 2. Invoices: 'viewAllInvoices' or implicit team view
    const invoiceAccessFilter = await getHierarchyFilter(req.user, 'invoice', 'viewAllInvoices');

    // --- QUERIES ---

    // 1) Total parties created today (Personalized)
    const totalPartiesToday = await Party.countDocuments({
      organizationId: orgObjectId,
      createdAt: { $gte: today, $lt: tomorrow },
      ...partyAccessFilter // Only count parties visible to user
    });

    // 2) Today's invoices (Personalized)
    const invoiceMatch = {
      organizationId: orgObjectId,
      createdAt: { $gte: today, $lt: tomorrow },
      ...invoiceAccessFilter // Only aggregate invoices visible to user
    };

    const todayAgg = await Invoice.aggregate([
      { $match: invoiceMatch },
      { $group: { _id: null, totalSalesToday: { $sum: { $ifNull: ['$totalAmount', 0] } }, totalOrdersToday: { $sum: 1 } } }
    ]);
    const totalSalesToday = todayAgg[0]?.totalSalesToday || 0;
    const totalOrdersToday = todayAgg[0]?.totalOrdersToday || 0;

    // 3) Pending orders (Personalized)
    const pendingOrders = await Invoice.countDocuments({
      organizationId: orgObjectId,
      status: 'pending',
      isEstimate: false,
      ...invoiceAccessFilter
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
exports.getTeamPerformance = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);
    const timezone = req.organization?.timezone || 'UTC';
    const { startUTC: today, endUTC: tomorrow } = getUTCRangeForDateInTimeZone(new Date(), timezone);

    // Dynamic Role Filtering (Consistent with other modules)
    // Checks 'viewAllInvoices' or falls back to team view
    const hierarchyFilter = await getHierarchyFilter(req.user, 'invoice', 'viewAllInvoices');

    const matchQuery = {
      organizationId: orgObjectId,
      createdAt: { $gte: today, $lt: tomorrow },
      status: { $ne: 'rejected' },
      ...hierarchyFilter // Apply permissions
    };

    const performance = await Invoice.aggregate([
      { $match: matchQuery },
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
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: false } },
      // Filter out system roles from leaderboard
      {
        $match: {
          'userInfo.role': { $nin: ['superadmin', 'developer'] }
        }
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$userInfo.name',
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
    const { organizationId, role, _id: userId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);
    const timezone = req.organization?.timezone || 'UTC';
    const { startUTC: today, endUTC: tomorrow } = getUTCRangeForDateInTimeZone(new Date(), timezone);

    // --- HIERARCHY LOGIC (Fixed for Deep Hierarchy) ---
    let allowedUserIds = [];

    // Check permission using the centralized helper
    const canViewAll = checkRoleFeaturePermission(req.user, 'attendance', 'viewAllAttendance').allowed;

    // 1. Admin / System Role / View All Permission
    if (role === 'admin' || isSystemRole(role) || canViewAll) {
      allowedUserIds = null; // null means "fetch all based on organizationId"
    }
    // 2. Manager / Regular User: View Self + Deep Subordinates
    else {
      // Use the optimized helper to get ALL nested subordinates (not just direct reports)
      const subordinateIds = await getAllSubordinateIds(userId, organizationId);
      allowedUserIds = [userId, ...subordinateIds];
    }

    // Build Queries
    const teamStrengthQuery = {
      organizationId: orgObjectId,
      isActive: true
    };

    const attendanceMatch = {
      organizationId: orgObjectId,
      date: { $gte: today, $lt: tomorrow }
    };

    // Apply User Filter if not allowed to view all
    if (allowedUserIds !== null) {
      teamStrengthQuery._id = { $in: allowedUserIds };
      attendanceMatch.employee = { $in: allowedUserIds };
    } else {
      // Even admins shouldn't see superadmin stats usually
      teamStrengthQuery.role = { $nin: ['superadmin', 'developer'] };
    }

    const teamStrength = await User.countDocuments(teamStrengthQuery);

    const attendanceRecords = await Attendance.aggregate([
      { $match: attendanceMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Process counts
    let present = 0, absent = 0, onLeave = 0, halfDay = 0, weeklyOff = 0;

    attendanceRecords.forEach(record => {
      if (record._id === 'P') present = record.count;
      else if (record._id === 'A') absent = record.count;
      else if (record._id === 'L') onLeave = record.count;
      else if (record._id === 'H') halfDay = record.count;
      else if (record._id === 'W') weeklyOff = record.count;
    });

    // Calculate attendance rate
    const attendanceRate = teamStrength > 0
      ? ((present + halfDay * 0.5) / teamStrength * 100).toFixed(2)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        teamStrength,
        present,
        absent,
        onLeave,
        halfDay,
        weeklyOff,
        attendanceRate: parseFloat(attendanceRate),
      }
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// =============================
// GET /api/v1/dashboard/sales-trend
// =============================
exports.getSalesTrend = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const orgObjectId = toObjectIdIfNeeded(organizationId);
    const timezone = req.organization?.timezone || 'UTC';

    // 7-day window
    const now = new Date();
    const sevenDaysAgo = DateTime.fromJSDate(now, { zone: timezone }).minus({ days: 6 }).startOf('day').toUTC().toJSDate();

    // Access Control
    const hierarchyFilter = await getHierarchyFilter(req.user, 'invoice', 'viewAllInvoices');

    const salesData = await Invoice.aggregate([
      {
        $match: {
          organizationId: orgObjectId,
          createdAt: { $gte: sevenDaysAgo },
          status: { $ne: 'rejected' },
          ...hierarchyFilter // Personalized trend
        }
      },
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
