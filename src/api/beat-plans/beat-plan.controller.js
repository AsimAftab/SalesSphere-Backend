const BeatPlan = require('./beat-plan.model');
const Party = require('../parties/party.model');
const User = require('../users/user.model');
const { z } = require('zod');

// --- Zod Validation Schemas ---
// Simple validation for UI create beat plan
const createBeatPlanValidation = z.object({
    employeeId: z.string({ required_error: "Employee is required" }).min(1, "Employee is required"),
    name: z.string({ required_error: "Beat plan name is required" }).min(1, "Beat plan name is required"),
    assignedDate: z.string({ required_error: "Date is required" }).refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
    parties: z.array(z.string()).min(1, "At least one party must be added to the route"),
});

// Update validation schema for beat plan management
const updateBeatPlanValidation = z.object({
    name: z.string().min(1, "Beat plan name is required").optional(),
    employeeId: z.string().min(1, "Employee is required").optional(),
    assignedDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }).optional(),
    parties: z.array(z.string()).min(1, "At least one party must be added to the route").optional(),
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

// @desc    Get available parties for beat plan assignment
// @route   GET /api/v1/beat-plans/available-parties
// @access  Protected
exports.getAvailableParties = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const { search } = req.query;

        // Build filter
        const filter = { organizationId };

        // Add search functionality for party name or owner name
        if (search) {
            filter.$or = [
                { partyName: { $regex: search, $options: 'i' } },
                { ownerName: { $regex: search, $options: 'i' } },
                { 'location.address': { $regex: search, $options: 'i' } }
            ];
        }

        // Fetch parties with relevant fields
        const parties = await Party.find(filter)
            .select('partyName ownerName location.address location.latitude location.longitude contact.phone')
            .sort({ partyName: 1 });

        res.status(200).json({
            success: true,
            data: parties
        });
    } catch (error) {
        console.error('Error fetching available parties:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available parties',
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

        // 1. Get total parties (shops) in the organization
        const totalShops = await Party.countDocuments({ organizationId });

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
                totalShops,
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

        // Verify all parties belong to the organization
        const parties = await Party.find({
            _id: { $in: validatedData.parties },
            organizationId
        });

        if (parties.length !== validatedData.parties.length) {
            return res.status(400).json({
                success: false,
                message: 'Some parties do not belong to your organization'
            });
        }

        // Create the beat plan
        const assignedDate = new Date(validatedData.assignedDate);

        // Initialize visits array with all parties as pending
        const visits = validatedData.parties.map(partyId => ({
            partyId: partyId,
            status: 'pending'
        }));

        const newBeatPlan = await BeatPlan.create({
            name: validatedData.name,
            employees: [validatedData.employeeId], // Store as array for model compatibility
            parties: validatedData.parties,
            visits: visits, // Initialize visit tracking
            schedule: {
                startDate: assignedDate,
                frequency: 'custom',
            },
            status: 'pending', // Start as pending
            progress: {
                totalParties: validatedData.parties.length,
                visitedParties: 0,
                percentage: 0,
            },
            organizationId,
            createdBy: userId,
        });

        // Populate references before sending response
        await newBeatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl phone' },
            { path: 'parties', select: 'partyName ownerName contact location' },
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

        // Verify parties if provided
        if (validatedData.parties && validatedData.parties.length > 0) {
            const parties = await Party.find({
                _id: { $in: validatedData.parties },
                organizationId
            });

            if (parties.length !== validatedData.parties.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Some parties do not belong to your organization'
                });
            }

            // Reset visits array with new parties
            beatPlan.parties = validatedData.parties;
            beatPlan.visits = validatedData.parties.map(partyId => ({
                partyId: partyId,
                status: 'pending'
            }));

            // Reset progress
            beatPlan.progress = {
                totalParties: validatedData.parties.length,
                visitedParties: 0,
                percentage: 0
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

        // Reset status to pending (reusable beat plan)
        beatPlan.status = 'pending';

        await beatPlan.save();

        // Populate references before sending response
        await beatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl phone' },
            { path: 'parties', select: 'partyName ownerName contact location' },
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

// @desc    Mark a party as visited in beat plan
// @route   POST /api/v1/beat-plans/:id/visit
// @access  Protected (Salesperson)
exports.markPartyVisited = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const { partyId, latitude, longitude } = req.body;

        // Validate required fields
        if (!partyId) {
            return res.status(400).json({
                success: false,
                message: 'Party ID is required'
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

        // Check if the party is in the beat plan
        const partyIndex = beatPlan.parties.findIndex(p => p.toString() === partyId);
        if (partyIndex === -1) {
            return res.status(400).json({
                success: false,
                message: 'Party not found in this beat plan'
            });
        }

        // Find the visit record
        const visitIndex = beatPlan.visits.findIndex(v => v.partyId.toString() === partyId);
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
                message: 'Party already marked as visited'
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
        beatPlan.progress.visitedParties = visitedCount;
        beatPlan.progress.percentage = Math.round((visitedCount / beatPlan.progress.totalParties) * 100);

        // Update beat plan status
        if (visitedCount === 1 && beatPlan.status === 'pending') {
            // First party visited - change to active
            beatPlan.status = 'active';
        } else if (visitedCount === beatPlan.progress.totalParties) {
            // All parties visited - change to completed
            beatPlan.status = 'completed';
        }

        await beatPlan.save();

        // Populate and return
        await beatPlan.populate([
            { path: 'employees', select: 'name email role avatarUrl phone' },
            { path: 'parties', select: 'partyName ownerName contact location' },
            { path: 'visits.partyId', select: 'partyName ownerName location' }
        ]);

        res.status(200).json({
            success: true,
            message: 'Party marked as visited successfully',
            data: beatPlan
        });
    } catch (error) {
        console.error('Error marking party as visited:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark party as visited',
            error: error.message
        });
    }
};
