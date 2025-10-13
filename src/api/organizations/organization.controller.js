const Organization = require('./organization.model');
const User = require('../users/user.model');

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
exports.updateMyOrganization = async (req, res) => {
    try {
        const updatedOrganization = await Organization.findByIdAndUpdate(
            req.user.organizationId,
            req.body,
            { new: true, runValidators: true }
        );

        res.status(200).json({ status: 'success', data: updatedOrganization });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Deactivate an organization (for superadmin)
// @route   PUT /api/v1/organizations/:id/deactivate
// @access  Private (Superadmin)
exports.deactivateOrganization = async (req, res) => {
    try {
        const { id } = req.params;
        
        await User.updateMany({ organizationId: id }, { isActive: false });
        const organization = await Organization.findByIdAndUpdate(id, { isActive: false }, { new: true });

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.status(200).json({ status: 'success', message: 'Organization deactivated' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};