const Party = require('./party.model');
const PartyType = require('./partyType.model');
const Organization = require('../organizations/organization.model');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const User = require('../users/user.model');
const { isSystemRole } = require('../../utils/defaultPermissions');
const fs = require('fs').promises;

// --- HELPER: Get Hierarchy Filter ---
const { getHierarchyFilter, getEntityAccessFilter } = require('../../utils/hierarchyHelper');
// Internal helper removed in favor of centralized deep hierarchy helper
const partySchemaValidation = z.object({
    partyName: z.string({ required_error: "Party name is required" }).min(1, "Party name is required"),
    ownerName: z.string({ required_error: "Owner name is required" }).min(1, "Owner name is required"),
    dateJoined: z.string({ required_error: "Date joined is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    panVatNumber: z.string({ required_error: "PAN/VAT number is required" }).min(1, "PAN/VAT number is required").max(14),
    partyType: z.string().optional(),
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

// Sync Party Type Helper
const syncPartyType = async (partyTypeName, organizationId) => {
    if (!partyTypeName) return;

    const trimmedName = partyTypeName.trim();

    // Check if party type exists
    const existingPartyType = await PartyType.findOne({
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
        organizationId: organizationId
    });

    if (!existingPartyType) {
        // Create new party type
        await PartyType.create({
            name: trimmedName,
            organizationId: organizationId
        });
    }
};

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

        // Sync party type if provided
        if (validatedData.partyType) {
            await syncPartyType(validatedData.partyType, organizationId);
        }

        const newParty = await Party.create({
            ...validatedData,
            dateJoined: new Date(validatedData.dateJoined),
            organizationId: organizationId,
            createdBy: userId,
            // Auto-assign creator to the party
            assignedUsers: [userId],
            assignedBy: userId,
            assignedAt: new Date(),
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

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'parties',
            'viewTeamParties',
            'viewAllParties'
        );

        const parties = await Party.find({ organizationId, ...accessFilter })
            .select('_id partyName ownerName location.address partyType createdAt createdBy')
            .sort({ createdAt: -1 })
            .populate('createdBy', 'name')
            .lean();

        res.status(200).json({ success: true, count: parties.length, data: parties });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all parties for logged-in user's organization
// @route   GET /api/parties/details
// @access  Private
exports.getAllPartiesDetails = async (req, res, next) => {
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
            'parties',
            'viewTeamParties',
            'viewAllParties'
        );

        // Fetch all parties belonging to the organization with access check
        const parties = await Party.find({ organizationId, ...accessFilter })
            .sort({ createdAt: -1 })
            .lean(); // Optional: returns plain JSON, faster

        return res.status(200).json({
            success: true,
            count: parties.length,
            data: parties

        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get a single party by ID (no longer filters by isActive)
exports.getPartyById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'parties',
            'viewTeamParties',
            'viewAllParties'
        );

        const party = await Party.findOne({
            _id: req.params.id,
            organizationId,
            ...accessFilter
        })
            .select(
                '_id partyName ownerName panVatNumber dateJoined description organizationId partyType createdBy contact location image createdAt updatedAt'
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

        // Sync party type if provided
        if (validatedData.partyType) {
            await syncPartyType(validatedData.partyType, organizationId);
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


// Helper function to safely delete a file (async)
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

// @desc    Upload or update a party image
// @route   POST /api/parties/:id/image
// @access  Private (Admin, Manager, Salesperson)
exports.uploadPartyImage = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;

        // Validate image file
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image file' });
        }

        // Check if party exists and belongs to organization
        const party = await Party.findOne({ _id: id, organizationId });
        if (!party) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Party not found' });
        }

        // Fetch organization to get the name for folder structure
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Upload to Cloudinary

        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: `sales-sphere/${organization.name}/partiesImage/${party.partyName}/${id}`,
            public_id: `${id}_image`,
            overwrite: true,
            transformation: [
                { width: 1200, height: 800, crop: "limit" },
                { fetch_format: "auto", quality: "auto" }
            ]
        });

        await cleanupTempFile(tempFilePath);
        tempFilePath = null;

        // Update party with new image URL
        party.image = result.secure_url;
        await party.save();

        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                imageUrl: result.secure_url
            }
        });
    } catch (error) {
        await cleanupTempFile(tempFilePath);
        console.error('Error uploading party image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a party image
// @route   DELETE /api/parties/:id/image
// @access  Private (Admin, Manager)
exports.deletePartyImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Check if party exists
        const party = await Party.findOne({ _id: id, organizationId });
        if (!party) {
            return res.status(404).json({ success: false, message: 'Party not found' });
        }

        if (!party.image) {
            return res.status(400).json({ success: false, message: 'No image to delete' });
        }

        // Extract public_id robustly from the stored image URL
        const imageUrl = party.image;

        // Remove image field
        party.image = null;
        await party.save();

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
        console.error('Error deleting party image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
// --- END MODIFICATION ---

// --- Zod Validation Schema for Bulk Import ---
const bulkPartySchemaValidation = z.object({
    partyName: z.string({ required_error: "Party name is required" }).min(1, "Party name is required"),
    ownerName: z.string({ required_error: "Owner name is required" }).min(1, "Owner name is required"),
    panVatNumber: z.string({ required_error: "PAN/VAT number is required" }).min(1, "PAN/VAT number is required").max(14),
    contact: z.object({
        phone: z.string({ required_error: "Phone number is required" }).min(1, "Phone number is required"),
        email: z.string().email("Invalid email address").optional().or(z.literal('')),
    }),
    address: z.string().optional(), // Simple address string for bulk import
    description: z.string().optional(),
});

// @desc    Bulk import parties from Excel/CSV
// @route   POST /api/v1/parties/bulk-import
// @access  Private (Admin, Manager)
exports.bulkImportParties = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const { parties } = req.body;

        if (!parties || !Array.isArray(parties) || parties.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of parties to import'
            });
        }

        const results = {
            successful: [],
            failed: [],
            duplicates: []
        };

        for (let i = 0; i < parties.length; i++) {
            const partyData = parties[i];
            const rowNumber = i + 1;

            try {
                // Validate party data
                const validatedData = bulkPartySchemaValidation.parse(partyData);

                // Check for existing party with same PAN/VAT
                const existingParty = await Party.findOne({
                    panVatNumber: validatedData.panVatNumber,
                    organizationId,
                });

                if (existingParty) {
                    results.duplicates.push({
                        row: rowNumber,
                        partyName: validatedData.partyName,
                        panVatNumber: validatedData.panVatNumber,
                        message: 'A party with this PAN/VAT number already exists'
                    });
                    continue;
                }

                // Create party with auto-generated dateJoined
                const newParty = await Party.create({
                    partyName: validatedData.partyName,
                    ownerName: validatedData.ownerName,
                    panVatNumber: validatedData.panVatNumber,
                    contact: validatedData.contact,
                    location: validatedData.address ? { address: validatedData.address } : undefined,
                    description: validatedData.description,
                    dateJoined: new Date(), // Auto-generated
                    organizationId,
                    createdBy: userId,
                });

                results.successful.push({
                    row: rowNumber,
                    partyName: newParty.partyName,
                    _id: newParty._id
                });

            } catch (error) {
                if (error instanceof z.ZodError) {
                    results.failed.push({
                        row: rowNumber,
                        partyName: partyData.partyName || 'Unknown',
                        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
                    });
                } else if (error.code === 11000) {
                    results.duplicates.push({
                        row: rowNumber,
                        partyName: partyData.partyName || 'Unknown',
                        panVatNumber: partyData.panVatNumber,
                        message: 'Duplicate PAN/VAT number'
                    });
                } else {
                    results.failed.push({
                        row: rowNumber,
                        partyName: partyData.partyName || 'Unknown',
                        errors: [{ message: error.message || 'Unknown error' }]
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: `Bulk import completed. ${results.successful.length} parties imported successfully.`,
            data: {
                totalProcessed: parties.length,
                successfulCount: results.successful.length,
                failedCount: results.failed.length,
                duplicateCount: results.duplicates.length,
                successful: results.successful,
                failed: results.failed,
                duplicates: results.duplicates
            }
        });
    } catch (error) {
        console.error('Error in bulk import:', error);
        return res.status(500).json({ success: false, message: 'Server error during bulk import' });
    }
};

// @desc    Get all Party Types
// @route   GET /api/v1/parties/types
// @access  Authenticated Users
exports.getPartyTypes = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const partyTypes = await PartyType.find({ organizationId: organizationId })
            .select('name')
            .sort({ name: 1 })
            .lean();

        res.status(200).json({ success: true, count: partyTypes.length, data: partyTypes });
    } catch (error) {
        next(error);
    }
};

// @desc    Create party type
// @route   POST /api/v1/parties/types
// @access  Private (All authenticated users)
exports.createPartyType = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Type name is required' });
        }

        // Check if type already exists
        const existingType = await PartyType.findOne({
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
            organizationId
        });

        if (existingType) {
            return res.status(400).json({ success: false, message: 'Party type with this name already exists' });
        }

        const partyType = await PartyType.create({
            name: name.trim(),
            organizationId
        });

        res.status(201).json({
            success: true,
            message: 'Party type created successfully',
            data: partyType
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update party type
// @route   PUT /api/v1/parties/types/:id
// @access  Private (Admin only)
exports.updatePartyType = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Type name is required' });
        }

        const partyType = await PartyType.findOne({ _id: id, organizationId });

        if (!partyType) {
            return res.status(404).json({ success: false, message: 'Party type not found' });
        }

        const oldName = partyType.name; // Store old name for sync
        const newName = name.trim();

        // Check if new name conflicts with existing type
        if (newName.toLowerCase() !== oldName.toLowerCase()) {
            const existingType = await PartyType.findOne({
                name: { $regex: new RegExp(`^${newName}$`, 'i') },
                organizationId,
                _id: { $ne: id }
            });

            if (existingType) {
                return res.status(400).json({ success: false, message: 'Party type with this name already exists' });
            }
        }

        // Update the party type
        partyType.name = newName;
        await partyType.save();

        // SYNC: Update all parties with the old type name to the new name
        let partiesUpdated = 0;
        if (oldName !== newName) {
            const updateResult = await Party.updateMany(
                { organizationId, partyType: oldName },
                { $set: { partyType: newName } }
            );
            partiesUpdated = updateResult.modifiedCount;
        }

        res.status(200).json({
            success: true,
            message: `Party type updated successfully${partiesUpdated > 0 ? `. ${partiesUpdated} parties synced.` : ''}`,
            data: partyType,
            partiesUpdated
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete party type
// @route   DELETE /api/v1/parties/types/:id
// @access  Private (Admin only)
exports.deletePartyType = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const partyType = await PartyType.findOne({ _id: id, organizationId });

        if (!partyType) {
            return res.status(404).json({ success: false, message: 'Party type not found' });
        }

        // Check if type is being used by any party
        const partiesUsingType = await Party.countDocuments({
            partyType: partyType.name,
            organizationId
        });

        if (partiesUsingType > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete party type. It is being used by ${partiesUsingType} party/parties.`
            });
        }

        await PartyType.deleteOne({ _id: id });

        res.status(200).json({
            success: true,
            message: 'Party type deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// ASSIGNMENT CONTROLLERS
// ============================================

/**
 * Assign user(s) to a party
 * POST /api/v1/parties/:id/assign
 * Body: { userIds: string[] }
 */
exports.assignUsersToParty = async (req, res, next) => {
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

        // Find party
        const party = await Party.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!party) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
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
        const currentAssignedIds = party.assignedUsers.map(id => id.toString());
        const newAssignments = userIds.filter(id =>
            !currentAssignedIds.includes(id.toString())
        );

        if (newAssignments.length > 0) {
            party.assignedUsers.push(...newAssignments);
            party.assignedBy = userId;
            party.assignedAt = new Date();
            await party.save();
        }

        res.status(200).json({
            success: true,
            message: `${newAssignments.length} user(s) assigned to party`,
            data: {
                partyId: party._id,
                assignedUsers: party.assignedUsers
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Remove user assignment(s) from party
 * DELETE /api/v1/parties/:id/assign
 * Body: { userIds: string[] } - supports single or multiple user IDs
 */
exports.removeUserFromParty = async (req, res, next) => {
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

        const party = await Party.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!party) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        const beforeCount = party.assignedUsers.length;

        // Remove specified users
        const userIdsToRemove = userIds.map(id => id.toString());
        party.assignedUsers = party.assignedUsers.filter(
            assignedId => !userIdsToRemove.includes(assignedId.toString())
        );

        party.assignedBy = userId;
        party.assignedAt = new Date();
        await party.save();

        const removedCount = beforeCount - party.assignedUsers.length;

        res.status(200).json({
            success: true,
            message: removedCount === 1
                ? 'User assignment removed'
                : `${removedCount} user(s) removed from party assignments`,
            data: {
                partyId: party._id,
                assignedUsers: party.assignedUsers,
                removedCount
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all users assigned to a party
 * GET /api/v1/parties/:id/assignments
 */
exports.getPartyAssignments = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const party = await Party.findOne({
            _id: id,
            organizationId: organizationId
        }).populate('assignedUsers', 'name email role')
            .populate('assignedBy', 'name email');

        if (!party) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                partyId: party._id,
                partyName: party.partyName,
                assignedUsers: party.assignedUsers,
                assignedBy: party.assignedBy,
                assignedAt: party.assignedAt
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get parties assigned to current user
 * GET /api/v1/parties/my-assigned
 */
exports.getMyAssignedParties = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Use the new entity access filter
        const { getEntityAccessFilter } = require('../../utils/hierarchyHelper');

        const accessFilter = await getEntityAccessFilter(
            req.user,
            'parties',
            'viewTeamParties',
            'viewAllParties'
        );

        const parties = await Party.find({
            organizationId: organizationId,
            ...accessFilter
        })
            .select('_id partyName ownerName location.address partyType createdAt assignedAt')
            .sort({ assignedAt: -1, createdAt: -1 })
            .populate('assignedBy', 'name')
            .lean();

        res.status(200).json({
            success: true,
            count: parties.length,
            data: parties
        });
    } catch (error) {
        next(error);
    }
};
