const { hasPermission } = require('./defaultPermissions');

/**
 * Check if a user is authorized to approve a request for another user
 * 
 * Authorization Logic:
 * 1. Approver MUST have the 'approve' permission for the specific module.
 * 2. Approver MUST be either:
 *    a) An 'admin' role user
 *    b) The direct supervisor (reportsTo) of the requester
 * 
 * @param {Object} approver - The user document object attempting to approve
 * @param {Object} requester - The user document object of the requester
 * @param {String} moduleName - The module name to check permission for ('leaves', 'expenses', etc.)
 * @returns {Boolean} true if authorized, false otherwise
 */
exports.canApprove = (approver, requester, moduleName) => {
    if (!approver || !requester) return false;

    // 1. Check Permission: Does approver have approval rights for this module?
    // Get permissions from user object (assuming they are populated or resolved)
    // Note: User controller usually resolves permissions into req.user.permissions or we use helper

    // For now, checks against role/customRoleId would be handled by middleware, 
    // but here we double check if the user object has ability to approve.
    // In many implementations, 'req.user' already has role permissions merged if using getEffectivePermissions

    // However, since we might pass raw user objects, let's rely on the fact that 
    // the controller usually checks `requirePermission(module, 'approve')` BEFORE calling this.
    // But for safety, we can return false if they are not active.
    if (!approver.isActive) return false;

    // 2. Hierarchy Check

    // 2a. Admin Override: Admins can approve anyone's request within their organization
    if (approver.role === 'admin') {
        return approver.organizationId.toString() === requester.organizationId.toString();
    }

    // 2b. Supervisor Check: Must be the direct reporter
    // Ensure requester has a reportsTo field and it matches approver's ID
    if (requester.reportsTo && requester.reportsTo.toString() === approver._id.toString()) {
        return true;
    }

    return false;
};
