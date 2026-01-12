const Site = require('./sites.model');
const SiteCategory = require('./siteCategory.model');
const SiteSubOrganization = require('./siteSubOrganization.model');
const Organization = require('../organizations/organization.model');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs').promises;
const { getHierarchyFilter, getEntityAccessFilter } = require('../../utils/hierarchyHelper');
const { isValidFeature } = require('../../config/featureRegistry');

// Helper to escape regex metacharacters (prevents NoSQL injection via regex)
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- Zod Validation Schema ---
const siteSchemaValidation = z.object({
    siteName: z.string({ required_error: "Site name is required" }).min(1, "Site name is required"),
    ownerName: z.string({ required_error: "Owner name is required" }).min(1, "Owner name is required"),
    subOrganization: z.string().optional(),
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
    siteInterest: z.array(z.object({
        category: z.string({ required_error: "Category is required" }).min(1, "Category is required"),
        brands: z.array(z.string()).min(1, "At least one brand is required").max(50, "Maximum 50 brands allowed per category"),
        technicians: z.array(z.object({
            name: z.string().min(1, "Technician name is required"),
            phone: z.string().min(1, "Technician phone is required")
        })).max(20, "Maximum 20 technicians allowed per category").optional()
    })).max(10, "Maximum 10 categories allowed per site").optional(),
});

// Sync Site Interest Helper (atomic operations to prevent race conditions)
const syncSiteInterest = async (interests, organizationId, user) => {
    if (!interests || interests.length === 0) return;

    for (const item of interests) {
        const categoryName = item.category.trim();
        const brands = item.brands || [];
        const technicians = item.technicians || [];

        // Check if category exists (with escaped regex to prevent NoSQL injection)
        const escapedCategoryName = escapeRegex(categoryName);
        let category = await SiteCategory.findOne({
            name: { $regex: new RegExp(`^${escapedCategoryName}$`, 'i') },
            organizationId: organizationId
        });

        if (category) {
            // Use atomic updates for existing category
            const updateOps = {};

            // Add brands atomically (case-insensitive deduplication)
            if (brands.length > 0) {
                // Get current brands for deduplication
                const existingBrandNames = new Set(category.brands.map(b => b.toLowerCase()));
                const newBrands = brands.filter(b => !existingBrandNames.has(b.toLowerCase()));
                if (newBrands.length > 0) {
                    updateOps.$push = { brands: { $each: newBrands } };
                }
            }

            // Add technicians atomically (using addToSet for phone-based deduplication)
            if (technicians.length > 0) {
                if (!updateOps.$addToSet) updateOps.$addToSet = {};
                updateOps.$addToSet.technicians = { $each: technicians };
            }

            if (Object.keys(updateOps).length > 0) {
                await SiteCategory.updateOne(
                    { _id: category._id },
                    updateOps
                );
            }
        } else {
            // Create: New category with brands and technicians (all authenticated users can create)
            await SiteCategory.create({
                name: categoryName,
                brands: brands,
                technicians: technicians,
                organizationId: organizationId
            });
        }
    }
};

// Sync Sub-Organization Helper (atomic operation to prevent race conditions)
const syncSubOrganization = async (subOrgName, organizationId, user) => {
    if (!subOrgName) return;

    const trimmedName = subOrgName.trim();
    const escapedName = escapeRegex(trimmedName);

    // Use findOneAndUpdate with upsert for atomic operation (prevents race conditions)
    await SiteSubOrganization.findOneAndUpdate(
        {
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
            organizationId: organizationId
        },
        {
            $setOnInsert: {
                name: trimmedName,
                organizationId: organizationId
            }
        },
        { upsert: true, new: true }
    );
};

// @desc    Create a new site
exports.createSite = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Validate request body
        const validatedData = siteSchemaValidation.parse(req.body);

        // ⚡ Run sync operations in parallel for better performance
        const syncOps = [];
        if (validatedData.siteInterest) {
            syncOps.push(syncSiteInterest(validatedData.siteInterest, organizationId, req.user));
        } else {
            syncOps.push(Promise.resolve());
        }
        if (validatedData.subOrganization) {
            syncOps.push(syncSubOrganization(validatedData.subOrganization, organizationId, req.user));
        } else {
            syncOps.push(Promise.resolve());
        }

        try {
            await Promise.all(syncOps);
        } catch (err) {
            return res.status(403).json({ success: false, message: err.message });
        }

        const newSite = await Site.create({
            ...validatedData,
            organizationId,
            createdBy: userId,
            // Auto-assign creator to the site
            assignedUsers: [userId],
            assignedBy: userId,
            assignedAt: new Date(),
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

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewAllSites'
        );
        const query = { organizationId, ...accessFilter };

        const sites = await Site.find(query)
            .select('-images') // Exclude images for performance and security
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

// @desc    Get all sites for logged-in user's organization
// @route   GET /api/sites/details
// @access  Private
exports.getAllSitesDetails = async (req, res, next) => {
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
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );
        const query = { organizationId, ...accessFilter };

        const sites = await Site.find(query)
            .select('-images') // Exclude images for performance and security
            .sort({ createdAt: -1 })
            .lean(); // Optional: returns plain JSON, faster

        return res.status(200).json({
            success: true,
            count: sites.length,
            data: sites

        });

    } catch (error) {
        next(error);
    }
};


// @desc    Get a single site by ID
exports.getSiteById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );
        const query = { _id: id, organizationId, ...accessFilter };

        const site = await Site.findOne(query)
            .select('-images') // Exclude images for performance and security
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

// @desc    Get site images
// @route   GET /api/sites/:id/images
// @access  Private (Requires manageImages permission)
exports.getSiteImages = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Use entity access filter (includes hierarchy + assignment)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );
        const query = { _id: id, organizationId, ...accessFilter };

        const site = await Site.findOne(query).select('images');

        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found or access denied' });
        }

        return res.status(200).json({
            success: true,
            count: site.images.length,
            data: site.images,
        });
    } catch (error) {
        console.error('Error fetching site images:', error);
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

        // ⚡ Run sync operations in parallel for better performance
        const syncOps = [];
        if (validatedData.siteInterest) {
            syncOps.push(syncSiteInterest(validatedData.siteInterest, organizationId, req.user));
        } else {
            syncOps.push(Promise.resolve());
        }
        if (validatedData.subOrganization) {
            syncOps.push(syncSubOrganization(validatedData.subOrganization, organizationId, req.user));
        } else {
            syncOps.push(Promise.resolve());
        }

        try {
            await Promise.all(syncOps);
        } catch (err) {
            return res.status(403).json({ success: false, message: err.message });
        }

        // Check if user has permission to access this site (uses entity access filter for assignedUsers)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );
        const query = { _id: id, organizationId, ...accessFilter };

        const site = await Site.findOne(query);
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

        // Check if user has permission to access this site (uses entity access filter for assignedUsers)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );
        const query = { _id: id, organizationId, ...accessFilter };

        const site = await Site.findOne(query);
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
            await cleanupTempFile(tempFilePath);
            return res.status(400).json({
                success: false,
                message: 'imageNumber must be between 1 and 9'
            });
        }

        // Check if user has permission to access this site (uses entity access filter for assignedUsers)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );
        const site = await Site.findOne({ _id: id, organizationId, ...accessFilter });
        if (!site) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Site not found' });
        }

        // Fetch Organization for folder path
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            await cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const orgName = organization.name;
        const siteName = site.siteName;
        const folderPath = `sales-sphere/${orgName}/sitesImage/${siteName}/${id}`;

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
        await cleanupTempFile(tempFilePath);
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

        // Check if user has permission to access this site (uses entity access filter for assignedUsers)
        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );
        const site = await Site.findOne({ _id: id, organizationId, ...accessFilter });
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

        // Extract public_id robustly from the stored image URL
        const imageUrl = site.images[imageIndex].imageUrl;
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

        // Remove from array
        site.images.splice(imageIndex, 1);
        await site.save();

        return res.status(200).json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting site image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get all Site Categories
// @route   GET /api/sites/categories
// @access  Authenticated Users
exports.getSiteCategories = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const categories = await SiteCategory.find({ organizationId: organizationId })
            .sort({ name: 1 })
            .lean();

        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all Site Sub-Organizations
// @route   GET /api/sites/sub-organizations
// @access  Authenticated Users
exports.getSiteSubOrganizations = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const subOrgs = await SiteSubOrganization.find({ organizationId: organizationId })
            .select('name')
            .sort({ name: 1 })
            .lean();

        res.status(200).json({ success: true, count: subOrgs.length, data: subOrgs });
    } catch (error) {
        next(error);
    }
};

// @desc    Create site category
// @route   POST /api/sites/categories
// @access  Private (All authenticated users)
exports.createSiteCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { name, brands, technicians } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        // Check if category already exists (with escaped regex to prevent NoSQL injection)
        const escapedName = escapeRegex(name.trim());
        const existingCategory = await SiteCategory.findOne({
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
            organizationId
        });

        if (existingCategory) {
            return res.status(400).json({ success: false, message: 'Site category with this name already exists' });
        }

        const category = await SiteCategory.create({
            name: name.trim(),
            brands: brands || [],
            technicians: technicians || [],
            organizationId
        });

        res.status(201).json({
            success: true,
            message: 'Site category created successfully',
            data: category
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update site category
// @route   PUT /api/sites/categories/:id
// @access  Private (Admin only)
exports.updateSiteCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;
        const { name, brands, technicians } = req.body;

        const category = await SiteCategory.findOne({ _id: id, organizationId });

        if (!category) {
            return res.status(404).json({ success: false, message: 'Site category not found' });
        }

        const oldName = category.name; // Store for sync
        const newName = (name && name.trim().length > 0) ? name.trim() : oldName;

        // Check if new name conflicts with existing category
        if (newName.toLowerCase() !== oldName.toLowerCase()) {
            const escapedName = escapeRegex(newName);
            const existingCategory = await SiteCategory.findOne({
                name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
                organizationId,
                _id: { $ne: id }
            });

            if (existingCategory) {
                return res.status(400).json({ success: false, message: 'Site category with this name already exists' });
            }
        }

        if (name && name.trim().length > 0) {
            category.name = newName;
        }
        if (brands !== undefined) {
            category.brands = brands;
        }
        if (technicians !== undefined) {
            category.technicians = technicians;
        }

        await category.save();

        // SYNC: Update category name in all sites' siteInterest array
        let sitesUpdated = 0;
        if (oldName !== newName) {
            const updateResult = await Site.updateMany(
                {
                    organizationId,
                    'siteInterest.category': oldName
                },
                {
                    $set: { 'siteInterest.$[elem].category': newName }
                },
                {
                    arrayFilters: [{ 'elem.category': oldName }]
                }
            );
            sitesUpdated = updateResult.modifiedCount;
        }

        res.status(200).json({
            success: true,
            message: `Site category updated successfully${sitesUpdated > 0 ? `. ${sitesUpdated} sites synced.` : ''}`,
            data: category,
            sitesUpdated
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete site category
// @route   DELETE /api/sites/categories/:id
// @access  Private (Admin only)
exports.deleteSiteCategory = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const category = await SiteCategory.findOne({ _id: id, organizationId });

        if (!category) {
            return res.status(404).json({ success: false, message: 'Site category not found' });
        }

        // Check if category is being used by any site
        const sitesUsingCategory = await Site.countDocuments({
            siteInterest: category.name,
            organizationId
        });

        if (sitesUsingCategory > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category. It is being used by ${sitesUsingCategory} site(s).`
            });
        }

        await SiteCategory.deleteOne({ _id: id });

        res.status(200).json({
            success: true,
            message: 'Site category deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create site sub-organization
// @route   POST /api/sites/sub-organizations
// @access  Private (All authenticated users)
exports.createSiteSubOrganization = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Sub-organization name is required' });
        }

        // Check if sub-organization already exists (with escaped regex to prevent NoSQL injection)
        const escapedName = escapeRegex(name.trim());
        const existingSubOrg = await SiteSubOrganization.findOne({
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
            organizationId
        });

        if (existingSubOrg) {
            return res.status(400).json({ success: false, message: 'Sub-organization with this name already exists' });
        }

        const subOrg = await SiteSubOrganization.create({
            name: name.trim(),
            organizationId
        });

        res.status(201).json({
            success: true,
            message: 'Sub-organization created successfully',
            data: subOrg
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update site sub-organization
// @route   PUT /api/sites/sub-organizations/:id
// @access  Private (Admin only)
exports.updateSiteSubOrganization = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Sub-organization name is required' });
        }

        const subOrg = await SiteSubOrganization.findOne({ _id: id, organizationId });

        if (!subOrg) {
            return res.status(404).json({ success: false, message: 'Sub-organization not found' });
        }

        const oldName = subOrg.name; // Store for sync
        const newName = name.trim();

        // Check if new name conflicts with existing sub-organization
        if (newName.toLowerCase() !== oldName.toLowerCase()) {
            const escapedName = escapeRegex(newName);
            const existingSubOrg = await SiteSubOrganization.findOne({
                name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
                organizationId,
                _id: { $ne: id }
            });

            if (existingSubOrg) {
                return res.status(400).json({ success: false, message: 'Sub-organization with this name already exists' });
            }
        }

        subOrg.name = newName;
        await subOrg.save();

        // SYNC: Update subOrganization field in all sites with the old name
        let sitesUpdated = 0;
        if (oldName !== newName) {
            const updateResult = await Site.updateMany(
                { organizationId, subOrganization: oldName },
                { $set: { subOrganization: newName } }
            );
            sitesUpdated = updateResult.modifiedCount;
        }

        res.status(200).json({
            success: true,
            message: `Sub-organization updated successfully${sitesUpdated > 0 ? `. ${sitesUpdated} sites synced.` : ''}`,
            data: subOrg,
            sitesUpdated
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete site sub-organization
// @route   DELETE /api/sites/sub-organizations/:id
// @access  Private (Admin only)
exports.deleteSiteSubOrganization = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const subOrg = await SiteSubOrganization.findOne({ _id: id, organizationId });

        if (!subOrg) {
            return res.status(404).json({ success: false, message: 'Sub-organization not found' });
        }

        // Check if sub-organization is being used by any site
        const sitesUsingSubOrg = await Site.countDocuments({
            subOrganization: subOrg.name,
            organizationId
        });

        if (sitesUsingSubOrg > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete sub-organization. It is being used by ${sitesUsingSubOrg} site(s).`
            });
        }

        await SiteSubOrganization.deleteOne({ _id: id });

        res.status(200).json({
            success: true,
            message: 'Sub-organization deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// ASSIGNMENT CONTROLLERS
// ============================================

/**
 * Assign user(s) to a site
 * POST /api/v1/sites/:id/assign
 * Body: { userIds: string[] }
 */
exports.assignUsersToSite = async (req, res, next) => {
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

        // Find site
        const Site = require('./sites.model');
        const User = require('../users/user.model');
        const site = await Site.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!site) {
            return res.status(404).json({
                success: false,
                message: 'Site not found'
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
        const currentAssignedIds = site.assignedUsers ? site.assignedUsers.map(id => id.toString()) : [];
        const newAssignments = userIds.filter(id =>
            !currentAssignedIds.includes(id.toString())
        );

        if (newAssignments.length > 0) {
            site.assignedUsers.push(...newAssignments);
            site.assignedBy = userId;
            site.assignedAt = new Date();
            await site.save();
        }

        res.status(200).json({
            success: true,
            message: `${newAssignments.length} user(s) assigned to site`,
            data: {
                siteId: site._id,
                assignedUsers: site.assignedUsers
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Remove user assignment(s) from site
 * DELETE /api/v1/sites/:id/assign
 * Body: { userIds: string[] } - supports single or multiple user IDs
 */
exports.removeUserFromSite = async (req, res, next) => {
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

        const Site = require('./sites.model');
        const site = await Site.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!site) {
            return res.status(404).json({
                success: false,
                message: 'Site not found'
            });
        }

        const beforeCount = site.assignedUsers ? site.assignedUsers.length : 0;

        // Remove specified users
        const userIdsToRemove = userIds.map(id => id.toString());
        site.assignedUsers = site.assignedUsers.filter(
            assignedId => !userIdsToRemove.includes(assignedId.toString())
        );

        site.assignedBy = userId;
        site.assignedAt = new Date();
        await site.save();

        const removedCount = beforeCount - site.assignedUsers.length;

        res.status(200).json({
            success: true,
            message: removedCount === 1
                ? 'User assignment removed'
                : `${removedCount} user(s) removed from site assignments`,
            data: {
                siteId: site._id,
                assignedUsers: site.assignedUsers,
                removedCount
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all users assigned to a site
 * GET /api/v1/sites/:id/assignments
 */
exports.getSiteAssignments = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const Site = require('./sites.model');
        const site = await Site.findOne({
            _id: id,
            organizationId: organizationId
        }).populate('assignedUsers', 'name email role')
            .populate('assignedBy', 'name email');

        if (!site) {
            return res.status(404).json({
                success: false,
                message: 'Site not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                siteId: site._id,
                siteName: site.siteName,
                assignedUsers: site.assignedUsers,
                assignedBy: site.assignedBy,
                assignedAt: site.assignedAt
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get sites assigned to current user
 * GET /api/v1/sites/my-assigned
 */
exports.getMyAssignedSites = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // Use the new entity access filter
        const { getEntityAccessFilter } = require('../../utils/hierarchyHelper');

        const accessFilter = await getEntityAccessFilter(
            req.user,
            'sites',
            'viewTeamSites',
            'viewAllSites'
        );

        const Site = require('./sites.model');
        const sites = await Site.find({
            organizationId: organizationId,
            ...accessFilter
        })
            .select('_id siteName ownerName location.address siteInterest createdAt assignedAt')
            .sort({ assignedAt: -1, createdAt: -1 })
            .populate('assignedBy', 'name')
            .lean();

        res.status(200).json({
            success: true,
            count: sites.length,
            data: sites
        });
    } catch (error) {
        next(error);
    }
};