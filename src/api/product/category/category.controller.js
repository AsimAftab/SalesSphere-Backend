const Category = require('./category.model');
const Product = require('../product.model');

// @desc    Get all categories for the organization
// @route   GET /api/v1/categories
// @access  Private (All authenticated users)
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

// @desc    Create new category
// @route   POST /api/v1/categories
// @access  Private (All authenticated users)
exports.createCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        // Check if category already exists
        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
            organizationId
        });

        if (existingCategory) {
            return res.status(400).json({ success: false, message: 'Category with this name already exists' });
        }

        const category = await Category.create({
            name: name.trim(),
            organizationId
        });

        return res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: category
        });
    } catch (error) {
        console.error('Error creating category:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update category
// @route   PUT /api/v1/categories/:id
// @access  Private (Admin only)
exports.updateCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        const category = await Category.findOne({ _id: id, organizationId });

        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Check if new name conflicts with existing category
        if (name.trim().toLowerCase() !== category.name.toLowerCase()) {
            const existingCategory = await Category.findOne({
                name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
                organizationId,
                _id: { $ne: id }
            });

            if (existingCategory) {
                return res.status(400).json({ success: false, message: 'Category with this name already exists' });
            }
        }

        category.name = name.trim();
        await category.save();

        return res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            data: category
        });
    } catch (error) {
        console.error('Error updating category:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete category
// @route   DELETE /api/v1/categories/:id
// @access  Private (Admin only)
exports.deleteCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const category = await Category.findOne({ _id: id, organizationId });

        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Check if category is being used by any product
        const productsUsingCategory = await Product.countDocuments({
            category: category.name,
            organizationId
        });

        if (productsUsingCategory > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category. It is being used by ${productsUsingCategory} product(s).`
            });
        }

        await Category.deleteOne({ _id: id });

        return res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting category:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};