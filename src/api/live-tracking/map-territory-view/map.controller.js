const Party = require('../../parties/party.model'); // <-- FIXED PATH
const Prospect = require('../../prospect/prospect.model'); // <-- FIXED PATH
const Site = require('../../sites/sites.model'); // <-- FIXED PATH

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
        const { organizationId } = req.user;

        // 1. Define the fields we need for the map
        const selectFields = 'location.address location.latitude location.longitude';

        // 2. Run all three database queries in parallel
        const [parties, prospects, sites] = await Promise.all([
            // Query 1: Get all Parties
            Party.find({ organizationId })
                 .select(`${selectFields} partyName`)
                 .lean(),
            
            // Query 2: Get all Prospects
            Prospect.find({ organizationId })
                    .select(`${selectFields} prospectName`)
                    .lean(),

            // Query 3: Get all Sites
            Site.find({ organizationId })
                .select(`${selectFields} siteName`)
                .lean()
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