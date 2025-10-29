const Party = require('./party.model');

// @desc    Create a new party (for the app)
// @route   POST /api/v1/parties
// @access  Private (Admin, Manager, Salesperson)
exports.createParty = async (req, res) => {
    try {
        // This guard ensures req.user exists before you try to use it.
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId, _id: userId } = req.user;
        const { name, location, imageUrl, ownerName, panVat, contact } = req.body;

        // Check if party with this PAN/VAT already exists in the org
        const existingParty = await Party.findOne({ panVat, organizationId });
        if (existingParty) {
            return res.status(400).json({ success: false, message: 'A party with this PAN/VAT number already exists.' });
        }

        const newParty = await Party.create({
            name,
            location,
            imageUrl,
            ownerName,
            panVat,
            contact,
            organizationId: organizationId,
            createdBy: userId,
        });

        res.status(201).json({ success: true, data: newParty });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get all parties (for the main list page)
// @route   GET /api/v1/parties
// @access  Private (All roles)
exports.getAllParties = async (req, res) => {
    try {
        // This guard ensures req.user exists before you try to use it.
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId } = req.user;

        // Find only active parties for the user's organization
        // IMPORTANT: Only select the fields you requested for the list page
        const parties = await Party.find({
            organizationId: organizationId,
            isActive: true
        })
        .select('name imageUrl contact.address'); // <-- This optimization is key

        res.status(200).json({ success: true, count: parties.length, data: parties });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get a single party by ID (for the detail page)
// @route   GET /api/v1/parties/:id
// @access  Private (All roles)
exports.getPartyById = async (req, res) => {
    try {
        // This guard ensures req.user exists before you try to use it.
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId } = req.user;

        // Find the party by its ID and the user's organization
        const party = await Party.findOne({
            _id: req.params.id,
            organizationId: organizationId
        });

        if (!party) {
            return res.status(404).json({ success: false, message: 'Party not found' });
        }

        // Return the FULL party object
        res.status(200).json({ success: true, data: party });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update a party (for the app)
// @route   PUT /api/v1/parties/:id
// @access  Private (Admin, Manager, Salesperson)
exports.updateParty = async (req, res) => {
    try {
        // This guard ensures req.user exists before you try to use it.
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId } = req.user;

        // Whitelist fields that are allowed to be updated
        const allowedUpdates = ['name', 'location', 'imageUrl', 'ownerName', 'panVat', 'contact'];
        const updateData = {};

        for (const field of allowedUpdates) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                updateData[field] = req.body[field];
            }
        }

        const party = await Party.findOneAndUpdate(
            {
                _id: req.params.id,
                organizationId: organizationId, // Ensure it's in their org
            },
            updateData,
            { new: true, runValidators: true }
        );

        if (!party) {
            return res.status(404).json({ success: false, message: 'Party not found' });
        }

        res.status(200).json({ success: true, data: party });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Delete a party permanently (hard delete)
// @route   DELETE /api/v1/parties/:id
// @access  Private (Admin, Manager, Salesperson)
exports.deleteParty = async (req, res) => {
    try {
        // This guard ensures req.user exists before you try to use it.
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId } = req.user;

        // Find the party by its ID and org, and permanently delete it
        const party = await Party.findOneAndDelete({
            _id: req.params.id,
            organizationId: organizationId
        });

        if (!party) {
            // --- FIX: Corrected 4F4 to 404 ---
            return res.status(404).json({ success: false, message: 'Party not found' });
        }

        res.status(200).json({ success: true, message: 'Party deleted permanently' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};


