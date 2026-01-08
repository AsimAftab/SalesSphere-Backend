# Entity Assignment Feature Design Document

## Feature: Party, Sites, Prospects Mapping (Data Access Control)

### 1. Overview

This feature allows organizations to assign specific parties, prospects, and sites to individual users (e.g., salespersons). Users will only see and interact with entities they are assigned to, reducing cognitive overload and improving data security.

**Business Scenario:**
- Organization has 400+ parties in the system
- A salesperson should only see/interact with their assigned 5-10 parties
- Admin can control data access per user without changing role/hierarchy

---

## 2. Current State Analysis

### Existing Models

| Model | File Path | Current Filter | Key Fields |
|-------|-----------|----------------|------------|
| Party | `src/api/parties/party.model.js` | `createdBy` + hierarchy | organizationId, createdBy |
| Prospect | `src/api/prospect/prospect.model.js` | `createdBy` + hierarchy | organizationId, createdBy |
| Site | `src/api/sites/sites.model.js` | `createdBy` + hierarchy | organizationId, createdBy |
| User | `src/api/users/user.model.js` | N/A | organizationId, reportsTo, customRoleId |

### Current Filtering Logic

The system uses **hierarchy-based filtering** via `getHierarchyFilter()` in `src/utils/hierarchyHelper.js`:

```javascript
// Current Logic:
1. System roles (superadmin, developer) → No filter (see all)
2. Admin → No filter within org (see all)
3. Manager with viewTeam feature → See self + all subordinates' data
4. Regular user → See only own created data
```

**Limitation:** No way to assign data created by others to a user without supervisor relationship.

### Existing Assignment Pattern

The system already uses assignment patterns in **Beat Plans**:

```javascript
// src/api/beat-plans/beat-plan.model.js
const beatPlanSchema = new mongoose.Schema({
  employees: [{ type: ObjectId, ref: 'User' }],
  parties: [{ type: ObjectId, ref: 'Party' }],
  sites: [{ type: ObjectId, ref: 'Site' }],
  prospects: [{ type: ObjectId, ref: 'Prospect' }],
});
```

This confirms the architectural pattern for assignments.

---

## 3. Proposed Architecture

### Design Approach: Forward Assignment on Entity Models

Add `assignedUsers` array to Party, Prospect, and Site models.

**Why this approach:**
- Consistent with existing beat-plan pattern
- Efficient queries (no $lookup aggregation)
- Direct relationship between entity and assigned users
- Easy to extend to future entity types

### Data Access Logic

The new filtering logic will work in **conjunction** with existing hierarchy:

```
Visible Entities = (Created By Self) OR (Created By Subordinates) OR (Assigned To Me)
```

**Priority:**
1. System roles & Admins: See all (bypass assignment)
2. Users with `viewTeam` feature: See self + subordinates + assigned
3. Regular users: See self + assigned only

---

## 4. Database Schema Changes

### 4.1 Party Model Update

**File:** `src/api/parties/party.model.js`

```javascript
const partySchema = new mongoose.Schema({
  // ... existing fields ...
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }], // NEW: Users assigned to this party
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }, // NEW: Who made the assignment
  assignedAt: {
    type: Date,
    default: Date.now
  }, // NEW: When assignment was made
});

// Index for efficient queries
partySchema.index({ organizationId: 1, assignedUsers: 1 });
```

### 4.2 Prospect Model Update

**File:** `src/api/prospect/prospect.model.js`

```javascript
const prospectSchema = new mongoose.Schema({
  // ... existing fields ...
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
});

// Index for efficient queries
prospectSchema.index({ organizationId: 1, assignedUsers: 1 });
```

### 4.3 Site Model Update

**File:** `src/api/sites/sites.model.js`

```javascript
const siteSchema = new mongoose.Schema({
  // ... existing fields ...
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
});

// Index for efficient queries
siteSchema.index({ organizationId: 1, assignedUsers: 1 });
```

---

## 5. Feature Registry Updates

**File:** `src/config/featureRegistry.js`

Add new feature keys for assignment operations:

```javascript
parties: {
  // ... existing features ...
  assign: 'Assign parties to users',
  viewAssigned: 'View parties assigned to me',
},

prospects: {
  // ... existing features ...
  assign: 'Assign prospects to users',
  viewAssigned: 'View prospects assigned to me',
},

sites: {
  // ... existing features ...
  // 'assign' already exists, add:
  viewAssigned: 'View sites assigned to me',
},
```

---

## 6. Default Permissions Update

**File:** `src/utils/defaultPermissions.js`

```javascript
// SUPERADMIN - All access
const SUPERADMIN_GRANULAR_PERMISSIONS = {
  parties: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
  prospects: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
  sites: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
};

// DEVELOPER - All except delete
const DEVELOPER_GRANULAR_PERMISSIONS = {
  parties: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
  prospects: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
  sites: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
};

// ADMIN - All org features
const ADMIN_GRANULAR_PERMISSIONS = {
  parties: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
  prospects: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
  sites: {
    // ... existing ...
    assign: true,
    viewAssigned: true,
  },
};

// USER - Limited access
const USER_GRANULAR_PERMISSIONS = {
  parties: {
    // ... existing ...
    assign: false,
    viewAssigned: true,  // Users can see their assigned parties
  },
  prospects: {
    // ... existing ...
    assign: false,
    viewAssigned: true,
  },
  sites: {
    // ... existing ...
    assign: false,
    viewAssigned: true,
  },
};
```

---

## 7. Hierarchy Helper Updates

**File:** `src/utils/hierarchyHelper.js`

Add new function to combine hierarchy + assignment filters:

```javascript
/**
 * Get combined filter for entity access (hierarchy + assignment)
 * @param {Object} user - User object
 * @param {String} moduleName - Module name (parties, prospects, sites)
 * @param {String} teamViewFeature - Feature key for team view (e.g., 'viewTeamParties')
 * @returns {Object} MongoDB filter object
 */
exports.getEntityAccessFilter = async (user, moduleName, teamViewFeature) => {
  const { role, _id: userId } = user;

  // 1. System roles: All data
  if (isSystemRole(role)) {
    return {};
  }

  // 2. Admin: All org data
  if (role === 'admin') {
    return {};
  }

  const filterConditions = [];

  // 3. Always see own created data
  filterConditions.push({ createdBy: userId });

  // 4. If has team view feature: see subordinates' data
  if (user.hasFeature(moduleName, teamViewFeature)) {
    const subordinateIds = await getAllSubordinateIds(userId, user.organizationId);
    if (subordinateIds.length > 0) {
      filterConditions.push({ createdBy: { $in: subordinateIds } });
    }
  }

  // 5. Always see assigned data (regardless of hierarchy)
  filterConditions.push({ assignedUsers: userId });

  // Combine with $or
  return { $or: filterConditions };
};

/**
 * Helper to get all subordinate IDs recursively
 */
const getAllSubordinateIds = async (userId, organizationId) => {
  const subordinates = await User.find({
    organizationId,
    reportsTo: userId,
    isActive: true
  }).select('_id').lean();

  const ids = subordinates.map(s => s._id);
  // Recursively get nested subordinates (up to 20 levels)
  for (const subId of ids) {
    const nestedIds = await getAllSubordinateIds(subId, organizationId);
    ids.push(...nestedIds);
  }
  return [...new Set(ids)]; // Dedupe
};
```

---

## 8. API Design

### 8.1 Assignment Routes

#### Party Assignment Routes

**File:** `src/api/parties/party.routes.js`

```javascript
const {
  assignUsersToParty,
  removeUserFromParty,
  getPartyAssignments,
  getMyAssignedParties
} = require('./party.controller');

// Assign user(s) to party
router.post('/:id/assign',
    checkAccess('parties', 'assign'),
    assignUsersToParty
);

// Remove user assignment from party
router.delete('/:id/assign/:userId',
    checkAccess('parties', 'assign'),
    removeUserFromParty
);

// Get all users assigned to a party
router.get('/:id/assignments',
    checkAccess('parties', 'viewDetails'),
    getPartyAssignments
);

// Get parties assigned to current user
router.get('/my-assigned',
    checkAccess('parties', 'viewAssigned'),
    getMyAssignedParties
);
```

#### Prospect Assignment Routes

**File:** `src/api/prospect/prospect.route.js`

```javascript
const {
  assignUsersToProspect,
  removeUserFromProspect,
  getProspectAssignments,
  getMyAssignedProspects
} = require('./prospect.controller');

router.post('/:id/assign',
    checkAccess('prospects', 'assign'),
    assignUsersToProspect
);

router.delete('/:id/assign/:userId',
    checkAccess('prospects', 'assign'),
    removeUserFromProspect
);

router.get('/:id/assignments',
    checkAccess('prospects', 'viewDetails'),
    getProspectAssignments
);

router.get('/my-assigned',
    checkAccess('prospects', 'viewAssigned'),
    getMyAssignedProspects
);
```

#### Site Assignment Routes

**File:** `src/api/sites/sites.route.js`

```javascript
const {
  assignUsersToSite,
  removeUserFromSite,
  getSiteAssignments,
  getMyAssignedSites
} = require('./sites.controller');

router.post('/:id/assign',
    checkAccess('sites', 'assign'),
    assignUsersToSite
);

router.delete('/:id/assign/:userId',
    checkAccess('sites', 'assign'),
    removeUserFromSite
);

router.get('/:id/assignments',
    checkAccess('sites', 'viewDetails'),
    getSiteAssignments
);

router.get('/my-assigned',
    checkAccess('sites', 'viewAssigned'),
    getMyAssignedSites
);
```

### 8.2 Controller Implementation Examples

**File:** `src/api/parties/party.controller.js`

```javascript
/**
 * Assign user(s) to a party
 * POST /api/v1/parties/:id/assign
 * Body: { userIds: string[] }
 */
exports.assignUsersToParty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    // Validate input
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'userIds must be a non-empty array'
      });
    }

    // Find party
    const party = await Party.findOne({
      _id: id,
      organizationId: req.user.organizationId
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: 'Party not found'
      });
    }

    // Validate users belong to same org
    const User = require('../users/user.model');
    const users = await User.find({
      _id: { $in: userIds },
      organizationId: req.user.organizationId,
      isActive: true
    });

    if (users.length !== userIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more users not found or inactive'
      });
    }

    // Add users to assignedUsers array (avoid duplicates)
    const currentAssignedIds = party.assignedUsers.map(id => id.toString());
    const newAssignments = userIds.filter(id =>
      !currentAssignedIds.includes(id.toString())
    );

    if (newAssignments.length > 0) {
      party.assignedUsers.push(...newAssignments);
      party.assignedBy = req.user._id;
      party.assignedAt = new Date();
      await party.save();
    }

    res.status(200).json({
      success: true,
      message: `${newAssignments.length} user(s) assigned to party`,
      data: {
        partyId: party._id,
        assignedUsers: party.assignedUsers
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove user assignment from party
 * DELETE /api/v1/parties/:id/assign/:userId
 */
exports.removeUserFromParty = async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    const party = await Party.findOne({
      _id: id,
      organizationId: req.user.organizationId
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: 'Party not found'
      });
    }

    // Remove user from assignedUsers array
    party.assignedUsers = party.assignedUsers.filter(
      id => id.toString() !== userId
    );
    await party.save();

    res.status(200).json({
      success: true,
      message: 'User assignment removed',
      data: {
        partyId: party._id,
        assignedUsers: party.assignedUsers
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users assigned to a party
 * GET /api/v1/parties/:id/assignments
 */
exports.getPartyAssignments = async (req, res, next) => {
  try {
    const { id } = req.params;

    const party = await Party.findOne({
      _id: id,
      organizationId: req.user.organizationId
    }).populate('assignedUsers', 'name email role')
      .populate('assignedBy', 'name email');

    if (!party) {
      return res.status(404).json({
        success: false,
        message: 'Party not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        partyId: party._id,
        partyName: party.partyName,
        assignedUsers: party.assignedUsers,
        assignedBy: party.assignedBy,
        assignedAt: party.assignedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get parties assigned to current user
 * GET /api/v1/parties/my-assigned
 */
exports.getMyAssignedParties = async (req, res, next) => {
  try {
    const { getEntityAccessFilter } = require('../../utils/hierarchyHelper');

    const accessFilter = await getEntityAccessFilter(
      req.user,
      'parties',
      'viewTeamParties'
    );

    const parties = await Party.find({
      organizationId: req.user.organizationId,
      ...accessFilter
    }).populate('assignedBy', 'name email');

    res.status(200).json({
      success: true,
      count: parties.length,
      data: parties
    });
  } catch (error) {
    next(error);
  }
};
```

---

## 9. Update Existing Controllers

Update existing `getAll*` functions to use new `getEntityAccessFilter`:

### Example: Party Controller

**File:** `src/api/parties/party.controller.js`

```javascript
// BEFORE:
exports.getAllParties = async (req, res, next) => {
  try {
    const hierarchyFilter = await getHierarchyFilter(req.user, 'parties', 'viewTeamParties');
    const parties = await Party.find({
      organizationId: req.user.organizationId,
      ...hierarchyFilter
    });
    // ...
  }
};

// AFTER:
exports.getAllParties = async (req, res, next) => {
  try {
    const { getEntityAccessFilter } = require('../../utils/hierarchyHelper');

    const accessFilter = await getEntityAccessFilter(
      req.user,
      'parties',
      'viewTeamParties'
    );

    const parties = await Party.find({
      organizationId: req.user.organizationId,
      ...accessFilter
    });
    // ...
  }
};
```

**Same updates needed for:**
- `src/api/prospect/prospect.controller.js` - `getAllProspects()`
- `src/api/sites/sites.controller.js` - `getAllSites()`
- All detail, update, delete operations

---

## 10. Route Ordering Fixes

**Important:** When adding new routes, ensure specific routes come before wildcard `/:id` routes.

**Correct order example:**
```javascript
// Specific routes FIRST (before /:id wildcard)
router.get('/my-assigned', ...);        // Must be before /:id
router.post('/:id/assign', ...);        // Specific action

// Then wildcard routes
router.get('/:id', ...);                // Must be AFTER specific routes
router.put('/:id', ...);
router.delete('/:id', ...);
```

---

## 11. Implementation Checklist

### Phase 1: Database & Foundation
- [ ] Update `party.model.js` - Add `assignedUsers`, `assignedBy`, `assignedAt`
- [ ] Update `prospect.model.js` - Add `assignedUsers`, `assignedBy`, `assignedAt`
- [ ] Update `sites.model.js` - Add `assignedUsers`, `assignedBy`, `assignedAt`
- [ ] Create migration script for existing data (optional)

### Phase 2: Permissions & Features
- [ ] Update `src/config/featureRegistry.js` - Add `assign`, `viewAssigned` features
- [ ] Update `src/utils/defaultPermissions.js` - Add permissions for all roles
- [ ] Add `getEntityAccessFilter()` to `src/utils/hierarchyHelper.js`

### Phase 3: Controllers
- [ ] Update `party.controller.js`:
  - [ ] Add `assignUsersToParty()`
  - [ ] Add `removeUserFromParty()`
  - [ ] Add `getPartyAssignments()`
  - [ ] Add `getMyAssignedParties()`
  - [ ] Update `getAllParties()` to use new filter
  - [ ] Update `getPartyById()` to use new filter

- [ ] Update `prospect.controller.js`:
  - [ ] Add assignment functions (same as party)
  - [ ] Update existing functions to use new filter

- [ ] Update `sites.controller.js`:
  - [ ] Add assignment functions (same as party)
  - [ ] Update existing functions to use new filter

### Phase 4: Routes
- [ ] Update `party.routes.js`:
  - [ ] Add assignment routes (specific routes BEFORE `/:id`)

- [ ] Update `prospect.route.js`:
  - [ ] Add assignment routes

- [ ] Update `sites.route.js`:
  - [ ] Add assignment routes

### Phase 5: Testing
- [ ] Test assignment operations (assign/remove)
- [ ] Test data visibility for different user roles
- [ ] Test with team view permission
- [ ] Test edge cases (unassign, inactive users, org isolation)

---

## 12. API Response Examples

### Assign Users to Party

**Request:**
```
POST /api/v1/parties/507f1f77bcf86cd799439011/assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "userIds": ["507f191e810c19729de860ea", "507f191e810c19729de860eb"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "2 user(s) assigned to party",
  "data": {
    "partyId": "507f1f77bcf86cd799439011",
    "assignedUsers": [
      "507f191e810c19729de860ea",
      "507f191e810c19729de860eb"
    ]
  }
}
```

### Get Party Assignments

**Request:**
```
GET /api/v1/parties/507f1f77bcf86cd799439011/assignments
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "partyId": "507f1f77bcf86cd799439011",
    "partyName": "ABC Distributors",
    "assignedUsers": [
      {
        "_id": "507f191e810c19729de860ea",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user"
      },
      {
        "_id": "507f191e810c19729de860eb",
        "name": "Jane Smith",
        "email": "jane@example.com",
        "role": "user"
      }
    ],
    "assignedBy": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Admin User",
      "email": "admin@example.com"
    },
    "assignedAt": "2025-01-08T10:30:00.000Z"
  }
}
```

---

## 13. Security Considerations

1. **Organization Isolation:** Always validate `organizationId` matches
2. **User Validation:** Only assign active users from same organization
3. **Permission Checks:** Use `checkAccess()` middleware for all routes
4. **Audit Trail:** Track who assigned what (`assignedBy`, `assignedAt`)
5. **No Self-Assignment Prevention:** Allow users to assign to themselves if needed

---

## 14. Future Enhancements

- **Bulk Assignment:** UI to select multiple parties and assign to multiple users at once
- **Assignment Expiry:** Add `assignedUntil` date for temporary assignments
- **Assignment Groups:** Create "territories" or "regions" for batch assignment
- **Assignment Notifications:** Notify users when new entities are assigned
- **Assignment Analytics:** Report on assignment distribution and usage
