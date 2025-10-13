const User = require('./user.model');

// Create a new user within an organization
exports.createUser = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        const newUser = await User.create({
            name, email, password, role,
            organizationId: req.user.organizationId,
        });
        newUser.password = undefined;
        res.status(201).json({ success: true, data: newUser });
    } catch (error) {
        next(error);
    }
};

// Get all users WITHIN the same organization
exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find({
            organizationId: req.user.organizationId,
            isActive: true
        });
        res.status(200).json({ success: true, count: users.length, data: users });
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
        // --- SECURITY FIX APPLIED HERE ---
        // 1. Whitelist fields that can be updated
        const allowedUpdates = ['name', 'email'];
        const updateData = {};

        // 2. Validate and safely copy data from req.body to updateData
        for (const field of allowedUpdates) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                const value = req.body[field];
                // Prevent NoSQL injection by ensuring values are simple strings
                if (typeof value !== 'string') {
                    return res.status(400).json({ success: false, message: `Invalid type for field: ${field}` });
                }
                updateData[field] = value;
            }
        }
        
        // 3. Implement smarter role update logic separately
        if (req.body.role) {
            // Prevent NoSQL injection by ensuring the role is a simple string
            if (typeof req.body.role !== 'string') {
                return res.status(400).json({ success: false, message: 'Invalid type for field: role' });
            }
            if (req.body.role === 'superadmin') {
                return res.status(403).json({ success: false, message: 'Cannot assign superadmin role.' });
            }
            if (req.user.id === req.params.id) {
                return res.status(403).json({ success: false, message: 'Users cannot change their own role.' });
            }
            // Add the role to the updateData only after it passes checks
            updateData.role = req.body.role;
        }

        const user = await User.findOneAndUpdate(
            { _id: req.params.id, organizationId: req.user.organizationId },
            updateData, // Use the sanitized updateData object
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