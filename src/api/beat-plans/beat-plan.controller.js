const BeatPlan = require('./beat-plan.model');
const Party = require('../parties/party.model');
const Site = require('../sites/sites.model');
const Prospect = require('../prospect/prospect.model');
const User = require('../users/user.model');
const { z } = require('zod');
const { calculateDistance, calculateRouteDistance, optimizeRoute } = require('../../utils/distanceCalculator');
const { closeTrackingSessionsForBeatPlan } = require('./tracking/tracking.controller');

// --- Zod Validation Schemas ---
// Simple validation for UI create beat plan
const createBeatPlanValidation = z.object({
    employeeId: z.string({ required_error: "Employee is required" }).min(1, "Employee is required"),
    name: z.string({ required_error: "Beat plan name is required" }).min(1, "Beat plan name is required"),
    assignedDate: z.string({ required_error: "Date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    parties: z.array(z.string()).optional().default([]),
    sites: z.array(z.string()).optional().default([]),
    prospects: z.array(z.string()).optional().default([]),
}).refine(data => {
    const totalDirectories = (data.parties?.length || 0) + (data.sites?.length || 0) + (data.prospects?.length || 0);
    return totalDirectories >= 1;
}, {
    message: "At least one directory (party, site, or prospect) must be added to the route"
});

// Update validation schema for beat plan management
const updateBeatPlanValidation = z.object({
    name: z.string().min(1, "Beat plan name is required").optional(),
    employeeId: z.string().min(1, "Employee is required").optional(),
    assignedDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }).optional(),
    parties: z.array(z.string()).optional(),
    sites: z.array(z.string()).optional(),
    prospects: z.array(z.string()).optional(),
});

// @desc    Get salespersons for employee dropdown
// @route   GET /api/v1/beat-plans/salespersons
// @access  Protected
exports.getSalespersons = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // Fetch only active salespersons from the organization
        const salespersons = await User.find({
            organizationId,
            role: 'salesperson',
            isActive: true
        }).select('name email phone avatarUrl')
          .sort({ name: 1 });

        res.status(200).json({
            success: true,
            data: salespersons
        });
    } catch (error) {
        console.error('Error fetching salespersons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch salespersons',
            error: error.message
        });
    }
};

// @desc    Get available directories (parties, sites, prospects) for beat plan assignment
// @route   GET /api/v1/beat-plans/available-directories
// @access  Protected
exports.getAvailableDirectories = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { search } = req.query;

        // Build filter
        const filter = { organizationId };

        // Add search functionality for all directory types
        let partyFilter = { ...filter };
        let siteFilter = { ...filter };
        let prospectFilter = { ...filter };

        if (search) {
            partyFilter.$or = [
                { partyName: { $regex: search, $options: 'i' } },
                { ownerName: { $regex: search, $options: 'i' } },
                { 'location.address': { $regex: search, $options: 'i' } }
            ];
            siteFilter.$or = [
                { siteName: { $regex: search, $options: 'i' } },
                { ownerName: { $regex: search, $options: 'i' } },
                { 'location.address': { $regex: search, $options: 'i' } }
            ];
            prospectFilter.$or = [
                { prospectName: { $regex: search, $options: 'i' } },
                { ownerName: { $regex: search, $options: 'i' } },
                { 'location.address': { $regex: search, $options: 'i' } }
            ];
        }

        // Fetch all directory types with relevant fields
        const parties = await Party.find(partyFilter)
            .select('partyName ownerName location.address location.latitude location.longitude contact.phone panVatNumber')
            .sort({ partyName: 1 })
            .lean();

        const sites = await Site.find(siteFilter)
            .select('siteName ownerName location.address location.latitude location.longitude contact.phone')
            .sort({ siteName: 1 })
            .lean();

        const prospects = await Prospect.find(prospectFilter)
            .select('prospectName ownerName location.address location.latitude location.longitude contact.phone panVatNumber')
            .sort({ prospectName: 1 })
            .lean();

        // Add type field to each directory for frontend differentiation
        const partiesWithType = parties.map(party => ({ ...party, type: 'party', name: party.partyName }));
        const sitesWithType = sites.map(site => ({ ...site, type: 'site', name: site.siteName }));
        const prospectsWithType = prospects.map(prospect => ({ ...prospect, type: 'prospect', name: prospect.prospectName }));

        res.status(200).json({
            success: true,
            data: {
                parties: partiesWithType,
                sites: sitesWithType,
                prospects: prospectsWithType,
                all: [...partiesWithType, ...sitesWithType, ...prospectsWithType]
            }
        });
    } catch (error) {
        console.error('Error fetching available directories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available directories',
            error: error.message
        });
    }
};

// @desc    Get beat plan data (analytics/summary)
// @route   GET /api/v1/beat-plans/data
// @access  Protected
exports.getBeatPlanData = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // 1. Get total directories (parties, sites, prospects) in the organization
        const totalParties = await Party.countDocuments({ organizationId });
        const totalSites = await Site.countDocuments({ organizationId });
        const totalProspects = await Prospect.countDocuments({ organizationId });
        const totalDirectories = totalParties + totalSites + totalProspects;

        // 2. Get total beat plans created
        const totalBeatPlans = await BeatPlan.countDocuments({ organizationId });

        // 3. Get unique assigned employees across all beat plans
        const beatPlans = await BeatPlan.find({ organizationId })
            .populate('employees', 'name email role avatarUrl')
            .select('employees');

        // Extract unique employee IDs
        const employeeIds = new Set();
        beatPlans.forEach(plan => {
            plan.employees.forEach(emp => {
                employeeIds.add(emp._id.toString());
            });
        });

        // Get full employee details for unique employees
        const assignedEmployees = await User.find({
            _id: { $in: Array.from(employeeIds) },
            organizationId
        }).select('name email role avatarUrl phone');

        // 4. Additional stats
        const activeBeatPlans = await BeatPlan.countDocuments({
            organizationId,
            status: 'active'
        });

        res.status(200).json({
            success: true,
            data: {
                totalDirectories,
                totalParties,
                totalSites,
                totalProspects,
                totalBeatPlans,
                activeBeatPlans,
                assignedEmployeesCount: assignedEmployees.length,
                assignedEmployees,
            }
        });
    } catch (error) {
        console.error('Error fetching beat plan data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch beat plan data',
            error: error.message
        });
    }
};

// @desc    Create a new beat plan (from UI)
// @route   POST /api/v1/beat-plans
// @access  Protected
exports.createBeatPlan = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Validate request body using simple validation
        const validatedData = createBeatPlanValidation.parse(req.body);

        // Verify the employee exists and is a salesperson
        const employee = await User.findOne({
            _id: validatedData.employeeId,
            organizationId,
            role: 'salesperson',
            isActive: true
        });

        if (!employee) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee. Employee must be an active salesperson in your organization.'
            });
        }

        // Verify all parties, sites, and prospects belong to the organization
        const partyIds = validatedData.parties || [];
        const siteIds = validatedData.sites || [];
        const prospectIds = validatedData.prospects || [];

        // Verify parties
        if (partyIds.length > 0) {
            const parties = await Party.find({
                _id: { $in: partyIds },
                organizationId
            });
            if (parties.length !== partyIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Some parties do not belong to your organization'
                });
            }
        }

        // Verify sites
        if (siteIds.length > 0) {
            const sites = await Site.find({
                _id: { $in: siteIds },
                organizationId
            });
            if (sites.length !== siteIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Some sites do not belong to your organization'
                });
            }
        }

        // Verify prospects
        if (prospectIds.length > 0) {
            const prospects = await Prospect.find({
                _id: { $in: prospectIds },
                organizationId
            });
            if (prospects.length !== prospectIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Some prospects do not belong to your organization'
                });
            }
        }

        // TODO: Implement optimization for mixed directory types if needed
        // For now, we'll use the order provided by the user

        // Create the beat plan
        const assignedDate = new Date(validatedData.assignedDate);

        // Initialize visits array with all directories as pending
        const visits = [
            ...partyIds.map(id => ({ directoryId: id, directoryType: 'party', status: 'pending' })),
            ...siteIds.map(id => ({ directoryId: id, directoryType: 'site', status: 'pending' })),
            ...prospectIds.map(id => ({ directoryId: id, directoryType: 'prospect', status: 'pending' }))
        ];

        const totalDirectories = partyIds.length + siteIds.length + prospectIds.length;

        const newBeatPlan = await BeatPlan.create({
            name: validatedData.name,
            employees: [validatedData.employeeId], // Store as array for model compatibility
            parties: partyIds,
            sites: siteIds,
            prospects: prospectIds,
            visits: visits, // Initialize visit tracking
            schedule: {
                startDate: assignedDate,
                frequency: 'custom',
            },
            status: 'pending', // Start as pending
            progress: {
                totalDirectories,
                visitedDirectories: 0,
                percentage: 0,
                totalParties: partyIds.length,
                totalSites: siteIds.length,
                totalProspects: prospectIds.length,
            },
            organizationId,
            createdBy: userId,
        });

        // Populate references before sending response
        await newBeatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl phone' },
            { path: 'parties', select: 'partyName ownerName contact location' },
            { path: 'sites', select: 'siteName ownerName contact location' },
            { path: 'prospects', select: 'prospectName ownerName contact location' },
            { path: 'createdBy', select: 'name email' }
        ]);

        res.status(201).json({ success: true, data: newBeatPlan });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: error.errors
            });
        }
        console.error('Error creating beat plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create beat plan',
            error: error.message
        });
    }
};

// @desc    Get all beat plans
// @route   GET /api/v1/beat-plans
// @access  Protected
exports.getAllBeatPlans = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { status, page = 1, limit = 10 } = req.query;

        // Build filter
        const filter = { organizationId };
        if (status) {
            filter.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const beatPlans = await BeatPlan.find(filter)
            .populate('employees', 'name email role avatarUrl')
            .populate('parties', 'partyName ownerName contact location')
            .populate('sites', 'siteName ownerName contact location')
            .populate('prospects', 'prospectName ownerName contact location')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await BeatPlan.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: beatPlans,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching beat plans:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch beat plans',
            error: error.message
        });
    }
};

// @desc    Get a single beat plan by ID
// @route   GET /api/v1/beat-plans/:id
// @access  Protected
exports.getBeatPlanById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const beatPlan = await BeatPlan.findOne({
            _id: req.params.id,
            organizationId
        })
            .populate('employees', 'name email role avatarUrl phone')
            .populate('parties', 'partyName ownerName contact location panVatNumber')
            .populate('sites', 'siteName ownerName contact location')
            .populate('prospects', 'prospectName ownerName contact location panVatNumber')
            .populate('createdBy', 'name email');

        if (!beatPlan) {
            return res.status(404).json({ success: false, message: 'Beat plan not found' });
        }

        res.status(200).json({ success: true, data: beatPlan });
    } catch (error) {
        console.error('Error fetching beat plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch beat plan',
            error: error.message
        });
    }
};

// @desc    Update a beat plan (Reset and reuse)
// @route   PUT /api/v1/beat-plans/:id
// @access  Protected (Admin, Manager)
exports.updateBeatPlan = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Find the beat plan
        const beatPlan = await BeatPlan.findOne({
            _id: req.params.id,
            organizationId
        });

        if (!beatPlan) {
            return res.status(404).json({ success: false, message: 'Beat plan not found' });
        }

        // Validate request body
        const validatedData = updateBeatPlanValidation.parse(req.body);

        // Verify employee if provided
        if (validatedData.employeeId) {
            const employee = await User.findOne({
                _id: validatedData.employeeId,
                organizationId,
                role: 'salesperson',
                isActive: true
            });

            if (!employee) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid employee. Employee must be an active salesperson in your organization.'
                });
            }

            beatPlan.employees = [validatedData.employeeId];
        }

        // Verify and update directories if provided
        let partyIds = beatPlan.parties || [];
        let siteIds = beatPlan.sites || [];
        let prospectIds = beatPlan.prospects || [];

        // Verify parties if provided
        if (validatedData.parties !== undefined) {
            partyIds = validatedData.parties;
            if (partyIds.length > 0) {
                const parties = await Party.find({
                    _id: { $in: partyIds },
                    organizationId
                });
                if (parties.length !== partyIds.length) {
                    return res.status(400).json({
                        success: false,
                        message: 'Some parties do not belong to your organization'
                    });
                }
            }
            beatPlan.parties = partyIds;
        }

        // Verify sites if provided
        if (validatedData.sites !== undefined) {
            siteIds = validatedData.sites;
            if (siteIds.length > 0) {
                const sites = await Site.find({
                    _id: { $in: siteIds },
                    organizationId
                });
                if (sites.length !== siteIds.length) {
                    return res.status(400).json({
                        success: false,
                        message: 'Some sites do not belong to your organization'
                    });
                }
            }
            beatPlan.sites = siteIds;
        }

        // Verify prospects if provided
        if (validatedData.prospects !== undefined) {
            prospectIds = validatedData.prospects;
            if (prospectIds.length > 0) {
                const prospects = await Prospect.find({
                    _id: { $in: prospectIds },
                    organizationId
                });
                if (prospects.length !== prospectIds.length) {
                    return res.status(400).json({
                        success: false,
                        message: 'Some prospects do not belong to your organization'
                    });
                }
            }
            beatPlan.prospects = prospectIds;
        }

        // Reset visits array if any directories were updated
        if (validatedData.parties !== undefined || validatedData.sites !== undefined || validatedData.prospects !== undefined) {
            beatPlan.visits = [
                ...partyIds.map(id => ({ directoryId: id, directoryType: 'party', status: 'pending' })),
                ...siteIds.map(id => ({ directoryId: id, directoryType: 'site', status: 'pending' })),
                ...prospectIds.map(id => ({ directoryId: id, directoryType: 'prospect', status: 'pending' }))
            ];

            const totalDirectories = partyIds.length + siteIds.length + prospectIds.length;

            // Reset progress
            beatPlan.progress = {
                totalDirectories,
                visitedDirectories: 0,
                percentage: 0,
                totalParties: partyIds.length,
                totalSites: siteIds.length,
                totalProspects: prospectIds.length,
            };
        }

        // Update name if provided
        if (validatedData.name) {
            beatPlan.name = validatedData.name;
        }

        // Update date if provided
        if (validatedData.assignedDate) {
            beatPlan.schedule.startDate = new Date(validatedData.assignedDate);
        }

        // Reset status to pending (reusable beat plan) and clear timestamps
        beatPlan.status = 'pending';
        beatPlan.startedAt = null;
        beatPlan.completedAt = null;

        await beatPlan.save();

        // Populate references before sending response
        await beatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl phone' },
            { path: 'parties', select: 'partyName ownerName contact location' },
            { path: 'sites', select: 'siteName ownerName contact location' },
            { path: 'prospects', select: 'prospectName ownerName contact location' },
            { path: 'createdBy', select: 'name email' }
        ]);

        res.status(200).json({
            success: true,
            message: 'Beat plan updated and reset to pending',
            data: beatPlan
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: error.errors
            });
        }
        console.error('Error updating beat plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update beat plan',
            error: error.message
        });
    }
};

// @desc    Delete a beat plan
// @route   DELETE /api/v1/beat-plans/:id
// @access  Protected
exports.deleteBeatPlan = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const beatPlan = await BeatPlan.findOneAndDelete({
            _id: req.params.id,
            organizationId
        });

        if (!beatPlan) {
            return res.status(404).json({ success: false, message: 'Beat plan not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Beat plan deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting beat plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete beat plan',
            error: error.message
        });
    }
};

// @desc    Get salesperson's assigned beat plans (minimal data for list view)
// @route   GET /api/v1/beat-plans/my-beatplans
// @access  Protected (Salesperson)
exports.getMyBeatPlans = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const { status, page = 1, limit = 10 } = req.query;

        // Build filter - find beat plans where this user is in the employees array
        const filter = {
            organizationId,
            employees: userId
        };

        // Optionally filter by status
        if (status) {
            filter.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const beatPlans = await BeatPlan.find(filter)
            .select('name status schedule.startDate progress startedAt completedAt')
            .sort({ 'schedule.startDate': -1, createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Transform to minimal response format
        const minimalBeatPlans = beatPlans.map(plan => ({
            _id: plan._id,
            name: plan.name,
            status: plan.status,
            assignedDate: plan.schedule?.startDate || null,
            startedAt: plan.startedAt || null,
            completedAt: plan.completedAt || null,
            totalDirectories: plan.progress?.totalDirectories || 0,
            visitedDirectories: plan.progress?.visitedDirectories || 0,
            unvisitedDirectories: (plan.progress?.totalDirectories || 0) - (plan.progress?.visitedDirectories || 0),
            progressPercentage: plan.progress?.percentage || 0,
            // Breakdown by type
            totalParties: plan.progress?.totalParties || 0,
            totalSites: plan.progress?.totalSites || 0,
            totalProspects: plan.progress?.totalProspects || 0,
        }));

        const total = await BeatPlan.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: minimalBeatPlans,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching my beat plans:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch beat plans',
            error: error.message
        });
    }
};

// @desc    Get detailed beatplan information with all parties and visit status
// @route   GET /api/v1/beat-plans/:id/details
// @access  Protected (Salesperson assigned to this beat plan or Admin/Manager)
exports.getBeatPlanDetails = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId, role } = req.user;

        // Find the beat plan
        const beatPlan = await BeatPlan.findOne({
            _id: req.params.id,
            organizationId
        })
            .populate('employees', 'name email role avatarUrl phone')
            .populate('createdBy', 'name email');

        if (!beatPlan) {
            return res.status(404).json({ success: false, message: 'Beat plan not found' });
        }

        // Check access - either assigned salesperson or admin/manager
        const isAssigned = beatPlan.employees.some(emp => emp._id.toString() === userId.toString());
        const isAdminOrManager = ['admin', 'manager'].includes(role);

        if (!isAssigned && !isAdminOrManager) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this beat plan'
            });
        }

        // Populate all directory types with full details
        await beatPlan.populate([
            { path: 'parties', select: 'partyName ownerName contact location panVatNumber' },
            { path: 'sites', select: 'siteName ownerName contact location' },
            { path: 'prospects', select: 'prospectName ownerName contact location panVatNumber' }
        ]);

        // Create a combined list of all directories with type and name
        const allDirectories = [
            ...beatPlan.parties.map(p => ({ ...p.toObject(), directoryType: 'party', name: p.partyName })),
            ...beatPlan.sites.map(s => ({ ...s.toObject(), directoryType: 'site', name: s.siteName })),
            ...beatPlan.prospects.map(pr => ({ ...pr.toObject(), directoryType: 'prospect', name: pr.prospectName }))
        ];

        // Sort directories to match the order in visits array
        const sortedDirectories = beatPlan.visits.map(visit => {
            const directory = allDirectories.find(d =>
                d._id.toString() === visit.directoryId.toString() &&
                d.directoryType === visit.directoryType
            );
            return { directory, visit };
        }).filter(item => item.directory); // Filter out any missing directories

        // Create detailed directory list with visit status and distance calculations
        const directoriesWithStatus = sortedDirectories.map((item, index) => {
            const { directory, visit } = item;

            // Calculate distance to next directory
            let distanceToNext = null;
            if (index < sortedDirectories.length - 1) {
                const nextDirectory = sortedDirectories[index + 1].directory;
                if (directory.location?.latitude && directory.location?.longitude &&
                    nextDirectory.location?.latitude && nextDirectory.location?.longitude) {
                    distanceToNext = calculateDistance(
                        directory.location.latitude,
                        directory.location.longitude,
                        nextDirectory.location.latitude,
                        nextDirectory.location.longitude
                    );
                }
            }

            return {
                _id: directory._id,
                name: directory.name,
                type: directory.directoryType,
                ownerName: directory.ownerName,
                contact: directory.contact,
                location: directory.location,
                panVatNumber: directory.panVatNumber || null,
                distanceToNext: distanceToNext, // Distance to next directory in km
                visitStatus: {
                    status: visit.status || 'pending',
                    visitedAt: visit.visitedAt || null,
                    visitLocation: visit.visitLocation || null
                }
            };
        });

        // Calculate total route distance
        const coordinates = directoriesWithStatus
            .filter(d => d.location?.latitude && d.location?.longitude)
            .map(d => ({
                latitude: d.location.latitude,
                longitude: d.location.longitude
            }));
        const totalRouteDistance = calculateRouteDistance(coordinates);

        // Prepare response
        const response = {
            _id: beatPlan._id,
            name: beatPlan.name,
            status: beatPlan.status,
            schedule: beatPlan.schedule,
            progress: beatPlan.progress,
            startedAt: beatPlan.startedAt || null,
            completedAt: beatPlan.completedAt || null,
            totalRouteDistance: totalRouteDistance, // Total distance in km
            employees: beatPlan.employees,
            createdBy: beatPlan.createdBy,
            directories: directoriesWithStatus, // Combined list of all directories
            // Also provide separate arrays for backward compatibility
            parties: directoriesWithStatus.filter(d => d.type === 'party'),
            sites: directoriesWithStatus.filter(d => d.type === 'site'),
            prospects: directoriesWithStatus.filter(d => d.type === 'prospect'),
            createdAt: beatPlan.createdAt,
            updatedAt: beatPlan.updatedAt
        };

        res.status(200).json({
            success: true,
            data: response
        });
    } catch (error) {
        console.error('Error fetching beat plan details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch beat plan details',
            error: error.message
        });
    }
};

// @desc    Start a beat plan (change status to active)
// @route   POST /api/v1/beat-plans/:id/start
// @access  Protected (Salesperson assigned to this beat plan)
exports.startBeatPlan = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // Find the beat plan
        const beatPlan = await BeatPlan.findOne({
            _id: req.params.id,
            organizationId
        });

        if (!beatPlan) {
            return res.status(404).json({ success: false, message: 'Beat plan not found' });
        }

        // Verify that the authenticated user is assigned to this beat plan
        const isAssigned = beatPlan.employees.some(empId => empId.toString() === userId.toString());
        if (!isAssigned) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to this beat plan'
            });
        }

        // Check if already active or completed
        if (beatPlan.status === 'active') {
            return res.status(400).json({
                success: false,
                message: 'Beat plan is already active'
            });
        }

        if (beatPlan.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Beat plan is already completed'
            });
        }

        // Change status to active and set startedAt timestamp
        beatPlan.status = 'active';
        beatPlan.startedAt = new Date();
        await beatPlan.save();

        // Populate and return
        await beatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl phone' },
            { path: 'parties', select: 'partyName ownerName contact location panVatNumber' },
            { path: 'sites', select: 'siteName ownerName contact location' },
            { path: 'prospects', select: 'prospectName ownerName contact location panVatNumber' },
            { path: 'createdBy', select: 'name email' }
        ]);

        res.status(200).json({
            success: true,
            message: 'Beat plan started successfully',
            data: beatPlan
        });
    } catch (error) {
        console.error('Error starting beat plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start beat plan',
            error: error.message
        });
    }
};

// @desc    Optimize beatplan route using nearest neighbor algorithm
// @route   POST /api/v1/beat-plans/:id/optimize-route
// @access  Protected (Admin, Manager, or assigned Salesperson)
exports.optimizeBeatPlanRoute = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId, role } = req.user;

        const { startLatitude, startLongitude } = req.body;

        // Find the beat plan
        const beatPlan = await BeatPlan.findOne({
            _id: req.params.id,
            organizationId
        }).populate({
            path: 'parties',
            select: 'partyName ownerName contact location panVatNumber'
        });

        if (!beatPlan) {
            return res.status(404).json({ success: false, message: 'Beat plan not found' });
        }

        // Check access - either assigned salesperson or admin/manager
        const isAssigned = beatPlan.employees.some(emp => emp._id.toString() === userId.toString());
        const isAdminOrManager = ['admin', 'manager'].includes(role);

        if (!isAssigned && !isAdminOrManager) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this beat plan'
            });
        }

        // Prepare starting location if provided
        let startLocation = null;
        if (startLatitude && startLongitude) {
            startLocation = {
                latitude: parseFloat(startLatitude),
                longitude: parseFloat(startLongitude)
            };
        }

        // Optimize the route
        const optimization = optimizeRoute(beatPlan.parties, startLocation);

        // Update the beatplan with optimized party order
        const optimizedPartyIds = optimization.optimizedParties.map(p => p._id);
        beatPlan.parties = optimizedPartyIds;

        // Update visits array to match new order
        const newVisits = optimizedPartyIds.map(partyId => {
            // Find existing visit record or create new one
            const existingVisit = beatPlan.visits.find(v => v.partyId.toString() === partyId.toString());
            return existingVisit || {
                partyId: partyId,
                status: 'pending'
            };
        });
        beatPlan.visits = newVisits;

        await beatPlan.save();

        // Prepare response with distance information
        const partiesWithDistances = optimization.optimizedParties.map((party, index) => {
            let distanceToNext = null;
            if (index < optimization.optimizedParties.length - 1) {
                const nextParty = optimization.optimizedParties[index + 1];
                if (party.location?.latitude && party.location?.longitude &&
                    nextParty.location?.latitude && nextParty.location?.longitude) {
                    distanceToNext = calculateDistance(
                        party.location.latitude,
                        party.location.longitude,
                        nextParty.location.latitude,
                        nextParty.location.longitude
                    );
                }
            }

            return {
                _id: party._id,
                partyName: party.partyName,
                ownerName: party.ownerName,
                location: party.location,
                distanceToNext: distanceToNext
            };
        });

        res.status(200).json({
            success: true,
            message: 'Route optimized successfully',
            data: {
                beatPlanId: beatPlan._id,
                beatPlanName: beatPlan.name,
                optimizedRoute: partiesWithDistances,
                optimization: {
                    originalDistance: optimization.originalDistance,
                    optimizedDistance: optimization.totalDistance,
                    distanceSaved: optimization.distanceSaved,
                    percentageSaved: optimization.originalDistance > 0
                        ? Math.round((optimization.distanceSaved / optimization.originalDistance) * 100)
                        : 0
                }
            }
        });
    } catch (error) {
        console.error('Error optimizing beat plan route:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to optimize route',
            error: error.message
        });
    }
};

// @desc    Calculate distance from current location to a party
// @route   POST /api/v1/beat-plans/calculate-distance
// @access  Protected
exports.calculateDistanceToParty = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { currentLatitude, currentLongitude, partyId } = req.body;

        // Validate inputs
        if (!currentLatitude || !currentLongitude || !partyId) {
            return res.status(400).json({
                success: false,
                message: 'Current location (latitude, longitude) and party ID are required'
            });
        }

        // Find the party
        const party = await Party.findOne({
            _id: partyId,
            organizationId
        }).select('partyName location');

        if (!party) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        // Check if party has location
        if (!party.location?.latitude || !party.location?.longitude) {
            return res.status(400).json({
                success: false,
                message: 'Party does not have location coordinates'
            });
        }

        // Calculate distance
        const distance = calculateDistance(
            currentLatitude,
            currentLongitude,
            party.location.latitude,
            party.location.longitude
        );

        res.status(200).json({
            success: true,
            data: {
                partyId: party._id,
                partyName: party.partyName,
                partyLocation: party.location,
                currentLocation: {
                    latitude: currentLatitude,
                    longitude: currentLongitude
                },
                distance: distance, // in kilometers
                distanceInMeters: Math.round(distance * 1000)
            }
        });
    } catch (error) {
        console.error('Error calculating distance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate distance',
            error: error.message
        });
    }
};

// @desc    Mark a directory (party/site/prospect) as visited in beat plan
// @route   POST /api/v1/beat-plans/:id/visit
// @access  Protected (Salesperson)
exports.markPartyVisited = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const { directoryId, directoryType, latitude, longitude, partyId } = req.body;

        // Support backward compatibility - if partyId is provided, use it as directoryId with type 'party'
        const actualDirectoryId = directoryId || partyId;
        const actualDirectoryType = directoryType || 'party';

        // Validate required fields
        if (!actualDirectoryId) {
            return res.status(400).json({
                success: false,
                message: 'Directory ID (or partyId for backward compatibility) is required'
            });
        }

        if (!['party', 'site', 'prospect'].includes(actualDirectoryType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid directory type. Must be party, site, or prospect'
            });
        }

        // Find the beat plan
        const beatPlan = await BeatPlan.findOne({
            _id: req.params.id,
            organizationId
        });

        if (!beatPlan) {
            return res.status(404).json({ success: false, message: 'Beat plan not found' });
        }

        // Check if the directory is in the beat plan
        const directoryField = `${actualDirectoryType === 'party' ? 'parties' : actualDirectoryType === 'site' ? 'sites' : 'prospects'}`;
        const directoryIndex = beatPlan[directoryField].findIndex(d => d.toString() === actualDirectoryId);
        if (directoryIndex === -1) {
            return res.status(400).json({
                success: false,
                message: `${actualDirectoryType.charAt(0).toUpperCase() + actualDirectoryType.slice(1)} not found in this beat plan`
            });
        }

        // Find the visit record
        const visitIndex = beatPlan.visits.findIndex(v =>
            v.directoryId.toString() === actualDirectoryId && v.directoryType === actualDirectoryType
        );
        if (visitIndex === -1) {
            return res.status(400).json({
                success: false,
                message: 'Visit record not found'
            });
        }

        // Check if already visited
        if (beatPlan.visits[visitIndex].status === 'visited') {
            return res.status(400).json({
                success: false,
                message: `${actualDirectoryType.charAt(0).toUpperCase() + actualDirectoryType.slice(1)} already marked as visited`
            });
        }

        // Mark as visited
        beatPlan.visits[visitIndex].status = 'visited';
        beatPlan.visits[visitIndex].visitedAt = new Date();

        if (latitude && longitude) {
            beatPlan.visits[visitIndex].visitLocation = {
                latitude,
                longitude
            };
        }

        // Update progress
        const visitedCount = beatPlan.visits.filter(v => v.status === 'visited').length;
        beatPlan.progress.visitedDirectories = visitedCount;
        beatPlan.progress.percentage = Math.round((visitedCount / beatPlan.progress.totalDirectories) * 100);

        // Update beat plan status to completed when all directories are visited
        if (visitedCount === beatPlan.progress.totalDirectories) {
            beatPlan.status = 'completed';
            beatPlan.completedAt = new Date();
        }

        await beatPlan.save();

        // Graceful shutdown: Close all active tracking sessions when beat plan is completed
        if (beatPlan.status === 'completed') {
            try {
                // Get io instance from req.app if available (for socket notifications)
                const io = req.app?.get('io');
                const result = await closeTrackingSessionsForBeatPlan(beatPlan._id, io);
                console.log(`📊 Closed ${result.closed} tracking session(s) for completed beat plan: ${beatPlan._id}`);
            } catch (error) {
                // Log error but don't fail the request
                console.error('⚠️ Error closing tracking sessions, but beat plan was marked as completed:', error);
            }
        }

        // Populate and return
        await beatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl phone' },
            { path: 'parties', select: 'partyName ownerName contact location' },
            { path: 'sites', select: 'siteName ownerName contact location' },
            { path: 'prospects', select: 'prospectName ownerName contact location' }
        ]);

        res.status(200).json({
            success: true,
            message: `${actualDirectoryType.charAt(0).toUpperCase() + actualDirectoryType.slice(1)} marked as visited successfully`,
            data: beatPlan
        });
    } catch (error) {
        console.error('Error marking directory as visited:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark directory as visited',
            error: error.message
        });
    }
};
