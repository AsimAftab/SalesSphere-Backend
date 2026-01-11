const { checkRoleFeaturePermission } = require('../middlewares/compositeAccess.middleware');
const { isSystemRole } = require('./defaultPermissions');
const User = require('../api/users/user.model');
const mongoose = require('mongoose');

/**
 * Check if a user is authorized to approve a request
 * Authorization Logic:
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
    if (moduleName === 'attendance') permissionKey = 'updateAttendance';

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
 * OPTIMIZED: Get all subordinate IDs in ONE database call
 * Uses MongoDB's native $graphLookup for deep hierarchy traversal
    * Performance: 1 query instead of 50 + queries for nested hierarchies
        *
 * @param { string| ObjectId} userId - Starting user ID
    * @param { string | ObjectId } organizationId - Organization ID(for tenant isolation)
 * @returns { Promise < Array < mongoose.Types.ObjectId >>} Array of subordinate user IDs
    */
const getAllSubordinateIds = async (userId, organizationId) => {
    try {
        const result = await User.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(userId),
                    organizationId: new mongoose.Types.ObjectId(organizationId)
                }
            },
            {
                $graphLookup: {
                    from: 'users',
                    startWith: '$_id',
                    connectFromField: '_id',
                    connectToField: 'reportsTo',
                    as: 'subordinates',
                    restrictSearchWithMatch: {
                        organizationId: new mongoose.Types.ObjectId(organizationId),
                        isActive: true
                    },
                    maxDepth: 20  // Safety limit to prevent infinite loops
                }
            },
            {
                $project: {
                    subordinateIds: '$subordinates._id'
                }
            }
        ]);

        return result[0]?.subordinateIds || [];
    } catch (error) {
        console.error('Error in getAllSubordinateIds:', error);
        return [];
    }
};

exports.getAllSubordinateIds = getAllSubordinateIds;

/**
 * Helper to construct hierarchy-based query for data filtering
 * Returns a query object to be merged with other filters
 * @param {Object} user - The user object from req.user
 * @param {string} moduleName - The module name (e.g., 'prospects', 'parties')
 * @param {string} viewAllFeature - The feature key for view all (e.g., 'viewAllAttendance')
 * @returns {Promise<Object>} Filter object for MongoDB queries
 */
exports.getHierarchyFilter = async (user, moduleName, viewAllFeature) => {
    const { role, _id: userId, organizationId } = user;

    // 1. System Role: No additional filter (View All)
    if (isSystemRole(role)) {
        return {};
    }

    // 2. Org Admin: View all within org (organization filter applied separately)
    if (role === 'admin') {
        return {};
    }

    // 3. View All Feature (Global Access within Org)
    // If user has the specific 'View All' feature enabled, return empty filter (view everything)
    if (user.hasFeature && user.hasFeature(moduleName, viewAllFeature)) {
        return {};
    }

    // 4. Manager/Supervisor: View Self + Subordinates (Implicit Access)
    // Implicit: If you have subordinates, you see them.

    // Always fetch subordinates to check for implicit supervisor status
    const subordinateIds = await getAllSubordinateIds(userId, organizationId);

    const hasSubordinates = subordinateIds.length > 0;

    if (hasSubordinates) {
        // Return filter for "CreatedBy Me OR CreatedBy Any Subordinate (Deep)"
        return {
            $or: [
                { createdBy: userId },
                { createdBy: { $in: subordinateIds } }
            ]
        };
    }

    // 5. Regular User: View Self Only
    return { createdBy: userId };
};

/**
 * Entity Access Filter with Assignment Support
 * Combines hierarchy + assignment filtering for parties, prospects, sites
 *
 * Access Logic:
 * 1. System roles → See all
 * 2. Admin → See all in org
 * 3. Has viewAll feature → See all in org
 * 4. Has viewTeam feature → See self + subordinates' created + subordinates' assigned data
 * 5. Everyone → See assigned to self + own created
 *
 * @param {Object} user - The user object from req.user
 * @param {string} moduleName - The module name (e.g., 'parties', 'prospects', 'sites')
 * @param {string} viewAllFeature - The feature key for view all (e.g., 'viewAllParties')
 * @returns {Promise<Object>} Filter object for MongoDB queries
 */
exports.getEntityAccessFilter = async (user, moduleName, viewAllFeature) => {
    const { role, _id: userId, organizationId } = user;

    // ==================================================
    // 1. SYSTEM ROLES: No filter (see everything)
    // ==================================================
    if (isSystemRole(role)) {
        return {};
    }

    // ==================================================
    // 2. ADMIN: No filter (see all in org)
    // ==================================================
    if (role === 'admin') {
        return {};
    }

    // ==================================================
    // 3. viewAll FEATURE: See all in org (manager role)
    // ==================================================
    const hasViewAll = user.hasFeature && user.hasFeature(moduleName, viewAllFeature);
    if (hasViewAll) {
        return {};
    }

    // Build filter conditions array
    const orConditions = [];

    // ==================================================
    // 4. BASE: Created By Me OR Assigned To Me
    // ==================================================
    orConditions.push({ createdBy: userId });
    orConditions.push({ assignedUsers: userId });

    // ==================================================
    // 5. TEAM VIEW: See subordinates' data (Deep Hierarchy)
    // ==================================================
    // Implicit Access: Supervisors automatically see team data
    // Use the optimized $graphLookup helper (single DB query)
    const subordinateIds = await getAllSubordinateIds(userId, organizationId);

    // Check if user has subordinates - if yes, grant implicit access
    const hasImplicitAccess = subordinateIds.length > 0;

    // NOTE: 'teamViewFeature' usage is deprecated/removed in favor of implicit access
    // 'viewAllFeature' is handled in step 3.

    if (hasImplicitAccess) {
        // A. See data CREATED by team
        orConditions.push({ createdBy: { $in: subordinateIds } });

        // B. See data ASSIGNED to team (Fixes the Manager Blind Spot)
        // If Admin assigns a lead to Salesperson, Manager must see it
        orConditions.push({ assignedUsers: { $in: subordinateIds } });
    }

    // ==================================================
    // 6. COMBINE FILTERS: Use $or for multiple conditions
    // ==================================================
    // User sees data if ANY condition matches:
    // - Created by self
    // - Assigned to self
    // - Created by subordinate (if hasTeamView)
    // - Assigned to subordinate (if hasTeamView) ← Manager Blind Spot fix

    if (orConditions.length === 0) {
        // Fallback safety: If no conditions, user sees nothing (or just their own)
        return { createdBy: userId };
    }

    if (orConditions.length === 1) {
        // Optimization: No need for $or if there's only one condition
        return orConditions[0];
    }

    return { $or: orConditions };
};
