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
    viewAllAttendance: 'Master Key: View ALL attendance records in organization',
    viewMyAttendance: 'View own attendance records',
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
    viewList: 'Access product list page',
    viewDetails: 'View detailed information about a specific product',
    create: 'Add new products to the inventory (includes image upload)',
    update: 'Edit existing product details and pricing (includes image update)',
    delete: 'Remove products from the system (includes image deletion)',
    bulkUpload: 'Import multiple products at once via CSV/Excel',
    bulkDelete: 'Perform mass deletion of selected products',
    exportPdf: 'Generate and download the product list as a PDF document',
    exportExcel: 'Export product data into an Excel spreadsheet for reporting',
  },

  // ============================================
  // PROSPECTS MODULE
  // ============================================
  prospects: {
    viewAllProspects: 'Master Key: View ALL prospects in the organization (bypass hierarchy filter)',
    viewList: 'Access prospect list page',
    viewDetails: 'Access deep-dive information and history for a specific prospect',
    viewOwn: 'View own prospects only',
    viewAssigned: 'View prospects assigned to the current user',
    create: 'Add new prospective clients to the system (includes image upload)',
    update: 'Edit prospect contact information and lead details (includes image update)',
    delete: 'Remove prospect records from the system (includes image deletion)',
    transferToParty: 'Convert or transfer a qualified prospect into a formal Party/Client',
    import: 'Import prospects via CSV',
    exportPdf: 'Export the prospects list as a PDF document',
    exportExcel: 'Export prospect data to an Excel spreadsheet',
    assign: 'Assign prospects to specific users',
  },

  // ============================================
  // ESTIMATES MODULE
  // ============================================
  estimates: {
    viewList: 'Access estimate list page',
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
    viewAllInvoices: 'Master Key: View ALL organization invoices',
    viewList: 'Access invoice list page',
    viewDetails: 'Access deep-dive information for specific orders',
    viewDetails: 'Access deep-dive information for specific orders',
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
    viewAllCollections: 'Master Key: View ALL organization collection entries',
    view: 'View collection entries',
    collectPayment: 'Add payment entry (includes image upload)',
    verifyPayment: 'Verify/approve payment',
    updateChequeStatus: 'Update cheque status (cleared/bounced)',
    delete: 'Delete collection entry',
  },

  // ============================================
  // BEAT PLANS MODULE
  // ============================================
  beatPlan: {
    viewAllBeatPlans: 'Master Key: View ALL organization beat plans',
    viewList: 'Access beat plan list page',
    viewOwn: 'View own assigned beat plans',
    viewOwn: 'View own assigned beat plans',
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
    viewAllTourPlans: 'Master Key: View ALL organization tour plans',
    viewList: 'Access tour plan list page',
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
    viewAllClaims: 'Master Key: View ALL organization expense claims',
    viewList: 'Access expense claim list page',
    viewDetails: 'Access detailed breakdown, receipts, and approval history',
    create: 'Submit and record new expense claims',
    update: 'Edit specific details of an existing expense record',
    updateStatus: 'Approve, reject, or mark expense claims as reimbursed',
    delete: 'Delete expense claim',
    bulkDelete: 'Bulk delete expense claims',
    exportPdf: 'Export expense reports as PDF documents for filing',
    exportExcel: 'Export expense data to Excel spreadsheet for accounting',
  },

  // ============================================
  // LEAVE REQUESTS MODULE
  // ============================================
  leaves: {
    viewAllLeaves: 'Master Key: View ALL organization leave requests',
    viewList: 'Access leave request list page',
    viewOwn: 'View own leave requests only',
    viewOwn: 'View own leave requests only',
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
    viewAllParties: 'Master Key: View ALL parties in the organization (bypass hierarchy filter)',
    viewList: 'Access party list page',
    viewDetails: 'View specific party details',
    viewOwn: 'View own parties only',
    viewOwn: 'View own parties only',
    viewAssigned: 'View parties assigned to the current user',
    create: 'Add new parties to the system (includes image upload, implicitly creates party types)',
    update: 'Edit party contact information and business details (includes image update)',
    delete: 'Remove party records from the database (includes image deletion)',
    bulkImport: 'Import multiple parties at once via CSV/Excel',
    exportPdf: 'Export the list of parties as a PDF document',
    exportExcel: 'Export party contact and data to an Excel spreadsheet',
    viewOrders: 'View specific order history and transactions for a party',
    assign: 'Assign parties to specific users',
  },

  // ============================================
  // SITES MODULE
  // ============================================
  sites: {
    viewAllSites: 'Master Key: View ALL sites in the organization (bypass hierarchy filter)',
    viewList: 'Access site list page',
    viewDetails: 'Access detailed configuration and history for a specific site',
    viewOwn: 'View own sites only',
    viewOwn: 'View own sites only',
    viewAssigned: 'View sites assigned to the current user',
    viewSubOrganizations: 'View available sub-organizations for site categorization',
    create: 'Register new site locations in the system (includes image upload, implicitly creates categories/sub-orgs)',
    update: 'Edit site details, boundaries, or contact information (includes image update)',
    delete: 'Permanently remove site records from the system (includes image deletion)',
    assign: 'Assign users to sites',
    exportPdf: 'Export the site directory as a PDF document',
    exportExcel: 'Export site data and coordinates to an Excel spreadsheet',
  },

  // ============================================
  // DASHBOARD MODULE
  // ============================================
  dashboard: {
    viewAllPerformance: 'Master Key: View real-time organization performance metrics',
    viewTeamPerformance: 'View team performance metrics (scoped by hierarchy)',
    viewStats: 'View high-level business metrics and overview cards',
    viewAttendanceSummary: 'View daily attendance overview across the organization',
    viewSalesTrend: 'View sales revenue and growth trends for the last 7 days',
  },

  // ============================================
  // ANALYTICS MODULE
  // ============================================
  analytics: {
    viewAllAnalytics: 'Master Key: View aggregated analytics for organization',
    viewMonthlyOverview: 'View month-over-month performance summaries and KPIs',
    viewMonthlyOverview: 'View month-over-month performance summaries and KPIs',
    viewSalesTrend: 'Access detailed revenue charts and growth trends',
    viewCategorySales: 'View breakdown of products sold by specific categories',
    viewTopProducts: 'Analyze the highest performing products by volume and value',
    viewTopParties: 'Identify and view the top 5 customers/parties of the month',
  },

  // ============================================
  // NOTES MODULE
  // ============================================
  notes: {
    viewAllNotes: 'Master Key: View ALL organization notes',
    viewList: 'Access note list page',
    viewOwn: 'View own created notes only',
    viewOwn: 'View own created notes only',
    viewDetails: 'Access the full content, attachments, and metadata of a specific note',
    create: 'Create and save new notes or documentation (includes image upload)',
    update: 'Edit the content, title, or tags of an existing note (includes image update)',
    delete: 'Permanently remove a specific note from the system',
    bulkDelete: 'Mass delete multiple notes simultaneously',
    exportPdf: 'Export the notes list as a PDF document',
    exportExcel: 'Export notes data to an Excel spreadsheet',
  },

  // ============================================
  // MISCELLANEOUS WORK MODULE
  // ============================================
  miscellaneousWork: {
    viewAllMiscellaneous: 'Master Key: View ALL organization miscellaneous work',
    viewList: 'Access miscellaneous work list page',
    viewOwn: 'View own miscellaneous work entries',
    viewOwn: 'View own miscellaneous work entries',
    viewDetails: 'View specific miscellaneous work entry details and images',
    create: 'Create new miscellaneous work entry (includes image upload)',
    update: 'Edit existing miscellaneous work entry (includes image update)',
    delete: 'Permanently remove a specific miscellaneous work entry',
    bulkDelete: 'Mass delete multiple miscellaneous work records simultaneously',
    exportPdf: 'Export the miscellaneous work list as a PDF document',
    exportExcel: 'Export miscellaneous work data to an Excel spreadsheet',
  },

  // ============================================
  // EMPLOYEES MODULE
  // ============================================
  employees: {
    viewList: 'Access employee list page',
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
    viewList: 'Access system user list page',
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
