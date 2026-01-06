const Prospect = require('./prospect.model');
const ProspectCategory = require('./prospectCategory.model');
const Party = require('../parties/party.model.js'); // Corrected path
const User = require('../users/user.model.js'); // Corrected path
const Organization = require('../organizations/organization.model.js'); // Import Organization model
const { sendEmail } = require('../../utils/emailSender'); // <-- Assumed email utility
const crypto = require('crypto'); // <-- Added for random string generation
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary'); // Ensure this path matches your project structure
const fs = require('fs'); // Required for file cleanup

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
    // --- NEW: Prospect Interest Validation ---
    prospectInterest: z.array(z.object({
        category: z.string({ required_error: "Category is required" }).min(1, "Category is required"),
        brands: z.array(z.string()).min(1, "At least one brand is required")
    })).optional(),
    // --- END NEW ---
});

// --- Category Validation ---
const categorySchemaValidation = z.object({
    name: z.string({ required_error: "Category name is required" }).min(1, "Category name is required"),
    brands: z.array(z.string()).optional()
});

// --- HELPER FUNCTIONS ---

// Sync Prospect Interest Helper
const syncProspectInterest = async (interests, organizationId) => {
    if (!interests || interests.length === 0) return;

    for (const item of interests) {
        const categoryName = item.category.trim();
        const brands = item.brands || [];

        // Check if category exists
        let category = await ProspectCategory.findOne({
            name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
            organizationId: organizationId
        });

        if (category) {
            // Update: Add new unique brands
            if (brands.length > 0) {
                const newBrands = brands.filter(b =>
                    !category.brands.some(existing => existing.toLowerCase() === b.toLowerCase())
                );
                if (newBrands.length > 0) {
                    category.brands.push(...newBrands);
                    await category.save();
                }
            }
        } else {
            // Create: New category with brands
            await ProspectCategory.create({
                name: categoryName,
                brands: brands,
                organizationId: organizationId
            });
        }
    }
};

// @desc    Create a new prospect
exports.createProspect = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Validate request body
        const validatedData = prospectSchemaValidation.parse(req.body);

        // --- Sync Prospect Interest ---
        if (validatedData.prospectInterest) {
            await syncProspectInterest(validatedData.prospectInterest, organizationId);
        }
        // -----------------------------

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
            .select('_id prospectName ownerName location.address prospectInterest createdBy')
            .populate('createdBy', 'name')
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
                '_id prospectName ownerName panVatNumber dateJoined description prospectInterest organizationId createdBy contact location images createdAt updatedAt' // <-- FIXED
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

        // --- NEW: Sync Categories & Brands ---
        if (validatedData.prospectInterest) {
            await syncProspectInterest(validatedData.prospectInterest, organizationId);
        }
        // --- END ---

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

        // 5. Send email notification to Admins
        try {
            const admins = await User.find({
                organizationId: organizationId,
                role: 'admin'
            });

            if (admins.length > 0) {
                const emailList = admins.map(user => user.email);
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

const cleanupTempFile = (filePath) => {
    if (filePath) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error removing temp file ${filePath}:`, err);
        });
    }
};

// @desc    Upload or update a prospect image
exports.uploadProspectImage = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;
        const { imageNumber } = req.body;

        // Validate image file
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image file' });
        }

        // Validate imageNumber (Limit: 5 for prospects)
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 5) {
            cleanupTempFile(tempFilePath);
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be between 1 and 5'
            });
        }

        // Check if prospect exists and belongs to organization
        const prospect = await Prospect.findOne({ _id: id, organizationId });
        if (!prospect) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Prospect not found' });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Sanitize names for folder path
        // const sanitize = (name) => name.trim().replace(/\s+/g, '-').toLowerCase(); 
        // Using raw names to match party.controller.js behavior for consistency
        const orgName = organization.name;
        const prospectName = prospect.prospectName;

        const folderPath = `sales-sphere/${orgName}/prospectImage/${prospectName}/${id}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: `${id}_image_${imageNum}`,
            overwrite: true,
            transformation: [
                { width: 1200, height: 800, crop: "limit" },
                { fetch_format: "auto", quality: "auto" }
            ]
        });

        cleanupTempFile(tempFilePath);
        tempFilePath = null;

        // Initialize images array if it doesn't exist
        if (!prospect.images) {
            prospect.images = [];
        }

        // Check if image with this number already exists
        const existingImageIndex = prospect.images.findIndex(img => img.imageNumber === imageNum);

        if (existingImageIndex !== -1) {
            // Update existing image
            prospect.images[existingImageIndex].imageUrl = result.secure_url;
        } else {
            // Add new image
            prospect.images.push({
                imageNumber: imageNum,
                imageUrl: result.secure_url
            });
        }

        await prospect.save();

        return res.status(200).json({
            success: true,
            message: existingImageIndex !== -1 ? 'Image updated successfully' : 'Image uploaded successfully',
            data: {
                imageNumber: imageNum,
                imageUrl: result.secure_url
            }
        });
    } catch (error) {
        cleanupTempFile(tempFilePath);
        console.error('Error uploading prospect image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a prospect image
exports.deleteProspectImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id, imageNumber } = req.params;

        // Validate imageNumber (Limit: 5)
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 5) {
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be between 1 and 5'
            });
        }

        // Check if prospect exists and belongs to organization
        const prospect = await Prospect.findOne({ _id: id, organizationId });
        if (!prospect) {
            return res.status(404).json({ success: false, message: 'Prospect not found' });
        }

        // Find and remove the image
        // Ensure images array exists
        if (!prospect.images) {
            return res.status(404).json({ success: false, message: `Image ${imageNum} not found` });
        }

        const imageIndex = prospect.images.findIndex(img => img.imageNumber === imageNum);
        if (imageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: `Image ${imageNum} not found`
            });
        }

        // Fetch Organization for folder path construction
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Sanitize names for folder path
        // const sanitize = (name) => name.trim().replace(/\s+/g, '-').toLowerCase();
        // Using raw names to match party.controller.js behavior for consistency
        const orgName = organization.name;
        const prospectName = prospect.prospectName;
        const folderPath = `sales-sphere/${orgName}/prospectImage/${prospectName}/${id}`;

        // Remove from array
        prospect.images.splice(imageIndex, 1);
        await prospect.save();

        // Optionally delete from Cloudinary
        try {
            await cloudinary.uploader.destroy(`${folderPath}/${id}_image_${imageNum}`);
        } catch (cloudinaryError) {
            console.error('Error deleting from Cloudinary:', cloudinaryError);
            // Continue even if Cloudinary delete fails
        }

        return res.status(200).json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting prospect image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};



// @desc    Get all Prospect Categories
// @route   GET /api/v1/prospects/categories
// @access  Authenticated Users
exports.getProspectCategories = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const categories = await ProspectCategory.find({ organizationId: organizationId })
            .sort({ name: 1 })
            .lean();

        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        next(error);
    }
};

