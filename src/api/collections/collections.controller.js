const Collection = require('./collections.model');
const Organization = require('../organizations/organization.model');
const User = require('../users/user.model');
const Party = require('../parties/party.model'); // Import Party model
const mongoose = require('mongoose');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');
const { isSystemRole } = require('../../utils/defaultPermissions');
const { getHierarchyFilter } = require('../../utils/hierarchyHelper');

// --- Zod Validation Schemas ---

// Base schema for common fields
const BankName = require('./bankName.model'); // Import BankName model
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

/**
 * Sync Bank Name (Auto-create if not exists)
 * @param {string} bankName
 * @param {string} organizationId
 */
const syncBankName = async (bankName, organizationId) => {
    if (!bankName || !bankName.trim()) return;
    try {
        const normalizedName = bankName.trim();
        // Upsert logic for bank name
        await BankName.findOneAndUpdate(
            { name: normalizedName, organizationId },
            { name: normalizedName, organizationId }, // Set on insert
            { upsert: true, new: true, runValidators: true }
        );
    } catch (error) {
        // Log duplicate key errors quietly, others loudly
        if (error.code !== 11000) {
            console.error('Error syncing bank name:', error);
        }
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

        // Validate Party Existence
        const partyExists = await Party.findOne({
            _id: validatedData.party,
            organizationId: organizationId
        });

        if (!partyExists) {
            return res.status(404).json({ success: false, message: 'Party not found' });
        }

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
            // Sync Bank Name
            await syncBankName(validatedData.bankName, organizationId);
        } else if (validatedData.paymentMethod === 'cheque') {
            collectionData.bankName = validatedData.bankName;
            collectionData.chequeNumber = validatedData.chequeNumber;
            collectionData.chequeDate = new Date(validatedData.chequeDate);
            collectionData.chequeStatus = validatedData.chequeStatus || 'pending';
            // Sync Bank Name
            await syncBankName(validatedData.bankName, organizationId);
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
// @access  Private
exports.getAllCollections = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = { organizationId: organizationId };

        // Dynamic role filtering:
        // Use central hierarchy filter
        const hierarchyFilter = await getHierarchyFilter(req.user, 'collections', 'viewAllCollections');

        // Merge with existing org query
        Object.assign(query, hierarchyFilter);

        const collections = await Collection.find(query)
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

        // Dynamic role filtering:
        const hierarchyFilter = await getHierarchyFilter(req.user, 'collections', 'viewAllCollections');
        Object.assign(query, hierarchyFilter);

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
        const { organizationId, role, _id: userId } = req.user;

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

        // PERMISSION CHECK: Cheque Status Update
        // Only allow updating chequeStatus if user has specific permission or is Admin/System
        if (updateData.chequeStatus) {
            const hasStatusPermission =
                isSystemRole(role) ||
                role === 'admin' ||
                (req.permissions && req.permissions.collections &&
                    (req.permissions.collections.updateChequeStatus || req.permissions.collections.collectPayment));

            if (!hasStatusPermission) {
                // If user doesn't have permission, ignore the status update
                delete updateData.chequeStatus;
            }
        }

        // Update the collection
        const updatedCollection = await Collection.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('party', 'partyName ownerName')
            .populate('createdBy', 'name email');

        // Sync Bank Name if updated
        if (updateData.bankName && (collection.paymentMethod === 'bank_transfer' || collection.paymentMethod === 'cheque')) {
            await syncBankName(updateData.bankName, organizationId);
        }

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
// @access  Private
exports.deleteCollection = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // Dynamic role filtering:
        // - System roles and org admin: can delete any collection in org
        // - Regular users: can delete own collections only
        if (role !== 'admin' && !isSystemRole(role)) {
            query.createdBy = userId;
        }

        // Find the collection to get images
        const collection = await Collection.findOne(query);

        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }

        // Delete images from Cloudinary if they exist
        if (collection.images && collection.images.length > 0) {
            try {
                const organization = await Organization.findById(organizationId);
                if (organization) {
                    const deletePromises = collection.images.map((_, index) => {
                        // Correct naming convention for image deletion logic?
                        // NOTE: Images can have variable names if uploaded sequentially.
                        // However, we are likely storing full URLs. The public_id extraction is safer.
                        // For now, let's assum naming convention `image_${index}` if we strictly follow upload logic,
                        // BUT extracting public_id from URL is robust.
                        // Let's stick to the convention used in uploadCollectionImage: `image_${unique_id_or_index}`?
                        // Actually, let's rely on standard ID construction used in upload: public_id: `image_${imageNum}`
                        const publicId = `sales-sphere/${organization.name}/collections/${collection._id}/image_${index + 1}`;
                        return cloudinary.uploader.destroy(publicId).catch(err => {
                            console.error(`Error deleting image ${index + 1}:`, err);
                            return null;
                        });
                    });
                    await Promise.all(deletePromises);
                }
            } catch (cloudinaryError) {
                console.error('Error deleting images from Cloudinary:', cloudinaryError);
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

        // Find all collections to get images
        const collections = await Collection.find({
            _id: { $in: validIds },
            organizationId: organizationId
        }).select('_id images');

        // Get organization for Cloudinary folder path
        const organization = await Organization.findById(organizationId);

        // Delete images from Cloudinary
        if (organization) {
            const deletePromises = [];
            collections.forEach(collection => {
                if (collection.images && collection.images.length > 0) {
                    collection.images.forEach((_, index) => {
                        const publicId = `sales-sphere/${organization.name}/collections/${collection._id}/image_${index + 1}`;
                        deletePromises.push(
                            cloudinary.uploader.destroy(publicId).catch(err => {
                                console.error(`Error deleting image for collection ${collection._id}:`, err);
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
// IMAGE ENDPOINTS (Generic)
// ============================================

// @desc    Upload or update a collection image (specify imageNumber: 1, 2, or 3)
// @route   POST /api/v1/collections/:id/images
// @access  Private (Creator only)
exports.uploadCollectionImage = async (req, res, next) => {
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

        // Validate imageNumber (1 to 3)
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 3) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be between 1 and 3'
            });
        }

        // Fetch Collection and Org
        const [collection, organization] = await Promise.all([
            Collection.findOne({
                _id: id,
                organizationId: organizationId,
                createdBy: userId
            }),
            Organization.findById(organizationId).select('name').lean()
        ]);

        if (!collection) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }

        // Business Rule: Cash payments strictly no images?
        // Let's enforce it to be consistent with model validation
        if (collection.paymentMethod === 'cash') {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(400).json({ success: false, message: 'Images not allowed for cash payments' });
        }

        if (!organization) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const folderPath = `sales-sphere/${organization.name}/collections/${id}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: `image_${imageNum}`,
            overwrite: true,
            eager: [
                { width: 1200, height: 1600, crop: "limit", fetch_format: "auto", quality: "auto" }
            ],
            eager_async: true
        });

        // Cleanup temp file
        fs.unlink(tempFilePath, () => { });
        tempFilePath = null;

        // Initialize images array if needed
        if (!collection.images) {
            collection.images = [];
        }

        const arrayIndex = imageNum - 1; // 1 -> 0, 2 -> 1...

        // Ensure array has enough space
        while (collection.images.length <= arrayIndex) {
            collection.images.push(null);
        }

        collection.images[arrayIndex] = result.secure_url;
        await collection.save();

        // Return all images with their imageNumber
        const imagesWithNumber = collection.images
            .map((url, idx) => url ? { imageNumber: idx + 1, url } : null)
            .filter(img => img !== null);

        return res.status(200).json({
            success: true,
            message: `Image ${imageNum} uploaded successfully`,
            data: {
                images: imagesWithNumber
            }
        });
    } catch (error) {
        if (tempFilePath) fs.unlink(tempFilePath, () => { });
        console.error('Error uploading collection image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a generic image from a collection
// @route   DELETE /api/v1/collections/:id/images/:imageNumber
// @access  Private
exports.deleteCollectionImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;
        const { id, imageNumber } = req.params;

        // Validate imageNumber (1 to 3)
        const imageNum = parseInt(imageNumber, 10);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 3) {
            return res.status(400).json({ success: false, message: 'imageNumber must be between 1 and 3' });
        }

        const arrayIndex = imageNum - 1;

        // Build query based on dynamic role
        const query = {
            _id: id,
            organizationId: organizationId
        };

        if (role !== 'admin' && !isSystemRole(role)) {
            query.createdBy = userId;
        }

        const collection = await Collection.findOne(query);

        if (!collection) {
            return res.status(404).json({ success: false, message: 'Collection not found' });
        }

        if (!collection.images || !collection.images[arrayIndex]) {
            return res.status(404).json({ success: false, message: `Image ${imageNum} not found` });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Delete from Cloudinary
        try {
            const publicId = `sales-sphere/${organization.name}/collections/${id}/image_${imageNum}`;
            await cloudinary.uploader.destroy(publicId);
        } catch (cloudinaryError) {
            console.error('Error deleting from Cloudinary:', cloudinaryError);
        }

        // Set the image to null (maintain array structure)
        collection.images[arrayIndex] = null;
        // Filter out null values
        collection.images = collection.images.filter(img => img !== null);
        await collection.save();

        // Return images with their imageNumber
        const imagesWithNumber = collection.images
            .map((url, idx) => url ? { imageNumber: idx + 1, url } : null)
            .filter(img => img !== null);

        return res.status(200).json({
            success: true,
            message: `Image ${imageNum} deleted successfully`,
            data: {
                images: imagesWithNumber
            }
        });
    } catch (error) {
        console.error('Error deleting collection image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get all unique bank names for the organization
// @route   GET /api/v1/collections/utils/bank-names
// @access  Private
exports.getBankNames = async (req, res, next) => {
    try {
        const { organizationId } = req.user;

        const bankNames = await BankName.find({ organizationId })
            .sort({ name: 1 })
            .select('name'); // We just need names, maybe IDs later

        res.status(200).json({
            success: true,
            count: bankNames.length,
            data: bankNames
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a bank name
// @route   PUT /api/v1/collections/utils/bank-names/:id
// @access  Private (Org Admin only)
exports.updateBankName = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;
        const { name } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Bank name is required' });
        }

        const normalizedName = name.trim();

        // Find the existing bank name
        const bankNameRecord = await BankName.findOne({ _id: id, organizationId });

        if (!bankNameRecord) {
            return res.status(404).json({ success: false, message: 'Bank name not found' });
        }

        const oldName = bankNameRecord.name;

        // Update the bank name record
        bankNameRecord.name = normalizedName;
        await bankNameRecord.save();

        // SYNC: Update all collections that used the old bank name
        if (oldName !== normalizedName) {
            await Collection.updateMany(
                { organizationId, bankName: oldName },
                { $set: { bankName: normalizedName } }
            );
        }

        res.status(200).json({ success: true, data: bankNameRecord, message: 'Bank name updated and synced' });
    } catch (error) {
        // Handle unique constraint check
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Bank name already exists' });
        }
        next(error);
    }
};

// @desc    Delete a bank name
// @route   DELETE /api/v1/collections/utils/bank-names/:id
// @access  Private (Org Admin only)
exports.deleteBankName = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const result = await BankName.findOneAndDelete({ _id: id, organizationId });

        if (!result) {
            return res.status(404).json({ success: false, message: 'Bank name not found' });
        }

        // We do NOT delete legacy collections.
        // The name will just remain as a string in historical records,
        // but it will disappear from the dropdown list.

        res.status(200).json({ success: true, message: 'Bank name deleted' });
    } catch (error) {
        next(error);
    }
};
