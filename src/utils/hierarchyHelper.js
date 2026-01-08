const { checkRoleFeaturePermission } = require('../middlewares/compositeAccess.middleware');

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
