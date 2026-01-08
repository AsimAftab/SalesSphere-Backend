const Party = require('../../parties/party.model'); // <-- FIXED PATH
const Prospect = require('../../prospect/prospect.model'); // <-- FIXED PATH
const Site = require('../../sites/sites.model');
const User = require('../../users/user.model');
const { isSystemRole } = require('../../../utils/defaultPermissions');

// --- HELPER: Get Hierarchy Filter ---
// Returns a query object based on user role and granular permissions
const getMapHierarchyFilter = async (user, moduleName, teamViewFeatureKey) => {
    const { role, _id: userId } = user;

    // 1. Admin / System Role: Access All
    if (role === 'admin' || isSystemRole(role)) {
        return {};
    }

    // 2. Manager with Team View Feature: Access Self + Subordinates
    if (user.hasFeature(moduleName, teamViewFeatureKey)) {
        const subordinates = await User.find({ reportsTo: { $in: [userId] } }).select('_id');
        const subordinateIds = subordinates.map(u => u._id);

        return {
            $or: [
                { createdBy: userId },
                { createdBy: { $in: subordinateIds } }
            ]
        };
    }

    // 3. Regular User: Access Self Only
    return { createdBy: userId };
};

/**
 * @desc    Get all map locations (Parties, Prospects, Sites) for the org
 * @route   GET /api/v1/map/locations
 * @access  Private (All roles)
 */
exports.getMapLocations = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        const { organizationId, role } = req.user;

        // 1. Define the fields we need for the map
        const selectFields = 'location.address location.latitude location.longitude';

        // 2. Get hierarchy filters for each module
        const [partyFilter, prospectFilter, siteFilter] = await Promise.all([
            getMapHierarchyFilter(req.user, 'parties', 'viewTeamParties'),
            getMapHierarchyFilter(req.user, 'prospects', 'viewTeamProspects'),
            getMapHierarchyFilter(req.user, 'sites', 'viewTeamSites')
        ]);

        // 3. Run all three database queries in parallel
        const [parties, prospects, sites] = await Promise.all([
            // Query 1: Get Parties (check viewList permission first)
            req.user.hasFeature('parties', 'viewList')
                ? Party.find({ organizationId, ...partyFilter }).select(`${selectFields} partyName`).lean()
                : Promise.resolve([]),

            // Query 2: Get Prospects (check viewList permission first)
            req.user.hasFeature('prospects', 'viewList')
                ? Prospect.find({ organizationId, ...prospectFilter }).select(`${selectFields} prospectName`).lean()
                : Promise.resolve([]),

            // Query 3: Get Sites (check viewList permission first)
            req.user.hasFeature('sites', 'viewList')
                ? Site.find({ organizationId, ...siteFilter }).select(`${selectFields} siteName`).lean()
                : Promise.resolve([])
        ]);

        // 3. Standardize the data into a single format

        const partyLocations = parties.map(p => ({
            _id: p._id,
            name: p.partyName,
            address: p.location.address,
            latitude: p.location.latitude,
            longitude: p.location.longitude,
            type: 'party' // Add a type for the frontend
        }));

        const prospectLocations = prospects.map(p => ({
            _id: p._id,
            name: p.prospectName,
            address: p.location.address,
            latitude: p.location.latitude,
            longitude: p.location.longitude,
            type: 'prospect'
        }));

        const siteLocations = sites.map(s => ({
            _id: s._id,
            name: s.siteName,
            address: s.location.address,
            latitude: s.location.latitude,
            longitude: s.location.longitude,
            type: 'site'
        }));

        // 4. Return locations organized by type
        res.status(200).json({
            success: true,
            count: {
                total: partyLocations.length + prospectLocations.length + siteLocations.length,
                parties: partyLocations.length,
                prospects: prospectLocations.length,
                sites: siteLocations.length
            },
            data: {
                parties: partyLocations,
                prospects: prospectLocations,
                sites: siteLocations
            }
        });

    } catch (error) {
        console.error("Error fetching map locations:", error);
        next(error);
    }
};