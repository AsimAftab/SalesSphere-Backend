const BeatPlanList = require('./beatPlanList.model');
const Party = require('../parties/party.model');
const Site = require('../sites/sites.model');
const Prospect = require('../prospect/prospect.model');
const { z } = require('zod');
const { getHierarchyFilter } = require('../../utils/hierarchyHelper');
const { isSystemRole } = require('../../utils/defaultPermissions');

// --- Zod Validation Schemas ---
const createBeatPlanListValidation = z.object({
    name: z.string({ required_error: "Template name is required" }).min(1, "Template name is required"),
    parties: z.array(z.string()).optional().default([]),
    sites: z.array(z.string()).optional().default([]),
    prospects: z.array(z.string()).optional().default([]),
}).refine(data => {
    const totalDirectories = (data.parties?.length || 0) + (data.sites?.length || 0) + (data.prospects?.length || 0);
    return totalDirectories >= 1;
}, {
    message: "At least one directory (party, site, or prospect) must be added to the route"
});

const updateBeatPlanListValidation = z.object({
    name: z.string().min(1).optional(),
    parties: z.array(z.string()).optional(),
    sites: z.array(z.string()).optional(),
    prospects: z.array(z.string()).optional(),
});

// @desc    Create a new beat plan template
// @route   POST /api/v1/beat-plan-lists
// @access  Protected (beatPlanList:create)
exports.createBeatPlanList = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Validate input
        const validatedData = createBeatPlanListValidation.parse(req.body);

        // Create the template
        const beatPlanList = await BeatPlanList.create({
            name: validatedData.name,
            parties: validatedData.parties,
            sites: validatedData.sites,
            prospects: validatedData.prospects,
            organizationId,
            createdBy: userId,
        });

        // Populate for response
        await beatPlanList.populate([
            { path: 'parties', select: 'partyName location' },
            { path: 'sites', select: 'siteName location' },
            { path: 'prospects', select: 'prospectName location' },
            { path: 'createdBy', select: 'name email' }
        ]);

        res.status(201).json({
            success: true,
            message: 'Beat plan template created successfully',
            data: beatPlanList
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        console.error('Error creating beat plan template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create beat plan template',
            error: error.message
        });
    }
};

// @desc    Get all beat plan templates
// @route   GET /api/v1/beat-plan-lists
// @access  Protected (beatPlanList:viewList)
exports.getAllBeatPlanLists = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { page = 1, limit = 20, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = { organizationId };
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const [beatPlanLists, total] = await Promise.all([
            BeatPlanList.find(query)
                .select('name totalDirectories totalParties totalSites totalProspects createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('createdBy', 'name email')
                .lean(),
            BeatPlanList.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            count: beatPlanLists.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: beatPlanLists
        });
    } catch (error) {
        console.error('Error fetching beat plan templates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch beat plan templates',
            error: error.message
        });
    }
};

// @desc    Get a single beat plan template
// @route   GET /api/v1/beat-plan-lists/:id
// @access  Protected (beatPlanList:viewDetails)
exports.getBeatPlanListById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const beatPlanList = await BeatPlanList.findOne({
            _id: req.params.id,
            organizationId
        })
            .populate('parties', 'partyName ownerName contact location')
            .populate('sites', 'siteName ownerName contact location')
            .populate('prospects', 'prospectName ownerName contact location')
            .populate('createdBy', 'name email');

        if (!beatPlanList) {
            return res.status(404).json({ success: false, message: 'Beat plan template not found' });
        }

        res.status(200).json({
            success: true,
            data: beatPlanList
        });
    } catch (error) {
        console.error('Error fetching beat plan template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch beat plan template',
            error: error.message
        });
    }
};

// @desc    Update a beat plan template
// @route   PUT /api/v1/beat-plan-lists/:id
// @access  Protected (beatPlanList:update)
exports.updateBeatPlanList = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const validatedData = updateBeatPlanListValidation.parse(req.body);

        const beatPlanList = await BeatPlanList.findOne({
            _id: req.params.id,
            organizationId
        });

        if (!beatPlanList) {
            return res.status(404).json({ success: false, message: 'Beat plan template not found' });
        }

        // Update fields
        if (validatedData.name) beatPlanList.name = validatedData.name;
        if (validatedData.parties) beatPlanList.parties = validatedData.parties;
        if (validatedData.sites) beatPlanList.sites = validatedData.sites;
        if (validatedData.prospects) beatPlanList.prospects = validatedData.prospects;

        await beatPlanList.save();

        // Populate for response
        await beatPlanList.populate([
            { path: 'parties', select: 'partyName location' },
            { path: 'sites', select: 'siteName location' },
            { path: 'prospects', select: 'prospectName location' },
            { path: 'createdBy', select: 'name email' }
        ]);

        res.status(200).json({
            success: true,
            message: 'Beat plan template updated successfully',
            data: beatPlanList
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
            });
        }
        console.error('Error updating beat plan template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update beat plan template',
            error: error.message
        });
    }
};

// @desc    Delete a beat plan template
// @route   DELETE /api/v1/beat-plan-lists/:id
// @access  Protected (beatPlanList:delete)
exports.deleteBeatPlanList = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const beatPlanList = await BeatPlanList.findOne({
            _id: req.params.id,
            organizationId
        });

        if (!beatPlanList) {
            return res.status(404).json({ success: false, message: 'Beat plan template not found' });
        }

        await BeatPlanList.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Beat plan template deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting beat plan template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete beat plan template',
            error: error.message
        });
    }
};
