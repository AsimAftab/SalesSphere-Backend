const Site = require('./sites.model');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');

// --- Zod Validation Schema ---
const siteSchemaValidation = z.object({
    siteName: z.string({ required_error: "Site name is required" }).min(1, "Site name is required"),
    ownerName: z.string({ required_error: "Owner name is required" }).min(1, "Owner name is required"),
    dateJoined: z.string({ required_error: "Date joined is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
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

// @desc    Create a new site
exports.createSite = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Validate request body
        const validatedData = siteSchemaValidation.parse(req.body);

        const newSite = await Site.create({
            ...validatedData,
            organizationId,
            createdBy: userId,
        });

        return res.status(201).json({
            success: true,
            message: 'Site created successfully',
            data: newSite,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
            });
        }
        console.error('Error creating site:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get all sites for the organization
exports.getAllSites = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const sites = await Site.find({ organizationId })
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: sites.length,
            data: sites,
        });
    } catch (error) {
        console.error('Error fetching sites:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get a single site by ID
exports.getSiteById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const site = await Site.findOne({ _id: id, organizationId })
            .populate('createdBy', 'name email');

        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found' });
        }

        return res.status(200).json({
            success: true,
            data: site,
        });
    } catch (error) {
        console.error('Error fetching site:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update a site
exports.updateSite = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Validate request body
        const validatedData = siteSchemaValidation.parse(req.body);

        const site = await Site.findOne({ _id: id, organizationId });
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found' });
        }

        const updatedSite = await Site.findByIdAndUpdate(
            id,
            validatedData,
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email');

        return res.status(200).json({
            success: true,
            message: 'Site updated successfully',
            data: updatedSite,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
            });
        }
        console.error('Error updating site:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a site
exports.deleteSite = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const site = await Site.findOne({ _id: id, organizationId });
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found' });
        }

        await Site.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Site deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting site:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper function to safely delete a file
const cleanupTempFile = (filePath) => {
    if (filePath) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error removing temp file ${filePath}:`, err);
        });
    }
};

// @desc    Upload or update a site image
exports.uploadSiteImage = async (req, res, next) => {
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

        // Validate imageNumber
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 9) {
            cleanupTempFile(tempFilePath);
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be between 1 and 9'
            });
        }

        // Check if site exists and belongs to organization
        const site = await Site.findOne({ _id: id, organizationId });
        if (!site) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Site not found' });
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: `sales-sphere/sites/${id}`,
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
        const existingImageIndex = site.images.findIndex(img => img.imageNumber === imageNum);

        if (existingImageIndex !== -1) {
            // Update existing image
            site.images[existingImageIndex].imageUrl = result.secure_url;
        } else {
            // Add new image
            site.images.push({
                imageNumber: imageNum,
                imageUrl: result.secure_url
            });
        }

        await site.save();

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
        console.error('Error uploading site image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete a site image
exports.deleteSiteImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id, imageNumber } = req.params;

        // Validate imageNumber
        const imageNum = parseInt(imageNumber);
        if (isNaN(imageNum) || imageNum < 1 || imageNum > 9) {
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be between 1 and 9'
            });
        }

        // Check if site exists and belongs to organization
        const site = await Site.findOne({ _id: id, organizationId });
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found' });
        }

        // Find and remove the image
        const imageIndex = site.images.findIndex(img => img.imageNumber === imageNum);
        if (imageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: `Image ${imageNum} not found`
            });
        }

        // Remove from array
        site.images.splice(imageIndex, 1);
        await site.save();

        // Optionally delete from Cloudinary
        try {
            await cloudinary.uploader.destroy(`sales-sphere/sites/${id}/${id}_image_${imageNum}`);
        } catch (cloudinaryError) {
            console.error('Error deleting from Cloudinary:', cloudinaryError);
            // Continue even if Cloudinary delete fails
        }

        return res.status(200).json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting site image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};