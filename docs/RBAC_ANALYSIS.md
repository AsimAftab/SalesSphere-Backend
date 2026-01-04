# SalesSphere-Backend RBAC Analysis

## Executive Summary

This document provides a comprehensive analysis of the **SalesSphere-Backend** project's current authentication and authorization structure in preparation for implementing **Role-Based Access Control (RBAC)**.

---

## ✅ IMPLEMENTATION STATUS (Updated: 2026-01-05)

### Completed

| File | Description |
|------|-------------|
| `src/utils/defaultPermissions.js` | Default permissions for all 6 roles (23 modules) |
| `src/api/users/user.model.js` | Added `permissions` field + `getEffectivePermissions()` + `hasPermission()` |
| `src/middlewares/permission.middleware.js` | New middleware: `requirePermission`, `requireSystemRole`, etc. |
| `src/middlewares/auth.middleware.js` | Enhanced to attach `req.permissions`, re-exports permission middleware |

### Usage Examples

```javascript
// OLD way (still works - backward compatible)
router.get('/products', restrictTo('admin', 'manager'), getProducts);

// NEW way - permission-based
const { protect, requirePermission } = require('../../middlewares/auth.middleware');
router.get('/products', protect, requirePermission('products', 'read'), getProducts);
router.post('/products', protect, requirePermission('products', 'write'), createProduct);
router.delete('/products/:id', protect, requirePermission('products', 'delete'), deleteProduct);
```

### Next Steps

1. Migrate existing routes to use `requirePermission` (optional - can be gradual)
2. Add admin UI for permission management (Phase 2)
3. Implement plan-based dynamic roles (Phase 3)

---

## 1. Current Architecture Overview

### 1.1 Project Structure

```
src/
├── api/                    # API modules (20 feature areas)
│   ├── analytics/          # Sales analytics
│   ├── attendance/         # Employee attendance tracking
│   ├── auth/               # Authentication (login, register, password reset)
│   ├── beat-plans/         # Sales route planning
│   ├── collections/        # Payment collections
│   ├── common/             # Shared utilities
│   ├── dashboard/          # Dashboard data
│   ├── expense-claim/      # Employee expense claims
│   ├── invoice/            # Invoices and estimates
│   ├── leave-request/      # Leave management
│   ├── live-tracking/      # Real-time location tracking
│   ├── miscellaneous-work/ # Ad-hoc work tracking
│   ├── notes/              # Notes management
│   ├── organizations/      # Multi-tenant organization management
│   ├── parties/            # Customer/vendor management
│   ├── product/            # Product catalog
│   ├── prospect/           # Lead/prospect management
│   ├── sites/              # Site/location management
│   ├── tour-plans/         # Tour planning
│   └── users/              # User management
├── config/                 # Database configuration
├── middlewares/            # Auth, error handling middleware
└── utils/                  # Email sender, utilities
```

---

## 2. Current Role System

### 2.1 Defined Roles

The system currently defines **6 roles** in `user.model.js`:

| Role | Description | Scope |
|------|-------------|-------|
| `superadmin` | System-wide administrator | Cross-organization, no `organizationId` required |
| `developer` | System developer/support | Cross-organization, no `organizationId` required |
| `admin` | Organization administrator | Single organization |
| `manager` | Team manager | Single organization |
| `salesperson` | Field sales representative | Single organization |
| `user` | Basic user (default) | Single organization |

### 2.2 Role Hierarchy (Implied)

```
superadmin
   ├── developer
   └── admin
          └── manager
                 └── salesperson
                        └── user
```

---

## 3. Current Authentication & Authorization

### 3.1 Authentication Flow

Located in `auth.middleware.js`:

- **Hybrid Authentication**: Supports both cookies (web) and Bearer tokens (mobile)
- **JWT-based**: Uses `jsonwebtoken` for token verification
- **Refresh Token Support**: Implemented in `auth.controller.js`

### 3.2 Authorization Middleware

Two key functions in `auth.middleware.js`:

| Function | Purpose |
|----------|---------|
| `protect` | Validates JWT, attaches `req.user` |
| `restrictTo(...roles)` | Checks if user's role is in allowed list |

```javascript
// Current restrictTo implementation
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'User information missing...' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action'
      });
    }
    return next();
  };
};
```

---

## 4. Current Permission Mapping by Module

### 4.1 User Management (`/api/v1/users`)

| Endpoint | Allowed Roles | Notes |
|----------|---------------|-------|
| `GET /system-overview` | superadmin, developer | System-wide stats |
| `POST /system-user` | superadmin | Create system users |
| `GET /system-users` | superadmin | List system users |
| `POST /org-user` | superadmin, developer | Create user in any org |
| `GET/PUT /me` | All authenticated | Own profile |
| `POST /` | admin, manager | Create org users |
| `GET /` | admin, manager | List org users |
| `GET/PUT/DELETE /:id` | admin, manager | Manage org users |

### 4.2 Organization Management (`/api/v1/organizations`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `GET /my-organization` | admin, manager, superadmin |
| `GET /:id` | superadmin, developer |
| `PUT /:id` | superadmin, developer |
| `PUT /:id/deactivate` | superadmin, developer |
| `PUT /:id/reactivate` | superadmin, developer |
| `POST /:id/extend-subscription` | superadmin, developer |

### 4.3 Parties (`/api/v1/parties`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `POST /` | admin, manager, salesperson |
| `GET /` | All authenticated |
| `POST /bulk-import` | admin, manager |
| `PUT /:id` | admin, manager, salesperson |
| `DELETE /:id` | admin, manager |
| `POST /:id/image` | admin, manager, salesperson |
| `DELETE /:id/image` | admin, manager |

### 4.4 Invoices & Estimates (`/api/v1/invoices`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `POST /estimates` | admin, manager, salesperson |
| `DELETE /estimates/bulk-delete` | admin, manager |
| `DELETE /estimates/:id` | admin, manager, salesperson |
| `POST /` | admin, manager, salesperson |
| `PUT /:id/status` | admin, manager |

### 4.5 Attendance (`/api/v1/attendance`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `POST /check-in` | salesperson, manager |
| `PUT /check-out` | salesperson, manager |
| `GET /status/today` | salesperson, manager |
| `GET /search` | admin, manager, salesperson |
| `GET /report` | admin, manager |
| `PUT /admin/mark` | admin, manager |
| `POST /admin/mark-absentees` | admin |
| `POST /admin/mark-holiday` | admin, manager |

### 4.6 Beat Plans (`/api/v1/beat-plans`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `GET /salesperson` | admin, manager |
| `GET /available-directories` | admin, manager |
| `GET /data` | admin, manager |
| `GET /my-beatplans` | All authenticated |
| `POST /` | admin, manager |
| `PUT /:id` | admin, manager |
| `DELETE /:id` | admin, manager |

### 4.7 Leave Requests (`/api/v1/leave-requests`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `DELETE /bulk-delete` | admin |
| `GET /my-requests` | All authenticated |
| `GET /` | admin, manager |
| `PATCH /:id/status` | admin, manager |

### 4.8 Expense Claims (`/api/v1/expense-claims`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `POST /categories` | admin, manager |
| `PUT/DELETE /categories/:id` | admin, manager |
| `DELETE /bulk-delete` | admin, manager |
| `PUT /:id/status` | admin, manager |

### 4.9 Products (`/api/v1/products`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `POST /` | admin, manager |
| `PUT /:id` | admin, manager |
| `DELETE /:id` | admin, manager |
| `POST /bulk-delete` | admin, manager |

### 4.10 Sites (`/api/v1/sites`)

| Endpoint | Allowed Roles |
|----------|---------------|
| `POST /sub-organizations` | admin, manager |
| `POST /:id/image` | admin, manager, salesperson |
| `DELETE /:id` | admin, manager |

---

## 5. Multi-Tenancy Architecture

### 5.1 Organization Scoping

Currently implemented via `organization.model.js`:

- Every non-system user has an `organizationId`
- System users (`superadmin`, `developer`) don't require `organizationId`
- Organization includes settings like timezone, check-in/out times, weekly off day

### 5.2 Data Isolation Pattern

Most controllers filter data by `organizationId`:
```javascript
// Example from controllers
const data = await Model.find({ organizationId: req.user.organizationId });
```

---

## 6. Identified Gaps & Improvement Areas

### 6.1 Current Limitations

| Gap | Description | Impact |
|-----|-------------|--------|
| **No Granular Permissions** | Only role-based, no action-based permissions | Can't give partial access |
| **No Permission Inheritance** | Each endpoint manually specifies roles | Maintenance overhead |
| **No Custom Roles** | Fixed 6 roles hardcoded | Inflexible for different organizations |
| **No Resource-Level Permissions** | Can't restrict to specific records | Privacy concerns |
| **Inconsistent Ownership Checks** | Some routes check ownership, some don't | Security risk |
| **No Permission Groups** | Can't bundle permissions | Complex role management |
| **No Audit Trail** | No logging of permission checks | Compliance issues |

### 6.2 Routes Without Role Restrictions

Several endpoints only use `protect` without `restrictTo`:

- Most `GET` operations on lists (parties, invoices, etc.)
- `GET /:id` operations
- Some create/update operations rely on implicit organization scoping

---

## 7. Recommendations for RBAC Implementation

### 7.1 Approach Options

| Approach | Complexity | Flexibility | Recommendation |
|----------|------------|-------------|----------------|
| **A. Enhanced Role Middleware** | Low | Medium | Good for quick wins |
| **B. Permission-Based System** | Medium | High | Best balance |
| **C. Full ABAC (Attribute-Based)** | High | Very High | Overkill for current needs |

### 7.2 Suggested Permission Categories

```
users:create, users:read, users:update, users:delete
parties:create, parties:read, parties:update, parties:delete
invoices:create, invoices:read, invoices:update, invoices:delete
attendance:mark, attendance:view, attendance:admin
reports:view, reports:export
settings:read, settings:update
```

### 7.3 Proposed New Models

1. **Permission Model** - Define granular permissions
2. **Role Model** - Dynamic roles with permission arrays
3. **RoleAssignment Model** - User-role mappings (optional for complex scenarios)

### 7.4 Migration Strategy

1. **Phase 1**: Add Permission model, maintain backward compatibility
2. **Phase 2**: Create enhanced `restrictTo` with permission support
3. **Phase 3**: Migrate routes incrementally
4. **Phase 4**: Add admin UI for role/permission management

---

## 8. Files to Modify

### Core Files

| File | Change |
|------|--------|
| `src/api/users/user.model.js` | Add permissions array or role reference |
| `src/middlewares/auth.middleware.js` | Enhance `restrictTo` for permissions |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/api/rbac/permission.model.js` | Permission definitions |
| `src/api/rbac/role.model.js` | Dynamic role definitions |
| `src/api/rbac/rbac.controller.js` | Permission/role CRUD |
| `src/api/rbac/rbac.route.js` | Admin endpoints |
| `src/middlewares/permission.middleware.js` | Permission check middleware |

### Route Files to Update (15+)

All route files using `restrictTo` will need updates if switching to permission-based system.

---

## 9. Next Steps

1. **Decide on RBAC approach** (Enhanced roles vs. Permission-based)
2. **Define permission taxonomy** for all modules
3. **Create implementation plan** with migration steps
4. **Design seed data** for default roles/permissions
5. **Plan admin UI** for role management

---

## 10. Questions for Stakeholder

1. Do you need **dynamic role creation** by organization admins?
2. Should permissions be **inheritable** (e.g., manager inherits salesperson permissions)?
3. Do you need **resource-level permissions** (e.g., salesperson sees only their invoices)?
4. Should there be an **admin UI** for managing roles/permissions?
5. Is **audit logging** of permission changes required?
6. Are there specific **compliance requirements** (SOC2, GDPR) to consider?

---

*Analysis completed on: 2026-01-05*
