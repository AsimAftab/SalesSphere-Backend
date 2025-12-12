const Prospect = require('./prospect.model');
const Party = require('../parties/party.model.js'); // Corrected path
const User = require('../users/user.model.js'); // Corrected path
const { sendEmail } = require('../../utils/emailSender'); // <-- Assumed email utility
const crypto = require('crypto'); // <-- Added for random string generation
const { z } = require('zod');

// --- Zod Validation Schema ---
const prospectSchemaValidation = z.object({
    prospectName: z.string({ required_error: "Prospect name is required" }).min(1, "Prospect name is required"), // <-- FIXED: Matched to your model
    ownerName: z.string({ required_error: "Owner name is required" }).min(1, "Owner name is required"),
    dateJoined: z.string({ required_error: "Date joined is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    panVatNumber: z.string().max(14).optional().or(z.literal('')), // <-- Made optional
    contact: z.object({
        phone: z.string({ required_error: "Phone number is required" }).min(1, "Phone number is required"),
        email: z.string().email("Invalid email address").optional().or(z.literal('')),
    }),
    location: z.object({
        address: z.string({ required_error: "Address is required" }).min(1, "Address is required"),
        latitude: z.number({ required_error: "Latitude is required" }),
        longitude: z.number({ required_error: "Longitude is required" }),
    }),
    description: z.string().optional(),
});

// @desc    Create a new prospect
exports.createProspect = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Validate request body
        const validatedData = prospectSchemaValidation.parse(req.body); // <-- Now validates prospectName

        // --- No duplicate check needed for prospects ---

        const newProspect = await Prospect.create({
            ...validatedData,
            dateJoined: new Date(validatedData.dateJoined),
            organizationId: organizationId,
            createdBy: userId,
        });

        res.status(201).json({ success: true, data: newProspect });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        console.error("Unexpected error in createProspect:", error);
        next(error);
    }
};

// @desc    Get all prospects
exports.getAllProspects = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const prospects = await Prospect.find({ organizationId: organizationId })
            .select('_id prospectName ownerName location.address') // <-- FIXED: Matched to your model
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, count: prospects.length, data: prospects });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all prospects for logged-in user's organization
// @route   GET /api/prospects/details
// @access  Private
exports.getAllProspectsDetails = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const { organizationId } = req.user;

        // Fetch all prospects belonging to the organization
        const prospects = await Prospect.find({ organizationId })
            .sort({ createdAt: -1 })
            .lean(); // Optional: returns plain JSON, faster

        return res.status(200).json({
            success: true,
            count: prospects.length,
            data: prospects
        });

    } catch (error) {
        next(error);
    }
};


// @desc    Get a single prospect by ID
exports.getProspectById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const prospect = await Prospect.findOne({
            _id: req.params.id,
            organizationId: organizationId
        })
            .select(
                '_id prospectName ownerName panVatNumber dateJoined description organizationId createdBy contact location createdAt updatedAt' // <-- FIXED
            )
            .lean();

        if (!prospect) {
            return res.status(404).json({ success: false, message: 'Prospect not found' });
        }
        res.status(200).json({ success: true, data: prospect });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a prospect
exports.updateProspect = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const validatedData = prospectSchemaValidation.partial().parse(req.body); // <-- Now validates prospectName

        if (validatedData.dateJoined) {
            validatedData.dateJoined = new Date(validatedData.dateJoined);
        }

        const prospect = await Prospect.findOneAndUpdate(
            { _id: req.params.id, organizationId: organizationId },
            validatedData,
            { new: true, runValidators: true }
        );

        if (!prospect) {
            return res.status(404).json({ success: false, message: 'Prospect not found' });
        }
        res.status(200).json({ success: true, data: prospect });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ success: false, errors: error.flatten().fieldErrors });
        next(error);
    }
};


// @desc    Permanently delete a prospect
exports.deleteProspect = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const prospect = await Prospect.findOneAndDelete({
            _id: req.params.id,
            organizationId: organizationId
        });

        if (!prospect) {
            return res.status(404).json({ success: false, message: 'Prospect not found' });
        }

        res.status(200).json({ success: true, message: 'Prospect deleted permanently' });
    } catch (error) {
        next(error);
    }
};

// @desc    Transfer a prospect to a party
// @route   POST /api/v1/prospects/:id/transfer
// @access  Private (Admin, Manager, Salesperson)
exports.transferToParty = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const prospectId = req.params.id;

        // 1. Generate a unique temporary PAN/VAT number
        let panVatNumber;
        let isUnique = false;
        while (!isUnique) {
            panVatNumber = "TEMP-" + crypto.randomBytes(5).toString('hex').substring(0, 9);

            const existingParty = await Party.findOne({
                panVatNumber: panVatNumber,
                organizationId: organizationId
            });
            if (!existingParty) {
                isUnique = true;
            }
        }
        // Now we have a unique panVatNumber

        // 2. Find the prospect to be transferred
        const prospect = await Prospect.findOne({
            _id: prospectId,
            organizationId: organizationId
        }).lean(); // .lean() gives us a plain JS object

        if (!prospect) {
            return res.status(404).json({ success: false, message: 'Prospect not found' });
        }

        // --- FIXED VALIDATION ---
        // Check if the prospect has a prospectName.
        if (!prospect.prospectName) { // <-- FIXED: Matched to your model
            return res.status(400).json({
                success: false,
                message: 'Cannot transfer prospect: Prospect is missing a name. Please update the prospect with a name before transferring.'
            });
        }
        // --- END FIXED VALIDATION ---


        // 3. Create the new party
        const partyData = { ...prospect };

        // --- FIXED: Rename prospectName to partyName for the new Party ---
        partyData.partyName = prospect.prospectName;
        delete partyData.prospectName;
        // --- END FIX ---

        delete partyData._id;
        delete partyData.__v;
        delete partyData.createdAt;
        delete partyData.updatedAt;

        // Add the new, generated panVatNumber
        partyData.panVatNumber = panVatNumber;

        // Set the dateJoined to the current date of transfer
        partyData.dateJoined = new Date();

        const newParty = await Party.create(partyData); // newParty will have partyName

        // 4. Delete the original prospect
        await Prospect.findByIdAndDelete(prospectId);

        // 5. Send email notification to Admins and Managers
        try {
            const adminsAndManagers = await User.find({
                organizationId: organizationId,
                role: { $in: ['admin', 'manager'] }
            });

            if (adminsAndManagers.length > 0) {
                const emailList = adminsAndManagers.map(user => user.email);
                const subject = `Action Required: Please Update PAN/VAT for ${newParty.partyName}`; // This is correct
                const message = `
<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6; padding: 20px;">
  <div style="max-width: 600px; margin: auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 24px;">
    
    <h2 style="color: #2563eb; margin-top: 0;">
      New Party Created in <span style="color: #1e3a8a;">SalesSphere</span>
    </h2>

    <p>Hello,</p>

    <p>
      A new party, <strong style="color: #2563eb;">${newParty.partyName}</strong> 
      (Owner: <strong>${newParty.ownerName}</strong>), was just created by 
      <strong>${req.user.name}</strong> (<em>${req.user.role}</em>) by transferring a prospect.
    </p>

    <p style="margin: 16px 0;">
      It was assigned a temporary PAN/VAT number:
    </p>

    <div style="background: #f3f4f6; padding: 12px 16px; border-radius: 8px; display: inline-block;">
      <p style="margin: 0; font-size: 15px;">
        <strong>PAN/VAT Number:</strong> 
        <span style="color: #2563eb;">${newParty.panVatNumber}</span>
      </p>
    </div>

    <p style="margin-top: 20px;">
      Please log in to the system at your earliest convenience to update this party 
      with the correct official PAN/VAT number.
    </p>

    <p style="margin-top: 24px;">
      Thank you,<br>
      <strong>The SalesSphere System</strong>
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="font-size: 12px; color: #6b7280; text-align: center;">
      This is an automated email — please do not reply.
    </p>

  </div>
</div>
`;


                await sendEmail({
                    emails: emailList,
                    subject: subject,
                    html: message
                });
            }
        } catch (emailError) {
            // Log the email error, but don't fail the entire transaction
            console.error("Email notification failed:", emailError);
        }

        // 6. Send the successful response
        res.status(201).json({
            success: true,
            message: 'Prospect transferred to party successfully. Admins have been notified to update the PAN/VAT number.',
            data: newParty // Send back the newly created party
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Validation failed for new party', errors: error.errors });
        }
        if (error.code === 11000) {
            return res.status(500).json({ success: false, message: 'A temporary PAN/VAT number collision occurred. Please try again.' });
        }
        console.error("Error in transferToParty:", error);
        next(error);
    }
};

