const Collection = require('./collections.model');
const Organization = require('../organizations/organization.model');
const mongoose = require('mongoose');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');

// --- Zod Validation Schemas ---

// Base schema for common fields
const baseCollectionSchema = {
    party: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), "Invalid party ID"),
    amountReceived: z.coerce.number({ required_error: "Amount is required" }).min(0, "Amount cannot be negative"),
    receivedDate: z.string({ required_error: "Received date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    description: z.string().optional(),
    paymentMethod: z.enum(['bank_transfer', 'cheque', 'qr', 'cash'], { required_error: "Payment method is required" }),
};

// Full validation with conditional fields
const collectionSchemaValidation = z.object({
    ...baseCollectionSchema,
    // Bank transfer field
    bankName: z.string().optional(),
    // Cheque fields
    chequeNumber: z.string().optional(),
    chequeDate: z.string().refine(val => !val || !isNaN(Date.parse(val)), { message: "Invalid cheque date format" }).optional(),
    chequeStatus: z.enum(['pending', 'deposited', 'cleared', 'bounced']).optional(),
}).superRefine((data, ctx) => {
    // Validate bank transfer
    if (data.paymentMethod === 'bank_transfer') {
        if (!data.bankName || data.bankName.trim() === '') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Bank name is required for bank transfer",
                path: ['bankName'],
            });
        }
    }

    // Validate cheque
    if (data.paymentMethod === 'cheque') {
        if (!data.bankName || data.bankName.trim() === '') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Bank name is required for cheque payment",
                path: ['bankName'],
            });
        }
        if (!data.chequeNumber || data.chequeNumber.trim() === '') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Cheque number is required",
                path: ['chequeNumber'],
            });
        }
        if (!data.chequeDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Cheque date is required",
                path: ['chequeDate'],
            });
        }
    }
});

// Cheque status update validation
const chequeStatusSchemaValidation = z.object({
    chequeStatus: z.enum(['pending', 'deposited', 'cleared', 'bounced']),
});

// Helper to cleanup temp files
const cleanupTempFiles = (files) => {
    if (files && files.length > 0) {
        files.forEach(file => {
            fs.unlink(file.path, (err) => {
                if (err) console.error(`Error removing temp file ${file.path}:`, err);
            });
        });
    }
};

// ============================================
// COLLECTION ENDPOINTS
// ============================================

// @desc    Create a new collection
// @route   POST /api/v1/collections
// @access  Private (All authenticated users)
exports.createCollection = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const validatedData = collectionSchemaValidation.parse(req.body);

        // Build collection data
        const collectionData = {
            party: validatedData.party,
            amountReceived: validatedData.amountReceived,
            receivedDate: new Date(validatedData.receivedDate),
            description: validatedData.description,
            paymentMethod: validatedData.paymentMethod,
            organizationId: organizationId,
            createdBy: userId,
        };

        // Add payment method specific fields
        if (validatedData.paymentMethod === 'bank_transfer') {
            collectionData.bankName = validatedData.bankName;
        } else if (validatedData.paymentMethod === 'cheque') {
            collectionData.bankName = validatedData.bankName;
            collectionData.chequeNumber = validatedData.chequeNumber;
            collectionData.chequeDate = new Date(validatedData.chequeDate);
            collectionData.chequeStatus = validatedData.chequeStatus || 'pending';
        }

        const newCollection = await Collection.create(collectionData);

        // Populate party for response
        await newCollection.populate('party', 'partyName ownerName');

        res.status(201).json({ success: true, data: newCollection });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        console.error("Error creating collection:", error);
        next(error);
    }
};

// @desc    Get all collections
// @route   GET /api/v1/collections
// @access  Private (Admin, Manager)
exports.getAllCollections = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const collections = await Collection.find({ organizationId: organizationId })
            .populate('party', 'partyName ownerName')
            .populate('createdBy', 'name email')
            .sort({ receivedDate: -1 });

        res.status(200).json({ success: true, count: collections.length, data: collections });
    } catch (error) {
        next(error);
    }
};

// @desc    Get my collections
// @route   GET /api/v1/collections/my-collections
// @access  Private (All authenticated users)
exports.getMyCollections = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const collections = await Collection.find({
            organizationId: organizationId,
            createdBy: userId
        })
            .populate('party', 'partyName ownerName')
            .sort({ receivedDate: -1 });

        res.status(200).json({ success: true, count: collections.length, data: collections });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single collection by ID
// @route   GET /api/v1/collections/:id
// @access  Private
exports.getCollectionById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // Salesperson can only see their own collections
        if (role === 'salesperson') {
            query.createdBy = userId;
        }

        const collection = await Collection.findOne(query)
            .populate('party', 'partyName ownerName')
            .populate('createdBy', 'name email');

        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }

        res.status(200).json({ success: true, data: collection });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a collection
// @route   PUT /api/v1/collections/:id
// @access  Private (Creator only)
exports.updateCollection = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const validatedData = collectionSchemaValidation.partial().parse(req.body);

        // Find the collection
        const collection = await Collection.findOne({
            _id: req.params.id,
            organizationId: organizationId,
            createdBy: userId
        });

        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }

        // Build update data
        const updateData = { ...validatedData };

        if (updateData.receivedDate) {
            updateData.receivedDate = new Date(updateData.receivedDate);
        }
        if (updateData.chequeDate) {
            updateData.chequeDate = new Date(updateData.chequeDate);
        }

        // Update the collection
        const updatedCollection = await Collection.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('party', 'partyName ownerName')
            .populate('createdBy', 'name email');

        res.status(200).json({ success: true, data: updatedCollection });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Update cheque status
// @route   PATCH /api/v1/collections/:id/cheque-status
// @access  Private (Admin, Manager)
exports.updateChequeStatus = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { chequeStatus } = chequeStatusSchemaValidation.parse(req.body);

        const collection = await Collection.findOne({
            _id: req.params.id,
            organizationId: organizationId,
            paymentMethod: 'cheque'
        });

        if (!collection) {
            return res.status(404).json({ success: false, message: 'Cheque collection not found' });
        }

        collection.chequeStatus = chequeStatus;
        await collection.save();

        await collection.populate('party', 'partyName ownerName');

        res.status(200).json({ success: true, data: collection });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Delete a collection
// @route   DELETE /api/v1/collections/:id
// @access  Private (Creator or Admin/Manager)
exports.deleteCollection = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // If not admin/manager, restrict to own collections
        if (role === 'salesperson') {
            query.createdBy = userId;
        }

        // Find the collection to get cheque images
        const collection = await Collection.findOne(query);

        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }

        // Delete cheque images from Cloudinary if they exist
        if (collection.chequeImages && collection.chequeImages.length > 0) {
            try {
                const organization = await Organization.findById(organizationId);
                if (organization) {
                    const deletePromises = collection.chequeImages.map((_, index) => {
                        const publicId = `sales-sphere/${organization.name}/collections/${collection._id}/cheque_${index}`;
                        return cloudinary.uploader.destroy(publicId).catch(err => {
                            console.error(`Error deleting cheque image ${index}:`, err);
                            return null;
                        });
                    });
                    await Promise.all(deletePromises);
                }
            } catch (cloudinaryError) {
                console.error('Error deleting cheque images from Cloudinary:', cloudinaryError);
            }
        }

        await Collection.findByIdAndDelete(collection._id);

        res.status(200).json({ success: true, message: 'Collection deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Bulk delete collections
// @route   DELETE /api/v1/collections/bulk-delete
// @access  Private (Admin, Manager)
exports.bulkDeleteCollections = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of collection IDs'
            });
        }

        // Validate all IDs
        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length !== ids.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more invalid collection IDs'
            });
        }

        // Find all collections to get cheque images
        const collections = await Collection.find({
            _id: { $in: validIds },
            organizationId: organizationId
        }).select('_id chequeImages');

        // Get organization for Cloudinary folder path
        const organization = await Organization.findById(organizationId);

        // Delete cheque images from Cloudinary
        if (organization) {
            const deletePromises = [];
            collections.forEach(collection => {
                if (collection.chequeImages && collection.chequeImages.length > 0) {
                    collection.chequeImages.forEach((_, index) => {
                        const publicId = `sales-sphere/${organization.name}/collections/${collection._id}/cheque_${index}`;
                        deletePromises.push(
                            cloudinary.uploader.destroy(publicId).catch(err => {
                                console.error(`Error deleting cheque image for collection ${collection._id}:`, err);
                                return null;
                            })
                        );
                    });
                }
            });
            await Promise.all(deletePromises);
        }

        // Delete the collections
        const result = await Collection.deleteMany({
            _id: { $in: validIds },
            organizationId: organizationId
        });

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} collection(s) deleted successfully`
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// CHEQUE IMAGE ENDPOINTS
// ============================================

// @desc    Upload or update a cheque image (specify imageNumber: 1 or 2 in form-data)
// @route   POST /api/v1/collections/:id/cheque-images
// @access  Private (Creator only)
exports.uploadChequeImage = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;
        const { imageNumber } = req.body;

        // Validate image file
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image file' });
        }

        // Validate imageNumber (1 or 2)
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 2) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be 1 or 2'
            });
        }

        // 🔥 OPTIMIZATION: Parallelize Collection and Organization fetch
        const [collection, organization] = await Promise.all([
            Collection.findOne({
                _id: id,
                organizationId: organizationId,
                createdBy: userId,
                paymentMethod: 'cheque'
            }),
            Organization.findById(organizationId).select('name').lean()
        ]);

        if (!collection) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Cheque collection not found' });
        }

        if (!organization) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const folderPath = `sales-sphere/${organization.name}/collections/${id}`;

        // 🔥 OPTIMIZATION: Use eager transformation for async processing
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: `cheque_${imageNum}`,
            overwrite: true,
            eager: [
                { width: 1200, height: 1600, crop: "limit", fetch_format: "auto", quality: "auto" }
            ],
            eager_async: true // Process transformations asynchronously
        });

        // Cleanup temp file
        fs.unlink(tempFilePath, () => { });
        tempFilePath = null;

        // Initialize chequeImages array if needed
        if (!collection.chequeImages) {
            collection.chequeImages = [];
        }

        const arrayIndex = imageNum - 1; // 1 -> 0, 2 -> 1

        // Ensure array has enough space
        while (collection.chequeImages.length <= arrayIndex) {
            collection.chequeImages.push(null);
        }

        collection.chequeImages[arrayIndex] = result.secure_url;
        await collection.save();

        // Return all images with their imageNumber
        const chequeImagesWithNumber = collection.chequeImages
            .map((url, idx) => url ? { imageNumber: idx + 1, url } : null)
            .filter(img => img !== null);

        return res.status(200).json({
            success: true,
            message: `Cheque image ${imageNum} uploaded successfully`,
            data: {
                chequeImages: chequeImagesWithNumber
            }
        });
    } catch (error) {
        if (tempFilePath) fs.unlink(tempFilePath, () => { });
        console.error('Error uploading cheque image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a cheque image from a collection
// @route   DELETE /api/v1/collections/:id/cheque-images/:imageNumber
// @access  Private (Creator or Admin/Manager)
exports.deleteChequeImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;
        const { id, imageNumber } = req.params;

        // Validate imageNumber (1 or 2)
        const imageNum = parseInt(imageNumber, 10);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 2) {
            return res.status(400).json({ success: false, message: 'imageNumber must be 1 or 2' });
        }

        const arrayIndex = imageNum - 1; // 1 -> 0, 2 -> 1

        // Build query based on role
        const query = {
            _id: id,
            organizationId: organizationId,
            paymentMethod: 'cheque'
        };

        if (role === 'salesperson') {
            query.createdBy = userId;
        }

        const collection = await Collection.findOne(query);

        if (!collection) {
            return res.status(404).json({ success: false, message: 'Cheque collection not found' });
        }

        if (!collection.chequeImages || !collection.chequeImages[arrayIndex]) {
            return res.status(404).json({ success: false, message: `Cheque image ${imageNum} not found` });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Delete from Cloudinary
        try {
            const publicId = `sales-sphere/${organization.name}/collections/${id}/cheque_${imageNum}`;
            await cloudinary.uploader.destroy(publicId);
        } catch (cloudinaryError) {
            console.error('Error deleting from Cloudinary:', cloudinaryError);
        }

        // Set the image to null (maintain array structure)
        collection.chequeImages[arrayIndex] = null;
        // Filter out null values
        collection.chequeImages = collection.chequeImages.filter(img => img !== null);
        await collection.save();

        // Return images with their imageNumber
        const chequeImagesWithNumber = collection.chequeImages
            .map((url, idx) => url ? { imageNumber: idx + 1, url } : null)
            .filter(img => img !== null);

        return res.status(200).json({
            success: true,
            message: `Cheque image ${imageNum} deleted successfully`,
            data: {
                chequeImages: chequeImagesWithNumber
            }
        });
    } catch (error) {
        console.error('Error deleting cheque image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
