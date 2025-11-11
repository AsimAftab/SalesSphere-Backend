const Invoice = require('../invoice/invoice.model');

// @desc    Get monthly analytics overview
// @route   GET /api/v1/analytics/monthly-overview?month=11&year=2025
// @access  Private (Admin, Manager)
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

        // Calculate date range for the selected month
        const monthInt = parseInt(month);
        const yearInt = parseInt(year);
        
        const monthStart = new Date(yearInt, monthInt - 1, 1);
        const monthEnd = new Date(yearInt, monthInt, 1);

        // Total Order Value for the month (excluding rejected)
        const totalOrderValueResult = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalValue: { $sum: '$totalAmount' }
                }
            }
        ]);
        const totalOrderValue = totalOrderValueResult.length > 0 ? totalOrderValueResult[0].totalValue : 0;

        // Total Orders count for the month (excluding rejected)
        const totalOrders = await Invoice.countDocuments({
            organizationId,
            createdAt: { $gte: monthStart, $lt: monthEnd },
            status: { $ne: 'rejected' }
        });

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
// @access  Private (Admin, Manager)
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
        
        const monthStart = new Date(yearInt, monthInt - 1, 1);
        const monthEnd = new Date(yearInt, monthInt, 1);

        // Get sales data aggregated by week
        const salesData = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' }
                }
            },
            {
                $group: {
                    _id: { $week: '$createdAt' },
                    weekStart: { $min: '$createdAt' },
                    totalSales: { $sum: '$totalAmount' }
                }
            },
            {
                $sort: { weekStart: 1 }
            },
            {
                $project: {
                    _id: 0,
                    week: '$_id',
                    weekStart: 1,
                    totalSales: 1
                }
            }
        ]);

        // Create week labels (Week 1, Week 2, etc.)
        const formattedData = salesData.map((item, index) => ({
            week: `Week ${index + 1}`,
            sales: item.totalSales
        }));

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
// @access  Private (Admin, Manager)
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
        
        const monthStart = new Date(yearInt, monthInt - 1, 1);
        const monthEnd = new Date(yearInt, monthInt, 1);

        // Aggregate products sold by category
        const categoryData = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' }
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
// @access  Private (Admin, Manager)
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
        
        const monthStart = new Date(yearInt, monthInt - 1, 1);
        const monthEnd = new Date(yearInt, monthInt, 1);

        // Aggregate top products sold
        const topProducts = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' }
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
// @access  Private (Admin, Manager)
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
        
        const monthStart = new Date(yearInt, monthInt - 1, 1);
        const monthEnd = new Date(yearInt, monthInt, 1);

        // Aggregate top parties by total order value
        const topParties = await Invoice.aggregate([
            {
                $match: {
                    organizationId: organizationId,
                    createdAt: { $gte: monthStart, $lt: monthEnd },
                    status: { $ne: 'rejected' }
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
