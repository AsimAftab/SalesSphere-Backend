const { checkRoleFeaturePermission } = require('../middlewares/compositeAccess.middleware');
const { isSystemRole } = require('./defaultPermissions');
const User = require('../api/users/user.model');

/**
 * Check if a user is authorized to approve a request
 * * Authorization Logic:
 * 1. Admin Override: Admins can approve ANYTHING within their org.
 * 2. Permission Check: Approver MUST have 'updateStatus' (or 'approve') capability.
 * 3. Supervisor Check: Approver MUST be in the requester's 'reportsTo' array.
 */
exports.canApprove = (approver, requester, moduleName) => {
    if (!approver || !requester) return false;
    if (!approver.isActive) return false;

    // ==================================================
    // 1. ADMIN OVERRIDE (The Safety Net)
    // ==================================================
    // Check if role is populated and name is Admin
    // OR if role matches the specific hardcoded System Role strings if you use them
    const roleName = approver.role?.name || approver.role;

    // Convert to string and lowercase to be safe against 'Admin' vs 'admin'
    if (roleName && roleName.toString().toLowerCase() === 'admin') {
        // Security: Prevent cross-organization approvals
        if (approver.organizationId?.toString() !== requester.organizationId?.toString()) {
            return false;
        }
        return true;
    }

    // ==================================================
    // 2. PERMISSION CHECK (The "Capability" Gate)
    // ==================================================
    // Determine the correct key ('approve' for Odometer, 'updateStatus' for others)
    let permissionKey = 'updateStatus';
    if (moduleName === 'odometer') permissionKey = 'approve';

    // Use the centralized helper. This works even if 'hasFeature' isn't on the User model.
    const permCheck = checkRoleFeaturePermission(approver, moduleName, permissionKey);

    if (!permCheck.allowed) {
        return false;
    }

    // ==================================================
    // 3. SUPERVISOR CHECK (The "Relationship" Gate)
    // ==================================================
    // Check if requester has supervisors assigned
    if (!requester.reportsTo || (Array.isArray(requester.reportsTo) && requester.reportsTo.length === 0)) {
        // No supervisor assigned -> Only Admin could have approved (handled in step 1).
        // So we return false here.
        return false;
    }

    const approverId = approver._id.toString();

    // Handle Array (Multiple Supervisors)
    if (Array.isArray(requester.reportsTo)) {
        const isSupervisor = requester.reportsTo.some(id => id.toString() === approverId);
        if (isSupervisor) return true;
    }
    // Handle Single ID (Fallback/Legacy support)
    else if (requester.reportsTo.toString() === approverId) {
        return true;
    }

    return false;
};

/**
 * Helper to construct hierarchy-based query for data filtering
 * Returns a query object to be merged with other filters
 * @param {Object} user - The user object from req.user
 * @param {string} moduleName - The module name (e.g., 'prospects', 'parties')
 * @param {string} teamViewFeature - The feature key for team view (e.g., 'viewTeamProspects')
 * @returns {Promise<Object>} Filter object for MongoDB queries
 */
exports.getHierarchyFilter = async (user, moduleName, teamViewFeature) => {
    const { role, _id: userId } = user;

    // 1. System Role: No additional filter (View All)
    if (isSystemRole(role)) {
        return {};
    }

    // 2. Org Admin: View all within org (organization filter applied separately)
    if (role === 'admin') {
        return {};
    }

    // 3. Manager with team view feature: View Self + Subordinates (Recursive)
    if (user.hasFeature && user.hasFeature(moduleName, teamViewFeature)) {
        // Start with direct reports
        let allSubordinateIds = [];
        let currentLevelIds = [userId];

        // Loop to find deep hierarchy
        // Safety break to prevent infinite loops (though hierarchy should be acyclic by validation)
        let depth = 0;
        const MAX_DEPTH = 20;

        while (currentLevelIds.length > 0 && depth < MAX_DEPTH) {
            const subordinates = await User.find({ reportsTo: { $in: currentLevelIds } }).select('_id');
            const nextLevelIds = subordinates.map(u => u._id);

            if (nextLevelIds.length === 0) break;

            // Add unique IDs to master list
            const newIds = nextLevelIds.filter(id =>
                !allSubordinateIds.some(existing => existing.toString() === id.toString()) &&
                id.toString() !== userId.toString() // Prevent self-include if cycle exists
            );

            if (newIds.length === 0) break; // No new nodes found

            allSubordinateIds = [...allSubordinateIds, ...newIds];
            currentLevelIds = newIds; // Continue searching from the new level
            depth++;
        }

        // Return filter for "CreatedBy Me OR CreatedBy Any Subordinate (Deep)"
        return {
            $or: [
                { createdBy: userId },
                { createdBy: { $in: allSubordinateIds } }
            ]
        };
    }

    // 4. Regular User: View Self Only
    return { createdBy: userId };
};
