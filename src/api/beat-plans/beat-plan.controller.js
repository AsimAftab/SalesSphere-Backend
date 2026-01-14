const BeatPlan = require('./beat-plan.model');
const BeatPlanBackup = require('./beatPlanBackup.model');
const LocationTracking = require('./tracking/tracking.model');
const LocationTrackingBackup = require('./tracking/locationTrackingBackup.model');
const Party = require('../parties/party.model');
const Site = require('../sites/sites.model');
const Prospect = require('../prospect/prospect.model');
const User = require('../users/user.model');
const { z } = require('zod');
const { calculateDistance, calculateRouteDistance, optimizeRoute } = require('../../utils/distanceCalculator');
const { closeTrackingSessionsForBeatPlan } = require('./tracking/tracking.controller');
const { getAllSubordinateIds, canApprove, getEntityAccessFilter } = require('../../utils/hierarchyHelper');

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

// @desc    Get employees assignable to beat plans
// @route   GET /api/v1/beat-plans/salesperson
// @access  Protected
// @query   ?withBeatPlanPermission=true - Filter only users with beatPlan permission
exports.getSalespersons = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { withBeatPlanPermission } = req.query;

        // Base query: active non-admin users
        const query = {
            organizationId,
            role: 'user',
            isActive: true
        };

        // Optionally filter by users with beatPlan permission in their customRole
        if (withBeatPlanPermission === 'true') {
            // Find roles that have beatPlan permissions
            const Role = require('../roles/role.model');
            const rolesWithBeatPlan = await Role.find({
                organizationId,
                'permissions.beatPlan': { $exists: true }
            }).select('_id').lean();

            const roleIds = rolesWithBeatPlan.map(r => r._id);
            query.customRoleId = { $in: roleIds };
        }

        const employees = await User.find(query)
            .select('name email phone avatarUrl customRoleId')
            .populate('customRoleId', 'name')
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: employees.length,
            data: employees
        });
    } catch (error) {
        console.error('Error fetching assignable employees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employees',
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

const { isSystemRole } = require('../../utils/defaultPermissions');

// @desc    Get beat plan data (analytics/summary)
// @route   GET /api/v1/beat-plans/data
// @access  Protected
exports.getBeatPlanData = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        // --- HIERARCHY LOGIC FOR STATS ---
        let hierarchyFilter = {};

        // 1. Admin / System Role / View All Feature: View All
        if (role === 'admin' || isSystemRole(role) || req.user.hasFeature('beatPlan', 'viewAllBeatPlans')) {
            hierarchyFilter = {};
        }
        else {
            // Implicit Supervisor Check
            const subordinateIds = await getAllSubordinateIds(userId, organizationId);

            if (subordinateIds.length > 0) {
                // Manager: View Self + Subordinates (Created or Assigned)
                hierarchyFilter = {
                    $or: [
                        { createdBy: userId },
                        { createdBy: { $in: subordinateIds } },
                        { employees: userId },
                        { employees: { $in: subordinateIds } }
                    ]
                };
            } else {
                // Regular User: View Self Only (Created or Assigned)
                hierarchyFilter = {
                    $or: [
                        { createdBy: userId },
                        { employees: userId }
                    ]
                };
            }
        }

        const commonFilter = { organizationId, ...hierarchyFilter };

        // 1. Get total directories (parties, sites, prospects) - Respecting Visibility
        // Use getEntityAccessFilter to ensure consistency with list views
        const partyAccessFilter = await getEntityAccessFilter(req.user, 'parties', 'viewAllParties');
        const siteAccessFilter = await getEntityAccessFilter(req.user, 'sites', 'viewAllSites');
        const prospectAccessFilter = await getEntityAccessFilter(req.user, 'prospects', 'viewAllProspects');

        const totalParties = await Party.countDocuments({ organizationId, ...partyAccessFilter });
        const totalSites = await Site.countDocuments({ organizationId, ...siteAccessFilter });
        const totalProspects = await Prospect.countDocuments({ organizationId, ...prospectAccessFilter });

        const totalDirectories = totalParties + totalSites + totalProspects;

        // 2. Get total beat plans (Filtered)
        const totalBeatPlans = await BeatPlan.countDocuments(commonFilter);

        // 3. Get unique assigned employees across filtered beat plans
        const beatPlans = await BeatPlan.find(commonFilter)
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

        // 4. Additional stats (Filtered)
        const activeBeatPlans = await BeatPlan.countDocuments({
            ...commonFilter,
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

        // Verify the employee exists and is active (excludes admin)
        const employee = await User.findOne({
            _id: validatedData.employeeId,
            organizationId,
            role: 'user',
            role: 'user',
            isActive: true
        });

        if (!employee) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee. Employee must be an active user in your organization.'
            });
        }

        // Security: Ensure Manager can only assign to subordinates
        // Admin and System roles bypass this
        const { role } = req.user;
        const isAdmin = role === 'admin' || isSystemRole(role);

        if (!isAdmin) {
            // Check if employee reports to this user
            const isSubordinate = await canApprove(req.user, employee, 'beatPlan'); // reusing canApprove for hierarchy check
            // Note: canApprove returns true if approver is supervisor. 
            // We can also double check direct reportsTo if canApprove isn't granular enough, 
            // but canApprove handles deep hierarchy if designed well. 
            // Let's use specific check for safety if canApprove is strict on "permissions".
            // Actually, let's use the explicit check:
            const reportsTo = employee.reportsTo || [];
            const isDirectOrIndirectReport = Array.isArray(reportsTo)
                ? reportsTo.some(id => id.toString() === userId.toString())
                : reportsTo.toString() === userId.toString();

            // Fallback to canApprove which handles logic properly
            if (!isDirectOrIndirectReport && !await canApprove(req.user, employee, 'beatPlan')) {
                return res.status(403).json({
                    success: false,
                    message: "You can only assign beat plans to your subordinates."
                });
            }
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
        const { organizationId, role, _id: userId } = req.user;

        const { status, page = 1, limit = 10 } = req.query;

        // --- HIERARCHY LOGIC ---
        let hierarchyFilter = {};

        // 1. Admin / System Role / View All Feature: View All
        if (role === 'admin' || isSystemRole(role) || req.user.hasFeature('beatPlan', 'viewAllBeatPlans')) {
            hierarchyFilter = {};
        }
        else {
            // Implicit Supervisor Check
            const subordinateIds = await getAllSubordinateIds(userId, organizationId);

            if (subordinateIds.length > 0) {
                // Manager: View Self + Subordinates (Created or Assigned)
                hierarchyFilter = {
                    $or: [
                        { createdBy: userId },
                        { createdBy: { $in: subordinateIds } },
                        { employees: userId },
                        { employees: { $in: subordinateIds } }
                    ]
                };
            } else {
                // Regular User: View Self Only (Created or Assigned)
                hierarchyFilter = {
                    $or: [
                        { createdBy: userId },
                        { employees: userId }
                    ]
                };
            }
        }

        // Build filter
        const filter = { organizationId, ...hierarchyFilter };
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

        // --- IDOR PROTECTION ---
        // Access allowed if: Admin, Creator, Assigned, or Supervisor of Assigned
        const { role, _id: userId } = req.user;
        const isAdmin = role === 'admin' || isSystemRole(role);
        const isCreator = beatPlan.createdBy?._id.toString() === userId.toString();
        const isAssigned = beatPlan.employees.some(emp => emp._id.toString() === userId.toString());

        if (!isAdmin && !isCreator && !isAssigned) {
            // Check if user is supervisor of ANY assigned employee
            // Optimization: Get user's subordinates once
            const mySubordinates = await getAllSubordinateIds(userId, organizationId);
            const mySubordinateIds = new Set(mySubordinates.map(id => id.toString()));

            const isSupervisorOfAssigned = beatPlan.employees.some(emp => mySubordinateIds.has(emp._id.toString()));

            if (!isSupervisorOfAssigned) {
                return res.status(403).json({ success: false, message: 'Access denied to this beat plan' });
            }
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
                role: 'user',
                isActive: true
            });

            if (!employee) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid employee. Employee must be an active user in your organization.'
                });
            }

            // Security: Subordinate check for update
            const { role, _id: userId } = req.user;
            const isAdmin = role === 'admin' || isSystemRole(role);

            if (!isAdmin) {
                const reportsTo = employee.reportsTo || [];
                const isSubordinate = Array.isArray(reportsTo)
                    ? reportsTo.some(id => id.toString() === userId.toString())
                    : reportsTo.toString() === userId.toString();

                if (!isSubordinate && !await canApprove(req.user, employee, 'beatPlan')) {
                    return res.status(403).json({
                        success: false,
                        message: "You can only assign beat plans to your subordinates."
                    });
                }
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

        // Sync visits array when directories are updated
        // Preserve existing visit statuses for directories still in the plan
        if (validatedData.parties !== undefined || validatedData.sites !== undefined || validatedData.prospects !== undefined) {
            const existingVisits = beatPlan.visits || [];

            // Create new visits array preserving existing statuses
            const newVisits = [];

            // Add parties with preserved status
            for (const id of partyIds) {
                const existing = existingVisits.find(
                    v => v.directoryId.toString() === id.toString() && v.directoryType === 'party'
                );
                newVisits.push(existing || { directoryId: id, directoryType: 'party', status: 'pending' });
            }

            // Add sites with preserved status
            for (const id of siteIds) {
                const existing = existingVisits.find(
                    v => v.directoryId.toString() === id.toString() && v.directoryType === 'site'
                );
                newVisits.push(existing || { directoryId: id, directoryType: 'site', status: 'pending' });
            }

            // Add prospects with preserved status
            for (const id of prospectIds) {
                const existing = existingVisits.find(
                    v => v.directoryId.toString() === id.toString() && v.directoryType === 'prospect'
                );
                newVisits.push(existing || { directoryId: id, directoryType: 'prospect', status: 'pending' });
            }

            beatPlan.visits = newVisits;

            const totalDirectories = partyIds.length + siteIds.length + prospectIds.length;

            // Recalculate progress based on current visits
            const visitedCount = newVisits.filter(v => v.status === 'visited').length;
            beatPlan.progress = {
                totalDirectories,
                visitedDirectories: visitedCount,
                percentage: totalDirectories > 0 ? Math.round((visitedCount / totalDirectories) * 100) : 0,
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
// @access  Private (beatPlan:view permission)
exports.getMyBeatPlans = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const { status, page = 1, limit = 10, includeArchived = 'true' } = req.query;

        // Build filter - find beat plans where this user is in the employees array
        const filter = {
            organizationId,
            employees: userId
        };

        // Optionally filter by status
        if (status && status !== 'all') {
            filter.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Helper function to transform beat plan to minimal response format
        const transformBeatPlan = (plan, isArchived = false) => ({
            _id: plan._id,
            originalId: isArchived ? plan.originalId : undefined,
            name: plan.name,
            status: plan.status,
            isArchived: isArchived,
            assignedDate: plan.schedule?.startDate || null,
            startedAt: plan.startedAt || null,
            completedAt: plan.completedAt || null,
            archivedAt: isArchived ? plan.archivedAt : undefined,
            totalDirectories: plan.progress?.totalDirectories || 0,
            visitedDirectories: plan.progress?.visitedDirectories || 0,
            unvisitedDirectories: (plan.progress?.totalDirectories || 0) - (plan.progress?.visitedDirectories || 0),
            progressPercentage: plan.progress?.percentage || 0,
            totalParties: plan.progress?.totalParties || 0,
            totalSites: plan.progress?.totalSites || 0,
            totalProspects: plan.progress?.totalProspects || 0,
        });

        // Query active beat plans
        const [activeBeatPlans, activeCount] = await Promise.all([
            BeatPlan.find(filter)
                .select('name status schedule.startDate progress startedAt completedAt')
                .sort({ 'schedule.startDate': -1, createdAt: -1 })
                .lean(),
            BeatPlan.countDocuments(filter)
        ]);

        let allBeatPlans = activeBeatPlans.map(plan => transformBeatPlan(plan, false));
        let totalCount = activeCount;

        // Include archived beat plans if requested
        if (includeArchived === 'true') {
            const archivedFilter = { ...filter };
            // For archived, we don't filter by status unless specifically requested
            if (!status || status === 'all') {
                delete archivedFilter.status;
            }

            const [archivedBeatPlans, archivedCount] = await Promise.all([
                BeatPlanBackup.find(archivedFilter)
                    .select('originalId name status schedule.startDate progress startedAt completedAt archivedAt')
                    .sort({ archivedAt: -1 })
                    .lean(),
                BeatPlanBackup.countDocuments(archivedFilter)
            ]);

            const transformedArchived = archivedBeatPlans.map(plan => transformBeatPlan(plan, true));
            allBeatPlans = [...allBeatPlans, ...transformedArchived];
            totalCount += archivedCount;
        }

        // Sort combined results by date (most recent first)
        allBeatPlans.sort((a, b) => {
            const dateA = a.archivedAt || a.assignedDate || 0;
            const dateB = b.archivedAt || b.assignedDate || 0;
            return new Date(dateB) - new Date(dateA);
        });

        // Apply pagination after merging
        const paginatedResults = allBeatPlans.slice(skip, skip + parseInt(limit));

        res.status(200).json({
            success: true,
            data: paginatedResults,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / parseInt(limit))
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
// @access  Private (beatPlan:view permission)
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

        // Check access - either assigned employee or admin
        // Fix Manager Blind Spot: Allow Creator and Supervisors too
        const isAssigned = beatPlan.employees.some(emp => emp._id.toString() === userId.toString());
        const isAdmin = role === 'admin' || isSystemRole(role);
        const isCreator = beatPlan.createdBy?._id.toString() === userId.toString();

        if (!isAssigned && !isAdmin && !isCreator) {
            // Subordinate check
            const mySubordinates = await getAllSubordinateIds(userId, organizationId);
            const mySubordinateIds = new Set(mySubordinates.map(id => id.toString()));
            const isSupervisorOfAssigned = beatPlan.employees.some(emp => mySubordinateIds.has(emp._id.toString()));

            if (!isSupervisorOfAssigned) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this beat plan'
                });
            }
        }

        // Populate all directory types with only necessary fields
        // Exclude location.address (not needed for distance calculations) to reduce payload size
        await beatPlan.populate([
            { path: 'parties', select: 'partyName ownerName contact.phone contact.email location.address location.latitude location.longitude panVatNumber' },
            { path: 'sites', select: 'siteName ownerName contact.phone contact.email location.address location.latitude location.longitude' },
            { path: 'prospects', select: 'prospectName ownerName contact.phone contact.email location.address location.latitude location.longitude panVatNumber' }
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
// @access  Private (beatPlan:update permission)
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
// @access  Private (beatPlan:update permission)
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

        // Check access - either assigned employee or admin (permissions via route middleware)
        // Fix Manager Blind Spot: Allow Creator and Supervisors too
        const isAssigned = beatPlan.employees.some(emp => emp._id.toString() === userId.toString());
        const isAdmin = role === 'admin' || isSystemRole(role);
        const isCreator = beatPlan.createdBy?._id.toString() === userId.toString();

        if (!isAssigned && !isAdmin && !isCreator) {
            // Subordinate check
            const mySubordinates = await getAllSubordinateIds(userId, organizationId);
            const mySubordinateIds = new Set(mySubordinates.map(id => id.toString()));
            const isSupervisorOfAssigned = beatPlan.employees.some(emp => mySubordinateIds.has(emp._id.toString()));

            if (!isSupervisorOfAssigned) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this beat plan'
                });
            }
        }

        // Separate parties with and without valid location coordinates
        const partiesWithLocation = beatPlan.parties.filter(p =>
            p.location?.latitude != null &&
            p.location?.longitude != null &&
            !isNaN(p.location.latitude) &&
            !isNaN(p.location.longitude)
        );
        const partiesWithoutLocation = beatPlan.parties.filter(p =>
            !p.location?.latitude ||
            !p.location?.longitude ||
            isNaN(p.location.latitude) ||
            isNaN(p.location.longitude)
        );

        // Warn if any parties lack location data
        if (partiesWithoutLocation.length > 0) {
            console.warn(`⚠️ ${partiesWithoutLocation.length} party(s) missing location coordinates - will be appended as unoptimized`);
        }

        // Prepare starting location if provided
        let startLocation = null;
        if (startLatitude && startLongitude) {
            startLocation = {
                latitude: parseFloat(startLatitude),
                longitude: parseFloat(startLongitude)
            };
        }

        // Optimize only parties with valid location
        let optimization;
        let optimizedParties = [];

        if (partiesWithLocation.length > 0) {
            optimization = optimizeRoute(partiesWithLocation, startLocation);
            optimizedParties = optimization.optimizedParties;
        } else {
            // No parties with location - all are unoptimized
            optimization = {
                originalDistance: 0,
                totalDistance: 0,
                distanceSaved: 0
            };
        }

        // Append parties without location to the end (unoptimized/manual visit)
        const unoptimizedParties = partiesWithoutLocation.map(p => ({
            ...p.toObject(),
            isUnoptimized: true
        }));

        // Combine optimized + unoptimized parties
        const finalPartyOrder = [...optimizedParties, ...unoptimizedParties];

        // Update the beatplan with optimized party order
        const finalPartyIds = finalPartyOrder.map(p => p._id);
        beatPlan.parties = finalPartyIds;

        // Update visits array to match new order
        const newVisits = finalPartyIds.map(partyId => {
            // Find existing visit record or create new one
            const existingVisit = beatPlan.visits.find(v =>
                v.directoryId?.toString() === partyId.toString() && v.directoryType === 'party'
            );
            return existingVisit || {
                directoryId: partyId,
                directoryType: 'party',
                status: 'pending'
            };
        });
        beatPlan.visits = newVisits;

        await beatPlan.save();

        // Prepare response with distance information
        const partiesWithDistances = finalPartyOrder.map((party, index) => {
            const isUnoptimized = party.isUnoptimized;

            let distanceToNext = null;
            if (!isUnoptimized && index < finalPartyOrder.length - 1) {
                const nextParty = finalPartyOrder[index + 1];
                // Only calculate distance if both parties have location and next is not unoptimized
                if (nextParty && !nextParty.isUnoptimized &&
                    party.location?.latitude && party.location?.longitude &&
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
                distanceToNext: distanceToNext,
                isUnoptimized: isUnoptimized || false
            };
        });

        res.status(200).json({
            success: true,
            message: partiesWithoutLocation.length > 0
                ? `Route optimized for ${partiesWithLocation.length} parties. ${partiesWithoutLocation.length} party(s) without location added as manual visits.`
                : 'Route optimized successfully',
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
// @access  Private (beatPlan:view permission)
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
// @access  Private (beatPlan:view permission)
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
        // Fix: Strictly ensure req.user is in the beatPlan.employees list
        // Even Admins should not "mark visited" remotely unless they optimize/update. 
        // Visiting implies physical presence or direct action by the assigned user.
        // Update: User requested Admin override for manual marking cases (e.g. app crash)

        const { role } = req.user;
        const isAdmin = role === 'admin' || isSystemRole(role);
        const isAssigned = beatPlan.employees.some(empId => empId.toString() === userId.toString());

        if (!isAssigned && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Only the assigned employee (or Admin) can mark items as visited.'
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

                // Archive the beat plan and its tracking data to backup collections
                const archiveResult = await archiveBeatPlan(beatPlan);
                console.log(`📦 Beat plan archived successfully: ${archiveResult.backupId}`);

                // Return early since original beat plan is now deleted
                return res.status(200).json({
                    success: true,
                    message: `Beat plan completed and archived. All directories visited.`,
                    archived: true,
                    backupId: archiveResult.backupId
                });
            } catch (error) {
                // Log error but don't fail the request
                console.error('⚠️ Error during completion/archival, but beat plan was marked as completed:', error);
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

// --- Archive Helper Function ---
// Archives a completed beat plan and its tracking sessions to backup collections
// Uses aggregation pipeline with $merge for efficient bulk data transfer
const archiveBeatPlan = async (beatPlan) => {
    try {
        const archivedAt = new Date();
        const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
        const expireAt = new Date(archivedAt.getTime() + TEN_DAYS_MS);

        // 1. Create beat plan backup
        const backupData = {
            originalId: beatPlan._id,
            name: beatPlan.name,
            employees: beatPlan.employees,
            parties: beatPlan.parties,
            sites: beatPlan.sites,
            prospects: beatPlan.prospects,
            visits: beatPlan.visits,
            schedule: beatPlan.schedule,
            status: beatPlan.status,
            startedAt: beatPlan.startedAt,
            completedAt: beatPlan.completedAt,
            progress: beatPlan.progress,
            organizationId: beatPlan.organizationId,
            createdBy: beatPlan.createdBy,
            originalCreatedAt: beatPlan.createdAt,
            originalUpdatedAt: beatPlan.updatedAt,
            archivedAt: archivedAt,
        };

        const beatPlanBackup = await BeatPlanBackup.create(backupData);

        // 2. Archive tracking sessions using aggregation pipeline with $merge
        // This is much more efficient for large datasets than find + loop + create
        const trackingCount = await LocationTracking.countDocuments({ beatPlanId: beatPlan._id });

        if (trackingCount > 0) {
            await LocationTracking.aggregate([
                // Match tracking sessions for this beat plan
                { $match: { beatPlanId: beatPlan._id } },
                // Add archive fields
                {
                    $addFields: {
                        originalId: "$_id",
                        beatPlanBackupId: beatPlanBackup._id,
                        originalBeatPlanId: beatPlan._id,
                        archivedAt: archivedAt,
                        expireAt: expireAt
                    }
                },
                // Remove the original _id so MongoDB generates a new one
                { $unset: "_id" },
                // Merge into backup collection
                {
                    $merge: {
                        into: "locationtrackingbackups",
                        whenMatched: "keepExisting",
                        whenNotMatched: "insert"
                    }
                }
            ]);
        }

        // 3. Delete original tracking sessions
        await LocationTracking.deleteMany({ beatPlanId: beatPlan._id });

        // 4. Delete original beat plan
        await BeatPlan.findByIdAndDelete(beatPlan._id);

        console.log(`📦 Archived beat plan ${beatPlan._id} with ${trackingCount} tracking session(s) using aggregation pipeline`);
        return { success: true, backupId: beatPlanBackup._id, trackingSessionsArchived: trackingCount };
    } catch (error) {
        console.error('Error archiving beat plan:', error);
        throw error;
    }
};

// @desc    Clone a beat plan for reuse with new date/employees
// @route   POST /api/v1/beat-plans/:id/clone
// @access  Protected (beatPlan:add permission)
exports.cloneBeatPlan = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { id } = req.params;
        const { organizationId, _id: userId } = req.user;
        const { employees, startDate, endDate } = req.body;

        // Validate input
        if (!employees || !Array.isArray(employees) || employees.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one employee is required'
            });
        }
        if (!startDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date is required'
            });
        }

        // Find original beat plan (can be from main collection or backup)
        let originalBeatPlan = await BeatPlan.findOne({ _id: id, organizationId });
        let fromBackup = false;

        if (!originalBeatPlan) {
            // Try finding in backup
            originalBeatPlan = await BeatPlanBackup.findOne({
                $or: [{ _id: id }, { originalId: id }],
                organizationId
            });
            fromBackup = true;
        }

        if (!originalBeatPlan) {
            return res.status(404).json({
                success: false,
                message: 'Beat plan not found'
            });
        }

        // Build visits array with pending status
        const allDirectoryIds = [
            ...originalBeatPlan.parties.map(p => ({ id: p, type: 'party' })),
            ...originalBeatPlan.sites.map(s => ({ id: s, type: 'site' })),
            ...originalBeatPlan.prospects.map(pr => ({ id: pr, type: 'prospect' }))
        ];

        const visits = allDirectoryIds.map(dir => ({
            directoryId: dir.id,
            directoryType: dir.type,
            status: 'pending'
        }));

        // Create new beat plan (clone)
        const newBeatPlan = await BeatPlan.create({
            name: originalBeatPlan.name,
            employees: employees,
            parties: originalBeatPlan.parties,
            sites: originalBeatPlan.sites,
            prospects: originalBeatPlan.prospects,
            visits: visits,
            schedule: {
                daysOfWeek: originalBeatPlan.schedule?.daysOfWeek || [],
                frequency: originalBeatPlan.schedule?.frequency || 'weekly',
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
            },
            status: 'pending',
            progress: {
                totalDirectories: allDirectoryIds.length,
                visitedDirectories: 0,
                percentage: 0,
                totalParties: originalBeatPlan.parties.length,
                totalSites: originalBeatPlan.sites.length,
                totalProspects: originalBeatPlan.prospects.length,
            },
            organizationId,
            createdBy: userId,
        });

        // Populate for response
        await newBeatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl' },
            { path: 'parties', select: 'partyName location' },
            { path: 'sites', select: 'siteName location' },
            { path: 'prospects', select: 'prospectName location' }
        ]);

        res.status(201).json({
            success: true,
            message: 'Beat plan cloned successfully',
            data: newBeatPlan
        });
    } catch (error) {
        console.error('Error cloning beat plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clone beat plan',
            error: error.message
        });
    }
};

// @desc    Get archived/completed beat plans (history)
// @route   GET /api/v1/beat-plans/history
// @access  Protected (beatPlan:view permission)
exports.getArchivedBeatPlans = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { organizationId } = req.user;
        const { page = 1, limit = 20, employee } = req.query;

        const query = { organizationId };
        if (employee) {
            query.employees = employee;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [archivedBeatPlans, total] = await Promise.all([
            BeatPlanBackup.find(query)
                .sort({ archivedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('employees', 'name email avatarUrl')
                .populate('createdBy', 'name email')
                .lean(),
            BeatPlanBackup.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            count: archivedBeatPlans.length,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            data: archivedBeatPlans
        });
    } catch (error) {
        console.error('Error fetching archived beat plans:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch archived beat plans',
            error: error.message
        });
    }
};

// @desc    Get archived beat plan by ID
// @route   GET /api/v1/beat-plans/history/:id
// @access  Protected (beatPlan:view permission)
exports.getArchivedBeatPlanById = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const { id } = req.params;
        const { organizationId } = req.user;

        const archivedBeatPlan = await BeatPlanBackup.findOne({ _id: id, organizationId })
            .populate('employees', 'name email role avatarUrl phone')
            .populate('parties', 'partyName ownerName contact location')
            .populate('sites', 'siteName ownerName contact location')
            .populate('prospects', 'prospectName ownerName contact location')
            .populate('createdBy', 'name email');

        if (!archivedBeatPlan) {
            return res.status(404).json({
                success: false,
                message: 'Archived beat plan not found'
            });
        }

        // Get tracking data if still available (within 10-day TTL)
        const trackingData = await LocationTrackingBackup.find({ beatPlanBackupId: id })
            .populate('userId', 'name email avatarUrl')
            .lean();

        res.status(200).json({
            success: true,
            data: archivedBeatPlan,
            tracking: trackingData,
            trackingExpired: trackingData.length === 0
        });
    } catch (error) {
        console.error('Error fetching archived beat plan:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch archived beat plan',
            error: error.message
        });
    }
};

// Export archive function for use in markPartyVisited
exports.archiveBeatPlan = archiveBeatPlan;
