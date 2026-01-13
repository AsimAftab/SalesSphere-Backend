const MiscellaneousWork = require('./miscellaneous.model');
const Organization = require('../organizations/organization.model');
const User = require('../users/user.model');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs').promises;
const { DateTime } = require('luxon');
const mongoose = require('mongoose');
const { isSystemRole } = require('../../utils/defaultPermissions');

const { getHierarchyFilter } = require('../../utils/hierarchyHelper');
// Internal helper removed in favor of centralized deep hierarchy helper

// --- Zod Validation Schema ---
const miscellaneousWorkSchemaValidation = z.object({
    natureOfWork: z.string({ required_error: "Nature of work is required" }).min(1, "Nature of work is required"),
    address: z.string({ required_error: "Address is required" }).min(1, "Address is required"),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    workDate: z.string({ required_error: "Work date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    assignedBy: z.string().optional(), // Optional: name of person who assigned the work
});

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

// Centralized helper to get Org Timezone and Name (DRY - avoids repetitive DB calls)
const getOrgSettings = async (orgId) => {
    const org = await Organization.findById(orgId).select('timezone name').lean();
    return {
        timezone: org?.timezone || 'Asia/Kolkata',
        orgName: org?.name || 'unknown'
    };
};

// Parse date string and return a Date at UTC midnight with local date components
// This prevents timezone issues when querying by date
const parseDateToOrgTZ = (dateStr, timezone = 'Asia/Kolkata') => {
    if (!dateStr) throw new Error('Date is required');

    const dateString = String(dateStr).trim();

    // For date-only strings (YYYY-MM-DD), explicitly parse components
    const isoDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
        const year = parseInt(isoDateMatch[1], 10);
        const month = parseInt(isoDateMatch[2], 10);
        const day = parseInt(isoDateMatch[3], 10);

        const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });

        if (!dt.isValid) {
            throw new Error(`Invalid date: ${dateString}`);
        }

        // Return a Date object at UTC midnight with the LOCAL date components
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    // Try ISO date format with time
    let dt = DateTime.fromISO(dateString, { zone: timezone });

    if (!dt.isValid) {
        const jsDate = new Date(dateString);
        if (isNaN(jsDate.getTime())) {
            throw new Error(`Invalid date format: ${dateString}`);
        }
        dt = DateTime.fromJSDate(jsDate, { zone: timezone });
    }

    if (!dt.isValid) {
        throw new Error(`Invalid date: ${dateString}`);
    }

    const { year, month, day } = dt;
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// Get day range for a specific date in org timezone
const getDayRangeInOrgTZ = (dateStr, timezone = 'Asia/Kolkata') => {
    const date = parseDateToOrgTZ(dateStr, timezone);
    const start = date;
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
};

// Get month range in org timezone
const getMonthRangeInOrgTZ = (year, month, timezone = 'Asia/Kolkata') => {
    const startDt = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone });
    const start = new Date(Date.UTC(startDt.year, startDt.month - 1, startDt.day, 0, 0, 0, 0));

    const endDt = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone }).endOf('month');
    const end = new Date(Date.UTC(endDt.year, endDt.month - 1, endDt.day, 23, 59, 59, 999));

    return { start, end };
};

// Helper to build month/date-based folder path using Luxon
const buildFolderPath = (orgName, workDate, timezone = 'Asia/Kolkata') => {
    const dt = DateTime.fromJSDate(new Date(workDate), { zone: 'UTC' });
    const year = dt.year;
    const month = String(dt.month).padStart(2, '0');
    const day = String(dt.day).padStart(2, '0');
    return `sales-sphere/${orgName}/miscellaneous-work/${year}/${month}/${day}`;
};

// @desc    Create a new miscellaneous work entry
// @route   POST /api/v1/miscellaneous-work
// @access  Authenticated Users
exports.createMiscellaneousWork = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // 🔥 OPTIMIZATION: Parallelize Validation and Org settings fetch
        const [validatedData, { timezone }] = await Promise.all([
            miscellaneousWorkSchemaValidation.parseAsync(req.body),
            getOrgSettings(organizationId)
        ]);

        const workDate = parseDateToOrgTZ(validatedData.workDate, timezone);

        const newWork = await MiscellaneousWork.create({
            ...validatedData,
            employeeId: userId,
            assignedBy: validatedData.assignedBy || req.user.name,
            organizationId,
            workDate,
        });

        return res.status(201).json({
            success: true,
            message: 'Miscellaneous work created successfully',
            data: newWork,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.flatten().fieldErrors,
            });
        }
        console.error('Error creating miscellaneous work:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get all miscellaneous work entries with optional date/month filters
// @route   GET /api/v1/miscellaneous-work
// @access  Authenticated Users
exports.getAllMiscellaneousWork = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { date, month, year } = req.query;

        // Use centralized helper for org settings
        const { timezone } = await getOrgSettings(organizationId);

        // Get hierarchy filter
        // Get hierarchy filter
        // Note: MiscellaneousWork uses 'employeeId' instead of 'createdBy', so we map it if necessary
        // However, centralized helper assumes 'createdBy' or standard usage. 
        // Let's check centralized helper implementation. It returns { $or: [{ createdBy: ... }] }.
        // MiscellaneousWork schema likely uses 'employeeId'. 
        // We need to verify if we can pass a custom field name or if we need to manually adjust.
        // Looking at hierarchyHelper.js (from memory/context), it defaults to `createdBy`.
        // We should wrap it or adjust the result. 
        // ACTUALLY, checking hierarchyHelper.js content from previous turns is safer.
        // It returns `{ $or: [{ createdBy: userId }, { createdBy: { $in: subordinateIds } }] }`
        // We need to change 'createdBy' to 'employeeId' in the result.

        const rawFilter = await getHierarchyFilter(req.user, 'miscellaneousWork', 'viewAllMiscellaneous');
        const hierarchyFilter = JSON.parse(JSON.stringify(rawFilter).replace(/createdBy/g, 'employeeId'));

        let query = { organizationId, ...hierarchyFilter };

        // Filter by specific date
        if (date) {
            const { start, end } = getDayRangeInOrgTZ(date, timezone);
            query.workDate = { $gte: start, $lte: end };
        }
        // Filter by month and year
        else if (month && year) {
            const { start, end } = getMonthRangeInOrgTZ(parseInt(year), parseInt(month), timezone);
            query.workDate = { $gte: start, $lte: end };
        }

        const works = await MiscellaneousWork.find(query)
            .populate({
                path: 'employeeId',
                select: 'name role avatarUrl customRoleId',
                populate: { path: 'customRoleId', select: 'name' }
            })
            .sort({ workDate: -1, createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: works.length,
            data: works.map((work, index) => ({
                sNo: index + 1,
                ...work
            })),
            organizationTimezone: timezone
        });
    } catch (error) {
        console.error('Error fetching miscellaneous work:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get miscellaneous work entries for the logged-in user (salesperson)
// @route   GET /api/v1/miscellaneous-work/my-work
// @access  Authenticated Users
exports.getMyMiscellaneousWork = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { date, month, year } = req.query;

        // Use centralized helper for org settings
        const { timezone } = await getOrgSettings(organizationId);

        // Query by organization AND the logged-in user's employee ID
        let query = { organizationId, employeeId: userId };

        // Filter by specific date
        if (date) {
            const { start, end } = getDayRangeInOrgTZ(date, timezone);
            query.workDate = { $gte: start, $lte: end };
        }
        // Filter by month and year
        else if (month && year) {
            const { start, end } = getMonthRangeInOrgTZ(parseInt(year), parseInt(month), timezone);
            query.workDate = { $gte: start, $lte: end };
        }

        const works = await MiscellaneousWork.find(query)
            .populate({
                path: 'employeeId',
                select: 'name role avatarUrl customRoleId',
                populate: { path: 'customRoleId', select: 'name' }
            })
            .sort({ workDate: -1, createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: works.length,
            data: works.map((work, index) => ({
                sNo: index + 1,
                ...work
            })),
            organizationTimezone: timezone
        });
    } catch (error) {
        console.error('Error fetching user miscellaneous work:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get a single miscellaneous work entry by ID
// @route   GET /api/v1/miscellaneous-work/:id
// @access  Authenticated Users
exports.getMiscellaneousWorkById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const work = await MiscellaneousWork.findOne({ _id: id, organizationId })
            .populate('employeeId', 'name role');

        if (!work) {
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
        }

        return res.status(200).json({
            success: true,
            data: work,
        });
    } catch (error) {
        console.error('Error fetching miscellaneous work:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get images for a specific miscellaneous work entry
// @route   GET /api/v1/miscellaneous-work/:id/images
// @access  Authenticated Users
exports.getMiscellaneousWorkImages = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const work = await MiscellaneousWork.findOne({ _id: id, organizationId })
            .select('images');

        if (!work) {
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
        }

        return res.status(200).json({
            success: true,
            count: work.images.length,
            data: work.images,
        });
    } catch (error) {
        console.error('Error fetching miscellaneous work images:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update a miscellaneous work entry
// @route   PUT /api/v1/miscellaneous-work/:id
// @access  Authenticated Users (Admin, Manager, Salesperson - own work only)
exports.updateMiscellaneousWork = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId, role } = req.user;
        const { id } = req.params;

        // Use .partial() to allow partial updates
        const validatedData = miscellaneousWorkSchemaValidation.partial().parse(req.body);

        const work = await MiscellaneousWork.findOne({ _id: id, organizationId });
        if (!work) {
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
        }

        // Salesperson can only edit their own work
        if (role === 'salesperson' && work.employeeId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own miscellaneous work'
            });
        }

        // Prepare update data
        const updateData = { ...validatedData };

        // Only parse workDate if it's provided
        if (validatedData.workDate) {
            updateData.workDate = new Date(validatedData.workDate);
        }

        const updatedWork = await MiscellaneousWork.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('employeeId', 'name role');

        return res.status(200).json({
            success: true,
            message: 'Miscellaneous work updated successfully',
            data: updatedWork,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
            });
        }
        console.error('Error updating miscellaneous work:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a miscellaneous work entry
// @route   DELETE /api/v1/miscellaneous-work/:id
// @access  Authenticated Users (Admin, Manager)
exports.deleteMiscellaneousWork = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const work = await MiscellaneousWork.findOne({ _id: id, organizationId });
        if (!work) {
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
        }

        await MiscellaneousWork.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Miscellaneous work deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting miscellaneous work:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Mass delete miscellaneous work entries with images
// @route   DELETE /api/v1/miscellaneous-work/mass-delete
// @access  Authenticated Users (Admin, Manager)
exports.massBulkDeleteMiscellaneousWork = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { ids } = req.body;

        // Validate input
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of IDs to delete'
            });
        }

        // Validate that all IDs are valid MongoDB ObjectIDs
        const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format detected',
                invalidIds: invalidIds,
                hint: 'MongoDB ObjectIDs must be 24-character hexadecimal strings (0-9, a-f)'
            });
        }

        // Fetch all works that match the IDs and belong to the organization
        const works = await MiscellaneousWork.find({
            _id: { $in: ids },
            organizationId
        });

        if (works.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No miscellaneous work entries found for the provided IDs'
            });
        }

        // Fetch organization for folder path construction
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const orgName = organization.name;
        const deletionResults = {
            totalRequested: ids.length,
            totalFound: works.length,
            totalDeleted: 0,
            imagesDeleted: 0,
            imagesFailed: 0,
            errors: []
        };

        // Delete images from Cloudinary and work entries in parallel for better performance
        const deletePromises = works.map(async (work) => {
            const result = { imagesDeleted: 0, imagesFailed: 0, success: true, id: work._id };

            try {
                // Delete all images associated with this work entry
                if (work.images && work.images.length > 0) {
                    const folderPath = buildFolderPath(orgName, work.workDate);

                    // Delete images in parallel too
                    const imageDeletePromises = work.images.map(async (image) => {
                        try {
                            const publicId = `${folderPath}/${work._id}_image_${image.imageNumber}`;
                            await cloudinary.uploader.destroy(publicId);
                            return { success: true };
                        } catch (cloudinaryError) {
                            console.error(`Error deleting image from Cloudinary for work ${work._id}:`, cloudinaryError);
                            return { success: false };
                        }
                    });

                    const imageResults = await Promise.all(imageDeletePromises);
                    result.imagesDeleted = imageResults.filter(r => r.success).length;
                    result.imagesFailed = imageResults.filter(r => !r.success).length;
                }

                // Delete the work entry from database
                await MiscellaneousWork.findByIdAndDelete(work._id);
            } catch (error) {
                console.error(`Error deleting miscellaneous work ${work._id}:`, error);
                result.success = false;
                result.error = error.message;
            }

            return result;
        });

        const results = await Promise.all(deletePromises);

        // Aggregate results
        results.forEach(r => {
            if (r.success) deletionResults.totalDeleted++;
            deletionResults.imagesDeleted += r.imagesDeleted;
            deletionResults.imagesFailed += r.imagesFailed;
            if (r.error) deletionResults.errors.push({ id: r.id, error: r.error });
        });

        return res.status(200).json({
            success: true,
            message: `Successfully deleted ${deletionResults.totalDeleted} miscellaneous work entries`,
            data: deletionResults
        });
    } catch (error) {
        console.error('Error in mass delete miscellaneous work:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Upload or update an image for miscellaneous work
// @route   POST /api/v1/miscellaneous-work/:id/images
// @access  Authenticated Users
exports.uploadMiscellaneousWorkImage = async (req, res, next) => {
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

        // Validate imageNumber (1 or 2)
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 2) {
            await cleanupTempFile(tempFilePath);
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be 1 or 2'
            });
        }

        // 🔥 OPTIMIZATION: Fetch work and org info in parallel
        const [work, { orgName }] = await Promise.all([
            MiscellaneousWork.findOne({ _id: id, organizationId }),
            getOrgSettings(organizationId)
        ]);

        if (!work) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
        }

        const folderPath = buildFolderPath(orgName, work.workDate);

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

        // Check if image with this number already exists
        const existingImageIndex = work.images.findIndex(img => img.imageNumber === imageNum);

        if (existingImageIndex !== -1) {
            // Update existing image
            work.images[existingImageIndex].imageUrl = result.secure_url;
        } else {
            // Add new image
            work.images.push({
                imageNumber: imageNum,
                imageUrl: result.secure_url
            });
        }

        await work.save();

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
        console.error('Error uploading miscellaneous work image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete an image from miscellaneous work
// @route   DELETE /api/v1/miscellaneous-work/:id/images/:imageNumber
// @access  Authenticated Users
exports.deleteMiscellaneousWorkImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id, imageNumber } = req.params;

        // Validate imageNumber
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 2) {
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be 1 or 2'
            });
        }

        // Check if work exists and belongs to organization
        const work = await MiscellaneousWork.findOne({ _id: id, organizationId });
        if (!work) {
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
        }

        // Find and remove the image
        const imageIndex = work.images.findIndex(img => img.imageNumber === imageNum);
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

        const orgName = organization.name;
        const folderPath = buildFolderPath(orgName, work.workDate);

        // Remove from array
        work.images.splice(imageIndex, 1);
        await work.save();

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
        console.error('Error deleting miscellaneous work image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
