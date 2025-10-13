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
// Update the details of the currently logged-in user's organization
exports.updateMyOrganization = async (req, res) => {
    try {
        // 1. Whitelist fields that are allowed to be updated
        const allowedUpdates = {
            name: req.body.name,
            // Add other safe fields here in the future
        };

        // 2. Create a new object with only the defined properties
        const updateData = Object.fromEntries(
            Object.entries(allowedUpdates).filter(([_, value]) => value !== undefined)
        );

        // 3. Update the organization using only the safe, defined fields
        const updatedOrganization = await Organization.findByIdAndUpdate(
            req.user.organizationId,
            updateData, // Use the clean object
            { new: true, runValidators: true }
        );

        if (!updatedOrganization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.status(200).json({ status: 'success', data: updatedOrganization });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
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