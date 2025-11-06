const Category = require('./category.model');

// @desc    Get all categories for the organization
// @route   GET /api/v1/categories
// @access  Private (All roles)
exports.getAllCategories = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const categories = await Category.find({ organizationId })
            .sort({ name: 1 }); // Sort alphabetically

        return res.status(200).json({
            success: true,
            count: categories.length,
            data: categories,
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Note: A createCategory function isn't strictly needed here,
// as we will build the "find or create" logic directly into the 
// product controller for a better user experience.