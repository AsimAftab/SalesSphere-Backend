const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');
const Invoice = require('../invoice/invoice.model');
const { isSystemRole } = require('../../utils/defaultPermissions');

const { getHierarchyFilter } = require('../../utils/hierarchyHelper');

// Helper to construct hierarchy-based query for analytics is now imported from utils


/**
 * Helper to get timezone-aware date range for a month
 * Uses organization's timezone to properly convert month boundaries to UTC
 * @param {string} organizationId - Organization ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (e.g., 2025)
 * @returns {Promise<{monthStart: Date, monthEnd: Date}>}
 */
const getTimezoneAwareMonthRange = async (organizationId, month, year) => {
    const monthInt = parseInt(month);
    const yearInt = parseInt(year);

    // Get organization timezone (default to Asia/Kolkata if not set)
    const org = await Organization.findById(organizationId).select('timezone').lean();
    const timeZone = org?.timezone || 'Asia/Kolkata';

    // Helper: Convert "YYYY-MM-01 00:00:00 in org timezone" to UTC timestamp
    const getMidnightInTimezone = (y, m) => {
        // Create a date representing midnight on the 1st of the month
        // We use a trick: format the UTC date using the org's timezone,
        // then parse the result to get the actual UTC timestamp
        const date = new Date(Date.UTC(y, m, 1, 0, 0, 0));

        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        const formatted = formatter.format(date);
        // formatted is now "MM/DD/YYYY, HH:MM:SS" in the org's timezone
        // But this represents what UTC time looks like when converted to org timezone
        // We need the inverse: what UTC time corresponds to midnight in org timezone

        // Better approach: get timezone offset for the specific date
        const tempDate = new Date(y, m, 1);
        const utcDate = new Date(Date.UTC(y, m, 1, 0, 0, 0));

        // Get the timezone offset for this date using Intl
        const parts = formatter.formatToParts(utcDate);
        const hour = parseInt(parts.find(p => p.type === 'hour').value);
        const minute = parseInt(parts.find(p => p.type === 'minute').value);

        // The offset from UTC (positive means ahead of UTC, like Asia/Kolkata +5:30)
        // When UTC is 00:00, Asia/Kolkata shows 05:30, so offset is +5.5 hours
        let offsetMinutes = (hour * 60) + minute;
        if (offsetMinutes > 720) {
            offsetMinutes -= 1440; // Timezones behind UTC will show hours like 20:00
        }
        // But we want the inverse: midnight in timezone = what UTC time?
        // Asia/Kolkata midnight = UTC 18:30 previous day
        // So we subtract the offset from midnight
        offsetMinutes = -offsetMinutes;

        // Create the UTC date: midnight in org timezone
        return new Date(Date.UTC(y, m, 1, 0, 0) - (offsetMinutes * 60 * 1000));
    };

    const monthStart = getMidnightInTimezone(yearInt, monthInt - 1);
    const monthEnd = getMidnightInTimezone(yearInt, monthInt);

    return { monthStart, monthEnd };
};

// @desc    Get monthly analytics overview
// @route   GET /api/v1/analytics/monthly-overview?month=11&year=2025
// @access  Private (analytics:view permission)
exports.getMonthlyOverview = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Please provide month and year parameters'
            });
        }

        // Get timezone-aware date range for the selected month
        const { monthStart, monthEnd } = await getTimezoneAwareMonthRange(organizationId, month, year);

        // Get Hierarchy Filter
        const hierarchyQuery = await getHierarchyFilter(req.user, 'analytics', 'viewTeamAnalytics');

        // Common Match Query
        const matchQuery = {
            organizationId: organizationId,
            createdAt: { $gte: monthStart, $lt: monthEnd },
            status: { $ne: 'rejected' },
            ...hierarchyQuery // Merge hierarchy filter
        };

        // Total Order Value for the month (excluding rejected)
        const totalOrderValueResult = await Invoice.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalValue: { $sum: '$totalAmount' }
                }
            }
        ]);
        const totalOrderValue = totalOrderValueResult.length > 0 ? totalOrderValueResult[0].totalValue : 0;

        // Total Orders count for the month (excluding rejected)
        const totalOrders = await Invoice.countDocuments(matchQuery);

        res.status(200).json({
            success: true,
            data: {
                month: monthInt,
                year: yearInt,
                totalOrderValue,
                totalOrders
            }
        });
    } catch (error) {
        console.error('Error fetching monthly overview:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// @desc    Get sales trend by week for selected month
// @route   GET /api/v1/analytics/sales-trend?month=11&year=2025
// @access  Private (analytics:view permission)
exports.getSalesTrend = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Please provide month and year parameters'
            });
        }

        const monthInt = parseInt(month);
        const yearInt = parseInt(year);

        // Get timezone-aware date range for the selected month
        const { monthStart, monthEnd } = await getTimezoneAwareMonthRange(organizationId, month, year);

        // Calculate week boundaries for the month
        const weeks = [];
        let weekStart = new Date(monthStart);
        let weekNumber = 1;

        while (weekStart < monthEnd) {
            // Calculate week end (7 days from start or end of month, whichever is earlier)
            let weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

            if (weekEnd > monthEnd) {
                weekEnd = new Date(monthEnd);
            }

            weeks.push({
                weekNumber,
                start: new Date(weekStart),
                end: new Date(weekEnd)
            });

            weekStart = weekEnd;
            weekNumber++;
        }

        // Get Hierarchy Filter
        const hierarchyQuery = await getHierarchyFilter(req.user, 'analytics', 'viewTeamAnalytics');

        // Get sales data for each week using $facet for parallel execution
        const facetStages = {};
        weeks.forEach((week) => {
            facetStages[`week${week.weekNumber}`] = [
                {
                    $match: {
                        organizationId: organizationId,
                        createdAt: { $gte: week.start, $lt: week.end },
                        status: { $ne: 'rejected' },
                        ...hierarchyQuery // Merge hierarchy filter
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalSales: { $sum: '$totalAmount' }
                    }
                }
            ];
        });

        const salesData = await Invoice.aggregate([
            { $facet: facetStages }
        ]);

        // Format the response
        const formattedData = weeks.map((week) => {
            const weekData = salesData[0][`week${week.weekNumber}`];
            return {
                week: `Week ${week.weekNumber}`,
                sales: weekData.length > 0 ? weekData[0].totalSales : 0
            };
        });

        res.status(200).json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Error fetching sales trend:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// @desc    Get products sold by category for selected month
// @route   GET /api/v1/analytics/products-by-category?month=11&year=2025
// @access  Private (analytics:view permission)
exports.getProductsByCategory = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Please provide month and year parameters'
            });
        }

        const monthInt = parseInt(month);
        const yearInt = parseInt(year);

        // Get timezone-aware date range for the selected month
        const { monthStart, monthEnd } = await getTimezoneAwareMonthRange(organizationId, month, year);

        // Get Hierarchy Filter
        const hierarchyQuery = await getHierarchyFilter(req.user, 'analytics', 'viewTeamAnalytics');

        // Aggregate products sold by category
        const categoryData = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' },
                    ...hierarchyQuery // Merge hierarchy filter
                }
            },
            {
                $unwind: '$items'
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            {
                $unwind: '$productInfo'
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'productInfo.category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            {
                $unwind: '$categoryInfo'
            },
            {
                $group: {
                    _id: '$categoryInfo._id',
                    category: { $first: '$categoryInfo.name' },
                    quantity: { $sum: '$items.quantity' }
                }
            },
            {
                $sort: { quantity: -1 }
            },
            {
                $project: {
                    _id: 0,
                    category: 1,
                    quantity: 1
                }
            }
        ]);

        // Calculate total
        const total = categoryData.reduce((sum, item) => sum + item.quantity, 0);

        res.status(200).json({
            success: true,
            data: {
                categories: categoryData,
                total
            }
        });
    } catch (error) {
        console.error('Error fetching products by category:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// @desc    Get top products sold for selected month
// @route   GET /api/v1/analytics/top-products?month=11&year=2025
// @access  Private (analytics:view permission)
exports.getTopProducts = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Please provide month and year parameters'
            });
        }

        const monthInt = parseInt(month);
        const yearInt = parseInt(year);

        // Get timezone-aware date range for the selected month
        const { monthStart, monthEnd } = await getTimezoneAwareMonthRange(organizationId, month, year);

        // Get Hierarchy Filter
        const hierarchyQuery = await getHierarchyFilter(req.user, 'analytics', 'viewTeamAnalytics');

        // Aggregate top products sold
        const topProducts = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' },
                    ...hierarchyQuery // Merge hierarchy filter
                }
            },
            {
                $unwind: '$items'
            },
            {
                $group: {
                    _id: '$items.productId',
                    productName: { $first: '$items.productName' },
                    quantity: { $sum: '$items.quantity' }
                }
            },
            {
                $sort: { quantity: -1 }
            },
            {
                $limit: 10
            },
            {
                $project: {
                    _id: 0,
                    product: '$productName',
                    quantity: 1
                }
            }
        ]);

        // Calculate total
        const total = topProducts.reduce((sum, item) => sum + item.quantity, 0);

        res.status(200).json({
            success: true,
            data: {
                products: topProducts,
                total
            }
        });
    } catch (error) {
        console.error('Error fetching top products:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// @desc    Get top 5 parties of the month
// @route   GET /api/v1/analytics/top-parties?month=11&year=2025
// @access  Private (analytics:view permission)
exports.getTopParties = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Please provide month and year parameters'
            });
        }

        const monthInt = parseInt(month);
        const yearInt = parseInt(year);

        // Get timezone-aware date range for the selected month
        const { monthStart, monthEnd } = await getTimezoneAwareMonthRange(organizationId, month, year);

        // Get Hierarchy Filter
        const hierarchyQuery = await getHierarchyFilter(req.user, 'analytics', 'viewTeamAnalytics');

        // Aggregate top parties by total order value
        const topParties = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' },
                    ...hierarchyQuery // Merge hierarchy filter
                }
            },
            {
                $group: {
                    _id: '$party',
                    partyName: { $first: '$partyName' },
                    totalOrderValue: { $sum: '$totalAmount' },
                    totalOrders: { $sum: 1 }
                }
            },
            {
                $sort: { totalOrderValue: -1 }
            },
            {
                $limit: 5
            },
            {
                $project: {
                    _id: 0,
                    partyId: '$_id',
                    partyName: 1,
                    totalOrderValue: 1,
                    totalOrders: 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: topParties
        });
    } catch (error) {
        console.error('Error fetching top parties:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
