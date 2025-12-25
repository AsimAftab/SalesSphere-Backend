const MiscellaneousWork = require('./miscellaneous.model');
const Organization = require('../organizations/organization.model');
const User = require('../users/user.model');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');
const { DateTime } = require('luxon');

// --- Zod Validation Schema ---
const miscellaneousWorkSchemaValidation = z.object({
    natureOfWork: z.string({ required_error: "Nature of work is required" }).min(1, "Nature of work is required"),
    address: z.string({ required_error: "Address is required" }).min(1, "Address is required"),
    workDate: z.string({ required_error: "Work date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    assignedById: z.string().optional(), // Optional: defaults to current user if not provided
});

// Helper function to safely delete a file
const cleanupTempFile = (filePath) => {
    if (filePath) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error removing temp file ${filePath}:`, err);
        });
    }
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

        // Fetch organization for timezone
        const organization = await Organization.findById(organizationId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';

        // Validate request body
        const validatedData = miscellaneousWorkSchemaValidation.parse(req.body);

        // Parse workDate using Luxon to handle timezone correctly
        const workDate = parseDateToOrgTZ(validatedData.workDate, timezone);

        const newWork = await MiscellaneousWork.create({
            ...validatedData,
            employeeId: userId,
            assignedById: validatedData.assignedById || userId, // Use provided value or default to current user
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
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
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

        // Fetch organization for timezone
        const organization = await Organization.findById(organizationId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';

        let query = { organizationId };

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
            .populate('employeeId', 'name role avatarUrl')
            .populate('assignedById', 'name')
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

// @desc    Get a single miscellaneous work entry by ID
// @route   GET /api/v1/miscellaneous-work/:id
// @access  Authenticated Users
exports.getMiscellaneousWorkById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const work = await MiscellaneousWork.findOne({ _id: id, organizationId })
            .populate('employeeId', 'name role')
            .populate('assignedById', 'name');

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
// @access  Authenticated Users (Admin, Manager)
exports.updateMiscellaneousWork = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Use .partial() to allow partial updates
        const validatedData = miscellaneousWorkSchemaValidation.partial().parse(req.body);

        const work = await MiscellaneousWork.findOne({ _id: id, organizationId });
        if (!work) {
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
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
            .populate('employeeId', 'name role')
            .populate('assignedById', 'name');

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
            cleanupTempFile(tempFilePath);
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be 1 or 2'
            });
        }

        // Check if work exists and belongs to organization
        const work = await MiscellaneousWork.findOne({ _id: id, organizationId });
        if (!work) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Miscellaneous work not found' });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const orgName = organization.name;
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

        cleanupTempFile(tempFilePath);
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
        cleanupTempFile(tempFilePath);
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
