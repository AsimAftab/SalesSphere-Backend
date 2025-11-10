const User = require('../users/user.model');


// @desc    Get the main KPI stats for the dashboard
// @route   GET /api/v1/dashboard/stats
// @access  Private (Admin, Manager)
exports.getDashboardStats = async (req, res) => {
    try {
        const { organizationId } = req.user;

        const Invoice = require('../invoice/invoice.model');
        const Party = require('../parties/party.model');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Query for total parties
        const totalParties = await Party.countDocuments({ organizationId });

        // Query for today's sales (sum of totalAmount for today's invoices, excluding rejected)
        const todaySalesResult = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: today, $lt: tomorrow },
                    status: { $ne: 'rejected' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: '$totalAmount' }
                }
            }
        ]);
        const totalSales = todaySalesResult.length > 0 ? todaySalesResult[0].totalSales : 0;

        // Query for today's orders count (excluding rejected)
        const totalOrders = await Invoice.countDocuments({ 
            organizationId, 
            createdAt: { $gte: today, $lt: tomorrow },
            status: { $ne: 'rejected' }
        });

        // Query for ALL pending orders (not just today - across all time)
        const pendingOrders = await Invoice.countDocuments({ 
            organizationId, 
            status: 'pending' 
        });
        
        res.status(200).json({
            success: true,
            data: {
                totalParties,
                totalSales,
                totalOrders,
                pendingOrders,
            },
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get the team performance stats for the dashboard
// @route   GET /api/v1/dashboard/team-performance
// @access  Private (Admin, Manager)
exports.getTeamPerformance = async (req, res) => {
    try {
        const { organizationId } = req.user;

        const Invoice = require('../invoice/invoice.model');
        
        // Get today's start time for filtering
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Aggregate invoices by salesperson to get performance metrics
        const performance = await Invoice.aggregate([
            {
                // Filter by organization and today's date
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: today, $lt: tomorrow },
                    status: { $ne: 'rejected' } // Exclude rejected orders
                }
            },
            {
                // Group by the person who created the invoice
                $group: {
                    _id: '$createdBy',
                    totalSales: { $sum: '$totalAmount' },
                    totalOrders: { $sum: 1 },
                    completedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    }
                }
            },
            {
                // Lookup user details
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            {
                // Unwind the user info array
                $unwind: '$userInfo'
            },
            {
                // Filter only salespersons and managers
                $match: {
                    'userInfo.role': { $in: ['salesperson', 'manager'] }
                }
            },
            {
                // Project the final shape
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
            {
                // Sort by total sales (highest first)
                $sort: { sales: -1 }
            },
            {
                // Limit to top 10 performers
                $limit: 10
            }
        ]);

        res.status(200).json({ 
            success: true, 
            count: performance.length,
            data: performance 
        });
    } catch (error) {
        console.error('Error fetching team performance:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get the attendance summary for the dashboard
// @route   GET /api/v1/dashboard/attendance-summary
// @access  Private (Admin, Manager)
exports.getAttendanceSummary = async (req, res) => {
    try {
        const { organizationId } = req.user;

        // --- MOCK DATA (Replace with real queries later) ---
        // These queries would count users and their attendance status
        // const teamStrength = await User.countDocuments({ organizationId, isActive: true });
        const summary = {
            teamStrength: 35,
            present: 28,
            absent: 4,
            onLeave: 3,
            attendanceRate: 80.0,
        };
        
        res.status(200).json({ success: true, data: summary });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get the sales trend data for the dashboard
// @route   GET /api/v1/dashboard/sales-trend
// @access  Private (Admin, Manager)
exports.getSalesTrend = async (req, res) => {
    try {
        const { organizationId } = req.user;
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // --- MOCK DATA (Replace with the real query below) ---
        const salesData = [
            { date: "2025-10-09", sales: 12000 }, { date: "2025-10-10", sales: 16000 },
            { date: "2025-10-11", sales: 11000 }, { date: "2025-10-12", sales: 19000 },
            { date: "2025-10-13", sales: 23000 }, { date: "2025-10-14", sales: 20000 },
            { date: "2025-10-15", sales: 14000 },
        ];

        /* --- REAL QUERY (Use this when you have an Order model) ---
        const salesData = await Order.aggregate([
            // 1. Filter orders for the correct organization and time frame
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            // 2. Group orders by the day they were created and sum the sales
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    totalSales: { $sum: "$amount" }
                }
            },
            // 3. Format the output
            {
                $project: {
                    _id: 0,
                    date: "$_id",
                    sales: "$totalSales"
                }
            },
            // 4. Sort by date
            { $sort: { date: 1 } }
        ]);
        */
        
        res.status(200).json({ success: true, data: salesData });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};