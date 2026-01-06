# Granular Feature-Based Permission System

**SalesSphere Backend - Feature-Level Access Control for Custom Roles**

---

## Table of Contents

1. [Concept Overview](#concept-overview)
2. [Permission Model Comparison](#permission-model-comparison)
3. [Feature Registry Design](#feature-registry-design)
4. [Complete Module Definitions](#complete-module-definitions)
5. [Role Permission Structure](#role-permission-structure)
6. [Implementation Examples](#implementation-examples)
7. [Migration Strategy](#migration-strategy)

---

## 1. Concept Overview

### Current vs Proposed Model

| Aspect | Current (CRUD-Based) | Proposed (Feature-Based) |
|--------|---------------------|-------------------------|
| Permissions | `view`, `add`, `update`, `delete`, `approve` | Specific features like `exportPdf`, `bulkImport`, `convertToCustomer` |
| Granularity | Module-level | Feature-level within modules |
| Flexibility | Fixed 5 actions | Unlimited custom features per module |
| Example | `products: { add: true }` | `products: { addNew: true, exportPdf: false, bulkImport: true }` |
| Role Config | Boolean per action | Boolean per feature |

### Key Principles

1. **Feature-First**: Each module defines its specific features/operations
2. **Granular Control**: Toggle individual features per role
3. **Backward Compatible**: Map old CRUD to new features where needed
4. **Subscription Gating**: Plans still control module availability
5. **Self-Documenting**: Feature names describe what they control

### Permission Flow (Updated)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GRANULAR PERMISSION CHECK FLOW                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Request: POST /api/v1/products/bulk-import                             │
│                                                                          │
│  1. Route Definition                                                    │
│     └─> router.post('/bulk-import',                                     │
│          requireFeature('products', 'bulkImport'),                      │
│          bulkImportProducts)                                            │
│                                                                          │
│  2. Authentication (protect middleware)                                 │
│     └─> Validates JWT, sets req.user                                    │
│                                                                          │
│  3. Subscription Check                                                  │
│     └─> Does organization's plan include 'products' module?             │
│         └─> NO: Return 403 "Upgrade required"                           │
│         └─> YES: Continue                                               │
│                                                                          │
│  4. Role Permission Check                                               │
│     └─> Does user's role have 'bulkImport' feature in 'products'?       │
│         ├─> System Role (superadmin/developer): PASS                    │
│         ├─> Admin: PASS (if plan allows)                                │
│         ├─> Custom Role: Check customRoleId.permissions.products        │
│         │   └─> .bulkImport === true ? PASS : FAIL                      │
│         └─> Base User: Check USER_DEFAULT_FEATURES                     │
│                                                                          │
│  5. Final Decision                                                      │
│     └─> PASS: next() ────> Controller executes                          │
│     └─> FAIL: 403 "You don't have permission to bulk import products"   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Permission Model Comparison

### Example: Products Module

**Current CRUD-Based:**
```javascript
products: {
    view: true,      // Can see products
    add: true,       // Can add products
    update: true,    // Can edit products
    delete: false,   // Cannot delete
    approve: false   // N/A for products
}
```

**New Feature-Based:**
```javascript
products: {
    // List & View
    viewList: true,           // View product list
    viewDetails: true,        // View product details
    searchProducts: true,     // Search/filter products

    // Create & Edit
    addNew: true,             // Add new product
    editBasic: true,          // Edit basic info (name, description)
    editPricing: false,       // Edit prices (restricted)
    editInventory: true,      // Edit stock/quantity

    // Bulk Operations
    bulkImport: false,        // Bulk import products
    bulkExport: false,        // Export product list

    // Special Features
    exportPdf: false,         // Export to PDF
    manageCategories: false,  // Manage product categories
    deleteProduct: false,     // Delete products
    archiveProduct: true,     // Archive instead of delete
    restoreProduct: true,     // Restore archived
}
```

### Example: Prospects Module

**Current CRUD-Based:**
```javascript
prospects: {
    view: true,
    add: true,
    update: true,
    delete: false
}
```

**New Feature-Based:**
```javascript
prospects: {
    // Viewing
    viewList: true,
    viewDetails: true,
    viewPipeline: true,          // Kanban pipeline view
    viewMyProspectsOnly: false,  // Restrict to own prospects

    // Creating
    addNew: true,
    importFromCsv: false,

    // Editing
    editDetails: true,
    assignSalesperson: false,    // Re-assign prospects
    changeStage: true,           // Move pipeline stage
    addNotes: true,
    addFollowUp: true,

    // Conversion
    convertToCustomer: false,    // Convert prospect to customer/party
    convertWithHistory: false,   // Include history in conversion

    // Deleting
    delete: false,
    archive: true
}
```

---

## 3. Feature Registry Design

### Registry Structure

```javascript
// src/utils/granularFeatureRegistry.js

/**
 * Granular Feature Registry
 *
 * Each module defines its specific features/operations.
 * Features are grouped by functionality for better organization.
 *
 * Structure:
 * {
 *   moduleId: {
 *     id: 'moduleId',
 *     name: 'Display Name',
 *     description: 'Module description',
 *     category: 'business',
 *     tiers: ['basic', 'standard', 'premium'],
 *     features: {
 *       featureGroup: {
 *         featureId: { label, description, requiresApproval }
 *       }
 *     }
 *   }
 * }
 */

const GRANULAR_FEATURE_REGISTRY = {
    // ============================================================
    // PRODUCTS MODULE
    // ============================================================
    products: {
        id: 'products',
        name: 'Products',
        description: 'Product inventory and catalog management',
        icon: 'package',
        category: 'business',
        tiers: ['basic', 'standard', 'premium', 'custom'],
        defaultEnabled: ['viewList', 'viewDetails'],
        features: {
            // Viewing Features
            viewing: {
                viewList: {
                    label: 'View Product List',
                    description: 'View the product catalog/list',
                    defaultFor: ['admin', 'user']
                },
                viewDetails: {
                    label: 'View Product Details',
                    description: 'View detailed product information',
                    defaultFor: ['admin', 'user']
                },
                searchProducts: {
                    label: 'Search Products',
                    description: 'Search and filter products',
                    defaultFor: ['admin', 'user']
                },
                viewCostPrice: {
                    label: 'View Cost Price',
                    description: 'Can see the cost price (not just selling price)',
                    defaultFor: ['admin']
                },
                viewProfitMargin: {
                    label: 'View Profit Margin',
                    description: 'Can see profit margins on products',
                    defaultFor: ['admin']
                }
            },

            // Creation Features
            creation: {
                addNew: {
                    label: 'Add New Product',
                    description: 'Create new products',
                    defaultFor: ['admin']
                },
                bulkImport: {
                    label: 'Bulk Import Products',
                    description: 'Import products from CSV/Excel',
                    defaultFor: ['admin']
                },
                duplicateProduct: {
                    label: 'Duplicate Product',
                    description: 'Create copy of existing product',
                    defaultFor: ['admin', 'user']
                }
            },

            // Editing Features
            editing: {
                editBasic: {
                    label: 'Edit Basic Info',
                    description: 'Edit name, description, SKU',
                    defaultFor: ['admin', 'user']
                },
                editPricing: {
                    label: 'Edit Pricing',
                    description: 'Change selling prices',
                    defaultFor: ['admin']
                },
                editCostPrice: {
                    label: 'Edit Cost Price',
                    description: 'Modify cost prices',
                    defaultFor: ['admin']
                },
                editInventory: {
                    label: 'Edit Inventory',
                    description: 'Update stock quantities',
                    defaultFor: ['admin', 'user']
                },
                bulkUpdate: {
                    label: 'Bulk Update',
                    description: 'Update multiple products at once',
                    defaultFor: ['admin']
                }
            },

            // Category Management
            categories: {
                manageCategories: {
                    label: 'Manage Categories',
                    description: 'Create, edit, delete product categories',
                    defaultFor: ['admin']
                },
                assignCategory: {
                    label: 'Assign Category',
                    description: 'Assign products to categories',
                    defaultFor: ['admin', 'user']
                }
            },

            // Export Features
            export: {
                exportPdf: {
                    label: 'Export to PDF',
                    description: 'Export product list as PDF',
                    defaultFor: ['admin']
                },
                exportExcel: {
                    label: 'Export to Excel',
                    description: 'Export product list as Excel',
                    defaultFor: ['admin']
                },
                exportCsv: {
                    label: 'Export to CSV',
                    description: 'Export product list as CSV',
                    defaultFor: ['admin', 'user']
                }
            },

            // Deletion & Archive
            deletion: {
                deleteProduct: {
                    label: 'Delete Products',
                    description: 'Permanently delete products',
                    defaultFor: ['admin']
                },
                archiveProduct: {
                    label: 'Archive Products',
                    description: 'Archive instead of deleting',
                    defaultFor: ['admin', 'user']
                },
                restoreProduct: {
                    label: 'Restore Archived',
                    description: 'Restore archived products',
                    defaultFor: ['admin', 'user']
                }
            }
        }
    },

    // ============================================================
    // PROSPECTS MODULE (Leads)
    // ============================================================
    prospects: {
        id: 'prospects',
        name: 'Prospects',
        description: 'Lead and prospect management with pipeline',
        icon: 'user-plus',
        category: 'business',
        tiers: ['standard', 'premium', 'custom'],
        defaultEnabled: ['viewList', 'viewDetails'],
        features: {
            // Viewing
            viewing: {
                viewList: {
                    label: 'View Prospect List',
                    description: 'View all prospects',
                    defaultFor: ['admin', 'user']
                },
                viewDetails: {
                    label: 'View Prospect Details',
                    description: 'View detailed prospect information',
                    defaultFor: ['admin', 'user']
                },
                viewPipeline: {
                    label: 'View Pipeline',
                    description: 'Access kanban pipeline view',
                    defaultFor: ['admin', 'user']
                },
                viewMyProspectsOnly: {
                    label: 'View Own Prospects Only',
                    description: 'Restrict view to only assigned prospects',
                    defaultFor: ['user']
                },
                viewContactHistory: {
                    label: 'View Contact History',
                    description: 'See all interactions with prospect',
                    defaultFor: ['admin', 'user']
                }
            },

            // Creating
            creation: {
                addNew: {
                    label: 'Add New Prospect',
                    description: 'Create new prospect/lead',
                    defaultFor: ['admin', 'user']
                },
                importFromCsv: {
                    label: 'Import Prospects',
                    description: 'Bulk import prospects from CSV',
                    defaultFor: ['admin']
                },
                addFromWebsite: {
                    label: 'Add from Website',
                    description: 'Add prospects from website inquiries',
                    defaultFor: ['admin', 'user']
                }
            },

            // Editing
            editing: {
                editDetails: {
                    label: 'Edit Details',
                    description: 'Edit prospect information',
                    defaultFor: ['admin', 'user']
                },
                editOwnOnly: {
                    label: 'Edit Own Prospects Only',
                    description: 'Can only edit own prospects',
                    defaultFor: ['user']
                },
                assignSalesperson: {
                    label: 'Assign Salesperson',
                    description: 'Re-assign prospects to different users',
                    defaultFor: ['admin']
                },
                changeStage: {
                    label: 'Change Pipeline Stage',
                    description: 'Move prospect to different stage',
                    defaultFor: ['admin', 'user']
                },
                bulkUpdateStage: {
                    label: 'Bulk Stage Update',
                    description: 'Update stage for multiple prospects',
                    defaultFor: ['admin']
                }
            },

            // Interactions
            interactions: {
                addNotes: {
                    label: 'Add Notes',
                    description: 'Add notes to prospect',
                    defaultFor: ['admin', 'user']
                },
                addFollowUp: {
                    label: 'Add Follow-up',
                    description: 'Schedule follow-up reminders',
                    defaultFor: ['admin', 'user']
                },
                logCall: {
                    label: 'Log Call',
                    description: 'Log phone call with prospect',
                    defaultFor: ['admin', 'user']
                },
                logMeeting: {
                    label: 'Log Meeting',
                    description: 'Log meeting with prospect',
                    defaultFor: ['admin', 'user']
                },
                sendEmail: {
                    label: 'Send Email',
                    description: 'Send email to prospect through system',
                    defaultFor: ['admin', 'user']
                }
            },

            // Conversion
            conversion: {
                convertToCustomer: {
                    label: 'Convert to Customer',
                    description: 'Convert prospect to customer/party',
                    defaultFor: ['admin']
                },
                convertWithHistory: {
                    label: 'Include History in Conversion',
                    description: 'Copy interaction history to customer',
                    defaultFor: ['admin']
                },
                viewConversionReport: {
                    label: 'View Conversion Report',
                    description: 'Access prospect conversion analytics',
                    defaultFor: ['admin']
                }
            },

            // Export
            export: {
                exportPdf: {
                    label: 'Export to PDF',
                    description: 'Export prospect list as PDF',
                    defaultFor: ['admin']
                },
                exportExcel: {
                    label: 'Export to Excel',
                    description: 'Export prospect list as Excel',
                    defaultFor: ['admin', 'user']
                }
            },

            // Deletion
            deletion: {
                delete: {
                    label: 'Delete Prospects',
                    description: 'Permanently delete prospects',
                    defaultFor: ['admin']
                },
                archive: {
                    label: 'Archive Prospects',
                    description: 'Archive lost/dead prospects',
                    defaultFor: ['admin', 'user']
                }
            }
        }
    },

    // ============================================================
    // PARTIES (CUSTOMERS) MODULE
    // ============================================================
    parties: {
        id: 'parties',
        name: 'Parties (Customers)',
        description: 'Customer and party management',
        icon: 'users',
        category: 'business',
        tiers: ['basic', 'standard', 'premium', 'custom'],
        defaultEnabled: ['viewList', 'viewDetails'],
        features: {
            viewing: {
                viewList: {
                    label: 'View Customer List',
                    description: 'View all customers/parties',
                    defaultFor: ['admin', 'user']
                },
                viewDetails: {
                    label: 'View Customer Details',
                    description: 'View detailed customer information',
                    defaultFor: ['admin', 'user']
                },
                viewCreditLimit: {
                    label: 'View Credit Limit',
                    description: 'Can see customer credit limits',
                    defaultFor: ['admin']
                },
                viewOutstanding: {
                    label: 'View Outstanding Balance',
                    description: 'Can see outstanding payments',
                    defaultFor: ['admin']
                },
                viewPurchaseHistory: {
                    label: 'View Purchase History',
                    description: 'View customer order history',
                    defaultFor: ['admin', 'user']
                }
            },

            creation: {
                addNew: {
                    label: 'Add New Customer',
                    description: 'Create new customer/party',
                    defaultFor: ['admin', 'user']
                },
                importFromCsv: {
                    label: 'Import Customers',
                    description: 'Bulk import customers',
                    defaultFor: ['admin']
                }
            },

            editing: {
                editDetails: {
                    label: 'Edit Details',
                    description: 'Edit customer information',
                    defaultFor: ['admin', 'user']
                },
                setCreditLimit: {
                    label: 'Set Credit Limit',
                    description: 'Modify customer credit limits',
                    defaultFor: ['admin']
                },
                setPricingTier: {
                    label: 'Set Pricing Tier',
                    description: 'Assign pricing tier to customer',
                    defaultFor: ['admin']
                },
                assignSalesperson: {
                    label: 'Assign Salesperson',
                    description: 'Assign salesperson to customer',
                    defaultFor: ['admin']
                }
            },

            transactions: {
                viewOrders: {
                    label: 'View Orders',
                    description: 'View customer orders',
                    defaultFor: ['admin', 'user']
                },
                viewInvoices: {
                    label: 'View Invoices',
                    description: 'View customer invoices',
                    defaultFor: ['admin', 'user']
                },
                viewPayments: {
                    label: 'View Payments',
                    description: 'View payment history',
                    defaultFor: ['admin', 'user']
                },
                recordPayment: {
                    label: 'Record Payment',
                    description: 'Record customer payments',
                    defaultFor: ['admin', 'user']
                }
            },

            export: {
                exportPdf: {
                    label: 'Export to PDF',
                    description: 'Export customer list as PDF',
                    defaultFor: ['admin']
                },
                exportExcel: {
                    label: 'Export to Excel',
                    description: 'Export customer list as Excel',
                    defaultFor: ['admin', 'user']
                },
                exportStatement: {
                    label: 'Export Account Statement',
                    description: 'Export customer statement',
                    defaultFor: ['admin']
                }
            },

            deletion: {
                delete: {
                    label: 'Delete Customer',
                    description: 'Permanently delete customer',
                    defaultFor: ['admin']
                },
                deactivate: {
                    label: 'Deactivate Customer',
                    description: 'Deactivate instead of deleting',
                    defaultFor: ['admin', 'user']
                }
            }
        }
    },

    // ============================================================
    // ORDERS MODULE
    // ============================================================
    orders: {
        id: 'orders',
        name: 'Orders',
        description: 'Sales order management',
        icon: 'shopping-cart',
        category: 'business',
        tiers: ['basic', 'standard', 'premium', 'custom'],
        defaultEnabled: ['viewList', 'viewDetails'],
        features: {
            viewing: {
                viewList: {
                    label: 'View Order List',
                    description: 'View all orders',
                    defaultFor: ['admin', 'user']
                },
                viewDetails: {
                    label: 'View Order Details',
                    description: 'View detailed order information',
                    defaultFor: ['admin', 'user']
                },
                viewMyOrdersOnly: {
                    label: 'View Own Orders Only',
                    description: 'Restrict to own orders',
                    defaultFor: ['user']
                },
                viewAllBranchOrders: {
                    label: 'View All Branch Orders',
                    description: 'See orders from all branches',
                    defaultFor: ['admin']
                },
                viewProfit: {
                    label: 'View Order Profit',
                    description: 'Can see profit per order',
                    defaultFor: ['admin']
                }
            },

            creation: {
                createNew: {
                    label: 'Create Order',
                    description: 'Create new sales order',
                    defaultFor: ['admin', 'user']
                },
                createForBranch: {
                    label: 'Create for Branch',
                    description: 'Create orders for other branches',
                    defaultFor: ['admin']
                },
                addProducts: {
                    label: 'Add Products',
                    description: 'Add products to order',
                    defaultFor: ['admin', 'user']
                },
                applyDiscount: {
                    label: 'Apply Discount',
                    description: 'Apply discounts to order',
                    defaultFor: ['admin']
                },
                applyCustomDiscount: {
                    label: 'Apply Custom Discount',
                    description: 'Apply discounts above allowed limit',
                    defaultFor: ['admin']
                }
            },

            editing: {
                editOrder: {
                    label: 'Edit Order',
                    description: 'Modify order details',
                    defaultFor: ['admin', 'user']
                },
                editOwnOrdersOnly: {
                    label: 'Edit Own Orders Only',
                    description: 'Can only edit own orders',
                    defaultFor: ['user']
                },
                editConfirmedOrder: {
                    label: 'Edit Confirmed Order',
                    description: 'Edit already confirmed orders',
                    defaultFor: ['admin']
                },
                editPrices: {
                    label: 'Edit Prices',
                    description: 'Modify prices in order',
                    defaultFor: ['admin']
                },
                editQuantities: {
                    label: 'Edit Quantities',
                    description: 'Modify quantities',
                    defaultFor: ['admin', 'user']
                }
            },

            workflow: {
                confirmOrder: {
                    label: 'Confirm Order',
                    description: 'Confirm pending orders',
                    defaultFor: ['admin', 'user']
                },
                cancelOrder: {
                    label: 'Cancel Order',
                    description: 'Cancel orders',
                    defaultFor: ['admin']
                },
                holdOrder: {
                    label: 'Hold Order',
                    description: 'Put order on hold',
                    defaultFor: ['admin', 'user']
                },
                unholdOrder: {
                    label: 'Unhold Order',
                    description: 'Release held orders',
                    defaultFor: ['admin', 'user']
                }
            },

            approval: {
                requireApproval: {
                    label: 'Requires Approval',
                    description: 'Orders require approval before confirmation',
                    defaultFor: []
                },
                approveOrder: {
                    label: 'Approve Order',
                    description: 'Approve pending orders',
                    defaultFor: ['admin']
                },
                rejectOrder: {
                    label: 'Reject Order',
                    description: 'Reject pending orders',
                    defaultFor: ['admin']
                }
            },

            shipping: {
                createShipment: {
                    label: 'Create Shipment',
                    description: 'Create shipment for order',
                    defaultFor: ['admin', 'user']
                },
                updateTracking: {
                    label: 'Update Tracking',
                    description: 'Update shipment tracking',
                    defaultFor: ['admin', 'user']
                },
                markDelivered: {
                    label: 'Mark Delivered',
                    description: 'Mark order as delivered',
                    defaultFor: ['admin', 'user']
                }
            },

            export: {
                exportPdf: {
                    label: 'Export Order to PDF',
                    description: 'Generate PDF invoice/receipt',
                    defaultFor: ['admin', 'user']
                },
                exportExcel: {
                    label: 'Export Orders to Excel',
                    description: 'Export order list',
                    defaultFor: ['admin']
                },
                emailInvoice: {
                    label: 'Email Invoice',
                    description: 'Send invoice via email',
                    defaultFor: ['admin', 'user']
                }
            },

            deletion: {
                delete: {
                    label: 'Delete Order',
                    description: 'Permanently delete order',
                    defaultFor: ['admin']
                },
                deleteOwnOnly: {
                    label: 'Delete Own Orders Only',
                    description: 'Can delete only own orders',
                    defaultFor: ['user']
                }
            }
        }
    },

    // ============================================================
    // EMPLOYEES MODULE
    // ============================================================
    employees: {
        id: 'employees',
        name: 'Employees',
        description: 'Employee and staff management',
        icon: 'users',
        category: 'business',
        tiers: ['premium', 'custom'],
        defaultEnabled: ['viewList'],
        features: {
            viewing: {
                viewList: {
                    label: 'View Employee List',
                    description: 'View all employees',
                    defaultFor: ['admin']
                },
                viewDetails: {
                    label: 'View Employee Details',
                    description: 'View detailed employee information',
                    defaultFor: ['admin']
                },
                viewOwnProfile: {
                    label: 'View Own Profile',
                    description: 'Can view own profile',
                    defaultFor: ['admin', 'user']
                },
                viewSalary: {
                    label: 'View Salary',
                    description: 'Can see salary information',
                    defaultFor: ['admin']
                },
                viewReports: {
                    label: 'View Direct Reports',
                    description: 'View subordinates in hierarchy',
                    defaultFor: ['admin']
                }
            },

            creation: {
                addNew: {
                    label: 'Add Employee',
                    description: 'Create new employee record',
                    defaultFor: ['admin']
                },
                sendInvitation: {
                    label: 'Send Invitation',
                    description: 'Send login invitation to employee',
                    defaultFor: ['admin']
                }
            },

            editing: {
                editDetails: {
                    label: 'Edit Details',
                    description: 'Edit employee information',
                    defaultFor: ['admin']
                },
                editOwnProfile: {
                    label: 'Edit Own Profile',
                    description: 'Can edit own profile',
                    defaultFor: ['admin', 'user']
                },
                setSalary: {
                    label: 'Set Salary',
                    description: 'Modify salary information',
                    defaultFor: ['admin']
                },
                assignRole: {
                    label: 'Assign Role',
                    description: 'Assign role to employee',
                    defaultFor: ['admin']
                },
                assignCustomRole: {
                    label: 'Assign Custom Role',
                    description: 'Assign custom role to employee',
                    defaultFor: ['admin']
                },
                assignManager: {
                    label: 'Assign Manager',
                    description: 'Set reporting manager',
                    defaultFor: ['admin']
                },
                assignBranch: {
                    label: 'Assign Branch',
                    description: 'Assign employee to branch',
                    defaultFor: ['admin']
                }
            },

            access: {
                grantWebAccess: {
                    label: 'Grant Web Access',
                    description: 'Enable web portal access',
                    defaultFor: ['admin']
                },
                grantMobileAccess: {
                    label: 'Grant Mobile Access',
                    description: 'Enable mobile app access',
                    defaultFor: ['admin']
                },
                revokeAccess: {
                    label: 'Revoke Access',
                    description: 'Disable system access',
                    defaultFor: ['admin']
                }
            },

            attendance: {
                viewAttendance: {
                    label: 'View Attendance',
                    description: 'View attendance records',
                    defaultFor: ['admin']
                },
                markAttendance: {
                    label: 'Mark Attendance',
                    description: 'Mark employee attendance',
                    defaultFor: ['admin']
                },
                viewOwnAttendance: {
                    label: 'View Own Attendance',
                    description: 'View own attendance',
                    defaultFor: ['user']
                }
            },

            documents: {
                uploadDocuments: {
                    label: 'Upload Documents',
                    description: 'Upload employee documents',
                    defaultFor: ['admin']
                },
                viewDocuments: {
                    label: 'View Documents',
                    description: 'View employee documents',
                    defaultFor: ['admin']
                },
                deleteDocuments: {
                    label: 'Delete Documents',
                    description: 'Delete employee documents',
                    defaultFor: ['admin']
                }
            },

            deletion: {
                deactivate: {
                    label: 'Deactivate Employee',
                    description: 'Deactivate employee account',
                    defaultFor: ['admin']
                },
                delete: {
                    label: 'Delete Employee',
                    description: 'Permanently delete employee',
                    defaultFor: ['admin']
                }
            }
        }
    },

    // ============================================================
    // ATTENDANCE MODULE
    // ============================================================
    attendance: {
        id: 'attendance',
        name: 'Attendance',
        description: 'Employee attendance management',
        icon: 'clock',
        category: 'business',
        tiers: ['basic', 'standard', 'premium', 'custom'],
        defaultEnabled: ['viewOwn'],
        features: {
            viewing: {
                viewList: {
                    label: 'View All Attendance',
                    description: 'View attendance of all employees',
                    defaultFor: ['admin']
                },
                viewOwn: {
                    label: 'View Own Attendance',
                    description: 'View own attendance records',
                    defaultFor: ['admin', 'user']
                },
                viewTeam: {
                    label: 'View Team Attendance',
                    description: 'View subordinates attendance',
                    defaultFor: ['admin']
                },
                viewLateArrivals: {
                    label: 'View Late Arrivals',
                    description: 'View late arrival reports',
                    defaultFor: ['admin']
                }
            },

            marking: {
                checkIn: {
                    label: 'Check In',
                    description: 'Mark attendance check-in',
                    defaultFor: ['admin', 'user']
                },
                checkOut: {
                    label: 'Check Out',
                    description: 'Mark attendance check-out',
                    defaultFor: ['admin', 'user']
                },
                markOnBehalf: {
                    label: 'Mark for Others',
                    description: 'Mark attendance for other employees',
                    defaultFor: ['admin']
                }
            },

            editing: {
                editOwnAttendance: {
                    label: 'Edit Own Attendance',
                    description: 'Edit own attendance records',
                    defaultFor: ['admin']
                },
                editAnyAttendance: {
                    label: 'Edit Any Attendance',
                    description: 'Edit any employee attendance',
                    defaultFor: ['admin']
                },
                addMissingCheck: {
                    label: 'Add Missing Check',
                    description: 'Add missing check-in/out',
                    defaultFor: ['admin']
                }
            },

            reports: {
                viewReport: {
                    label: 'View Attendance Report',
                    description: 'View attendance reports',
                    defaultFor: ['admin']
                },
                viewOwnReport: {
                    label: 'View Own Report',
                    description: 'View own attendance summary',
                    defaultFor: ['admin', 'user']
                },
                exportReport: {
                    label: 'Export Report',
                    description: 'Export attendance reports',
                    defaultFor: ['admin']
                }
            },

            settings: {
                manageWorkingHours: {
                    label: 'Manage Working Hours',
                    description: 'Set working hours and shifts',
                    defaultFor: ['admin']
                },
                manageHolidays: {
                    label: 'Manage Holidays',
                    description: 'Manage company holidays',
                    defaultFor: ['admin']
                }
            }
        }
    },

    // ============================================================
    // LEAVES MODULE
    // ============================================================
    leaves: {
        id: 'leaves',
        name: 'Leaves',
        description: 'Leave request management',
        icon: 'calendar',
        category: 'business',
        tiers: ['basic', 'standard', 'premium', 'custom'],
        defaultEnabled: ['viewOwn', 'submitRequest'],
        features: {
            viewing: {
                viewList: {
                    label: 'View All Leaves',
                    description: 'View leave requests of all employees',
                    defaultFor: ['admin']
                },
                viewOwn: {
                    label: 'View Own Leaves',
                    description: 'View own leave requests',
                    defaultFor: ['admin', 'user']
                },
                viewTeam: {
                    label: 'View Team Leaves',
                    description: 'View subordinates leave requests',
                    defaultFor: ['admin']
                },
                viewLeaveBalance: {
                    label: 'View Leave Balance',
                    description: 'View leave balance',
                    defaultFor: ['admin', 'user']
                },
                viewTeamBalance: {
                    label: 'View Team Balance',
                    description: 'View team leave balance',
                    defaultFor: ['admin']
                }
            },

            requesting: {
                submitRequest: {
                    label: 'Submit Leave Request',
                    description: 'Submit new leave request',
                    defaultFor: ['admin', 'user']
                },
                submitOnBehalf: {
                    label: 'Submit on Behalf',
                    description: 'Submit leave for other employees',
                    defaultFor: ['admin']
                },
                cancelOwn: {
                    label: 'Cancel Own Request',
                    description: 'Cancel own pending request',
                    defaultFor: ['admin', 'user']
                },
                cancelAny: {
                    label: 'Cancel Any Request',
                    description: 'Cancel any leave request',
                    defaultFor: ['admin']
                }
            },

            approval: {
                approvePending: {
                    label: 'Approve Leaves',
                    description: 'Approve leave requests',
                    defaultFor: ['admin']
                },
                rejectRequest: {
                    label: 'Reject Leaves',
                    description: 'Reject leave requests',
                    defaultFor: ['admin']
                },
                approveTeamOnly: {
                    label: 'Approve Team Only',
                    description: 'Can only approve subordinates',
                    defaultFor: []
                },
                overrideApproval: {
                    label: 'Override Approval',
                    description: 'Approve/reject any leave',
                    defaultFor: ['admin']
                }
            },

            editing: {
                editOwnPending: {
                    label: 'Edit Own Pending',
                    description: 'Edit own pending request',
                    defaultFor: ['admin', 'user']
                },
                editAny: {
                    label: 'Edit Any Request',
                    description: 'Edit any leave request',
                    defaultFor: ['admin']
                }
            },

            management: {
                adjustBalance: {
                    label: 'Adjust Leave Balance',
                    description: 'Manually adjust leave balance',
                    defaultFor: ['admin']
                },
                setAllowance: {
                    label: 'Set Leave Allowance',
                    description: 'Set annual leave allowance',
                    defaultFor: ['admin']
                },
                carryForward: {
                    label: 'Carry Forward Leave',
                    description: 'Manage leave carry forward',
                    defaultFor: ['admin']
                }
            },

            reports: {
                viewReport: {
                    label: 'View Leave Report',
                    description: 'View leave reports',
                    defaultFor: ['admin']
                },
                exportReport: {
                    label: 'Export Report',
                    description: 'Export leave reports',
                    defaultFor: ['admin']
                }
            }
        }
    },

    // ============================================================
    // EXPENSES MODULE
    // ============================================================
    expenses: {
        id: 'expenses',
        name: 'Expenses',
        description: 'Expense claim management',
        icon: 'receipt',
        category: 'business',
        tiers: ['standard', 'premium', 'custom'],
        defaultEnabled: ['viewOwn', 'submitClaim'],
        features: {
            viewing: {
                viewList: {
                    label: 'View All Expenses',
                    description: 'View all expense claims',
                    defaultFor: ['admin']
                },
                viewOwn: {
                    label: 'View Own Expenses',
                    description: 'View own expense claims',
                    defaultFor: ['admin', 'user']
                },
                viewTeam: {
                    label: 'View Team Expenses',
                    description: 'View subordinates expenses',
                    defaultFor: ['admin']
                }
            },

            claiming: {
                submitClaim: {
                    label: 'Submit Expense Claim',
                    description: 'Submit new expense claim',
                    defaultFor: ['admin', 'user']
                },
                uploadReceipt: {
                    label: 'Upload Receipt',
                    description: 'Upload receipt image',
                    defaultFor: ['admin', 'user']
                },
                addMultipleItems: {
                    label: 'Add Multiple Items',
                    description: 'Add multiple expense items',
                    defaultFor: ['admin', 'user']
                },
                cancelOwn: {
                    label: 'Cancel Own Claim',
                    description: 'Cancel own pending claim',
                    defaultFor: ['admin', 'user']
                }
            },

            approval: {
                approvePending: {
                    label: 'Approve Expenses',
                    description: 'Approve expense claims',
                    defaultFor: ['admin']
                },
                rejectClaim: {
                    label: 'Reject Expenses',
                    description: 'Reject expense claims',
                    defaultFor: ['admin']
                },
                approveTeamOnly: {
                    label: 'Approve Team Only',
                    description: 'Can only approve subordinates',
                    defaultFor: []
                }
            },

            processing: {
                markPaid: {
                    label: 'Mark as Paid',
                    description: 'Mark approved claims as paid',
                    defaultFor: ['admin']
                },
                processPayment: {
                    label: 'Process Payment',
                    description: 'Process expense payment',
                    defaultFor: ['admin']
                }
            },

            reports: {
                viewReport: {
                    label: 'View Expense Report',
                    description: 'View expense reports',
                    defaultFor: ['admin']
                },
                viewCategoryReport: {
                    label: 'View Category Report',
                    description: 'View expense by category',
                    defaultFor: ['admin']
                },
                exportReport: {
                    label: 'Export Report',
                    description: 'Export expense reports',
                    defaultFor: ['admin']
                }
            }
        }
    },

    // ============================================================
    // BEAT PLAN MODULE
    // ============================================================
    beatPlan: {
        id: 'beatPlan',
        name: 'Beat Plans',
        description: 'Route and beat planning for sales visits',
        icon: 'map',
        category: 'business',
        tiers: ['standard', 'premium', 'custom'],
        defaultEnabled: ['viewOwn'],
        features: {
            viewing: {
                viewList: {
                    label: 'View All Beat Plans',
                    description: 'View all beat plans',
                    defaultFor: ['admin']
                },
                viewOwn: {
                    label: 'View Own Beat Plans',
                    description: 'View own beat plans',
                    defaultFor: ['admin', 'user']
                },
                viewTeam: {
                    label: 'View Team Beat Plans',
                    description: 'View subordinates beat plans',
                    defaultFor: ['admin']
                },
                viewMap: {
                    label: 'View on Map',
                    description: 'View beat plans on map',
                    defaultFor: ['admin', 'user']
                }
            },

            creation: {
                createNew: {
                    label: 'Create Beat Plan',
                    description: 'Create new beat plan',
                    defaultFor: ['admin', 'user']
                },
                addStores: {
                    label: 'Add Stores',
                    description: 'Add stores to beat',
                    defaultFor: ['admin', 'user']
                },
                setFrequency: {
                    label: 'Set Visit Frequency',
                    description: 'Set visit frequency for stores',
                    defaultFor: ['admin', 'user']
                },
                optimizeRoute: {
                    label: 'Optimize Route',
                    description: 'Auto-optimize route',
                    defaultFor: ['admin', 'user']
                }
            },

            editing: {
                editOwn: {
                    label: 'Edit Own Plans',
                    description: 'Edit own beat plans',
                    defaultFor: ['admin', 'user']
                },
                editAny: {
                    label: 'Edit Any Plan',
                    description: 'Edit any beat plan',
                    defaultFor: ['admin']
                },
                reassignStore: {
                    label: 'Reassign Stores',
                    description: 'Move stores between beats',
                    defaultFor: ['admin']
                }
            },

            approval: {
                approve: {
                    label: 'Approve Beat Plan',
                    description: 'Approve beat plans',
                    defaultFor: ['admin']
                },
                reject: {
                    label: 'Reject Beat Plan',
                    description: 'Reject beat plans',
                    defaultFor: ['admin']
                }
            },

            execution: {
                startVisit: {
                    label: 'Start Visit',
                    description: 'Start store visit',
                    defaultFor: ['admin', 'user']
                },
                completeVisit: {
                    label: 'Complete Visit',
                    description: 'Complete store visit',
                    defaultFor: ['admin', 'user']
                },
                logActivity: {
                    label: 'Log Activity',
                    description: 'Log visit activity',
                    defaultFor: ['admin', 'user']
                },
                takePhoto: {
                    label: 'Take Photo',
                    description: 'Capture photos during visit',
                    defaultFor: ['admin', 'user']
                }
            }
        }
    },

    // ============================================================
    // TOUR PLAN MODULE
    // ============================================================
    tourPlan: {
        id: 'tourPlan',
        name: 'Tour Plans',
        description: 'Multi-day tour planning',
        icon: 'route',
        category: 'business',
        tiers: ['standard', 'premium', 'custom'],
        defaultEnabled: ['viewOwn'],
        features: {
            viewing: {
                viewList: {
                    label: 'View All Tours',
                    description: 'View all tour plans',
                    defaultFor: ['admin']
                },
                viewOwn: {
                    label: 'View Own Tours',
                    description: 'View own tour plans',
                    defaultFor: ['admin', 'user']
                },
                viewTeam: {
                    label: 'View Team Tours',
                    description: 'View subordinates tour plans',
                    defaultFor: ['admin']
                }
            },

            creation: {
                createNew: {
                    label: 'Create Tour Plan',
                    description: 'Create new tour plan',
                    defaultFor: ['admin', 'user']
                },
                addDays: {
                    label: 'Add Tour Days',
                    description: 'Add days to tour',
                    defaultFor: ['admin', 'user']
                },
                addStops: {
                    label: 'Add Stops',
                    description: 'Add stops to tour day',
                    defaultFor: ['admin', 'user']
                }
            },

            editing: {
                editOwn: {
                    label: 'Edit Own Tours',
                    description: 'Edit own tour plans',
                    defaultFor: ['admin', 'user']
                },
                editAny: {
                    label: 'Edit Any Tour',
                    description: 'Edit any tour plan',
                    defaultFor: ['admin']
                }
            },

            approval: {
                approve: {
                    label: 'Approve Tour',
                    description: 'Approve tour plans',
                    defaultFor: ['admin']
                },
                reject: {
                    label: 'Reject Tour',
                    description: 'Reject tour plans',
                    defaultFor: ['admin']
                },
                approveTeamOnly: {
                    label: 'Approve Team Only',
                    description: 'Can approve subordinates only',
                    defaultFor: []
                }
            },

            execution: {
                startTour: {
                    label: 'Start Tour',
                    description: 'Start tour execution',
                    defaultFor: ['admin', 'user']
                },
                checkInStop: {
                    label: 'Check-in at Stop',
                    description: 'Check-in at tour stop',
                    defaultFor: ['admin', 'user']
                },
                completeTour: {
                    label: 'Complete Tour',
                    description: 'Mark tour as completed',
                    defaultFor: ['admin', 'user']
                },
                addExpense: {
                    label: 'Add Tour Expense',
                    description: 'Add expenses during tour',
                    defaultFor: ['admin', 'user']
                }
            }
        }
    },

    // ============================================================
    // LIVE TRACKING MODULE
    // ============================================================
    liveTracking: {
        id: 'liveTracking',
        name: 'Live Tracking',
        description: 'Real-time GPS tracking of field staff',
        icon: 'location-arrow',
        category: 'business',
        tiers: ['premium', 'custom'],
        defaultEnabled: [],
        features: {
            viewing: {
                viewMap: {
                    label: 'View Live Map',
                    description: 'View live tracking map',
                    defaultFor: ['admin']
                },
                viewTeamLocation: {
                    label: 'View Team Location',
                    description: 'View subordinates live location',
                    defaultFor: ['admin']
                },
                viewOwnLocation: {
                    label: 'View Own Location',
                    description: 'View own location on map',
                    defaultFor: ['admin', 'user']
                },
                viewRouteHistory: {
                    label: 'View Route History',
                    description: 'View travel route history',
                    defaultFor: ['admin']
                }
            },

            tracking: {
                shareLocation: {
                    label: 'Share Location',
                    description: 'Enable location sharing',
                    defaultFor: ['admin', 'user']
                },
                autoShare: {
                    label: 'Auto Share',
                    description: 'Auto share during working hours',
                    defaultFor: ['admin', 'user']
                },
                viewBatteryStatus: {
                    label: 'View Battery Status',
                    description: 'View device battery status',
                    defaultFor: ['admin']
                }
            },

            alerts: {
                viewAlerts: {
                    label: 'View Alerts',
                    description: 'View tracking alerts',
                    defaultFor: ['admin']
                },
                configureAlerts: {
                    label: 'Configure Alerts',
                    description: 'Set up tracking alerts',
                    defaultFor: ['admin']
                },
                geoFenceAlert: {
                    label: 'Geofence Alert',
                    description: 'Get alerts for geofence breaches',
                    defaultFor: ['admin']
                }
            },

            reports: {
                viewTravelReport: {
                    label: 'View Travel Report',
                    description: 'View travel distance reports',
                    defaultFor: ['admin']
                },
                viewIdleTime: {
                    label: 'View Idle Time',
                    description: 'View idle time reports',
                    defaultFor: ['admin']
                },
                exportReport: {
                    label: 'Export Report',
                    description: 'Export tracking reports',
                    defaultFor: ['admin']
                }
            }
        }
    },

    // ============================================================
    // ANALYTICS MODULE
    // ============================================================
    analytics: {
        id: 'analytics',
        name: 'Analytics',
        description: 'Business analytics and reports',
        icon: 'chart-bar',
        category: 'business',
        tiers: ['premium', 'custom'],
        defaultEnabled: [],
        features: {
            dashboards: {
                viewSalesDashboard: {
                    label: 'View Sales Dashboard',
                    description: 'View sales analytics',
                    defaultFor: ['admin']
                },
                viewCollectionDashboard: {
                    label: 'View Collection Dashboard',
                    description: 'View collection analytics',
                    defaultFor: ['admin']
                },
                viewProductDashboard: {
                    label: 'View Product Dashboard',
                    description: 'View product analytics',
                    defaultFor: ['admin']
                },
                viewEmployeeDashboard: {
                    label: 'View Employee Dashboard',
                    description: 'View employee performance',
                    defaultFor: ['admin']
                },
                viewCustomDashboard: {
                    label: 'View Custom Dashboard',
                    description: 'View custom dashboards',
                    defaultFor: ['admin']
                },
                createCustomDashboard: {
                    label: 'Create Custom Dashboard',
                    description: 'Create custom dashboards',
                    defaultFor: ['admin']
                }
            },

            reports: {
                viewSalesReport: {
                    label: 'View Sales Report',
                    description: 'View detailed sales reports',
                    defaultFor: ['admin']
                },
                viewCollectionReport: {
                    label: 'View Collection Report',
                    description: 'View collection reports',
                    defaultFor: ['admin']
                },
                viewProductReport: {
                    label: 'View Product Report',
                    description: 'View product performance',
                    defaultFor: ['admin']
                },
                viewCustomerReport: {
                    label: 'View Customer Report',
                    description: 'View customer analytics',
                    defaultFor: ['admin']
                },
                viewEmployeeReport: {
                    label: 'View Employee Report',
                    description: 'View employee reports',
                    defaultFor: ['admin']
                }
            },

            export: {
                exportPdf: {
                    label: 'Export to PDF',
                    description: 'Export reports as PDF',
                    defaultFor: ['admin']
                },
                exportExcel: {
                    label: 'Export to Excel',
                    description: 'Export reports as Excel',
                    defaultFor: ['admin']
                },
                scheduleReport: {
                    label: 'Schedule Report',
                    description: 'Schedule automatic reports',
                    defaultFor: ['admin']
                }
            }
        }
    },

    // ============================================================
    // SETTINGS MODULE
    // ============================================================
    settings: {
        id: 'settings',
        name: 'Settings',
        description: 'Organization settings',
        icon: 'cog',
        category: 'business',
        tiers: ['premium', 'custom'],
        defaultEnabled: [],
        features: {
            organization: {
                viewOrgSettings: {
                    label: 'View Org Settings',
                    description: 'View organization settings',
                    defaultFor: ['admin']
                },
                editOrgSettings: {
                    label: 'Edit Org Settings',
                    description: 'Edit organization settings',
                    defaultFor: ['admin']
                },
                editOrgDetails: {
                    label: 'Edit Org Details',
                    description: 'Edit organization details',
                    defaultFor: ['admin']
                },
                uploadLogo: {
                    label: 'Upload Logo',
                    description: 'Upload organization logo',
                    defaultFor: ['admin']
                }
            },

            preferences: {
                viewPreferences: {
                    label: 'View Preferences',
                    description: 'View system preferences',
                    defaultFor: ['admin']
                },
                editPreferences: {
                    label: 'Edit Preferences',
                    description: 'Edit system preferences',
                    defaultFor: ['admin']
                }
            },

            customizations: {
                manageFields: {
                    label: 'Manage Custom Fields',
                    description: 'Manage custom fields',
                    defaultFor: ['admin']
                },
                manageTemplates: {
                    label: 'Manage Templates',
                    description: 'Manage document templates',
                    defaultFor: ['admin']
                },
                manageWorkflows: {
                    label: 'Manage Workflows',
                    description: 'Configure approval workflows',
                    defaultFor: ['admin']
                }
            },

            integrations: {
                viewIntegrations: {
                    label: 'View Integrations',
                    description: 'View third-party integrations',
                    defaultFor: ['admin']
                },
                configureIntegrations: {
                    label: 'Configure Integrations',
                    description: 'Configure third-party integrations',
                    defaultFor: ['admin']
                }
            }
        }
    },

    // ============================================================
    // SYSTEM MODULES (Not subscription-gated)
    // ============================================================
    organizations: {
        id: 'organizations',
        name: 'Organizations',
        description: 'Organization management (system)',
        icon: 'building',
        category: 'system',
        tiers: null,
        defaultEnabled: ['viewList'],
        features: {
            viewing: {
                viewList: { label: 'View Organizations', defaultFor: ['superadmin', 'developer'] },
                viewDetails: { label: 'View Organization Details', defaultFor: ['superadmin', 'developer'] }
            },
            management: {
                create: { label: 'Create Organization', defaultFor: ['superadmin'] },
                edit: { label: 'Edit Organization', defaultFor: ['superadmin'] },
                delete: { label: 'Delete Organization', defaultFor: ['superadmin'] },
                manageSubscription: { label: 'Manage Subscription', defaultFor: ['superadmin'] }
            }
        }
    },

    systemUsers: {
        id: 'systemUsers',
        name: 'System Users',
        description: 'System user management (superadmin, developer)',
        icon: 'user-shield',
        category: 'system',
        tiers: null,
        defaultEnabled: [],
        features: {
            viewing: {
                viewList: { label: 'View System Users', defaultFor: ['superadmin'] },
                viewDetails: { label: 'View User Details', defaultFor: ['superadmin', 'developer'] }
            },
            management: {
                create: { label: 'Create System User', defaultFor: ['superadmin'] },
                edit: { label: 'Edit System User', defaultFor: ['superadmin'] },
                delete: { label: 'Delete System User', defaultFor: ['superadmin'] },
                resetPassword: { label: 'Reset Password', defaultFor: ['superadmin'] }
            }
        }
    },

    subscriptions: {
        id: 'subscriptions',
        name: 'Subscriptions',
        description: 'Subscription plan management',
        icon: 'credit-card',
        category: 'system',
        tiers: null,
        defaultEnabled: [],
        features: {
            viewing: {
                viewList: { label: 'View Plans', defaultFor: ['superadmin', 'developer'] },
                viewDetails: { label: 'View Plan Details', defaultFor: ['superadmin', 'developer'] }
            },
            management: {
                createPlan: { label: 'Create Plan', defaultFor: ['superadmin'] },
                editPlan: { label: 'Edit Plan', defaultFor: ['superadmin'] },
                deletePlan: { label: 'Delete Plan', defaultFor: ['superadmin'] },
                updatePricing: { label: 'Update Pricing', defaultFor: ['superadmin'] }
            }
        }
    }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get all module IDs
 */
const getAllModules = () => Object.keys(GRANULAR_FEATURE_REGISTRY);

/**
 * Get all features for a module (flattened)
 */
const getModuleFeatures = (moduleId) => {
    const module = GRANULAR_FEATURE_REGISTRY[moduleId];
    if (!module) return null;

    const features = {};
    for (const [groupName, group] of Object.entries(module.features)) {
        for (const [featureId, config] of Object.entries(group)) {
            features[featureId] = {
                ...config,
                group: groupName,
                moduleId: module.id
            };
        }
    }
    return features;
};

/**
 * Get features grouped by group
 */
const getModuleFeaturesGrouped = (moduleId) => {
    const module = GRANULAR_FEATURE_REGISTRY[moduleId];
    if (!module) return null;
    return module.features;
};

/**
 * Get business modules only
 */
const getBusinessModules = () => {
    return Object.values(GRANULAR_FEATURE_REGISTRY)
        .filter(m => m.category === 'business')
        .map(m => m.id);
};

/**
 * Get system modules only
 */
const getSystemModules = () => {
    return Object.values(GRANULAR_FEATURE_REGISTRY)
        .filter(m => m.category === 'system')
        .map(m => m.id);
};

/**
 * Get modules for a specific tier
 */
const getModulesForTier = (tier) => {
    return Object.values(GRANULAR_FEATURE_REGISTRY)
        .filter(m => m.tiers && m.tiers.includes(tier))
        .map(m => m.id);
};

/**
 * Check if feature exists in registry
 */
const featureExists = (moduleId, featureId) => {
    const features = getModuleFeatures(moduleId);
    return features && Object.prototype.hasOwnProperty.call(features, featureId);
};

/**
 * Validate feature - throws error if invalid
 */
const validateFeature = (moduleId, featureId) => {
    if (!GRANULAR_FEATURE_REGISTRY[moduleId]) {
        throw new Error(`Module "${moduleId}" not found in registry`);
    }
    if (!featureExists(moduleId, featureId)) {
        throw new Error(`Feature "${featureId}" not found in module "${moduleId}"`);
    }
    return true;
};

/**
 * Get default permissions for a role type
 */
const getDefaultFeaturesForRole = (role) => {
    const permissions = {};

    for (const [moduleId, module] of Object.entries(GRANULAR_FEATURE_REGISTRY)) {
        permissions[moduleId] = {};
        const features = getModuleFeatures(moduleId);

        for (const [featureId, config] of Object.entries(features)) {
            // Check if this role has this feature by default
            permissions[moduleId][featureId] = config.defaultFor?.includes(role) || false;
        }
    }

    return permissions;
};

/**
 * Create empty permissions (all false)
 */
const createEmptyFeaturePermissions = () => {
    const permissions = {};

    for (const [moduleId, module] of Object.entries(GRANULAR_FEATURE_REGISTRY)) {
        permissions[moduleId] = {};
        const features = getModuleFeatures(moduleId);

        for (const featureId of Object.keys(features)) {
            permissions[moduleId][featureId] = false;
        }
    }

    return permissions;
};

/**
 * Create full permissions (all true)
 */
const createFullFeaturePermissions = () => {
    const permissions = {};

    for (const [moduleId, module] of Object.entries(GRANULAR_FEATURE_REGISTRY)) {
        permissions[moduleId] = {};
        const features = getModuleFeatures(moduleId);

        for (const featureId of Object.keys(features)) {
            permissions[moduleId][featureId] = true;
        }
    }

    return permissions;
};

/**
 * Get feature configuration
 */
const getFeatureConfig = (moduleId, featureId) => {
    validateFeature(moduleId, featureId);
    return getModuleFeatures(moduleId)[featureId];
};

/**
 * Get module configuration
 */
const getModuleConfig = (moduleId) => {
    if (!GRANULAR_FEATURE_REGISTRY[moduleId]) {
        throw new Error(`Module "${moduleId}" not found in registry`);
    }
    return GRANULAR_FEATURE_REGISTRY[moduleId];
};

/**
 * Get all feature IDs for a module (for creating schema)
 */
const getModuleFeatureIds = (moduleId) => {
    return Object.keys(getModuleFeatures(moduleId));
};

/**
 * Generate permission schema for Mongoose
 */
const generatePermissionSchema = () => {
    const schema = {};

    for (const [moduleId, module] of Object.entries(GRANULAR_FEATURE_REGISTRY)) {
        // Skip system modules for custom roles
        if (module.category === 'system') continue;

        schema[moduleId] = {
            type: Map,
            of: Boolean,
            default: () => new Map()
        };
    }

    return schema;
};

/**
 * Get modules that require approval
 */
const getApprovalModules = () => {
    return Object.values(GRANULAR_FEATURE_REGISTRY)
        .filter(m => {
            const features = getModuleFeatures(m.id);
            return Object.values(features).some(f => f.group === 'approval');
        })
        .map(m => m.id);
};

module.exports = {
    GRANULAR_FEATURE_REGISTRY,

    // Query functions
    getAllModules,
    getModuleFeatures,
    getModuleFeaturesGrouped,
    getBusinessModules,
    getSystemModules,
    getModulesForTier,
    featureExists,
    validateFeature,
    getFeatureConfig,
    getModuleConfig,
    getModuleFeatureIds,
    getApprovalModules,

    // Permission generators
    getDefaultFeaturesForRole,
    createEmptyFeaturePermissions,
    createFullFeaturePermissions,

    // Schema generator
    generatePermissionSchema,

    // Constants
    CATEGORIES: {
        BUSINESS: 'business',
        SYSTEM: 'system'
    },
    TIERS: {
        BASIC: 'basic',
        STANDARD: 'standard',
        PREMIUM: 'premium',
        CUSTOM: 'custom'
    },
    ROLES: {
        SUPERADMIN: 'superadmin',
        DEVELOPER: 'developer',
        ADMIN: 'admin',
        USER: 'user'
    }
};
