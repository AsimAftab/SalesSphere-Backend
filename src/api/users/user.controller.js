const User = require('./user.model');

// Get all users WITHIN the same organization
exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find({ 
            organizationId: req.user.organizationId, 
            isActive: true 
        });
        
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        next(error);
    }
};

// Get a single user BY ID, ensuring they are in the same organization
exports.getUserById = async (req, res, next) => {
    try {
        const user = await User.findOne({ 
            _id: req.params.id, 
            organizationId: req.user.organizationId,
            isActive: true
        });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

// Update a user, ensuring they are in the same organization
exports.updateUser = async (req, res, next) => {
    try {
        // 1. Prevent users from changing their organizationId
        delete req.body.organizationId;

        // 2. Implement smarter role update logic
        if (req.body.role) {
            // Prevent anyone from assigning the 'superadmin' role
            if (req.body.role === 'superadmin') {
                return res.status(403).json({ success: false, message: 'Cannot assign superadmin role.' });
            }
            // Prevent users from changing their own role
            if (req.user.id === req.params.id) {
                return res.status(403).json({ success: false, message: 'Users cannot change their own role.' });
            }
        }
        
        // Limit updates to specific allowed fields
        const allowedFields = ['name', 'email', 'role', 'isActive', 'phone'];
        const updateData = {};
        for (const field of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                updateData[field] = req.body[field];
            }
        }
        // Disallow any update operator injection
        for (const key of Object.keys(req.body)) {
            if (key.startsWith('$')) {
                return res.status(400).json({ success: false, message: 'Invalid update parameter.' });
            }
        }
        const user = await User.findOneAndUpdate(
            { _id: req.params.id, organizationId: req.user.organizationId },
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};
// Soft delete a user (deactivate)
exports.deleteUser = async (req, res, next) => {
    try {
        const user = await User.findOneAndUpdate(
            { _id: req.params.id, organizationId: req.user.organizationId },
            { isActive: false },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.status(200).json({ success: true, message: 'User deactivated successfully' });
    } catch (error) {
        next(error);
    }
};