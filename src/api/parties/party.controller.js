const Party = require('./party.model');
const { z } = require('zod');

// --- Zod Validation Schema ---
const partySchemaValidation = z.object({
    partyName: z.string({ required_error: "Party name is required" }).min(1, "Party name is required"),
    ownerName: z.string({ required_error: "Owner name is required" }).min(1, "Owner name is required"),
    dateJoined: z.string({ required_error: "Date joined is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    panVatNumber: z.string({ required_error: "PAN/VAT number is required" }).min(1, "PAN/VAT number is required").max(14),
    contact: z.object({
        phone: z.string({ required_error: "Phone number is required" }).min(1, "Phone number is required"),
        email: z.string().email("Invalid email address").optional().or(z.literal('')), // Allow empty string or valid email
    }),
    location: z.object({
        address: z.string({ required_error: "Address is required" }).min(1, "Address is required"),
        latitude: z.number({ required_error: "Latitude is required" }),
        longitude: z.number({ required_error: "Longitude is required" }),
    }),
    description: z.string().optional(),
});

// @desc    Create a new party
exports.createParty = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Validate request body
        const validatedData = partySchemaValidation.parse(req.body);

        // Check for existing active party
        const existingParty = await Party.findOne({
            panVatNumber: validatedData.panVatNumber,
            organizationId,
        });
        if (existingParty) {
            return res.status(400).json({ success: false, message: 'A party with this PAN/VAT number already exists.' });
        }

        const newParty = await Party.create({
            ...validatedData,
            dateJoined: new Date(validatedData.dateJoined),
            organizationId: organizationId,
            createdBy: userId,
        });

        res.status(201).json({ success: true, data: newParty });
    } catch (error) {
        // --- Improved Error Handling ---
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors }); // Send detailed Zod errors
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'A party with this PAN/VAT number likely already exists.' });
        }
        console.error("Unexpected error in createParty:", error); // Keep one log for unexpected errors
        next(error); // Pass other errors to a central handler
    }
};
// @desc    Get all parties (no longer filters by isActive)
exports.getAllParties = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const parties = await Party.find({ organizationId: organizationId })
            .select('_id partyName ownerName location.address') // Re-ordered for clarity
            .sort({ createdAt: -1 })
            .lean(); // <-- ADD .LEAN() TO RETURN PLAIN JAVASCRIPT OBJECTS

        res.status(200).json({ success: true, count: parties.length, data: parties });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single party by ID (no longer filters by isActive)
exports.getPartyById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const party = await Party.findOne({
            _id: req.params.id,
            organizationId: organizationId
        })
        .select(
            '_id partyName ownerName panVatNumber dateJoined description organizationId createdBy contact location createdAt updatedAt'
        ) // Explicitly setting field order
        .lean(); // <-- ADD .LEAN() TO RETURN A PLAIN JAVASCRIPT OBJECT

        if (!party) {
            return res.status(404).json({ success: false, message: 'Party not found' }); // Message simplified
        }
        res.status(200).json({ success: true, data: party });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a party
exports.updateParty = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const validatedData = partySchemaValidation.partial().parse(req.body);

        if (validatedData.dateJoined) {
            validatedData.dateJoined = new Date(validatedData.dateJoined);
        }

        const party = await Party.findOneAndUpdate(
            { _id: req.params.id, organizationId: organizationId },
            validatedData,
            { new: true, runValidators: true } // Mongoose validation will still run
        );

        if (!party) {
            return res.status(404).json({ success: false, message: 'Party not found' });
        }
        res.status(200).json({ success: true, data: party });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ success: false, errors: error.flatten().fieldErrors });
        // Handle potential unique index violation on update if panVatNumber is changed
        if (error.code === 11000) return res.status(400).json({ success: false, message: 'Another party with this PAN/VAT number already exists.' });
        next(error);
    }
};


// --- MODIFIED: Hard Delete ---
// @desc    Permanently delete a party
// @route   DELETE /api/v1/parties/:id
// @access  Private (Admin, Manager)
exports.deleteParty = async (req, res, next) => { // Renamed function
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // Use findOneAndDelete for hard delete
        const party = await Party.findOneAndDelete({
            _id: req.params.id,
            organizationId: organizationId
        });

        if (!party) {
            return res.status(404).json({ success: false, message: 'Party not found' });
        }

        res.status(200).json({ success: true, message: 'Party deleted permanently' }); // Updated message
    } catch (error) {
        next(error);
    }
};
// --- END MODIFICATION ---

