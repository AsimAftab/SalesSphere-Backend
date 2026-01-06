# Feature Registry System - Design & Implementation Guide

**SalesSphere Backend - Plan-Based & Role-Based Access Control**

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Feature Registry Design](#proposed-feature-registry-design)
4. [Implementation Plan](#implementation-plan)
5. [Code Examples](#code-examples)
6. [Migration Guide](#migration-guide)
7. [Testing Strategy](#testing-strategy)

---

## 1. Executive Summary

### Problem Statement

The current permission system in SalesSphere has **module definitions scattered across multiple files**:
- `ALL_MODULES` in `src/utils/defaultPermissions.js`
- `enabledModules` enum in `SubscriptionPlan` model
- Hardcoded permission schema in `Role` model
- String literals throughout the codebase

**Issues:**
1. Adding a new module requires changes in 3+ locations
2. No single source of truth for feature definitions
3. Inconsistent use of `approve` permission (routes use `update`)
4. No type safety - typo-prone string literals
5. Difficult to audit which features exist and their configurations

### Solution: Centralized Feature Registry

A **single, self-describing registry** that defines:
- All available modules/features
- Valid actions per module
- Module categories (business vs system)
- Subscription tier availability
- Metadata for documentation

**Benefits:**
- Single place to add/modify features
- Auto-generated permission schemas
- Route validation against registry
- Type-safe permission constants
- Built-in documentation

---

## 2. Current State Analysis

### 2.1 Module Inventory (24 Total)

| Module | Category | Actions | Description | Tiers |
|--------|----------|---------|-------------|-------|
| `dashboard` | Business | view, add, update, delete | Analytics overview | All |
| `liveTracking` | Business | view, add, update, delete, approve | Real-time location | Premium+ |
| `products` | Business | view, add, update, delete | Product inventory | All |
| `orderLists` | Business | view, add, update, delete | Order management | All |
| `employees` | Business | view, add, update, delete | Employee management | Premium+ |
| `attendance` | Business | view, add, update, delete | Attendance tracking | All |
| `leaves` | Business | view, add, update, delete, approve | Leave requests | All |
| `parties` | Business | view, add, update, delete | Customer management | All |
| `prospects` | Business | view, add, update, delete | Lead management | Standard+ |
| `sites` | Business | view, add, update, delete | Location management | Standard+ |
| `rawMaterials` | Business | view, add, update, delete | Material inventory | Premium+ |
| `analytics` | Business | view, add, update, delete | Advanced reports | Premium+ |
| `beatPlan` | Business | view, add, update, delete, approve | Route planning | Standard+ |
| `tourPlan` | Business | view, add, update, delete, approve | Tour planning | Standard+ |
| `collections` | Business | view, add, update, delete | Collection tracking | Standard+ |
| `expenses` | Business | view, add, update, delete, approve | Expense claims | Standard+ |
| `odometer` | Business | view, add, update, delete | Odometer readings | Premium+ |
| `notes` | Business | view, add, update, delete | Notes management | Standard+ |
| `miscellaneousWork` | Business | view, add, update, delete | Misc work tracking | Standard+ |
| `settings` | System | view, add, update, delete | Organization settings | Premium+ |
| `organizations` | System | view, add, update, delete | Org management | N/A |
| `systemUsers` | System | view, add, update, delete | System user management | N/A |
| `subscriptions` | System | view, add, update, delete | Subscription plans | N/A |

### 2.2 Permission Actions

| Action | Description | HTTP Methods | Usage |
|--------|-------------|--------------|-------|
| `view` | Read/see data | GET | List, show, dashboard endpoints |
| `add` | Create new records | POST | Create endpoints |
| `update` | Modify existing | PUT/PATCH | Update endpoints |
| `delete` | Remove records | DELETE | Delete endpoints |
| `approve` | Approve/reject requests | PATCH | Status change endpoints |

**GAP:** `approve` action exists in schema but routes currently use `update` permission.

### 2.3 Current Permission Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PERMISSION CHECK FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Route Protection                                                    │
│     └─> router.post('/', protect, requirePermission('products', 'add')) │
│                                                                          │
│  2. Authentication (protect middleware)                                 │
│     └─> Validates JWT token                                             │
│     └─> Fetches user with customRoleId populated                        │
│     └─> Sets req.user and req.permissions                               │
│                                                                          │
│  3. Permission Check (requirePermission middleware)                     │
│     ├─> System Role Check ────> superadmin/developer: PASS             │
│     │                                                                   │
│     ├─> Role Permission Check                                           │
│     │   └─> user.hasPermission(module, action)                          │
│     │       └─> getEffectivePermissions()                               │
│     │           ├─> System role ──> defaults                            │
│     │           ├─> Admin ─────────> ADMIN_DEFAULT_PERMISSIONS          │
│     │           ├─> Custom role ────> customRoleId.permissions          │
│     │           └─> User ──────────> USER_DEFAULT_PERMISSIONS           │
│     │                                                                   │
│     └─> Subscription Plan Check (Intersection Logic)                    │
│         └─> Fetch organization with subscriptionPlanId populated         │
│         └─> Check subscription active (not expired)                     │
│         └─> Check plan.enabledModules includes module                   │
│             └─> If NOT: Return 403 "Feature not in plan"                │
│                                                                          │
│  4. Final Decision                                                      │
│     └─> PASS: next() ────> Controller executes                          │
│     └─> FAIL: 403 with specific error message                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Intersection Formula:**
```
effectivePermission = rolePermission[module][action] AND plan.enabledModules.includes(module)
```

### 2.4 Files That Need Changes for New Module

Currently, adding a new module requires updates in **5+ files**:

| File | Change Required |
|------|-----------------|
| `src/utils/defaultPermissions.js` | Add to `ALL_MODULES`, add to all role permissions |
| `src/api/subscriptions/subscriptionPlan.model.js` | Add to `enabledModules` enum |
| `src/api/roles/role.model.js` | Add permission schema field |
| `src/api/[newModule]/` | Create model, controller, routes |
| `app.js` | Mount new routes |
| `CLAUDE.md` | Update documentation |

---

## 3. Proposed Feature Registry Design

### 3.1 Registry Schema

```javascript
// src/utils/featureRegistry.js

/**
 * Feature Registry - Single Source of Truth for All Modules
 *
 * Categories:
 * - business: Regular business features (subject to subscription)
 * - system: System-level features (not subject to subscription)
 *
 * Tiers:
 * - basic: Available in Basic plan
 * - standard: Available in Standard plan and above
 * - premium: Available in Premium plan and above
 * - custom: Only in custom plans
 * - null: System modules (not tier-based)
 */

const FEATURE_REGISTRY = {
    // ============================================================
    // BUSINESS MODULES (Subscription-Gated)
    // ============================================================
    dashboard: {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Main dashboard with analytics overview',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['basic', 'standard', 'premium', 'custom'],
        requiresApproval: false,
        routes: {
            list: { method: 'GET', path: '/dashboard', action: 'view' },
            create: { method: 'POST', path: '/dashboard', action: 'add' },
        }
    },

    liveTracking: {
        id: 'liveTracking',
        name: 'Live Tracking',
        description: 'Real-time GPS tracking of field employees',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete', 'approve'],
        tiers: ['premium', 'custom'],
        requiresApproval: false,
        websocket: true,
        socketPath: '/api/tracking'
    },

    products: {
        id: 'products',
        name: 'Products',
        description: 'Product inventory management',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['basic', 'standard', 'premium', 'custom'],
        requiresApproval: false
    },

    orderLists: {
        id: 'orderLists',
        name: 'Order Lists',
        description: 'Order management and tracking',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['basic', 'standard', 'premium', 'custom'],
        requiresApproval: false
    },

    employees: {
        id: 'employees',
        name: 'Employees',
        description: 'Employee management and records',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['premium', 'custom'],
        requiresApproval: true,
        approvalFor: ['add', 'update'] // These actions require approval
    },

    attendance: {
        id: 'attendance',
        name: 'Attendance',
        description: 'Employee attendance tracking',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['basic', 'standard', 'premium', 'custom'],
        requiresApproval: false
    },

    leaves: {
        id: 'leaves',
        name: 'Leave Requests',
        description: 'Employee leave request management',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete', 'approve'],
        tiers: ['basic', 'standard', 'premium', 'custom'],
        requiresApproval: true,
        approvalAction: 'approve', // Specific action for approval
        hierarchicalApproval: true,
        approvalRoles: ['admin', 'supervisor']
    },

    parties: {
        id: 'parties',
        name: 'Parties',
        description: 'Customer/party management',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['basic', 'standard', 'premium', 'custom'],
        requiresApproval: false
    },

    prospects: {
        id: 'prospects',
        name: 'Prospects',
        description: 'Lead and prospect management',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: false
    },

    sites: {
        id: 'sites',
        name: 'Sites',
        description: 'Site/location management',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: false
    },

    rawMaterials: {
        id: 'rawMaterials',
        name: 'Raw Materials',
        description: 'Raw material inventory',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['premium', 'custom'],
        requiresApproval: false
    },

    analytics: {
        id: 'analytics',
        name: 'Analytics',
        description: 'Advanced analytics and reports',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['premium', 'custom'],
        requiresApproval: false
    },

    beatPlan: {
        id: 'beatPlan',
        name: 'Beat Plans',
        description: 'Route and beat planning',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete', 'approve'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: true,
        approvalAction: 'approve',
        hierarchicalApproval: true
    },

    tourPlan: {
        id: 'tourPlan',
        name: 'Tour Plans',
        description: 'Tour planning for field visits',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete', 'approve'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: true,
        approvalAction: 'approve',
        hierarchicalApproval: true
    },

    collections: {
        id: 'collections',
        name: 'Collections',
        description: 'Payment collection tracking',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: false
    },

    expenses: {
        id: 'expenses',
        name: 'Expense Claims',
        description: 'Employee expense claim management',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete', 'approve'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: true,
        approvalAction: 'approve',
        hierarchicalApproval: true
    },

    odometer: {
        id: 'odometer',
        name: 'Odometer',
        description: 'Vehicle odometer readings',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['premium', 'custom'],
        requiresApproval: false
    },

    notes: {
        id: 'notes',
        name: 'Notes',
        description: 'Notes and reminders',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: false
    },

    miscellaneousWork: {
        id: 'miscellaneousWork',
        name: 'Miscellaneous Work',
        description: 'Miscellaneous work tracking',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: false
    },

    settings: {
        id: 'settings',
        name: 'Settings',
        description: 'Organization settings configuration',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: ['premium', 'custom'],
        requiresApproval: false
    },

    // ============================================================
    // SYSTEM MODULES (Not Subscription-Gated)
    // ============================================================
    organizations: {
        id: 'organizations',
        name: 'Organizations',
        description: 'Organization management (system-level)',
        category: 'system',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: null, // System modules are not tier-gated
        requiresApproval: false,
        systemOnly: true
    },

    systemUsers: {
        id: 'systemUsers',
        name: 'System Users',
        description: 'System user management',
        category: 'system',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: null,
        requiresApproval: false,
        systemOnly: true
    },

    subscriptions: {
        id: 'subscriptions',
        name: 'Subscriptions',
        description: 'Subscription plan management',
        category: 'system',
        actions: ['view', 'add', 'update', 'delete'],
        tiers: null,
        requiresApproval: false,
        systemOnly: true
    }
};

// ============================================================
// REGISTRY HELPER FUNCTIONS
// ============================================================

/**
 * Get all module IDs
 */
const getAllModuleIds = () => Object.keys(FEATURE_REGISTRY);

/**
 * Get business modules only (for subscription plans)
 */
const getBusinessModules = () => {
    return Object.values(FEATURE_REGISTRY)
        .filter(m => m.category === 'business')
        .map(m => m.id);
};

/**
 * Get system modules only
 */
const getSystemModules = () => {
    return Object.values(FEATURE_REGISTRY)
        .filter(m => m.category === 'system')
        .map(m => m.id);
};

/**
 * Get modules available for a specific tier
 */
const getModulesForTier = (tier) => {
    return Object.values(FEATURE_REGISTRY)
        .filter(m => m.tiers && m.tiers.includes(tier))
        .map(m => m.id);
};

/**
 * Get all actions for a module
 */
const getModuleActions = (moduleId) => {
    const module = FEATURE_REGISTRY[moduleId];
    if (!module) throw new Error(`Module "${moduleId}" not found in registry`);
    return module.actions;
};

/**
 * Check if module exists in registry
 */
const moduleExists = (moduleId) => {
    return Object.prototype.hasOwnProperty.call(FEATURE_REGISTRY, moduleId);
};

/**
 * Check if action is valid for a module
 */
const isValidAction = (moduleId, action) => {
    const module = FEATURE_REGISTRY[moduleId];
    if (!module) return false;
    return module.actions.includes(action);
};

/**
 * Get permission schema for a module (for Mongoose schemas)
 */
const getPermissionSchema = () => {
    const schema = {};
    for (const [id, config] of Object.entries(FEATURE_REGISTRY)) {
        // Skip system modules for custom roles
        if (config.category === 'system') continue;

        schema[id] = {};
        config.actions.forEach(action => {
            schema[id][action] = { type: Boolean, default: false };
        });
    }
    return schema;
};

/**
 * Get modules that require approval
 */
const getApprovalModules = () => {
    return Object.values(FEATURE_REGISTRY)
        .filter(m => m.requiresApproval)
        .map(m => ({
            id: m.id,
            name: m.name,
            approvalAction: m.approvalAction || 'update',
            hierarchical: m.hierarchicalApproval || false
        }));
};

/**
 * Validate module and action (throws error if invalid)
 */
const validatePermission = (moduleId, action) => {
    if (!moduleExists(moduleId)) {
        throw new Error(`Module "${moduleId}" is not registered in the feature registry`);
    }
    if (!isValidAction(moduleId, action)) {
        const validActions = getModuleActions(moduleId).join(', ');
        throw new Error(
            `Action "${action}" is not valid for module "${moduleId}". ` +
            `Valid actions: ${validActions}`
        );
    }
    return true;
};

/**
 * Generate default permissions object (all false)
 */
const createEmptyPermissions = () => {
    const permissions = {};
    for (const [id, config] of Object.entries(FEATURE_REGISTRY)) {
        permissions[id] = {};
        config.actions.forEach(action => {
            permissions[id][action] = false;
        });
    }
    return permissions;
};

/**
 * Generate full permissions object (all true)
 */
const createFullPermissions = () => {
    const permissions = {};
    for (const [id, config] of Object.entries(FEATURE_REGISTRY)) {
        permissions[id] = {};
        config.actions.forEach(action => {
            permissions[id][action] = true;
        });
    }
    return permissions;
};

/**
 * Get module configuration
 */
const getModuleConfig = (moduleId) => {
    if (!moduleExists(moduleId)) {
        throw new Error(`Module "${moduleId}" not found in registry`);
    }
    return FEATURE_REGISTRY[moduleId];
};

/**
 * Export all
 */
module.exports = {
    FEATURE_REGISTRY,
    getAllModuleIds,
    getBusinessModules,
    getSystemModules,
    getModulesForTier,
    getModuleActions,
    moduleExists,
    isValidAction,
    getPermissionSchema,
    getApprovalModules,
    validatePermission,
    createEmptyPermissions,
    createFullPermissions,
    getModuleConfig,

    // Constants for use throughout the app
    MODULES: Object.fromEntries(
        Object.keys(FEATURE_REGISTRY).map(key => [key, key])
    ),
    ACTIONS: {
        VIEW: 'view',
        ADD: 'add',
        UPDATE: 'update',
        DELETE: 'delete',
        APPROVE: 'approve'
    },
    CATEGORIES: {
        BUSINESS: 'business',
        SYSTEM: 'system'
    },
    TIERS: {
        BASIC: 'basic',
        STANDARD: 'standard',
        PREMIUM: 'premium',
        CUSTOM: 'custom'
    }
};
```

### 3.2 Updated Permission Middleware

```javascript
// src/middlewares/permission.middleware.js (Updated)

const { isSystemRole } = require('../utils/defaultPermissions');
const { validatePermission, getModuleConfig } = require('../utils/featureRegistry');
const Organization = require('../api/organizations/organization.model');

/**
 * Middleware to check if user has required permission AND organization's plan has the feature
 * Implements the Intersection Logic: Effective = RolePermission AND PlanFeature
 *
 * @param {string} module - Module name (e.g., 'products', 'parties', 'employees')
 * @param {string} action - Action type ('view', 'add', 'update', 'delete', 'approve')
 * @returns {Function} Express middleware
 */
const requirePermission = (module, action) => {
    // Validate against feature registry
    validatePermission(module, action);

    return async (req, res, next) => {
        // Ensure protect middleware ran first
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required. Please ensure protect middleware runs before permission checks.'
            });
        }

        // 1. SYSTEM ROLES: superadmin/developer bypass all checks
        if (isSystemRole(req.user.role)) {
            return next();
        }

        // 2. CHECK ROLE-BASED PERMISSION
        let hasRoleAccess = false;
        if (typeof req.user.hasPermission === 'function') {
            hasRoleAccess = req.user.hasPermission(module, action);
        } else {
            // Fallback for cases where user method not available
            const { hasPermission: hasPermByRole } = require('../utils/defaultPermissions');
            hasRoleAccess = hasPermByRole(req.user.role, module, action);
        }

        if (!hasRoleAccess) {
            const moduleConfig = getModuleConfig(module);
            return res.status(403).json({
                status: 'error',
                message: `Access denied. You do not have ${action} permission for ${moduleConfig.name}.`,
                requiredPermission: { module, action },
                module: {
                    id: module,
                    name: moduleConfig.name,
                    description: moduleConfig.description
                }
            });
        }

        // 3. CHECK SUBSCRIPTION PLAN FEATURE (Intersection Logic)
        const moduleConfig = getModuleConfig(module);

        // Skip plan check for system-level modules
        if (moduleConfig.category === 'system') {
            return next();
        }

        try {
            // Fetch organization with populated subscription plan
            const org = await Organization.findById(req.user.organizationId)
                .populate('subscriptionPlanId')
                .lean();

            if (!org) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Organization not found. Please contact support.'
                });
            }

            // Check if subscription is active
            if (org.subscriptionEndDate && new Date() > new Date(org.subscriptionEndDate)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Your subscription has expired. Please renew to continue.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }

            // Check if plan includes this module
            const plan = org.subscriptionPlanId;
            if (plan && plan.enabledModules && !plan.enabledModules.includes(module)) {
                return res.status(403).json({
                    status: 'error',
                    message: `This feature (${moduleConfig.name}) is not available in your current plan. Please upgrade to access it.`,
                    code: 'PLAN_FEATURE_UNAVAILABLE',
                    currentPlan: plan.name,
                    currentTier: plan.tier,
                    requiredModule: {
                        id: module,
                        name: moduleConfig.name,
                        description: moduleConfig.description
                    }
                });
            }

            // All checks passed!
            return next();
        } catch (error) {
            console.error('Permission middleware error:', error);
            return res.status(500).json({
                status: 'error',
                message: 'Error checking permissions. Please try again.'
            });
        }
    };
};

// ... rest of middleware functions remain the same
```

---

## 4. Implementation Plan

### Phase 1: Create Feature Registry (Week 1)

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Create `src/utils/featureRegistry.js` | New file |
| 1.2 | Add JSDoc documentation for all functions | featureRegistry.js |
| 1.3 | Export TypeScript types (optional) | featureRegistry.d.ts |
| 1.4 | Write unit tests for registry functions | tests/utils/featureRegistry.test.js |

### Phase 2: Update Permission Middleware (Week 1)

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Import registry in permission middleware | permission.middleware.js |
| 2.2 | Add `validatePermission()` call | permission.middleware.js |
| 2.3 | Enhance error messages with registry data | permission.middleware.js |
| 2.4 | Add tests for validation | tests/middlewares/permission.test.js |

### Phase 3: Update Subscription Plan Model (Week 2)

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Replace hardcoded enum with registry import | subscriptionPlan.model.js |
| 3.2 | Add helper to get modules by tier | subscriptionPlan.model.js |
| 3.3 | Update seed data to use registry | seedSubscriptionPlans.js |
| 3.4 | Migration script for existing data | migrations/update-plans.js |

### Phase 4: Update Role Model (Week 2)

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | Generate permission schema from registry | role.model.js |
| 4.2 | Add method to validate permissions | role.model.js |
| 4.3 | Update role controller for validation | role.controller.js |
| 4.4 | Migration for existing roles | migrations/update-roles.js |

### Phase 5: Update Default Permissions (Week 2)

| Task | Description | Files |
|------|-------------|-------|
| 5.1 | Replace ALL_MODULES with registry | defaultPermissions.js |
| 5.2 | Use registry for permission creation | defaultPermissions.js |
| 5.3 | Backward compatibility layer | defaultPermissions.js |
| 5.4 | Update tests | tests/utils/defaultPermissions.test.js |

### Phase 6: Fix Approve Permission (Week 3)

| Task | Description | Files |
|------|-------------|-------|
| 6.1 | Update leave routes to use 'approve' | leave.route.js |
| 6.2 | Update expense routes to use 'approve' | expense-claim.route.js |
| 6.3 | Update tour plan routes to use 'approve' | tour-plans.route.js |
| 6.4 | Update hierarchy helper | hierarchyHelper.js |

### Phase 7: Create Registry API (Week 3)

| Task | Description | Files |
|------|-------------|-------|
| 7.1 | GET /api/v1/registry - List all features | registry.route.js |
| 7.2 | GET /api/v1/registry/:module - Get module details | registry.route.js |
| 7.3 | GET /api/v1/registry/tiers/:tier - Modules by tier | registry.route.js |
| 7.4 | Admin-only access | registry.middleware.js |

### Phase 8: Documentation & Training (Week 4)

| Task | Description |
|------|-------------|
| 8.1 | Update CLAUDE.md with registry info |
| 8.2 | Create developer guide for adding features |
| 8.3 | Update API documentation |
| 8.4 | Team training session |

---

## 5. Code Examples

### 5.1 Adding a New Module (With Registry)

**Before (5+ files to change):**
```javascript
// Had to update defaultPermissions.js, subscriptionPlan.model.js, role.model.js, etc.
```

**After (1 file to change):**
```javascript
// src/utils/featureRegistry.js - Add new module

const FEATURE_REGISTRY = {
    // ... existing modules ...

    invoices: {
        id: 'invoices',
        name: 'Invoices',
        description: 'Invoice generation and management',
        category: 'business',
        actions: ['view', 'add', 'update', 'delete', 'approve'],
        tiers: ['standard', 'premium', 'custom'],
        requiresApproval: true,
        approvalAction: 'approve',
        hierarchicalApproval: true
    }
};
```

### 5.2 Creating Routes with Type Safety

```javascript
// src/api/invoices/invoice.route.js

const { protect } = require('../../middlewares/auth.middleware');
const { requirePermission } = require('../../middlewares/permission.middleware');
const { MODULES, ACTIONS } = require('../../utils/featureRegistry');
const {
    getInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    approveInvoice
} = require('./invoice.controller');

const router = require('express').Router();

// Type-safe route definitions
router.get('/', requirePermission(MODULES.invoices, ACTIONS.view), getInvoices);
router.post('/', requirePermission(MODULES.invoices, ACTIONS.add), createInvoice);
router.get('/:id', requirePermission(MODULES.invoices, ACTIONS.view), getInvoiceById);
router.patch('/:id', requirePermission(MODULES.invoices, ACTIONS.update), updateInvoice);
router.delete('/:id', requirePermission(MODULES.invoices, ACTIONS.delete), deleteInvoice);

// Approval endpoint - uses 'approve' action
router.patch(
    '/:id/approve',
    requirePermission(MODULES.invoices, ACTIONS.approve),
    approveInvoice
);

module.exports = router;
```

### 5.3 Permission Schema Generation

```javascript
// src/api/roles/role.model.js (Updated)

const { getPermissionSchema } = require('../../utils/featureRegistry');

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
    },
    // Dynamically generated from registry
    permissions: {
        type: Object,
        default: () => {
            const schema = getPermissionSchema();
            const empty = {};
            for (const [module, actions] of Object.entries(schema)) {
                empty[module] = {};
                for (const action of Object.keys(actions)) {
                    empty[module][action] = false;
                }
            }
            return empty;
        }
    },
    // ... other fields
});

// Add method to validate permissions against registry
roleSchema.methods.validatePermissions = function() {
    const { getModuleActions } = require('../../utils/featureRegistry');

    for (const [module, actions] of Object.entries(this.permissions)) {
        try {
            const validActions = getModuleActions(module);
            for (const action of Object.keys(actions)) {
                if (!validActions.includes(action)) {
                    throw new Error(
                        `Invalid action "${action}" for module "${module}"`
                    );
                }
            }
        } catch (err) {
            // Module not in registry
            return false;
        }
    }
    return true;
};
```

### 5.4 Subscription Plan Helper

```javascript
// src/api/subscriptions/subscriptionPlan.model.js (Updated)

const { getModulesForTier, getBusinessModules } = require('../../utils/featureRegistry');

const subscriptionPlanSchema = new mongoose.Schema({
    name: String,
    tier: {
        type: String,
        enum: ['basic', 'standard', 'premium', 'custom'],
        required: true
    },
    enabledModules: {
        type: [String],
        // Validate against registry
        validate: {
            validator: function(modules) {
                const validModules = getBusinessModules();
                return modules.every(m => validModules.includes(m));
            },
            message: 'Invalid module in enabledModules'
        }
    },
    // ... other fields
});

// Static method to get default modules for a tier
subscriptionPlanSchema.statics.getDefaultModulesForTier = function(tier) {
    return getModulesForTier(tier);
};

// Instance method to check if module is enabled
subscriptionPlanSchema.methods.hasModule = function(moduleId) {
    const { moduleExists } = require('../../utils/featureRegistry');
    if (!moduleExists(moduleId)) return false;
    return this.enabledModules.includes(moduleId);
};
```

### 5.5 Registry API Endpoint

```javascript
// src/api/registry/registry.controller.js (New)

const { FEATURE_REGISTRY, getModulesForTier, getApprovalModules } = require('../../utils/featureRegistry');

/**
 * GET /api/v1/registry
 * Get complete feature registry (admin only)
 */
exports.getRegistry = (req, res) => {
    res.json({
        status: 'success',
        data: {
            modules: FEATURE_REGISTRY,
            summary: {
                total: Object.keys(FEATURE_REGISTRY).length,
                business: Object.values(FEATURE_REGISTRY).filter(m => m.category === 'business').length,
                system: Object.values(FEATURE_REGISTRY).filter(m => m.category === 'system').length,
                requiresApproval: Object.values(FEATURE_REGISTRY).filter(m => m.requiresApproval).length
            }
        }
    });
};

/**
 * GET /api/v1/registry/:moduleId
 * Get specific module details
 */
exports.getModuleDetails = (req, res) => {
    const { moduleId } = req.params;
    const { getModuleConfig } = require('../../utils/featureRegistry');

    try {
        const config = getModuleConfig(moduleId);
        res.json({
            status: 'success',
            data: config
        });
    } catch (err) {
        res.status(404).json({
            status: 'error',
            message: err.message
        });
    }
};

/**
 * GET /api/v1/registry/tiers/:tier
 * Get modules available for a specific tier
 */
exports.getModulesByTier = (req, res) => {
    const { tier } = req.params;

    try {
        const modules = getModulesForTier(tier);
        const { getModuleConfig } = require('../../utils/featureRegistry');

        res.json({
            status: 'success',
            data: {
                tier,
                modules: modules.map(id => getModuleConfig(id))
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'error',
            message: err.message
        });
    }
};

/**
 * GET /api/v1/registry/approval-modules
 * Get all modules that require approval
 */
exports.getApprovalModules = (req, res) => {
    const modules = getApprovalModules();

    res.json({
        status: 'success',
        data: modules
    });
};
```

---

## 6. Migration Guide

### 6.1 Migrating Existing Routes

**Step 1: Import constants**
```javascript
const { MODULES, ACTIONS } = require('../../utils/featureRegistry');
```

**Step 2: Replace string literals**
```javascript
// Before
router.post('/', requirePermission('products', 'add'), createProduct);

// After
router.post('/', requirePermission(MODULES.products, ACTIONS.add), createProduct);
```

**Step 3: Fix approve permissions**
```javascript
// Before
router.patch('/:id/status', requirePermission('leaves', 'update'), updateStatus);

// After
router.patch('/:id/status', requirePermission(MODULES.leaves, ACTIONS.approve), updateStatus);
```

### 6.2 Migrating Role Data

```javascript
// migrations/update-roles.js

const mongoose = require('mongoose');
const Role = require('../src/api/roles/role.model');
const { createEmptyPermissions } = require('../src/utils/featureRegistry');

async function migrateRoles() {
    await mongoose.connect(process.env.MONGO_URI);

    const roles = await Role.find({});

    for (const role of roles) {
        const newPermissions = createEmptyPermissions();

        // Copy existing permissions that are still valid
        for (const [module, actions] of Object.entries(role.permissions)) {
            if (newPermissions[module]) {
                for (const [action, value] of Object.entries(actions)) {
                    if (newPermissions[module][action] !== undefined) {
                        newPermissions[module][action] = value;
                    }
                }
            }
        }

        role.permissions = newPermissions;
        await role.save();
        console.log(`Migrated role: ${role.name}`);
    }

    console.log('Migration complete!');
    process.exit(0);
}

migrateRoles().catch(err => {
    console.error(err);
    process.exit(1);
});
```

### 6.3 Backward Compatibility Layer

```javascript
// src/utils/defaultPermissions.js (Updated)

const { getAllModuleIds, createEmptyPermissions, createFullPermissions } = require('./featureRegistry');

// Keep existing exports for backward compatibility
const ALL_MODULES = getAllModuleIds();
const createEmptyPermissionsLegacy = createEmptyPermissions;
const createFullAccess = createFullPermissions;

module.exports = {
    // New registry-based exports
    ALL_MODULES,
    createEmptyPermissions: createEmptyPermissionsLegacy,
    createFullAccess,

    // Keep all existing exports
    SUPERADMIN_DEFAULT_PERMISSIONS,
    DEVELOPER_DEFAULT_PERMISSIONS,
    // ... rest of exports
};
```

---

## 7. Testing Strategy

### 7.1 Unit Tests for Registry

```javascript
// tests/utils/featureRegistry.test.js

const {
    FEATURE_REGISTRY,
    getAllModuleIds,
    getBusinessModules,
    getSystemModules,
    getModulesForTier,
    getModuleActions,
    moduleExists,
    isValidAction,
    validatePermission,
    createEmptyPermissions,
    createFullPermissions,
    MODULES,
    ACTIONS
} = require('../../src/utils/featureRegistry');

describe('Feature Registry', () => {
    describe('Module Registry', () => {
        test('should have at least 20 modules', () => {
            const modules = getAllModuleIds();
            expect(modules.length).toBeGreaterThanOrEqual(20);
        });

        test('should have all required modules', () => {
            const required = ['dashboard', 'products', 'leaves', 'expenses', 'attendance'];
            const modules = getAllModuleIds();
            required.forEach(m => {
                expect(modules).toContain(m);
            });
        });

        test('business modules should not include system modules', () => {
            const business = getBusinessModules();
            const system = getSystemModules();
            const intersection = business.filter(m => system.includes(m));
            expect(intersection).toHaveLength(0);
        });
    });

    describe('Module Actions', () => {
        test('leaves module should have approve action', () => {
            const actions = getModuleActions('leaves');
            expect(actions).toContain('approve');
        });

        test('should validate correct module and action', () => {
            expect(() => validatePermission('products', 'view')).not.toThrow();
        });

        test('should reject invalid module', () => {
            expect(() => validatePermission('invalidModule', 'view')).toThrow();
        });

        test('should reject invalid action', () => {
            expect(() => validatePermission('products', 'invalidAction')).toThrow();
        });
    });

    describe('Tier-Based Access', () => {
        test('basic tier should have dashboard', () => {
            const basicModules = getModulesForTier('basic');
            expect(basicModules).toContain('dashboard');
        });

        test('basic tier should not have liveTracking', () => {
            const basicModules = getModulesForTier('basic');
            expect(basicModules).not.toContain('liveTracking');
        });

        test('premium tier should have all business modules', () => {
            const premiumModules = getModulesForTier('premium');
            const businessModules = getBusinessModules();
            businessModules.forEach(m => {
                expect(premiumModules).toContain(m);
            });
        });
    });

    describe('Permission Creation', () => {
        test('createEmptyPermissions should have all actions as false', () => {
            const perms = createEmptyPermissions();
            Object.values(perms).forEach(module => {
                Object.values(module).forEach(action => {
                    expect(action).toBe(false);
                });
            });
        });

        test('createFullPermissions should have all actions as true', () => {
            const perms = createFullPermissions();
            Object.values(perms).forEach(module => {
                Object.values(module).forEach(action => {
                    expect(action).toBe(true);
                });
            });
        });
    });

    describe('Constants Export', () => {
        test('MODULES should have all modules as properties', () => {
            const modules = getAllModuleIds();
            modules.forEach(m => {
                expect(MODULES[m]).toBe(m);
            });
        });

        test('ACTIONS should have all action types', () => {
            expect(Object.values(ACTIONS)).toEqual(
                expect.arrayContaining(['view', 'add', 'update', 'delete', 'approve'])
            );
        });
    });
});
```

### 7.2 Integration Tests for Permission Middleware

```javascript
// tests/middlewares/permission.test.js

const request = require('supertest');
const app = require('../../app');
const User = require('../../src/api/users/user.model');
const Organization = require('../../src/api/organizations/organization.model');
const { MODULES, ACTIONS } = require('../../src/utils/featureRegistry');

describe('Permission Middleware with Registry', () => {
    let testUser, token, organization;

    beforeEach(async () => {
        // Setup test user and organization
        organization = await Organization.create({
            name: 'Test Org',
            subscriptionPlanId: basicPlan._id
        });

        testUser = await User.create({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
            organizationId: organization._id,
            role: 'user'
        });

        token = generateToken(testUser);
    });

    test('should allow access with valid permission from registry', async () => {
        const response = await request(app)
            .get('/api/v1/products')
            .set('Authorization', `Bearer ${token}`);

        // Logic depends on user's actual permissions
        expect(response.status).not.toBe(401);
    });

    test('should reject access with invalid module name', async () => {
        // This would be caught by route validation
        const response = await request(app)
            .get('/api/v1/invalidModule')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404);
    });

    test('should return 403 when plan does not include module', async () => {
        // User with basic plan trying to access premium feature
        const response = await request(app)
            .get('/api/v1/live-tracking')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('PLAN_FEATURE_UNAVAILABLE');
    });
});
```

---

## 8. Summary Checklist

### Implementation Checklist

- [ ] Create `src/utils/featureRegistry.js`
- [ ] Add unit tests for registry
- [ ] Update `permission.middleware.js` with validation
- [ ] Update `subscriptionPlan.model.js` to use registry
- [ ] Update `role.model.js` to generate schema from registry
- [ ] Update `defaultPermissions.js` to use registry
- [ ] Fix approve permission usage in routes
- [ ] Create registry API endpoints
- [ ] Write migration scripts
- [ ] Update CLAUDE.md documentation
- [ ] Run full test suite
- [ ] Deploy to staging for testing

### Success Criteria

1. **Single Source of Truth**: Adding a new module only requires updating the registry
2. **Type Safety**: Constants available for all modules and actions
3. **Validation**: Invalid permissions are rejected at runtime
4. **Backward Compatibility**: Existing code continues to work
5. **Documentation**: Registry is self-documenting
6. **Test Coverage**: All registry functions tested

---

**Document Version:** 1.0
**Last Updated:** 2025-01-06
**Author:** SalesSphere Backend Team
