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
        // Prevent users from changing their organization or making themselves a superadmin
        delete req.body.organizationId;
        delete req.body.role;
        
        const user = await User.findOneAndUpdate(
            { _id: req.params.id, organizationId: req.user.organizationId },
            req.body,
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