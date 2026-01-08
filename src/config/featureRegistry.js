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
    exportPdf: 'Export the attendance data as a PDF',
    exportExcel: 'Export attendance data to an Excel spreadsheet',
    webCheckIn: 'Allow check-in/check-out via web portal',
    mobileCheckIn: 'Allow check-in/check-out via mobile app',
    remoteCheckIn: 'Allow check-in from anywhere (no geofence) - Future',
    markHoliday: 'Admin: Mark holiday for organization',
    updateAttendance: 'Admin: Mark present, absent, leave and half day manually',
    biometricSync: 'Enable biometric device sync',
  },

  // ============================================
  // PRODUCTS MODULE
  // ============================================
  products: {
    viewList: 'View the complete product catalog and details',
    viewDetails: 'View detailed information about a specific product',
    create: 'Add new products to the inventory',
    update: 'Edit existing product details and pricing',
    delete: 'Remove products from the system',
    bulkUpload: 'Import multiple products at once via CSV/Excel',
    bulkDelete: 'Perform mass deletion of selected products',
    exportPdf: 'Generate and download the product list as a PDF document',
    exportExcel: 'Export product data into an Excel spreadsheet for reporting',
    viewCategories: 'View product categories for dropdown selection',
    manageCategories: 'Create, edit, or delete product categories',
  },

  // ============================================
  // PROSPECTS MODULE
  // ============================================
  prospects: {
    viewList: 'View the list of potential leads and prospects',
    viewDetails: 'Access deep-dive information and history for a specific prospect',
    viewOwn: 'View own prospects only',
    viewTeamProspects: 'View subordinates/team prospects',
    viewAllProspects: 'View ALL prospects in the organization (bypass hierarchy filter)',
    viewAssigned: 'View prospects assigned to the current user',
    viewInterests: 'View specific products or services the prospect has shown interest in',
    create: 'Add new prospective clients to the system',
    update: 'Edit prospect contact information and lead details',
    uploadImage: 'Upload profile photos or related images for the prospect',
    delete: 'Remove prospect records from the system',
    deleteImage: 'Permanently remove images from the prospect profile',
    transferToParty: 'Convert or transfer a qualified prospect into a formal Party/Client',
    manageCategories: 'Create/edit prospect categories',
    import: 'Import prospects via CSV',
    exportPdf: 'Export the prospects list as a PDF document',
    exportExcel: 'Export prospect data to an Excel spreadsheet',
    assign: 'Assign prospects to specific users',
  },

  // ============================================
  // ESTIMATES MODULE
  // ============================================
  estimates: {
    viewList: 'View all generated price estimates and quotes',
    viewDetails: 'Access detailed breakdown and items within an estimate',
    create: 'Create new price estimates for potential customers',
    convertToInvoice: 'Convert approved estimate to invoice',
    delete: 'Delete individual estimate',
    bulkDelete: 'Remove multiple estimate records simultaneously',
    exportPdf: 'Export the estimate list as a PDF document',
    exportDetailPdf: 'Export specific estimate details as a PDF',
  },

  // ============================================
  // INVOICES MODULE
  // ============================================
  invoices: {
    viewList: 'View all customer orders and their current status',
    viewDetails: 'Access deep-dive information for specific orders',
    viewTeamInvoices: 'View subordinates/team invoices',
    create: 'Generate new customer invoices',
    updateStatus: 'Modify invoice status (e.g., Pending, Shipped, Delivered)',
    delete: 'Delete invoice record',
    bulkDelete: 'Mass delete invoices',
    viewPartyStats: 'View order statistics by party',
    exportPdf: 'Export the primary invoice list as a PDF',
    exportDetailPdf: 'Export individual invoice details as a PDF',
  },

  // ============================================
  // COLLECTIONS MODULE
  // ============================================
  collections: {
    view: 'View collection entries',
    viewTeamCollections: 'View subordinates/team collection entries',
    collectPayment: 'Add payment entry',
    verifyPayment: 'Verify/approve payment',
    updateChequeStatus: 'Update cheque status (cleared/bounced)',
    delete: 'Delete collection entry',
  },

  // ============================================
  // BEAT PLANS MODULE
  // ============================================
  beatPlan: {
    viewList: 'View all beat plans and routes',
    viewOwn: 'View own assigned beat plans',
    viewTeamBeatPlans: 'View subordinates/team beat plans',
    viewDetails: 'View detailed beat plan information including parties and visits',
    viewSalespersons: 'View list of salespersons for beat plan assignment',
    viewDirectories: 'View available beat plan directories/categories',
    create: 'Create new beat plans and assign to users',
    update: 'Edit beat plan details (parties, dates, etc.)',
    startExecution: 'Start/resume beat plan execution',
    markVisit: 'Mark parties as visited during beat execution',
    optimizeRoute: 'Optimize beat plan route for efficiency',
    calculateDistance: 'Calculate distance to parties from current location',
    delete: 'Delete beat plans',
  },

  // ============================================
  // TOUR PLANS MODULE
  // ============================================
  tourPlan: {
    viewList: 'View the list of all scheduled employee tours',
    viewOwn: 'View own tour plans and requests',
    viewDetails: 'Access in-depth information, itinerary, and stops within a tour',
    create: 'Create and schedule new tours for staff',
    update: 'Edit specific details, dates, or routes of an existing tour plan',
    updateStatus: 'Approve, reject, or update the progress of a tour plan',
    delete: 'Permanently remove a specific tour plan from the system',
    bulkDelete: 'Mass delete multiple tour records simultaneously',
    exportPdf: 'Export tour schedules as PDF documents',
    exportExcel: 'Export tour data to an Excel spreadsheet',
  },

  // ============================================
  // LIVE TRACKING MODULE
  // ============================================
  liveTracking: {
    viewLocations: 'View map with party, prospect, and site locations',
    viewLiveTracking: 'View live team locations and tracking sessions',
    viewActiveSessions: 'View all active tracking sessions',
    viewSessionHistory: 'View tracking session history and breadcrumbs',
    viewCurrentLocation: 'View current location of tracked users',
    historyPlayback: 'Replay route history for a specific date',
    deleteSession: 'Delete tracking session data',
  },

  // ============================================
  // EXPENSE CLAIMS MODULE
  // ============================================
  expenses: {
    viewList: 'View all employee expense claims and operational costs',
    viewTeamClaims: 'View subordinates/team expense claims',
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
    viewList: 'View all employee leave requests and history',
    viewOwn: 'View own leave requests only',
    viewTeamLeaves: 'View subordinates/team leave requests',
    viewDetails: 'View leave request details and comments',
    create: 'Create new leave request',
    update: 'Edit own leave request (before approval)',
    updateStatus: 'Approve, reject, or comment on pending leave applications',
    delete: 'Delete/cancel leave request',
    bulkDelete: 'Bulk delete leave requests',
    exportPdf: 'Export the leave records list as a PDF document',
    exportExcel: 'Export leave data to an Excel spreadsheet for payroll',
  },

  // ============================================
  // PARTIES MODULE
  // ============================================
  parties: {
    viewList: 'View list of all parties',
    viewDetails: 'View specific party details',
    viewOwn: 'View own parties only',
    viewTeamParties: 'View subordinates/team parties',
    viewAllParties: 'View ALL parties in the organization (bypass hierarchy filter)',
    viewAssigned: 'View parties assigned to the current user',
    viewTypes: 'View available party types for categorization',
    create: 'Add new parties to the system (implicitly creates party types)',
    update: 'Edit party contact information and business details',
    uploadImage: 'Upload profile photos or business-related images for the party',
    delete: 'Remove party records from the database',
    deleteImage: 'Permanently remove images from the party profile',
    bulkImport: 'Import multiple parties at once via CSV/Excel',
    manageTypes: 'Explicitly create, edit, or delete party types',
    exportPdf: 'Export the list of parties as a PDF document',
    exportExcel: 'Export party contact and data to an Excel spreadsheet',
    viewOrders: 'View specific order history and transactions for a party',
    assign: 'Assign parties to specific users',
  },

  // ============================================
  // SITES MODULE
  // ============================================
  sites: {
    viewList: 'View all registered sites and project locations',
    viewDetails: 'Access detailed configuration and history for a specific site',
    viewOwn: 'View own sites only',
    viewTeamSites: 'View subordinates/team sites',
    viewAllSites: 'View ALL sites in the organization (bypass hierarchy filter)',
    viewAssigned: 'View sites assigned to the current user',
    viewInterests: 'Monitor specific business interests or activities linked to sites',
    viewSubOrganizations: 'View available sub-organizations for site categorization',
    create: 'Register new site locations in the system (implicitly creates categories/sub-orgs)',
    update: 'Edit site details, boundaries, or contact information',
    uploadImage: 'Upload site photos, blueprints, or progress images',
    delete: 'Permanently remove site records from the system',
    deleteImage: 'Permanently remove images from the site profile',
    assign: 'Assign users to sites',
    manageCategories: 'Explicitly create, edit, or delete site categories',
    exportPdf: 'Export the site directory as a PDF document',
    exportExcel: 'Export site data and coordinates to an Excel spreadsheet',
  },

  // ============================================
  // DASHBOARD MODULE
  // ============================================
  dashboard: {
    viewStats: 'View high-level business metrics and overview cards',
    viewTeamPerformance: 'View real-time team performance metrics for today',
    viewAttendanceSummary: 'View daily attendance overview across the organization',
    viewSalesTrend: 'View sales revenue and growth trends for the last 7 days',
  },

  // ============================================
  // ANALYTICS MODULE
  // ============================================
  analytics: {
    viewMonthlyOverview: 'View month-over-month performance summaries and KPIs',
    viewTeamAnalytics: 'View aggregated analytics for subordinates/team',
    viewSalesTrend: 'Access detailed revenue charts and growth trends',
    viewCategorySales: 'View breakdown of products sold by specific categories',
    viewTopProducts: 'Analyze the highest performing products by volume and value',
    viewTopParties: 'Identify and view the top 5 customers/parties of the month',
  },

  // ============================================
  // NOTES MODULE
  // ============================================
  notes: {
    viewList: 'View all created notes, memos, and internal reminders',
    viewOwn: 'View own created notes only',
    viewTeamNotes: 'View subordinates/team notes',
    viewDetails: 'Access the full content, attachments, and metadata of a specific note',
    create: 'Create and save new notes or documentation',
    update: 'Edit the content, title, or tags of an existing note',
    uploadImage: 'Upload or update images attached to notes',
    delete: 'Permanently remove a specific note from the system',
    bulkDelete: 'Mass delete multiple notes simultaneously',
    exportPdf: 'Export the notes list as a PDF document',
    exportExcel: 'Export notes data to an Excel spreadsheet',
  },

  // ============================================
  // MISCELLANEOUS WORK MODULE
  // ============================================
  miscellaneousWork: {
    viewList: 'View all recorded miscellaneous or uncategorized task records',
    viewOwn: 'View own miscellaneous work entries',
    viewTeamMiscellaneous: 'View subordinates/team miscellaneous work',
    viewDetails: 'View specific miscellaneous work entry details and images',
    create: 'Create new miscellaneous work entry',
    update: 'Edit existing miscellaneous work entry',
    uploadImage: 'Upload images to miscellaneous work entry',
    delete: 'Permanently remove a specific miscellaneous work entry',
    bulkDelete: 'Mass delete multiple miscellaneous work records simultaneously',
    exportPdf: 'Export the miscellaneous work list as a PDF document',
    exportExcel: 'Export miscellaneous work data to an Excel spreadsheet',
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
    viewList: 'View all registered employees and their basic info',
    viewOwn: 'View own profile only',
    viewDetails: 'Access full profile, including personal and professional info',
    create: 'Onboard and add new employees to the system',
    update: 'Edit employee profile details and work information',
    delete: 'Remove employee records from the system',
    assignSupervisor: 'Set supervisor (reportsTo) for employee',
    viewAttendance: 'View specific attendance history for an employee',
    uploadDocuments: 'Upload sensitive documents (ID, Contract, etc.) to employee profiles',
    deleteDocuments: 'Permanently remove uploaded documents from employee records',
    exportPdf: 'Export the employee directory as a PDF',
    exportExcel: 'Export employee data to an Excel spreadsheet',
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

  // ============================================
  // SYSTEM USERS MODULE (superadmin/developer only)
  // ============================================
  systemUsers: {
    viewList: 'View all system users (superadmin, developer)',
    viewDetails: 'View detailed system user information',
    create: 'Add new system user (superadmin/developer)',
    update: 'Edit system user details',
    delete: 'Remove system user',
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
