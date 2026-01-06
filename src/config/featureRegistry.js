/**
 * Feature Registry - Definitive Granular Feature Keys
 *
 * This registry defines ALL modules and their granular feature keys.
 * Used by:
 * - SubscriptionPlan (moduleFeatures)
 * - Role (permissions)
 * - Middleware (permission checks)
 */

const FEATURE_REGISTRY = {
  // ============================================
  // ATTENDANCE MODULE
  // ============================================
  attendance: {
    viewMyAttendance: 'View own attendance records',
    viewTeamAttendance: 'View subordinates/team attendance records',
    webCheckIn: 'Allow check-in via web portal',
    mobileCheckIn: 'Allow check-in via mobile app',
    remoteCheckIn: 'Allow check-in from anywhere (no geofence) - Future',
    markHoliday: 'Admin: Mark holiday for organization',
    markAbsentees: 'Admin: Mark absentees manually',
    biometricSync: 'Enable biometric device sync',
  },

  // ============================================
  // PRODUCTS MODULE
  // ============================================
  products: {
    view: 'View product details',
    create: 'Add new product',
    update: 'Edit product details',
    delete: 'Delete product',
    bulkImport: 'Import products via CSV',
    bulkDelete: 'Mass delete products',
    exportPdf: 'Export product list as PDF',
  },

  // ============================================
  // PROSPECTS MODULE
  // ============================================
  prospects: {
    view: 'View prospects',
    create: 'Add new prospect',
    update: 'Edit prospect details',
    delete: 'Delete prospect',
    transfer: 'Transfer prospect to party (convert to customer)',
    manageCategories: 'Create/edit prospect categories',
    import: 'Import prospects via CSV',
  },

  // ============================================
  // ORDER LISTS / INVOICES MODULE
  // ============================================
  orderLists: {
    view: 'View orders/estimates/invoices',
    createEstimate: 'Create quote/estimate',
    createInvoice: 'Create invoice',
    convertToInvoice: 'Convert estimate to invoice',
    editStatus: 'Change order status (Pending → Delivered)',
    delete: 'Delete order record',
    bulkDelete: 'Mass delete orders',
  },

  // ============================================
  // COLLECTIONS MODULE
  // ============================================
  collections: {
    view: 'View collection entries',
    collectPayment: 'Add payment entry',
    verifyPayment: 'Verify/approve payment',
    updateChequeStatus: 'Update cheque status (cleared/bounced)',
    delete: 'Delete collection entry',
  },

  // ============================================
  // BEAT PLANS MODULE
  // ============================================
  beatPlan: {
    view: 'View beat plans',
    create: 'Create new beat plan',
    assign: 'Assign beat plan to user',
    edit: 'Edit existing beat plan',
    delete: 'Delete beat plan',
    adhocVisits: 'Allow visiting parties not in plan',
  },

  // ============================================
  // TOUR PLANS MODULE
  // ============================================
  tourPlan: {
    view: 'View tour plans',
    create: 'Create tour plan',
    approve: 'Approve tour plan',
    edit: 'Edit tour plan',
    delete: 'Delete tour plan',
  },

  // ============================================
  // LIVE TRACKING MODULE
  // ============================================
  liveTracking: {
    view: 'View live map with team locations',
    historyPlayback: 'Replay route history for a date',
  },

  // ============================================
  // EXPENSE CLAIMS MODULE
  // ============================================
  expenses: {
    viewList: 'View all employee expense claims and operational costs',
    viewDetails: 'Access detailed breakdown, receipts, and approval history',
    create: 'Submit and record new expense claims',
    update: 'Edit specific details of an existing expense record',
    updateStatus: 'Approve, reject, or mark expense claims as reimbursed',
    delete: 'Delete expense claim',
    bulkDelete: 'Bulk delete expense claims',
    exportPdf: 'Export expense reports as PDF documents for filing',
    exportExcel: 'Export expense data to Excel spreadsheet for accounting',
    uploadReceipt: 'Upload receipt images for expense claims',
    // Category management (separate features)
    viewCategories: 'View expense categories',
    createCategory: 'Add new expense category',
    updateCategory: 'Edit expense category',
    deleteCategory: 'Delete expense category',
  },

  // ============================================
  // LEAVE REQUESTS MODULE
  // ============================================
  leaves: {
    view: 'View leave requests',
    viewOwn: 'View own leaves only',
    viewTeam: 'View team leaves',
    apply: 'Apply for leave',
    approve: 'Approve leave request (manager)',
  },

  // ============================================
  // PARTIES MODULE
  // ============================================
  parties: {
    view: 'View parties/customers',
    create: 'Add new party',
    update: 'Edit party details',
    delete: 'Delete party',
    import: 'Import parties via CSV',
    exportPdf: 'Export party list as PDF',
  },

  // ============================================
  // SITES MODULE
  // ============================================
  sites: {
    view: 'View sites/locations',
    create: 'Add new site',
    update: 'Edit site details',
    delete: 'Delete site',
    assign: 'Assign users to sites',
  },

  // ============================================
  // DASHBOARD MODULE
  // ============================================
  dashboard: {
    view: 'View dashboard',
    viewOwnStats: 'View own statistics only',
    viewTeamStats: 'View team statistics',
    viewOrgStats: 'View organization-wide statistics',
  },

  // ============================================
  // ANALYTICS MODULE
  // ============================================
  analytics: {
    view: 'View analytics reports',
    salesReports: 'Access sales reports',
    performanceReports: 'Access performance reports',
    attendanceReports: 'Access attendance reports',
    customReports: 'Create custom reports',
    exportReports: 'Export reports as PDF/Excel',
  },

  // ============================================
  // NOTES MODULE
  // ============================================
  notes: {
    view: 'View notes',
    create: 'Create note',
    update: 'Edit note',
    delete: 'Delete note',
    share: 'Share note with team',
  },

  // ============================================
  // MISCELLANEOUS WORK MODULE
  // ============================================
  miscellaneousWork: {
    view: 'View miscellaneous work entries',
    create: 'Create miscellaneous work entry',
    update: 'Edit miscellaneous work',
    delete: 'Delete miscellaneous work',
    approve: 'Approve miscellaneous work',
  },

  // ============================================
  // SETTINGS / ORGANIZATION MODULE
  // ============================================
  settings: {
    view: 'View organization settings',
    manage: 'Edit organization settings',
    manageUsers: 'Add/edit organization users',
    manageRoles: 'Create/edit custom roles',
    manageSubscription: 'View/manage subscription',
  },

  // ============================================
  // EMPLOYEES MODULE
  // ============================================
  employees: {
    view: 'View employee list',
    viewOwn: 'View own profile only',
    create: 'Add new employee',
    update: 'Edit employee details',
    delete: 'Delete/deactivate employee',
    assignSupervisor: 'Set supervisor (reportsTo)',
  },

  // ============================================
  // ODOMETER MODULE
  // ============================================
  odometer: {
    view: 'View odometer readings',
    create: 'Add odometer reading',
    update: 'Edit odometer reading',
    approve: 'Approve odometer reading',
  },
};

/**
 * Get all feature keys for a specific module
 * @param {string} moduleName - The module name
 * @returns {string[]} Array of feature keys
 */
function getModuleFeatures(moduleName) {
  return Object.keys(FEATURE_REGISTRY[moduleName] || {});
}

/**
 * Check if a feature key exists for a module
 * @param {string} moduleName - The module name
 * @param {string} featureKey - The feature key to check
 * @returns {boolean}
 */
function isValidFeature(moduleName, featureKey) {
  return FEATURE_REGISTRY[moduleName]?.hasOwnProperty(featureKey) || false;
}

/**
 * Get all available modules
 * @returns {string[]} Array of module names
 */
function getAllModules() {
  return Object.keys(FEATURE_REGISTRY);
}

/**
 * Get feature description
 * @param {string} moduleName - The module name
 * @param {string} featureKey - The feature key
 * @returns {string} Feature description
 */
function getFeatureDescription(moduleName, featureKey) {
  return FEATURE_REGISTRY[moduleName]?.[featureKey] || '';
}

module.exports = {
  FEATURE_REGISTRY,
  getModuleFeatures,
  isValidFeature,
  getAllModules,
  getFeatureDescription,
};
