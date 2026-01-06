# Feature-Based Permission System (The Definitive Guide)

## Concept
We are replacing generic `view/add/update/delete` permissions with **Granular Feature Keys**.
This allows specific control per role (e.g., "Salesperson can Add Prospect but NOT Transfer Prospect").

## 1. Definitive Key Map (By Module)

### 📌 Attendance (`attendance`)
| Key | Operation |
|:---|:---|
| `viewMyAttendance` | View own records |
| `viewTeamAttendance` | View subordinates' records |
| `webCheckIn` | Check-in via Web |
| `mobileCheckIn` | Check-in via Mobile |
| `remoteCheckIn` | Check-in from anywhere (vs Office Geofence) - *Future* |
| `markHoliday` | Admin: Mark Holiday |
| `markAbsentees` | Admin: Mark Absentees |
| `biometricSync` | Enable biometric sync |

### 📌 Products (`products`)
| Key | Operation |
|:---|:---|
| `view` | View details |
| `create` | Add new product |
| `update` | Edit product |
| `delete` | Delete product |
| `bulkImport` | CSV Import |
| `bulkDelete` | Mass Delete |
| `exportPdf` | Export Product List as PDF |

### 📌 Prospects (`prospects`)
| Key | Operation |
|:---|:---|
| `view` | View prospects |
| `create` | Add new prospect |
| `update` | Edit prospect |
| `delete` | Delete prospect |
| `transfer` | Transfer Lead to Party |
| `manageCategories` | Create/Edit Categories |
| `import` | Import Prospects |

### 📌 Order Lists (`orderLists`)
| Key | Operation |
|:---|:---|
| `view` | View Orders/Invoices |
| `createEstimate` | Create Quote |
| `createInvoice` | Create Invoice |
| `convertToInvoice` | Convert Estimate -> Invoice |
| `editStatus` | Change Status (Pending -> Delivered) |
| `delete` | Delete Record |
| `bulkDelete` | Mass Delete |

### 📌 Collections (`collections`)
| Key | Operation |
|:---|:---|
| `view` | View Collections |
| `collectPayment` | Add Payment Entry |
| `verifyPayment` | Verify/Approve Payment |
| `updateChequeStatus` | Update Cheque Status |
| `delete` | Delete Entry |

### 📌 Beat Plans (`beatPlan`)
| Key | Operation |
|:---|:---|
| `view` | View Plans |
| `create` | Create Plan |
| `assign` | Assign Plan to User |
| `edit` | Edit Plan |
| `delete` | Delete Plan |
| `adhocVisits` | Allow visiting parties not in plan |

### 📌 Live Tracking (`liveTracking`)
| Key | Operation |
|:---|:---|
| `view` | View Map |
| `historyPlayback` | Replay Routes |

### 📌 Expenses (`expenses`)
| Key | Operation |
|:---|:---|
| `view` | View Expenses |
| `create` | Create Claim |
| `approve` | Approve Claim (Manager) |
| `bulkApprove` | Bulk Approve (Admin) |

### 📌 Leaves (`leaves`)
| Key | Operation |
|:---|:---|
| `view` | View Leaves |
| `apply` | Apply for Leave |
| `approve` | Approve Leave (Manager) |

### 📌 Settings & System (`settings`, `organizations`)
| Key | Operation |
|:---|:---|
| `view` | View Settings |
| `manage` | Edit Organization Settings |
| `manageUsers` | Add/Edit System Users |
| `manageRoles` | Add/Edit Roles |

---

## 2. Refactoring Steps

### Step 1: `role.model.js`
Replace generic `permissionSchema` with specific sub-schemas for **Attendance**, **Products**, **Prospects**, **Orders**, **Collections**. (Others can remain generic or use a restricted schema).

### Step 2: `orgFeature.model.js`
Create this model using the **SAME KEYS**. This ensures 1:1 mapping.

### Step 3: `defaultPermissions.js`
Update `USER_DEFAULT_PERMISSIONS` and `ADMIN_DEFAULT_PERMISSIONS` to use these new keys.

### Step 4: Middleware (`featureRegistry.middleware.js`)
Implement `checkAccess(module, featureKey)`.

### Step 5: Routes
Update all route files to use `checkAccess('products', 'exportPdf')` instead of `requirePermission('products', 'view')`.

---

## 3. Verification
- **Scenario**: Salesperson tries to Export PDF.
- **Config**: Role: `products: { exportPdf: true }`. Org: `products: { exportPdf: true }`.
- **Result**: Access Granted.
- **Config Change**: Org toggle OFF `exportPdf`.
- **Result**: Access Denied (Feature Disabled).

This completes the transition to Fine-Grained Control.
