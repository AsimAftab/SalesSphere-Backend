const Note = require('./notes.model');
const Organization = require('../organizations/organization.model');
const mongoose = require('mongoose');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs').promises;
const User = require('../users/user.model');
const { isSystemRole } = require('../../utils/defaultPermissions');

// --- Zod Validation Schema ---
const noteSchemaValidation = z.object({
    title: z.string({ required_error: "Title is required" }).min(1, "Title is required"),
    description: z.string({ required_error: "Description is required" }).min(1, "Description is required"),
    party: z.string().refine(val => !val || mongoose.Types.ObjectId.isValid(val), "Invalid party ID").optional(),
    prospect: z.string().refine(val => !val || mongoose.Types.ObjectId.isValid(val), "Invalid prospect ID").optional(),
    site: z.string().refine(val => !val || mongoose.Types.ObjectId.isValid(val), "Invalid site ID").optional(),
}).refine(data => {
    // Count how many reference fields are provided
    const references = [data.party, data.prospect, data.site].filter(Boolean);
    return references.length <= 1;
}, {
    message: "Only one of party, prospect, or site can be specified at a time",
    path: ["party", "prospect", "site"]
});

const { getHierarchyFilter } = require('../../utils/hierarchyHelper');
// Internal helper removed in favor of centralized deep hierarchy helper

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

// Helper to build folder path for notes images
const buildFolderPath = (orgName, noteId) => {
    return `sales-sphere/${orgName}/notes/${noteId}`;
};

// Helper to strip sensitive image info (publicId) for responses
const sanitizeNoteImages = (note) => {
    if (!note.images) return [];
    return note.images.map(img => ({
        imageNumber: img.imageNumber,
        imageUrl: img.imageUrl
    }));
};

// Helper to delete all images from Cloudinary for a note
const deleteNoteImagesFromCloudinary = async (note, orgName) => {
    const results = { deleted: 0, failed: 0 };

    if (note.images && note.images.length > 0) {
        for (const image of note.images) {
            try {
                if (image.publicId) {
                    await cloudinary.uploader.destroy(image.publicId);
                } else {
                    // Fallback to constructed path
                    const publicId = `${buildFolderPath(orgName, note._id)}/image_${image.imageNumber}`;
                    await cloudinary.uploader.destroy(publicId);
                }
                results.deleted++;
            } catch (error) {
                console.error(`Error deleting image from Cloudinary:`, error);
                results.failed++;
            }
        }
    }

    return results;
};

// @desc    Create a new note
// @route   POST /api/v1/notes
// @access  Private (All authenticated users)
exports.createNote = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const validatedData = noteSchemaValidation.parse(req.body);

        const newNote = await Note.create({
            title: validatedData.title,
            description: validatedData.description,
            party: validatedData.party || undefined,
            prospect: validatedData.prospect || undefined,
            site: validatedData.site || undefined,
            organizationId,
            createdBy: userId,
        });

        // Populate references for response
        await newNote.populate([
            { path: 'createdBy', select: 'name email' },
            { path: 'party', select: 'partyName' },
            { path: 'prospect', select: 'prospectName' },
            { path: 'site', select: 'siteName' }
        ]);

        return res.status(201).json({
            success: true,
            message: 'Note created successfully',
            data: newNote,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
            });
        }
        console.error('Error creating note:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get all notes
// @route   GET /api/v1/notes
// @access  Private
exports.getAllNotes = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        // Get hierarchy filter
        // Get hierarchy filter
        const hierarchyFilter = await getHierarchyFilter(req.user, 'notes', 'viewAllNotes');

        let query = { organizationId, ...hierarchyFilter };

        // Optional filters
        if (req.query.party) {
            query.party = req.query.party;
        }
        if (req.query.prospect) {
            query.prospect = req.query.prospect;
        }
        if (req.query.site) {
            query.site = req.query.site;
        }

        const notes = await Note.find(query)
            .populate('createdBy', 'name email')
            .populate('party', 'partyName')
            .populate('prospect', 'prospectName')
            .populate('site', 'siteName')
            .sort({ createdAt: -1 })
            .lean();

        // Sanitize images using helper
        const sanitizedNotes = notes.map(note => ({
            ...note,
            images: sanitizeNoteImages(note)
        }));

        return res.status(200).json({
            success: true,
            count: sanitizedNotes.length,
            data: sanitizedNotes,
        });
    } catch (error) {
        console.error('Error fetching notes:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get my notes (for logged-in user)
// @route   GET /api/v1/notes/my-notes
// @access  Private
exports.getMyNotes = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        let query = { organizationId, createdBy: userId };

        // Optional filters
        if (req.query.party) {
            query.party = req.query.party;
        }
        if (req.query.prospect) {
            query.prospect = req.query.prospect;
        }
        if (req.query.site) {
            query.site = req.query.site;
        }

        const notes = await Note.find(query)
            .populate('createdBy', 'name email')
            .populate('party', 'partyName')
            .populate('prospect', 'prospectName')
            .populate('site', 'siteName')
            .sort({ createdAt: -1 })
            .lean();

        // Sanitize images using helper
        const sanitizedNotes = notes.map(note => ({
            ...note,
            images: sanitizeNoteImages(note)
        }));

        return res.status(200).json({
            success: true,
            count: sanitizedNotes.length,
            data: sanitizedNotes,
        });
    } catch (error) {
        console.error('Error fetching user notes:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get a single note by ID
// @route   GET /api/v1/notes/:id
// @access  Private
exports.getNoteById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Use hierarchy filter - allows managers to see team notes
        const hierarchyFilter = await getHierarchyFilter(req.user, 'notes', 'viewAllNotes');

        const note = await Note.findOne({
            _id: id,
            organizationId,
            ...hierarchyFilter
        })
            .populate('createdBy', 'name email')
            .populate('party', 'partyName')
            .populate('prospect', 'prospectName')
            .populate('site', 'siteName')
            .lean();

        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        // Sanitize images using helper
        note.images = sanitizeNoteImages(note);

        return res.status(200).json({
            success: true,
            data: note,
        });
    } catch (error) {
        console.error('Error fetching note:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update a note
// @route   PUT /api/v1/notes/:id
// @access  Private (Only creator can update)
exports.updateNote = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId, role } = req.user;
        const { id } = req.params;

        const validatedData = noteSchemaValidation.partial().parse(req.body);

        const note = await Note.findOne({ _id: id, organizationId });
        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        // Only creator or admin/system role can update
        const isCreator = note.createdBy.toString() === userId.toString();
        const isAdmin = role === 'admin' || isSystemRole(role);

        if (!isCreator && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own notes'
            });
        }

        const updatedNote = await Note.findByIdAndUpdate(
            id,
            validatedData,
            { new: true, runValidators: true }
        )
            .populate('createdBy', 'name email')
            .populate('party', 'partyName')
            .populate('prospect', 'prospectName')
            .populate('site', 'siteName');

        return res.status(200).json({
            success: true,
            message: 'Note updated successfully',
            data: updatedNote,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
            });
        }
        console.error('Error updating note:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a note (with image cleanup)
// @route   DELETE /api/v1/notes/:id
// @access  Private (Admin, Manager, or creator)
exports.deleteNote = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId, role } = req.user;
        const { id } = req.params;

        const note = await Note.findOne({ _id: id, organizationId });
        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        // Only creator or admin/system role can delete
        const isCreator = note.createdBy.toString() === userId.toString();
        const isAdmin = role === 'admin' || isSystemRole(role);

        if (!isCreator && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own notes'
            });
        }

        // Fetch organization for Cloudinary folder path
        const organization = await Organization.findById(organizationId);
        const orgName = organization ? organization.name : 'unknown';

        // Delete images from Cloudinary
        const imageResults = await deleteNoteImagesFromCloudinary(note, orgName);

        // Delete the note
        await Note.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Note deleted successfully',
            data: {
                imagesDeleted: imageResults.deleted,
                imagesFailed: imageResults.failed
            }
        });
    } catch (error) {
        console.error('Error deleting note:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Bulk delete notes (with image cleanup)
// @route   DELETE /api/v1/notes/bulk-delete
// @access  Private (Admin, Manager)
exports.bulkDeleteNotes = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of note IDs'
            });
        }

        if (ids.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 100 notes can be deleted at once'
            });
        }

        // Validate all IDs
        const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'One or more invalid note IDs'
            });
        }

        // Find all notes matching the IDs
        const notes = await Note.find({
            _id: { $in: ids },
            organizationId
        });

        if (notes.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No notes found matching the provided IDs'
            });
        }

        // Fetch organization for Cloudinary folder path
        const organization = await Organization.findById(organizationId);
        const orgName = organization ? organization.name : 'unknown';

        const results = {
            totalRequested: ids.length,
            notesDeleted: 0,
            imagesDeleted: 0,
            imagesFailed: 0,
            notFound: ids.length - notes.length,
            notFoundIds: ids.filter(id => !notes.some(n => n._id.toString() === id))
        };

        // Delete images and notes in parallel for better performance
        const deleteResults = await Promise.all(notes.map(async (note) => {
            const imageResults = await deleteNoteImagesFromCloudinary(note, orgName);
            await Note.findByIdAndDelete(note._id);
            return imageResults;
        }));

        // Aggregate results
        deleteResults.forEach(imageResult => {
            results.imagesDeleted += imageResult.deleted;
            results.imagesFailed += imageResult.failed;
        });
        results.notesDeleted = notes.length;

        return res.status(200).json({
            success: true,
            message: 'Bulk delete completed',
            data: {
                ...results,
                notFoundIds: results.notFoundIds.length > 0 ? results.notFoundIds : undefined
            }
        });
    } catch (error) {
        console.error('Error in bulk delete notes:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Upload or update an image for a note
// @route   POST /api/v1/notes/:id/images
// @access  Private (Creator or admin only)
exports.uploadNoteImage = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId, role } = req.user;
        const { id } = req.params;
        const { imageNumber } = req.body;

        // Validate image file
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image file' });
        }

        // Validate imageNumber (1 or 2)
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 2) {
            await cleanupTempFile(tempFilePath);
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be 1 or 2'
            });
        }

        // Check if note exists and belongs to organization
        const note = await Note.findOne({ _id: id, organizationId });
        if (!note) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        // Only creator or admin/system role can upload images
        const isCreator = note.createdBy.toString() === userId.toString();
        const isAdmin = role === 'admin' || isSystemRole(role);

        if (!isCreator && !isAdmin) {
            await cleanupTempFile(tempFilePath);
            return res.status(403).json({
                success: false,
                message: 'You can only upload images to your own notes'
            });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const folderPath = buildFolderPath(organization.name, id);
        const publicId = `${folderPath}/image_${imageNum}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: `image_${imageNum}`,
            overwrite: true,
            transformation: [
                { width: 1200, height: 800, crop: "limit" },
                { fetch_format: "auto", quality: "auto" }
            ]
        });

        await cleanupTempFile(tempFilePath);
        tempFilePath = null;

        // Check if image with this number already exists
        const existingImageIndex = note.images.findIndex(img => img.imageNumber === imageNum);

        if (existingImageIndex !== -1) {
            // Update existing image
            note.images[existingImageIndex].imageUrl = result.secure_url;
            note.images[existingImageIndex].publicId = result.public_id;
        } else {
            // Add new image
            note.images.push({
                imageNumber: imageNum,
                imageUrl: result.secure_url,
                publicId: result.public_id
            });
        }

        await note.save();

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
        console.error('Error uploading note image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete an image from a note
// @route   DELETE /api/v1/notes/:id/images/:imageNumber
// @access  Private (Creator or Admin)
exports.deleteNoteImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId, role } = req.user;
        const { id, imageNumber } = req.params;

        // Validate imageNumber
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 2) {
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be 1 or 2'
            });
        }

        // Check if note exists and belongs to organization
        const note = await Note.findOne({ _id: id, organizationId });
        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        // Only creator or admin/system role can delete images
        const isCreator = note.createdBy.toString() === userId.toString();
        const isAdmin = role === 'admin' || isSystemRole(role);

        if (!isCreator && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete images from your own notes'
            });
        }

        // Find the image
        const imageIndex = note.images.findIndex(img => img.imageNumber === imageNum);
        if (imageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: `Image ${imageNum} not found`
            });
        }

        const image = note.images[imageIndex];

        // Delete from Cloudinary
        try {
            if (image.publicId) {
                await cloudinary.uploader.destroy(image.publicId);
            } else {
                const organization = await Organization.findById(organizationId);
                const folderPath = buildFolderPath(organization.name, id);
                await cloudinary.uploader.destroy(`${folderPath}/image_${imageNum}`);
            }
        } catch (cloudinaryError) {
            console.error('Error deleting from Cloudinary:', cloudinaryError);
            // Continue even if Cloudinary delete fails
        }

        // Remove from array
        note.images.splice(imageIndex, 1);
        await note.save();

        return res.status(200).json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting note image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get images for a note
// @route   GET /api/v1/notes/:id/images
// @access  Private
exports.getNoteImages = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Use hierarchy filter - allows managers to see team notes
        const hierarchyFilter = await getHierarchyFilter(req.user, 'notes', 'viewTeamNotes');

        const note = await Note.findOne({
            _id: id,
            organizationId,
            ...hierarchyFilter
        }).select('images');
        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        return res.status(200).json({
            success: true,
            count: note.images.length,
            data: note.images.map(img => ({
                imageNumber: img.imageNumber,
                imageUrl: img.imageUrl
            })),
        });
    } catch (error) {
        console.error('Error fetching note images:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
