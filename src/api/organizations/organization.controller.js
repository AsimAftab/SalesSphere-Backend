const Organization = require('./organization.model');
const User = require('../users/user.model');
const mongoose = require('mongoose');

// @desc    Get the details of the currently logged-in user's organization
// @route   GET /api/v1/organizations/my-organization
// @access  Private (Admin, Manager)
exports.getMyOrganization = async (req, res) => {
    try {
        const organization = await Organization.findOne({ 
            _id: req.user.organizationId, 
            isActive: true 
        });

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.status(200).json({ status: 'success', data: organization });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update the details of the currently logged-in user's organization
// @route   PUT /api/v1/organizations/my-organization
// @access  Private (Admin, Manager)
// Update the details of the currently logged-in user's organization
exports.updateMyOrganization = async (req, res) => {
    try {
        // Only superadmin and developer can update organization
        if (req.user.role !== 'superadmin' && req.user.role !== 'developer') {
            return res.status(403).json({
                success: false,
                message: 'Only superadmin and developer can update organization details'
            });
        }

        const organizationId = req.params.id;

        // 1. Whitelist fields that are allowed to be updated
        const allowedUpdates = {
            name: req.body.name,
            phone: req.body.phone,
            address: req.body.address,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            googleMapLink: req.body.googleMapLink,
            checkInTime: req.body.checkInTime,
            checkOutTime: req.body.checkOutTime,
            halfDayCheckOutTime: req.body.halfDayCheckOutTime,
            weeklyOffDay: req.body.weeklyOffDay,
            timezone: req.body.timezone,
        };

        // 2. Create a new object with only the defined properties
        const updateData = Object.fromEntries(
            Object.entries(allowedUpdates).filter(([_, value]) => value !== undefined)
        );

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields provided for update'
            });
        }

        // 3. Update the organization using only the safe, defined fields
        const updatedOrganization = await Organization.findByIdAndUpdate(
            organizationId,
            updateData, // Use the clean object
            { new: true, runValidators: true }
        );

        if (!updatedOrganization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        res.status(200).json({
            success: true,
            data: updatedOrganization
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
// @desc    Deactivate an organization (for superadmin)
// @route   PUT /api/v1/organizations/:id/deactivate
// @access  Private (Superadmin)
exports.deactivateOrganization = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        const organization = await Organization.findById(id).session(session);
        if (!organization) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Perform both updates within the transaction
        await User.updateMany({ organizationId: id }, { isActive: false }, { session });
        await Organization.findByIdAndUpdate(id, { isActive: false }, { session });

        // If both are successful, commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ status: 'success', message: 'Organization deactivated successfully' });
    } catch (error) {
        // If any error occurs, abort the transaction
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Reactivate an organization (for superadmin)
// @route   PUT /api/v1/organizations/:id/reactivate
// @access  Private (Superadmin)
exports.reactivateOrganization = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        const organization = await Organization.findById(id).session(session);
        if (!organization) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Perform both updates within the transaction
        await User.updateMany({ organizationId: id }, { isActive: true }, { session });
        await Organization.findByIdAndUpdate(id, { isActive: true }, { session });

        // If both are successful, commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ status: 'success', message: 'Organization reactivated successfully' });
    } catch (error) {
        // If any error occurs, abort the transaction
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get organization details by ID (for superadmin)
// @route   GET /api/v1/organizations/:id
// @access  Private (Superadmin)
exports.getOrganizationById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid organization ID'
            });
        }

        const organization = await Organization.findById(id).populate('owner', 'name email phone role');

        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        res.status(200).json({
            success: true,
            data: organization
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};