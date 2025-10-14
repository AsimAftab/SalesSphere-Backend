const User = require('../users/user.model');
// You will need to import your other models here as you create them
// const Order = require('../orders/order.model'); 
// const Party = require('../parties/party.model');

// @desc    Get the main KPI stats for the dashboard
// @route   GET /api/v1/dashboard/stats
// @access  Private (Admin, Manager)
exports.getDashboardStats = async (req, res) => {
    try {
        const { organizationId } = req.user;
// TODO: Use organizationId to filter data for multi-tenant support
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // --- MOCK DATA (Replace with real queries later) ---
        // As you build out your Order and Party models, you will replace this
        // mock data with real aggregation queries to your database.
        
        // Example query for total parties:
        // const totalParties = await Party.countDocuments({ organizationId });
        const totalParties = 847; 

        // Example query for today's sales:
        // const salesResult = await Order.aggregate([...]);
        const totalSales = 125000;

        // Example query for today's orders:
        // const totalOrders = await Order.countDocuments({ organizationId, createdAt: { $gte: today } });
        const totalOrders = 342;

        // Example query for pending orders:
        // const pendingOrders = await Order.countDocuments({ organizationId, status: 'pending' });
        const pendingOrders = 89;
        
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
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get the team performance stats for the dashboard
// @route   GET /api/v1/dashboard/team-performance
// @access  Private (Admin, Manager)
exports.getTeamPerformance = async (req, res) => {
    try {
        const { organizationId } = req.user;

        // --- MOCK DATA (Replace with real queries later) ---
        // This query would aggregate orders by user to find top performers
        // const performance = await Order.aggregate([...]);
        const performance = [
            { name: "Priya Sharma", sales: 31200, orders: 52 },
            { name: "Rajesh Kumar", sales: 28500, orders: 45 },
            { name: "Amit Singh", sales: 24800, orders: 38 },
        ];
        
        res.status(200).json({ success: true, data: performance });
    } catch (error) {
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