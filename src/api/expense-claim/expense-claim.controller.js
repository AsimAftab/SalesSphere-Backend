const ExpenseClaim = require('./expense-claim.model');
const ExpenseCategory = require('./expenseCategory.model');
const Organization = require('../organizations/organization.model');
const mongoose = require('mongoose');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');

// --- Zod Validation Schema ---
const expenseClaimSchemaValidation = z.object({
    title: z.string({ required_error: "Title is required" }).min(1, "Title is required"),
    amount: z.coerce.number({ required_error: "Amount is required" }).min(0, "Amount cannot be negative"),
    incurredDate: z.string({ required_error: "Incurred date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    category: z.string({ required_error: "Category is required" }).min(1, "Category is required"), // Accepts category name (string)
    description: z.string().optional(),
    party: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), "Invalid party ID").optional(), // Optional party reference
});

// --- Category Validation ---
const categorySchemaValidation = z.object({
    name: z.string({ required_error: "Category name is required" }).min(1, "Category name is required"),
});

// --- Status Update Validation ---
const statusSchemaValidation = z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
    rejectionReason: z.string().optional(),
});

// --- HELPER: Get or Create Category ---
const getOrCreateCategory = async (categoryName, organizationId) => {
    const trimmedName = categoryName.trim();

    // Check if category exists (case-insensitive)
    let category = await ExpenseCategory.findOne({
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
        organizationId: organizationId
    });

    // If category doesn't exist, create it
    if (!category) {
        category = await ExpenseCategory.create({
            name: trimmedName,
            organizationId: organizationId
        });
    }

    return category;
};

// ============================================
// EXPENSE CLAIM ENDPOINTS
// ============================================

// @desc    Create a new expense claim
// @route   POST /api/v1/expense-claims
// @access  Private (All authenticated users)
exports.createExpenseClaim = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const validatedData = expenseClaimSchemaValidation.parse(req.body);

        // Get or create category (auto-creates if doesn't exist)
        const category = await getOrCreateCategory(validatedData.category, organizationId);

        const newExpenseClaim = await ExpenseClaim.create({
            title: validatedData.title,
            amount: validatedData.amount,
            incurredDate: new Date(validatedData.incurredDate),
            category: category._id,
            description: validatedData.description,
            party: validatedData.party, // Optional party reference
            organizationId: organizationId,
            createdBy: userId,
            status: 'pending',
        });

        // Populate category and party for response
        await newExpenseClaim.populate('category', 'name');
        if (newExpenseClaim.party) {
            await newExpenseClaim.populate('party', 'partyName ownerName');
        }

        res.status(201).json({ success: true, data: newExpenseClaim });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        console.error("Error creating expense claim:", error);
        next(error);
    }
};

// @desc    Get all expense claims
// @route   GET /api/v1/expense-claims
// @access  Private
exports.getAllExpenseClaims = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = { organizationId: organizationId };

        // Salesperson can only see their own expense claims
        if (role === 'salesperson') {
            query.createdBy = userId;
        }

        const expenseClaims = await ExpenseClaim.find(query)
            .select('title amount incurredDate category description status createdBy approvedBy party createdAt')
            .populate('category', 'name')
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('party', 'partyName ownerName')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: expenseClaims.length, data: expenseClaims });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single expense claim by ID
// @route   GET /api/v1/expense-claims/:id
// @access  Private
exports.getExpenseClaimById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // Salesperson can only see their own expense claims
        if (role === 'salesperson') {
            query.createdBy = userId;
        }

        const expenseClaim = await ExpenseClaim.findOne(query)
            .populate('category', 'name')
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('party', 'partyName ownerName');

        if (!expenseClaim) {
            return res.status(404).json({ success: false, message: 'Expense claim not found' });
        }

        res.status(200).json({ success: true, data: expenseClaim });
    } catch (error) {
        next(error);
    }
};

// @desc    Update an expense claim
// @route   PUT /api/v1/expense-claims/:id
// @access  Private (Only the creator can update if status is pending)
exports.updateExpenseClaim = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const validatedData = expenseClaimSchemaValidation.partial().parse(req.body);

        // Find the expense claim
        const expenseClaim = await ExpenseClaim.findOne({
            _id: req.params.id,
            organizationId: organizationId,
            createdBy: userId
        });

        if (!expenseClaim) {
            return res.status(404).json({ success: false, message: 'Expense claim not found' });
        }

        // Only allow updates if status is pending
        if (expenseClaim.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update an expense claim that has already been processed'
            });
        }

        // If category is being updated, get or create it
        if (validatedData.category) {
            const category = await getOrCreateCategory(validatedData.category, organizationId);
            validatedData.category = category._id;
        }

        // Update the expense claim
        if (validatedData.incurredDate) {
            validatedData.incurredDate = new Date(validatedData.incurredDate);
        }

        const updatedExpenseClaim = await ExpenseClaim.findByIdAndUpdate(
            req.params.id,
            validatedData,
            { new: true, runValidators: true }
        ).populate('category', 'name').populate('createdBy', 'name email');

        res.status(200).json({ success: true, data: updatedExpenseClaim });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Delete an expense claim
// @route   DELETE /api/v1/expense-claims/:id
// @access  Private (Only the creator can delete if status is pending, Admin/Manager can delete any)
exports.deleteExpenseClaim = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId
        };

        // If not admin/manager, restrict to own pending claims
        if (role === 'salesperson') {
            query.createdBy = userId;
            query.status = 'pending';
        }

        // First find the expense claim to get the receipt URL
        const expenseClaim = await ExpenseClaim.findOne(query);

        if (!expenseClaim) {
            return res.status(404).json({
                success: false,
                message: 'Expense claim not found or cannot be deleted'
            });
        }

        // Delete receipt from Cloudinary if it exists
        if (expenseClaim.receipt) {
            try {
                const organization = await Organization.findById(organizationId);
                if (organization) {
                    const publicId = `sales-sphere/${organization.name}/expense-claims/${expenseClaim._id}/receipt`;
                    await cloudinary.uploader.destroy(publicId);
                }
            } catch (cloudinaryError) {
                console.error('Error deleting receipt from Cloudinary:', cloudinaryError);
                // Continue with deletion even if Cloudinary fails
            }
        }

        // Now delete the expense claim
        await ExpenseClaim.findByIdAndDelete(expenseClaim._id);

        res.status(200).json({ success: true, message: 'Expense claim deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Update expense claim status (approve/reject)
// @route   PUT /api/v1/expense-claims/:id/status
// @access  Private (Admin, Manager only)
exports.updateExpenseClaimStatus = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const { status, rejectionReason } = statusSchemaValidation.parse(req.body);

        const expenseClaim = await ExpenseClaim.findOne({
            _id: req.params.id,
            organizationId: organizationId
        });

        if (!expenseClaim) {
            return res.status(404).json({ success: false, message: 'Expense claim not found' });
        }

        // Don't allow changing status of already processed claims
        if (expenseClaim.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot change status of a ${expenseClaim.status} expense claim`
            });
        }

        // Prevent users from approving/rejecting their own expense claims
        if (expenseClaim.createdBy.toString() === userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve or reject your own expense claim'
            });
        }

        // Update status
        expenseClaim.status = status;

        if (status === 'approved') {
            expenseClaim.approvedBy = userId;
            expenseClaim.approvedAt = new Date();
        } else if (status === 'rejected') {
            expenseClaim.approvedBy = userId;
            expenseClaim.approvedAt = new Date();
            if (rejectionReason) {
                expenseClaim.rejectionReason = rejectionReason;
            }
        }

        await expenseClaim.save();

        const updatedClaim = await ExpenseClaim.findById(expenseClaim._id)
            .populate('category', 'name')
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email');

        res.status(200).json({ success: true, data: updatedClaim });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Bulk delete expense claims
// @route   DELETE /api/v1/expense-claims/bulk-delete
// @access  Private (Admin, Manager)
exports.bulkDeleteExpenseClaims = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of expense claim IDs'
            });
        }

        // Validate all IDs
        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length !== ids.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more invalid expense claim IDs'
            });
        }

        // First, find all expense claims to get their receipt URLs
        const expenseClaims = await ExpenseClaim.find({
            _id: { $in: validIds },
            organizationId: organizationId
        }).select('_id receipt');

        // Get organization for Cloudinary folder path
        const organization = await Organization.findById(organizationId);

        // Delete receipts from Cloudinary
        if (organization) {
            const deletePromises = expenseClaims
                .filter(claim => claim.receipt)
                .map(claim => {
                    const publicId = `sales-sphere/${organization.name}/expense-claims/${claim._id}/receipt`;
                    return cloudinary.uploader.destroy(publicId).catch(err => {
                        console.error(`Error deleting receipt for claim ${claim._id}:`, err);
                        return null; // Continue even if one fails
                    });
                });

            await Promise.all(deletePromises);
        }

        // Now delete the expense claims
        const result = await ExpenseClaim.deleteMany({
            _id: { $in: validIds },
            organizationId: organizationId
        });

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} expense claim(s) deleted successfully`
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// EXPENSE CATEGORY ENDPOINTS
// ============================================

// @desc    Create a new expense category
// @route   POST /api/v1/expense-claims/categories
// @access  Private (Admin, Manager)
exports.createExpenseCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const validatedData = categorySchemaValidation.parse(req.body);

        const newCategory = await ExpenseCategory.create({
            ...validatedData,
            organizationId: organizationId,
        });

        res.status(201).json({ success: true, data: newCategory });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Category with this name already exists' });
        }
        next(error);
    }
};

// @desc    Get all expense categories
// @route   GET /api/v1/expense-claims/categories
// @access  Private
exports.getExpenseCategories = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const categories = await ExpenseCategory.find({ organizationId: organizationId })
            .sort({ name: 1 })
            .lean();

        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        next(error);
    }
};

// @desc    Update an expense category
// @route   PUT /api/v1/expense-claims/categories/:id
// @access  Private (Admin, Manager)
exports.updateExpenseCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const validatedData = categorySchemaValidation.parse(req.body);

        const category = await ExpenseCategory.findOneAndUpdate(
            { _id: req.params.id, organizationId: organizationId },
            validatedData,
            { new: true, runValidators: true }
        );

        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        res.status(200).json({ success: true, data: category });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Category with this name already exists' });
        }
        next(error);
    }
};

// @desc    Delete an expense category
// @route   DELETE /api/v1/expense-claims/categories/:id
// @access  Private (Admin, Manager)
exports.deleteExpenseCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // Check if any expense claims are using this category
        const claimsUsingCategory = await ExpenseClaim.countDocuments({
            category: req.params.id,
            organizationId: organizationId
        });

        if (claimsUsingCategory > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category. ${claimsUsingCategory} expense claim(s) are using this category.`
            });
        }

        const category = await ExpenseCategory.findOneAndDelete({
            _id: req.params.id,
            organizationId: organizationId
        });

        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        res.status(200).json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// ============================================
// RECEIPT UPLOAD/DELETE ENDPOINTS
// ============================================

// Helper to cleanup temp file
const cleanupTempFile = (filePath) => {
    if (filePath) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error removing temp file ${filePath}:`, err);
        });
    }
};

// @desc    Upload receipt for an expense claim
// @route   POST /api/v1/expense-claims/:id/receipt
// @access  Private (Creator only)
exports.uploadReceipt = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;

        // Validate image file
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image file' });
        }

        // Check if expense claim exists and belongs to user
        const expenseClaim = await ExpenseClaim.findOne({
            _id: id,
            organizationId: organizationId,
            createdBy: userId
        });

        if (!expenseClaim) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Expense claim not found' });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const folderPath = `sales-sphere/${organization.name}/expense-claims/${id}`;

        // If there's an existing receipt, delete it from Cloudinary first
        if (expenseClaim.receipt) {
            try {
                // Extract public_id from URL
                const urlParts = expenseClaim.receipt.split('/');
                const publicIdWithExtension = urlParts.slice(-2).join('/').split('.')[0];
                const publicId = `sales-sphere/${organization.name}/expense-claims/${id}/receipt`;
                await cloudinary.uploader.destroy(publicId);
            } catch (deleteErr) {
                console.error('Error deleting old receipt from Cloudinary:', deleteErr);
                // Continue with upload even if delete fails
            }
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: 'receipt',
            overwrite: true,
            transformation: [
                { width: 1200, height: 1600, crop: "limit" },
                { fetch_format: "auto", quality: "auto" }
            ]
        });

        cleanupTempFile(tempFilePath);
        tempFilePath = null;

        // Update expense claim with receipt URL
        expenseClaim.receipt = result.secure_url;
        await expenseClaim.save();

        return res.status(200).json({
            success: true,
            message: 'Receipt uploaded successfully',
            data: {
                receipt: result.secure_url
            }
        });
    } catch (error) {
        cleanupTempFile(tempFilePath);
        console.error('Error uploading receipt:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete receipt from an expense claim
// @route   DELETE /api/v1/expense-claims/:id/receipt
// @access  Private (Creator only, or Admin/Manager)
exports.deleteReceipt = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;
        const { id } = req.params;

        // Build query based on role
        const query = {
            _id: id,
            organizationId: organizationId
        };

        // Only restrict to creator if not admin/manager
        if (role === 'salesperson') {
            query.createdBy = userId;
        }

        // Check if expense claim exists
        const expenseClaim = await ExpenseClaim.findOne(query);

        if (!expenseClaim) {
            return res.status(404).json({ success: false, message: 'Expense claim not found' });
        }

        if (!expenseClaim.receipt) {
            return res.status(404).json({ success: false, message: 'No receipt found for this expense claim' });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Delete from Cloudinary
        try {
            const publicId = `sales-sphere/${organization.name}/expense-claims/${id}/receipt`;
            await cloudinary.uploader.destroy(publicId);
        } catch (cloudinaryError) {
            console.error('Error deleting from Cloudinary:', cloudinaryError);
            // Continue even if Cloudinary delete fails
        }

        // Remove receipt from expense claim
        expenseClaim.receipt = undefined;
        await expenseClaim.save();

        return res.status(200).json({
            success: true,
            message: 'Receipt deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting receipt:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
