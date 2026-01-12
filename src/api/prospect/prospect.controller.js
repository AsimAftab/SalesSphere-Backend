const Prospect = require('./prospect.model');
const ProspectCategory = require('./prospectCategory.model');
const Party = require('../parties/party.model.js'); // Corrected path
const User = require('../users/user.model.js'); // Corrected path
const Organization = require('../organizations/organization.model.js'); // Import Organization model
const { sendEmail } = require('../../utils/emailSender'); // <-- Assumed email utility
const crypto = require('crypto'); // <-- Added for random string generation
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary'); // Ensure this path matches your project structure
const fs = require('fs').promises; // Required for file cleanup
const { getHierarchyFilter, getEntityAccessFilter } = require('../../utils/hierarchyHelper');
// const { isValidFeature } = require('../../config/featureRegistry'); // Removed unused import

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
// Sync Prospect Interest Helper
const syncProspectInterest = async (interests, organizationId, user) => {
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
            // Create: New category with brands (all authenticated users can create)
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
            try {
                await syncProspectInterest(validatedData.prospectInterest, organizationId, req.user);
            } catch (err) {
                return res.status(403).json({ success: false, message: err.message });
            }
        }
        // -----------------------------

        const newProspect = await Prospect.create({
            ...validatedData,
            dateJoined: new Date(validatedData.dateJoined),
            organizationId: organizationId,
            createdBy: userId,
            // Auto-assign creator to the prospect
            assignedUsers: [userId],
            assignedBy: userId,
            assignedAt: new Date(),
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

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'prospects',
            'viewAllProspects'
        );
        const query = { organizationId: organizationId, ...accessFilter };

        const prospects = await Prospect.find(query)
            .select('_id prospectName ownerName location.address prospectInterest createdBy') // Already explicit select, but confirm images are excluded
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

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'prospects',
            'viewAllProspects'
        );
        const query = { organizationId, ...accessFilter };

        // Fetch all prospects belonging to the organization
        const prospects = await Prospect.find(query)
            .select('-images') // Exclude images
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

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'prospects',
            'viewTeamProspects',
            'viewAllProspects'
        );

        // Combine ID check with access filter
        const query = {
            _id: req.params.id,
            organizationId: organizationId,
            ...accessFilter
        };

        const prospect = await Prospect.findOne(query)
            .select(
                '_id prospectName ownerName panVatNumber dateJoined description prospectInterest organizationId createdBy contact location createdAt updatedAt' // Removed images field
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

// @desc    Get prospect images
// @route   GET /api/v1/prospects/:id/images
// @access  Private (Requires manageImages permission)
exports.getProspectImages = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'prospects',
            'viewTeamProspects',
            'viewAllProspects'
        );

        // Combine ID check with access filter
        const query = {
            _id: id,
            organizationId: organizationId,
            ...accessFilter
        };

        const prospect = await Prospect.findOne(query).select('images');

        if (!prospect) {
            return res.status(404).json({ success: false, message: 'Prospect not found or access denied' });
        }

        return res.status(200).json({
            success: true,
            count: prospect.images.length,
            data: prospect.images,
        });
    } catch (error) {
        console.error('Error fetching prospect images:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
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
            try {
                await syncProspectInterest(validatedData.prospectInterest, organizationId, req.user);
            } catch (err) {
                return res.status(403).json({ success: false, message: err.message });
            }
        }
        // --- END ---

        // Check if user has permission to access this prospect based on hierarchy
        const hierarchyFilter = await getHierarchyFilter(req.user, 'prospects', 'viewTeamProspects');
        const query = { _id: req.params.id, organizationId: organizationId, ...hierarchyFilter };

        const prospect = await Prospect.findOneAndUpdate(
            query,
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

        // Check if user has permission to access this prospect based on hierarchy
        const hierarchyFilter = await getHierarchyFilter(req.user, 'prospects', 'viewTeamProspects');
        const query = { _id: req.params.id, organizationId: organizationId, ...hierarchyFilter };

        const prospect = await Prospect.findOneAndDelete(query);

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

const cleanupTempFile = async (filePath) => {
    if (filePath) {
        try {
            await fs.unlink(filePath);
        } catch (err) {
            // Ignore ENOENT (file already deleted)
            if (err.code !== 'ENOENT') {
                console.error(`Error removing temp file ${filePath}:`, err);
            }
        }
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
            await cleanupTempFile(tempFilePath);
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be between 1 and 5'
            });
        }

        // Check if prospect exists and belongs to organization
        const prospect = await Prospect.findOne({ _id: id, organizationId });
        if (!prospect) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Prospect not found' });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            await cleanupTempFile(tempFilePath);
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

        await cleanupTempFile(tempFilePath);
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
        await cleanupTempFile(tempFilePath);
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

        // Extract public_id robustly from the stored image URL
        const imageUrl = prospect.images[imageIndex].imageUrl;

        // Remove from array
        prospect.images.splice(imageIndex, 1);
        await prospect.save();

        // Delete from Cloudinary using extracted public_id
        try {
            const urlParts = imageUrl.split('/');
            const versionIndex = urlParts.findIndex(part =>
                part.startsWith('v') && part.length > 1 && !isNaN(Number(part.substring(1)))
            );

            if (versionIndex !== -1) {
                const publicIdWithExt = urlParts.slice(versionIndex + 1).join('/');
                const lastDotIndex = publicIdWithExt.lastIndexOf('.');
                const publicId = lastDotIndex > 0
                    ? publicIdWithExt.substring(0, lastDotIndex)
                    : publicIdWithExt;

                await cloudinary.uploader.destroy(publicId);
            }
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

// @desc    Create a new Prospect Category
// @route   POST /api/v1/prospects/categories
// @access  Private (Admin, Manager)
exports.createProspectCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // Validate request body
        const validatedData = categorySchemaValidation.parse(req.body);

        // Check if category already exists
        const existingCategory = await ProspectCategory.findOne({
            name: { $regex: new RegExp(`^${validatedData.name}$`, 'i') },
            organizationId: organizationId
        });

        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists'
            });
        }

        // Create new category
        const newCategory = await ProspectCategory.create({
            name: validatedData.name,
            brands: validatedData.brands || [],
            organizationId: organizationId
        });

        res.status(201).json({
            success: true,
            message: 'Prospect category created successfully',
            data: newCategory
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: error.flatten().fieldErrors
            });
        }
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists'
            });
        }
        next(error);
    }
};

// @desc    Update prospect category
// @route   PUT /api/v1/prospects/categories/:id
// @access  Private (requires manageCategories - admin only)
exports.updateProspectCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Validate request body
        const validatedData = categorySchemaValidation.parse(req.body);

        // Find category
        const category = await ProspectCategory.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        const oldName = category.name; // Store for sync
        const newName = validatedData.name ? validatedData.name.trim() : oldName;

        // Check if new name conflicts with existing category
        if (newName.toLowerCase() !== oldName.toLowerCase()) {
            const existingCategory = await ProspectCategory.findOne({
                name: { $regex: new RegExp(`^${newName}$`, 'i') },
                organizationId: organizationId,
                _id: { $ne: id }
            });

            if (existingCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists'
                });
            }
        }

        // Update category
        if (validatedData.name) {
            category.name = newName;
        }
        if (validatedData.brands) {
            category.brands = validatedData.brands;
        }

        await category.save();

        // SYNC: Update category name in all prospects' prospectInterest array
        let prospectsUpdated = 0;
        if (oldName !== newName) {
            const updateResult = await Prospect.updateMany(
                {
                    organizationId,
                    'prospectInterest.category': oldName
                },
                {
                    $set: { 'prospectInterest.$[elem].category': newName }
                },
                {
                    arrayFilters: [{ 'elem.category': oldName }]
                }
            );
            prospectsUpdated = updateResult.modifiedCount;
        }

        res.status(200).json({
            success: true,
            message: `Prospect category updated successfully${prospectsUpdated > 0 ? `. ${prospectsUpdated} prospects synced.` : ''}`,
            data: category,
            prospectsUpdated
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: error.flatten().fieldErrors
            });
        }
        next(error);
    }
};

// @desc    Delete prospect category
// @route   DELETE /api/v1/prospects/categories/:id
// @access  Private (requires manageCategories - admin only)
exports.deleteProspectCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Find category
        const category = await ProspectCategory.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Check if category is being used by any prospect
        const prospectsUsingCategory = await Prospect.countDocuments({
            'prospectInterest.category': category.name,
            organizationId: organizationId
        });

        if (prospectsUsingCategory > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category. It is being used by ${prospectsUsingCategory} prospect(s).`
            });
        }

        await ProspectCategory.deleteOne({ _id: id });

        res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// ASSIGNMENT CONTROLLERS
// ============================================

/**
 * Assign user(s) to a prospect
 * POST /api/v1/prospects/:id/assign
 * Body: { userIds: string[] }
 */
exports.assignUsersToProspect = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;
        const { userIds } = req.body;

        // Validate input
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'userIds must be a non-empty array'
            });
        }

        // Find prospect
        const Prospect = require('./prospect.model');
        const User = require('../users/user.model');
        const prospect = await Prospect.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!prospect) {
            return res.status(404).json({
                success: false,
                message: 'Prospect not found'
            });
        }

        // Validate users belong to same org
        const users = await User.find({
            _id: { $in: userIds },
            organizationId: organizationId,
            isActive: true
        });

        if (users.length !== userIds.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more users not found or inactive'
            });
        }

        // Add users to assignedUsers array (avoid duplicates)
        const currentAssignedIds = prospect.assignedUsers ? prospect.assignedUsers.map(id => id.toString()) : [];
        const newAssignments = userIds.filter(id =>
            !currentAssignedIds.includes(id.toString())
        );

        if (newAssignments.length > 0) {
            prospect.assignedUsers.push(...newAssignments);
            prospect.assignedBy = userId;
            prospect.assignedAt = new Date();
            await prospect.save();
        }

        res.status(200).json({
            success: true,
            message: `${newAssignments.length} user(s) assigned to prospect`,
            data: {
                prospectId: prospect._id,
                assignedUsers: prospect.assignedUsers
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Remove user assignment(s) from prospect
 * DELETE /api/v1/prospects/:id/assign
 * Body: { userIds: string[] } - supports single or multiple user IDs
 */
exports.removeUserFromProspect = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;
        const { userIds } = req.body;

        // Validate input
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'userIds must be a non-empty array'
            });
        }

        const Prospect = require('./prospect.model');
        const prospect = await Prospect.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!prospect) {
            return res.status(404).json({
                success: false,
                message: 'Prospect not found'
            });
        }

        const beforeCount = prospect.assignedUsers ? prospect.assignedUsers.length : 0;

        // Remove specified users
        const userIdsToRemove = userIds.map(id => id.toString());
        prospect.assignedUsers = prospect.assignedUsers.filter(
            assignedId => !userIdsToRemove.includes(assignedId.toString())
        );

        prospect.assignedBy = userId;
        prospect.assignedAt = new Date();
        await prospect.save();

        const removedCount = beforeCount - prospect.assignedUsers.length;

        res.status(200).json({
            success: true,
            message: removedCount === 1
                ? 'User assignment removed'
                : `${removedCount} user(s) removed from prospect assignments`,
            data: {
                prospectId: prospect._id,
                assignedUsers: prospect.assignedUsers,
                removedCount
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all users assigned to a prospect
 * GET /api/v1/prospects/:id/assignments
 */
exports.getProspectAssignments = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const Prospect = require('./prospect.model');
        const prospect = await Prospect.findOne({
            _id: id,
            organizationId: organizationId
        }).populate('assignedUsers', 'name email role')
            .populate('assignedBy', 'name email');

        if (!prospect) {
            return res.status(404).json({
                success: false,
                message: 'Prospect not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                prospectId: prospect._id,
                prospectName: prospect.prospectName,
                assignedUsers: prospect.assignedUsers,
                assignedBy: prospect.assignedBy,
                assignedAt: prospect.assignedAt
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get prospects assigned to current user
 * GET /api/v1/prospects/my-assigned
 */
exports.getMyAssignedProspects = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // Use the new entity access filter
        const { getEntityAccessFilter } = require('../../utils/hierarchyHelper');

        const accessFilter = await getEntityAccessFilter(
            req.user,
            'prospects',
            'viewTeamProspects',
            'viewAllProspects'
        );

        const Prospect = require('./prospect.model');
        const prospects = await Prospect.find({
            organizationId: organizationId,
            ...accessFilter
        })
            .select('_id prospectName ownerName location.address prospectInterest createdAt assignedAt')
            .sort({ assignedAt: -1, createdAt: -1 })
            .populate('assignedBy', 'name')
            .lean();

        res.status(200).json({
            success: true,
            count: prospects.length,
            data: prospects
        });
    } catch (error) {
        next(error);
    }
};

