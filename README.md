# SalesSphere Backend

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-v14+-green.svg)
![Express](https://img.shields.io/badge/Express-5.1.0-blue.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-6.20.0-green.svg)
![License](https://img.shields.io/badge/License-ISC-blue.svg)

**A comprehensive, enterprise-grade sales and field force management system**

</div>

## 🌟 Overview

SalesSphere Backend is a powerful, scalable Node.js API built for modern sales organizations. It provides comprehensive features for managing field operations, sales teams, customer relationships, inventory, and analytics with advanced role-based access control (RBAC) and subscription-based feature gating.

### Key Highlights

- 🔐 **Advanced Security**: JWT authentication, CSRF protection, rate limiting, and Helmet security headers
- 👥 **Granular RBAC**: Feature-level permissions with hierarchical role management
- 📊 **Comprehensive Modules**: 20+ business modules covering the entire sales lifecycle
- 🚀 **Real-time Tracking**: WebSocket-based live location tracking for field teams
- 📱 **Multi-platform**: Support for both web and mobile clients with different authentication strategies
- 🎯 **Subscription-Based**: Flexible subscription plans with module-level feature control
- 📈 **Scalable Architecture**: Built for performance with MongoDB, compression, and optimized queries

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Project Structure](#project-structure)
- [Features & Modules](#features--modules)
- [API Documentation](#api-documentation)
- [Authentication & Authorization](#authentication--authorization)
- [Security Features](#security-features)
- [WebSocket Features](#websocket-features)
- [Database Schema](#database-schema)
- [Technologies Used](#technologies-used)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **MongoDB** - Either:
  - MongoDB installed locally, or
  - MongoDB Atlas account (cloud database) - [Sign up here](https://www.mongodb.com/cloud/atlas)
- **Git** - [Download here](https://git-scm.com/)

## 📦 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/AsimAftab/SalesSphere-Backend.git
cd SalesSphere-Backend
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- **express** - Web framework
- **mongoose** - MongoDB ODM
- **jsonwebtoken** - JWT authentication
- **bcryptjs** - Password hashing
- **helmet** - Security headers
- **cors** - Cross-origin resource sharing
- **socket.io** - Real-time WebSocket communication
- **multer** - File uploads
- **cloudinary** - Image storage
- **nodemailer** - Email notifications
- **swagger-ui-express** - API documentation
- **zod** - Schema validation
- And more...

## 🔐 Environment Variables

Create a `.env` file in the root directory:

```bash
touch .env
```

Add the following configuration:

```env
# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=5000
NODE_ENV=development  # Options: development, staging, production, local_development

# ============================================
# DATABASE CONFIGURATION
# ============================================
# Local MongoDB (for local_development)
MONGO_URI_LOCAL=mongodb://localhost:27017/salessphere

# MongoDB Atlas (Cloud - for development/staging/production)
MONGO_URI_CLOUD=mongodb+srv://<username>:<password>@cluster.mongodb.net/salessphere?retryWrites=true&w=majority

# ============================================
# JWT & AUTHENTICATION
# ============================================
# Access Token (short-lived)
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=15m
JWT_COOKIE_EXPIRES_IN=15

# Refresh Token (long-lived)
JWT_REFRESH_SECRET=your_super_secret_refresh_key_different_from_jwt_secret
JWT_REFRESH_EXPIRES_IN=7d

# Session Configuration
MAX_SESSION_DURATION_DAYS=30

# ============================================
# CSRF PROTECTION
# ============================================
CSRF_SECRET=your_csrf_secret_key_make_it_different_from_jwt_secret

# ============================================
# CORS CONFIGURATION (Optional)
# ============================================
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com,https://app.yourdomain.com

# ============================================
# FILE UPLOAD & STORAGE (Optional)
# ============================================
# Cloudinary Configuration (for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ============================================
# EMAIL CONFIGURATION (Optional)
# ============================================
# For password reset and notifications
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@salessphere.com

# Alternative: Using Resend
RESEND_API_KEY=your_resend_api_key
```

### Environment Configuration Guide

| Environment | `NODE_ENV` Value | Database | Use Case |
|------------|------------------|----------|----------|
| **Local Development** | `local_development` | Local MongoDB | Development on local machine |
| **Cloud Development** | `development` | MongoDB Atlas | Development with cloud database |
| **Staging** | `staging` | MongoDB Atlas | Testing before production |
| **Production** | `production` | MongoDB Atlas | Live production environment |

### Important Security Notes

- ✅ Generate strong, unique secrets for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `CSRF_SECRET`
- ✅ Never commit `.env` file to version control
- ✅ Use different secrets for each environment
- ✅ Rotate secrets periodically in production
- ✅ Use environment-specific MongoDB credentials

## 🚀 Running the Project

### Development Mode (with auto-restart)

```bash
npm run dev
```

This starts the server in development mode using MongoDB Atlas (cloud database). The server automatically restarts when you make code changes.

### Local Development Mode

```bash
npm run dev:local
```

Uses your local MongoDB instance. Ensure MongoDB is running on your machine.

### Staging Mode

```bash
npm run stage
```

Runs the server in staging mode for pre-production testing.

### Production Mode

```bash
npm start
```

Starts the server in production mode with optimized settings.

### First-Time Setup

After starting the server for the first time:

1. **Verify MongoDB Connection**
   ```bash
   # The server will log:
   # "MongoDB Connected in <environment> mode..."
   ```

2. **Check Server Health**
   ```bash
   curl http://localhost:5000/health
   ```
   
   Expected response:
   ```json
   {
     "status": "OK",
     "uptime": 123.456,
     "timestamp": "2026-01-08T18:00:00.000Z",
     "environment": "development",
     "services": {
       "api": "operational",
       "database": "operational"
     },
     "memory": {
       "rss": "50.23 MB",
       "heapUsed": "30.45 MB"
     }
   }
   ```

3. **Create First Superadmin** (one-time setup)
   ```bash
   POST /api/v1/auth/register/superadmin
   ```

4. **Access API**
   - API Base URL: `http://localhost:5000`
   - Health Check: `http://localhost:5000/health`
   - API Version: `http://localhost:5000/api/v1`

### Local MongoDB Setup

If using local MongoDB:

**macOS (with Homebrew):**
```bash
brew services start mongodb-community
```

**Ubuntu/Debian:**
```bash
sudo systemctl start mongod
sudo systemctl enable mongod  # Auto-start on boot
```

**Windows:**
- Start MongoDB as a Windows service, or
- Run `mongod.exe` from the MongoDB installation directory

## 📂 Project Structure

```
SalesSphere-Backend/
├── src/
│   ├── api/                          # API modules (business logic)
│   │   ├── analytics/               # Advanced analytics and reporting
│   │   ├── attendance/              # Employee attendance tracking
│   │   ├── auth/                    # Authentication & authorization
│   │   ├── beat-plans/              # Route planning and execution
│   │   │   └── tracking/            # Beat plan tracking with WebSocket
│   │   ├── collections/             # Payment collection management
│   │   ├── common/                  # Shared resources (banks, etc.)
│   │   ├── dashboard/               # Dashboard analytics
│   │   ├── expense-claim/           # Expense claims and reimbursement
│   │   ├── invoice/                 # Invoice/order management
│   │   ├── leave-request/           # Leave request management
│   │   ├── live-tracking/           # Real-time GPS tracking
│   │   │   └── map-territory-view/  # Map visualization
│   │   ├── miscellaneous-work/      # Miscellaneous work tracking
│   │   ├── notes/                   # Notes and reminders
│   │   ├── organizations/           # Organization management
│   │   ├── parties/                 # Customer/client management
│   │   ├── product/                 # Product inventory
│   │   │   └── category/            # Product categories
│   │   ├── prospect/                # Lead/prospect management
│   │   ├── roles/                   # Role-based access control
│   │   ├── sites/                   # Site/location management
│   │   ├── subscriptions/           # Subscription plan management
│   │   ├── tour-plans/              # Tour planning and scheduling
│   │   └── users/                   # User management
│   │
│   ├── config/                      # Configuration files
│   │   ├── config.js                # Database connection
│   │   └── featureRegistry.js       # Feature/permission registry
│   │
│   ├── middlewares/                 # Express middlewares
│   │   ├── auth.middleware.js       # JWT authentication
│   │   ├── permission.middleware.js # Permission checking
│   │   ├── plan.middleware.js       # Subscription plan validation
│   │   ├── compositeAccess.middleware.js # Combined access control
│   │   ├── error.handler.js         # Global error handling
│   │   ├── multerError.middleware.js # File upload error handling
│   │   └── featureRegistry.middleware.js # Feature validation
│   │
│   └── utils/                       # Utility functions
│       ├── defaultPermissions.js    # Default role permissions
│       ├── seedSubscriptionPlans.js # Subscription plan seeding
│       └── [other utilities]        # Helper functions
│
├── docs/                            # Documentation
│   ├── FEATURE_REGISTRY.md         # Feature registry guide
│   ├── GRANULAR_FEATURE_REGISTRY.md # Granular permissions guide
│   ├── GRANULAR_PERMISSIONS_IMPLEMENTATION.md
│   └── RBAC_ANALYSIS.md            # RBAC analysis
│
├── scripts/                         # Utility scripts
│   └── fix_subscription_modules.js  # Migration scripts
│
├── app.js                           # Express app configuration
├── server.js                        # Server entry point
├── package.json                     # Dependencies and scripts
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore rules
└── README.md                        # This file
```

### Module Organization

Each API module follows a consistent structure:

```
module-name/
├── module.model.js      # Mongoose schema/model
├── module.controller.js # Business logic
├── module.route.js      # Express routes
└── module.validation.js # Input validation (optional)
```

## ✨ Features & Modules

SalesSphere Backend provides 20+ comprehensive modules covering the entire sales and field force management lifecycle:

### 🏢 Core Business Modules

#### 1. **Dashboard & Analytics**
- Real-time business metrics and KPIs
- Sales performance analytics
- Team productivity insights
- Customizable dashboard widgets
- Visual charts and graphs

#### 2. **Attendance Management**
- Web and mobile check-in/check-out
- Geofencing support
- Team attendance tracking
- Holiday management
- Manual attendance updates
- Export to PDF/Excel

#### 3. **Products & Inventory**
- Product catalog management
- Category organization
- Bulk upload/delete
- Price and stock management
- Product images and descriptions
- Export capabilities

#### 4. **Parties (Customers/Clients)**
- Customer database management
- Contact information
- Transaction history
- Category and segmentation
- Geolocation tagging
- Image uploads

#### 5. **Prospects (Leads)**
- Lead tracking and management
- Prospect categorization
- Interest tracking
- Convert prospects to parties
- Team prospect visibility
- Import/export capabilities

#### 6. **Invoices & Orders**
- Invoice generation
- Order status tracking
- Team invoice visibility
- Party statistics
- Bulk operations
- PDF/Excel export

#### 7. **Estimates & Quotes**
- Create price estimates
- Convert estimates to invoices
- Detailed item breakdown
- Export to PDF
- Bulk management

#### 8. **Collections & Payments**
- Payment collection tracking
- Cheque management
- Payment verification
- Team collection visibility
- Status updates

### 📍 Field Operations

#### 9. **Beat Plans**
- Route planning and optimization
- Party visit scheduling
- Real-time execution tracking
- Distance calculation
- Visit marking
- Team beat plan management

#### 10. **Tour Plans**
- Multi-day tour scheduling
- Itinerary management
- Approval workflows
- Status tracking
- Export capabilities

#### 11. **Live Tracking**
- Real-time GPS location tracking
- WebSocket-based updates
- Route playback
- Active session monitoring
- Location history
- Territory visualization

#### 12. **Sites Management**
- Site/location database
- Geolocation mapping
- Site categorization
- Image uploads
- Site details tracking

### 💼 Administrative Modules

#### 13. **Expense Claims**
- Expense submission
- Receipt uploads
- Approval workflows
- Category management
- Reimbursement tracking
- Export to Excel/PDF

#### 14. **Leave Requests**
- Leave application
- Multi-level approval
- Team leave visibility
- Leave balance tracking
- Status management
- Export capabilities

#### 15. **Employees**
- Employee database
- Profile management
- Document uploads
- Supervisor assignment
- Attendance history
- Export functionality

#### 16. **Notes & Reminders**
- Create and manage notes
- Task reminders
- Team collaboration
- Priority management

#### 17. **Miscellaneous Work**
- Track ad-hoc tasks
- Work categorization
- Time tracking
- Export capabilities

### 🔧 System & Configuration

#### 18. **Organizations**
- Multi-tenant support
- Organization settings
- Subscription management
- Custom branding

#### 19. **User Management**
- User CRUD operations
- Role assignment
- Profile management
- Access control
- Mobile/Web access control

#### 20. **Roles & Permissions**
- Custom role creation
- Granular permissions (100+ features)
- Feature-level access control
- Hierarchical permissions
- Permission templates

#### 21. **Subscriptions**
- Multiple subscription tiers
- Feature-based plans
- Module enablement
- Trial and paid plans
- Custom enterprise plans

#### 22. **Settings**
- Organization configuration
- User preferences
- System parameters
- Integration settings

### 🔐 Cross-Cutting Features

- **Multi-level Approvals**: Hierarchical approval workflows for leaves, expenses, and tour plans
- **Hierarchical Data Access**: View own, team, or organization-wide data based on role
- **Bulk Operations**: Mass import, export, and delete operations
- **Document Management**: Upload and manage images, PDFs, and documents
- **Export Capabilities**: PDF and Excel export for most modules
- **Audit Trails**: Track changes and user actions
- **Data Validation**: Comprehensive input validation using Zod
- **Error Handling**: Centralized error management

## 🔌 API Documentation

### Base URL

```
http://localhost:5000/api/v1
```

### API Structure

All API endpoints follow RESTful conventions and are versioned under `/api/v1`.

### Core Endpoints

#### Health Check
```http
GET /health
```
Returns server health status, uptime, and database connectivity.

#### CSRF Token (Web Clients Only)
```http
GET /api/v1/csrf-token
```
Returns CSRF token for web clients. Mobile clients using Bearer tokens don't need this.

### Authentication Endpoints

#### Register Organization (Superadmin Only)
```http
POST /api/v1/auth/register
Authorization: Bearer <superadmin_token>
```

#### Register Superadmin (First-time Setup)
```http
POST /api/v1/auth/register/superadmin
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Refresh Token
```http
POST /api/v1/auth/refresh
Cookie: refreshToken=<refresh_token>
```

#### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer <access_token>
```

#### Forgot Password
```http
POST /api/v1/auth/forgotpassword
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Reset Password
```http
PATCH /api/v1/auth/resetpassword/:token
Content-Type: application/json

{
  "password": "newPassword123"
}
```

### Module Endpoints Pattern

Most modules follow this standard RESTful pattern:

```http
# List all resources
GET /api/v1/{module}
Authorization: Bearer <token>

# Get specific resource
GET /api/v1/{module}/:id
Authorization: Bearer <token>

# Create new resource
POST /api/v1/{module}
Authorization: Bearer <token>
Content-Type: application/json

# Update resource
PATCH /api/v1/{module}/:id
Authorization: Bearer <token>
Content-Type: application/json

# Delete resource
DELETE /api/v1/{module}/:id
Authorization: Bearer <token>
```

### Module-Specific Endpoints

#### Products
- `GET /api/v1/products` - List all products
- `GET /api/v1/products/:id` - Get product details
- `POST /api/v1/products` - Create product
- `PATCH /api/v1/products/:id` - Update product
- `DELETE /api/v1/products/:id` - Delete product
- `GET /api/v1/categories` - List categories
- `POST /api/v1/categories` - Create category

#### Parties (Customers)
- `GET /api/v1/parties` - List all parties
- `GET /api/v1/parties/:id` - Get party details
- `POST /api/v1/parties` - Create party
- `PATCH /api/v1/parties/:id` - Update party
- `DELETE /api/v1/parties/:id` - Delete party

#### Attendance
- `GET /api/v1/attendance` - List attendance records
- `POST /api/v1/attendance/checkin` - Check in
- `POST /api/v1/attendance/checkout` - Check out
- `PATCH /api/v1/attendance/:id` - Update attendance
- `GET /api/v1/attendance/my` - Get my attendance

#### Beat Plans
- `GET /api/v1/beat-plans` - List beat plans
- `GET /api/v1/beat-plans/:id` - Get beat plan details
- `POST /api/v1/beat-plans` - Create beat plan
- `PATCH /api/v1/beat-plans/:id` - Update beat plan
- `POST /api/v1/beat-plans/:id/start` - Start execution
- `PATCH /api/v1/beat-plans/:id/visit` - Mark visit

#### Live Tracking
- `GET /api/v1/map` - Get map data
- `GET /api/v1/map/tracking` - Get live tracking data
- `WebSocket /api/tracking` - Real-time location updates

#### Invoices
- `GET /api/v1/invoices` - List invoices
- `GET /api/v1/invoices/:id` - Get invoice details
- `POST /api/v1/invoices` - Create invoice
- `PATCH /api/v1/invoices/:id` - Update invoice
- `DELETE /api/v1/invoices/:id` - Delete invoice

#### Expense Claims
- `GET /api/v1/expense-claims` - List claims
- `POST /api/v1/expense-claims` - Submit claim
- `PATCH /api/v1/expense-claims/:id/status` - Approve/reject
- `POST /api/v1/expense-claims/:id/receipt` - Upload receipt

#### Leave Requests
- `GET /api/v1/leave-requests` - List leave requests
- `POST /api/v1/leave-requests` - Create request
- `PATCH /api/v1/leave-requests/:id/status` - Approve/reject
- `GET /api/v1/leave-requests/my` - Get my leaves

#### Users
- `GET /api/v1/users` - List users
- `GET /api/v1/users/:id` - Get user details
- `POST /api/v1/users` - Create user
- `PATCH /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user

#### Roles
- `GET /api/v1/roles` - List custom roles
- `POST /api/v1/roles` - Create role
- `PATCH /api/v1/roles/:id` - Update role permissions
- `DELETE /api/v1/roles/:id` - Delete role

#### Organizations
- `GET /api/v1/organizations` - List organizations (Superadmin)
- `GET /api/v1/organizations/:id` - Get organization
- `PATCH /api/v1/organizations/:id` - Update organization
- `GET /api/v1/organizations/:id/stats` - Get statistics

#### Subscriptions
- `GET /api/v1/subscriptions` - List subscription plans
- `POST /api/v1/subscriptions` - Create plan (Superadmin)
- `PATCH /api/v1/subscriptions/:id` - Update plan

### Response Format

#### Success Response
```json
{
  "status": "success",
  "data": {
    // Response data
  },
  "message": "Operation successful"
}
```

#### Error Response
```json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

### Pagination

List endpoints support pagination:

```http
GET /api/v1/{module}?page=1&limit=20&sort=-createdAt
```

Query Parameters:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `sort` - Sort field (prefix with `-` for descending)
- `search` - Search query
- `filter` - Filter criteria (module-specific)

### File Upload Endpoints

File uploads use `multipart/form-data`:

```http
POST /api/v1/parties/:id/image
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <image_file>
```

## 🔐 Authentication & Authorization

SalesSphere implements a sophisticated multi-layered authentication and authorization system.

### Authentication Flow

#### 1. JWT-Based Authentication

The system uses **dual-token authentication**:

- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (7 days), used to obtain new access tokens

```javascript
// Login Response
{
  "status": "success",
  "data": {
    "user": { /* user data */ },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..." // Sent as httpOnly cookie
  }
}
```

#### 2. Client-Specific Authentication

**Web Clients:**
- Use JWT access token in `Authorization: Bearer <token>` header
- Require CSRF token for state-changing operations
- CSRF token sent as cookie and header

**Mobile Clients:**
- Use JWT access token in `Authorization: Bearer <token>` header
- Include `x-client-type: mobile` header
- CSRF protection bypassed for mobile clients

### Authorization Architecture

#### Role-Based Access Control (RBAC)

SalesSphere implements **granular feature-level RBAC** with the following hierarchy:

```
System Roles (Bypass all checks)
├── Superadmin (Full system access)
└── Developer (Full system access)

Organization Roles
├── Admin (Organization owner)
│   ├── Default: Full access to all business modules
│   └── Can create custom roles for team members
│
└── User (Team member)
    ├── Custom Role (Assigned by admin)
    │   └── Granular permissions based on role
    └── Default User (Limited permissions)
```

#### Permission Structure

Permissions are defined at the **feature level** (100+ features):

```javascript
{
  "products": {
    "viewList": true,
    "create": true,
    "update": true,
    "delete": false,
    "bulkUpload": false,
    "exportPdf": true
  },
  "attendance": {
    "viewMyAttendance": true,
    "viewTeamAttendance": false,
    "webCheckIn": true,
    "markHoliday": false
  }
  // ... more modules
}
```

#### Subscription-Based Feature Gating

Access is determined by **intersection** of:
1. **Role Permissions** - What the user's role allows
2. **Subscription Plan** - What the organization's plan includes

```
Effective Access = Role Permission AND Subscription Plan Feature
```

Example Plans:
- **Basic**: Core modules (products, parties, attendance, invoices)
- **Standard**: + prospects, sites, beat plans, tour plans, collections
- **Premium**: + live tracking, analytics, employees, advanced features
- **Custom**: Tailored feature selection

#### Hierarchical Data Access

Users can view data based on their position in the organization hierarchy:

- **Own Data**: User's own records
- **Team Data**: Direct subordinates' records (`reportsTo` relationship)
- **Organization Data**: All organizational data (admin/special permissions)

### Permission Middleware

#### protect
Validates JWT token and populates `req.user`

```javascript
router.get('/profile', protect, getProfile);
```

#### requirePermission
Checks feature-level permission

```javascript
router.post('/products',
  protect,
  requirePermission('products', 'create'),
  createProduct
);
```

#### requireSystemRole
Restricts to superadmin/developer only

```javascript
router.post('/organizations',
  protect,
  requireSystemRole(),
  createOrganization
);
```

#### checkModuleAccess
Validates subscription plan includes module

```javascript
router.get('/analytics',
  protect,
  checkModuleAccess('analytics'),
  getAnalytics
);
```

### Security Best Practices Implemented

✅ **Password Security**
- Bcrypt hashing (10 rounds)
- Minimum password length enforced
- Password reset with secure tokens

✅ **Token Security**
- Short-lived access tokens
- Refresh token rotation
- httpOnly cookies for refresh tokens
- Separate secrets for access and refresh tokens

✅ **Session Management**
- Maximum session duration (30 days)
- Automatic session cleanup
- Concurrent session handling

✅ **Data Access Control**
- Feature-level permissions
- Hierarchical data filtering
- Organization isolation

## 🛡️ Security Features

SalesSphere implements enterprise-grade security measures:

### 1. **Helmet Security Headers**

```javascript
- Content-Security-Policy
- X-DNS-Prefetch-Control
- X-Frame-Options
- Strict-Transport-Security
- X-Download-Options
- X-Content-Type-Options
- X-XSS-Protection
```

### 2. **CSRF Protection**

- **Double-submit cookie pattern** using `csrf-csrf`
- Different cookie names for production (`__Host-` prefix)
- Token validation for state-changing operations
- Automatic exemption for mobile clients

```javascript
// Web clients must include CSRF token
headers: {
  'x-csrf-token': '<token_from_cookie>'
}
```

### 3. **Rate Limiting**

```javascript
- 10,000 requests per 15 minutes per IP
- Applies to all authenticated routes
- Returns 429 Too Many Requests when exceeded
```

### 4. **CORS Configuration**

- Allowlist-based origin validation
- Credentials support enabled
- Custom headers allowed
- Preflight caching (1 hour)

**Allowed Origins** (configurable via `ALLOWED_ORIGINS` env variable):
- `http://localhost:5173` (Development)
- `https://salessphere360.com` (Production)
- `https://www.salessphere360.com`
- Custom domains via environment variable

### 5. **Input Validation**

- **Zod schema validation** for request payloads
- Type-safe data structures
- Sanitization of user inputs
- MongoDB injection prevention

### 6. **Secure File Uploads**

- File type validation
- Size restrictions
- Cloudinary integration for secure storage
- Virus scanning capability (configurable)

### 7. **Error Handling**

- Sensitive information filtering
- Stack traces only in development
- Consistent error response format
- Error logging and monitoring

### 8. **Database Security**

- Mongoose query sanitization
- Parameterized queries
- Connection string encryption
- Role-based database access

### 9. **Compression**

- Gzip compression for responses > 1KB
- Reduces bandwidth usage
- Improves API performance

### 10. **Trust Proxy**

- Configured for deployment behind reverse proxies
- Proper IP address detection
- Secure cookie handling in proxy environments

## 🌐 WebSocket Features

SalesSphere includes real-time features using **Socket.IO** for live tracking and notifications.

### WebSocket Configuration

**Endpoint**: `ws(s)://<host>/api/tracking`

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:5000', {
  path: '/api/tracking',
  transports: ['websocket', 'polling'],
  auth: {
    token: '<jwt_access_token>'
  }
});
```

### Live Tracking WebSocket

#### Connection

```javascript
socket.on('connect', () => {
  console.log('Connected to tracking server');
});
```

#### Start Tracking Session

```javascript
socket.emit('start-tracking', {
  userId: 'user_id',
  sessionType: 'beat-plan', // or 'tour-plan'
  sessionId: 'session_id'
});
```

#### Send Location Updates

```javascript
socket.emit('location-update', {
  latitude: 27.7172,
  longitude: 85.3240,
  timestamp: new Date(),
  accuracy: 10,
  speed: 5.5,
  heading: 180
});
```

#### Receive Location Updates (Admin/Supervisor)

```javascript
socket.on('location-broadcast', (data) => {
  console.log('User location:', data);
  // data: { userId, location, timestamp, ... }
});
```

#### Stop Tracking Session

```javascript
socket.emit('stop-tracking', {
  userId: 'user_id',
  sessionId: 'session_id'
});
```

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | Server → Client | Connection established |
| `disconnect` | Server → Client | Connection closed |
| `start-tracking` | Client → Server | Start tracking session |
| `stop-tracking` | Client → Server | End tracking session |
| `location-update` | Client → Server | Send GPS coordinates |
| `location-broadcast` | Server → Client | Receive team locations |
| `tracking-session-started` | Server → Client | Session start confirmation |
| `tracking-session-ended` | Server → Client | Session end confirmation |
| `error` | Server → Client | Error notification |

### Real-time Features

- **Live GPS Tracking**: Real-time location updates for field teams
- **Route Breadcrumbs**: Historical route tracking
- **Active Session Monitoring**: View all active tracking sessions
- **Geofence Alerts**: Location-based notifications (future)
- **Team Visibility**: Supervisors see subordinate locations
- **Battery Optimization**: Configurable update intervals

## 📊 Database Schema

### Core Models

#### User Model
```javascript
{
  name: String,
  email: String (unique, indexed),
  password: String (hashed),
  role: ['superadmin', 'developer', 'admin', 'user'],
  customRoleId: ObjectId (ref: 'Role'),
  organizationId: ObjectId (ref: 'Organization'),
  reportsTo: [ObjectId] (ref: 'User'), // Supervisors
  isActive: Boolean,
  mobileAppAccess: Boolean,
  webPortalAccess: Boolean,
  
  // Employee details
  phone, address, gender, dateOfBirth,
  panNumber, citizenshipNumber,
  avatarUrl, dateJoined,
  
  timestamps: true
}
```

#### Organization Model
```javascript
{
  name: String,
  email: String,
  phone: String,
  address: String,
  subscriptionPlanId: ObjectId (ref: 'SubscriptionPlan'),
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  isActive: Boolean,
  settings: Object,
  timestamps: true
}
```

#### Role Model
```javascript
{
  name: String,
  organizationId: ObjectId (ref: 'Organization'),
  permissions: {
    // Granular feature permissions
    products: {
      viewList: Boolean,
      create: Boolean,
      update: Boolean,
      delete: Boolean,
      // ... more features
    },
    // ... other modules
  },
  timestamps: true
}
```

#### SubscriptionPlan Model
```javascript
{
  name: String,
  tier: ['basic', 'standard', 'premium', 'custom'],
  price: Number,
  billingCycle: ['monthly', 'yearly'],
  moduleFeatures: {
    // Feature-level enablement
    products: {
      viewList: Boolean,
      create: Boolean,
      // ... all product features
    },
    // ... other modules
  },
  maxUsers: Number,
  isActive: Boolean,
  timestamps: true
}
```

#### Product Model
```javascript
{
  name: String,
  description: String,
  sku: String (unique),
  categoryId: ObjectId (ref: 'Category'),
  price: Number,
  stock: Number,
  imageUrl: String,
  organizationId: ObjectId (ref: 'Organization'),
  isActive: Boolean,
  timestamps: true
}
```

#### Party (Customer) Model
```javascript
{
  name: String,
  type: ['customer', 'vendor', 'both'],
  email: String,
  phone: String,
  address: String,
  location: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  categoryId: ObjectId (ref: 'Category'),
  organizationId: ObjectId (ref: 'Organization'),
  createdBy: ObjectId (ref: 'User'),
  imageUrl: String,
  timestamps: true
}
```

#### Attendance Model
```javascript
{
  userId: ObjectId (ref: 'User'),
  organizationId: ObjectId (ref: 'Organization'),
  checkInTime: Date,
  checkOutTime: Date,
  checkInLocation: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  checkOutLocation: GeoJSON Point,
  status: ['present', 'absent', 'half-day', 'leave', 'holiday'],
  workHours: Number,
  timestamps: true
}
```

#### Invoice Model
```javascript
{
  invoiceNumber: String (unique, auto-generated),
  partyId: ObjectId (ref: 'Party'),
  items: [{
    productId: ObjectId (ref: 'Product'),
    quantity: Number,
    price: Number,
    total: Number
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
  organizationId: ObjectId (ref: 'Organization'),
  createdBy: ObjectId (ref: 'User'),
  timestamps: true
}
```

#### BeatPlan Model
```javascript
{
  name: String,
  userId: ObjectId (ref: 'User'),
  parties: [ObjectId] (ref: 'Party'),
  startDate: Date,
  endDate: Date,
  status: ['draft', 'active', 'completed', 'cancelled'],
  route: {
    type: 'LineString',
    coordinates: [[longitude, latitude], ...]
  },
  organizationId: ObjectId (ref: 'Organization'),
  timestamps: true
}
```

#### LeaveRequest Model
```javascript
{
  userId: ObjectId (ref: 'User'),
  leaveType: ['casual', 'sick', 'annual', 'unpaid'],
  startDate: Date,
  endDate: Date,
  days: Number,
  reason: String,
  status: ['pending', 'approved', 'rejected'],
  approvedBy: ObjectId (ref: 'User'),
  approvalDate: Date,
  organizationId: ObjectId (ref: 'Organization'),
  timestamps: true
}
```

### Indexes

Strategic indexes for performance:

```javascript
// User indexes
email: unique
organizationId: indexed
role: indexed

// Party indexes
organizationId + name: compound
location: 2dsphere (geospatial)

// Attendance indexes
userId + date: compound unique
organizationId: indexed

// Invoice indexes
invoiceNumber: unique
organizationId + createdAt: compound
partyId: indexed
```

## 🛠️ Technologies Used

### Backend Framework & Runtime
- **Node.js** (v14+) - JavaScript runtime environment
- **Express.js** (v5.1.0) - Fast, unopinionated web framework
- **CommonJS** - Module system

### Database
- **MongoDB** (v6.20.0) - NoSQL document database
- **Mongoose** (v8.19.1) - MongoDB ODM with schema validation
- **MongoDB Atlas** - Cloud database hosting (optional)

### Authentication & Security
- **jsonwebtoken** (v9.0.2) - JWT implementation
- **bcryptjs** (v3.0.2) - Password hashing
- **cookie-parser** (v1.4.7) - Cookie parsing middleware
- **csrf-csrf** (v4.0.3) - CSRF protection
- **helmet** (v8.1.0) - Security HTTP headers
- **express-rate-limit** (v8.1.0) - Rate limiting
- **cors** (v2.8.5) - CORS middleware

### Real-time Communication
- **socket.io** (v4.8.1) - WebSocket server
- **socket.io-client** (v4.8.1) - WebSocket client

### File Handling
- **multer** (v2.0.2) - File upload handling
- **cloudinary** (v2.8.0) - Cloud image storage and CDN

### Email & Notifications
- **nodemailer** (v7.0.10) - Email sending
- **resend** (v6.4.0) - Modern email API

### Validation & Utilities
- **zod** (v4.1.12) - TypeScript-first schema validation
- **luxon** (v3.7.2) - Date/time handling
- **compression** (v1.8.1) - Gzip compression

### API Documentation
- **swagger-jsdoc** (v6.2.8) - Swagger/OpenAPI spec generation
- **swagger-ui-express** (v5.0.1) - Interactive API documentation

### Development Tools
- **nodemon** (v3.1.10) - Auto-restart on file changes
- **morgan** (v1.10.1) - HTTP request logger
- **dotenv** (v17.2.3) - Environment variable management
- **cross-env** (v10.1.0) - Cross-platform environment variables

### Performance
- **compression** - Response compression
- **Mongoose lean queries** - Optimized database queries
- **Connection pooling** - Efficient database connections
- **Caching strategies** - In-memory caching (future)

## 🚀 Deployment

### Prerequisites for Production

- Node.js v14 or higher
- MongoDB Atlas account or dedicated MongoDB server
- HTTPS/SSL certificate
- Domain name
- Server with at least 1GB RAM

### Recommended Hosting Platforms

- **Railway** - Simple deployment with MongoDB support
- **Heroku** - Cloud platform with easy scaling
- **AWS EC2** - Full control over infrastructure
- **DigitalOcean** - Droplets with MongoDB
- **Render** - Modern cloud platform
- **Azure** - Enterprise-grade hosting

### Deployment Steps

#### 1. Prepare Environment

```bash
# Set production environment variables
NODE_ENV=production
MONGO_URI_CLOUD=mongodb+srv://...
JWT_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<different-strong-secret>
CSRF_SECRET=<csrf-secret>
PORT=5000
```

#### 2. Build Optimization

```bash
# Install production dependencies only
npm install --production

# Remove development files
rm -rf tests/ docs/ .git/
```

#### 3. Database Setup

```bash
# Ensure MongoDB Atlas cluster is configured
# Whitelist deployment server IP address
# Create database user with appropriate permissions
```

#### 4. Start Application

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start server.js --name salessphere-api -i max

# Or using node directly
npm start
```

#### 5. Set Up Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /api/tracking {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 6. SSL Certificate (Let's Encrypt)

```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

### Environment-Specific Configuration

#### Development
```env
NODE_ENV=development
MONGO_URI_CLOUD=<dev-database>
# Lenient CORS, detailed error messages
```

#### Staging
```env
NODE_ENV=staging
MONGO_URI_CLOUD=<staging-database>
# Production-like settings with debugging
```

#### Production
```env
NODE_ENV=production
MONGO_URI_CLOUD=<production-database>
# Strict security, minimal error exposure
```

### Monitoring & Logging

#### PM2 Monitoring

```bash
# View logs
pm2 logs salessphere-api

# Monitor resources
pm2 monit

# View process status
pm2 status
```

#### Health Checks

Set up automated health checks:
```bash
# cron job
*/5 * * * * curl -f http://localhost:5000/health || echo "API down"
```

### Scaling

#### Horizontal Scaling (PM2 Cluster Mode)

```bash
# Run on all CPU cores
pm2 start server.js -i max

# Run on specific number of instances
pm2 start server.js -i 4
```

#### Vertical Scaling
- Increase server RAM and CPU
- Optimize MongoDB connection pool
- Enable database indexes
- Implement caching layer

### Backup Strategy

```bash
# MongoDB backup
mongodump --uri="mongodb+srv://..." --out=/backup/

# Restore
mongorestore --uri="mongodb+srv://..." /backup/
```

### Security Checklist for Production

- [ ] Use strong, unique secrets for JWT and CSRF
- [ ] Enable HTTPS/SSL
- [ ] Configure proper CORS origins
- [ ] Set up rate limiting
- [ ] Enable MongoDB authentication
- [ ] Use environment variables for secrets
- [ ] Set up firewall rules
- [ ] Configure CSP headers
- [ ] Enable audit logging
- [ ] Set up intrusion detection
- [ ] Regular security updates
- [ ] Implement backup strategy

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Getting Started

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/your-username/SalesSphere-Backend.git
   ```
3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes**
5. **Test thoroughly**
6. **Commit with clear messages**
   ```bash
   git commit -m "Add: Brief description of changes"
   ```
7. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
8. **Create a Pull Request**

### Coding Standards

- Follow existing code style
- Use meaningful variable and function names
- Comment complex logic
- Keep functions small and focused
- Handle errors properly
- Write descriptive commit messages

### Commit Message Format

```
Type: Brief description

Detailed description if needed

Type can be:
- Add: New feature
- Fix: Bug fix
- Update: Modify existing feature
- Remove: Delete code/feature
- Refactor: Code restructuring
- Docs: Documentation changes
- Test: Add or modify tests
```

### Pull Request Guidelines

- Describe the changes clearly
- Reference any related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Update documentation if needed

## 🐛 Troubleshooting

### Common Issues

#### 1. MongoDB Connection Error

**Error**: `Error Connecting to MongoDB: MongooseServerSelectionError`

**Solutions**:
- Verify `MONGO_URI_LOCAL` or `MONGO_URI_CLOUD` is correct
- Check MongoDB is running (for local)
- Whitelist your IP in MongoDB Atlas
- Verify database user credentials
- Check network connectivity

```bash
# Test local MongoDB
mongo --eval "db.version()"

# Test MongoDB Atlas connection
mongosh "mongodb+srv://..."
```

#### 2. Port Already in Use

**Error**: `EADDRINUSE: address already in use :::5000`

**Solutions**:
```bash
# Find process using port 5000
lsof -i :5000
# Or on Windows
netstat -ano | findstr :5000

# Kill the process
kill -9 <PID>

# Or change port in .env
PORT=5001
```

#### 3. JWT Token Errors

**Error**: `jwt malformed` or `invalid token`

**Solutions**:
- Ensure `JWT_SECRET` is set in `.env`
- Verify token format: `Bearer <token>`
- Check token expiration
- Clear browser cookies and login again

#### 4. CSRF Token Errors

**Error**: `Invalid or missing CSRF token`

**Solutions**:
- Web clients: Include `x-csrf-token` header
- Mobile clients: Add `x-client-type: mobile` header
- Fetch CSRF token from `/api/v1/csrf-token` first
- Check cookie settings in browser

#### 5. Module Not Found

**Error**: `Cannot find module '...'`

**Solutions**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Clear npm cache
npm cache clean --force
```

#### 6. Permission Denied

**Error**: `Access denied. You do not have permission`

**Solutions**:
- Verify user role and permissions
- Check organization subscription plan includes module
- Ensure custom role has required feature enabled
- Contact admin to grant permissions

#### 7. File Upload Errors

**Error**: `File too large` or `Invalid file type`

**Solutions**:
- Check file size limits (usually 10MB)
- Verify file type is allowed
- Configure Cloudinary credentials
- Check multer configuration

#### 8. WebSocket Connection Failed

**Error**: `WebSocket connection failed`

**Solutions**:
- Verify WebSocket path: `/api/tracking`
- Check JWT token in auth payload
- Ensure firewall allows WebSocket connections
- Verify nginx WebSocket configuration

### Debug Mode

Enable detailed logging:

```bash
# Set debug environment
DEBUG=* npm run dev

# Or specific modules
DEBUG=express:*,mongoose:* npm run dev
```

### Database Debug

```javascript
// Enable Mongoose debugging
mongoose.set('debug', true);
```

### Getting Help

- **Documentation**: Check `/docs` directory
- **Issues**: [GitHub Issues](https://github.com/AsimAftab/SalesSphere-Backend/issues)
- **Email**: Open an issue on GitHub for support

## 📝 License

This project is licensed under the **ISC License**.

## 👤 Author

**AsimAftab**

- GitHub: [@AsimAftab](https://github.com/AsimAftab)

---

## 🎯 Additional Resources

### Documentation

- [Feature Registry Guide](./docs/FEATURE_REGISTRY.md) - Detailed feature and permission system
- [Granular Permissions](./docs/GRANULAR_PERMISSIONS_IMPLEMENTATION.md) - Permission implementation guide
- [RBAC Analysis](./docs/RBAC_ANALYSIS.md) - Role-based access control analysis

### Related Projects

- **SalesSphere Frontend** - Web application (React/Next.js)
- **SalesSphere Mobile** - Mobile app (React Native)

### API Testing

You can test the API using:
- **Postman**: Import the API collection (create from Swagger docs)
- **cURL**: Command-line testing
- **HTTPie**: User-friendly CLI HTTP client
- **Swagger UI**: Interactive API documentation (if configured)

### Performance Optimization Tips

- Use `lean()` for read-only queries
- Implement pagination for large datasets
- Add database indexes for frequently queried fields
- Use projection to limit returned fields
- Enable compression for API responses
- Implement caching for static data
- Use connection pooling
- Monitor database query performance

---

**Last Updated**: January 2026

For questions or issues, please open an issue on GitHub.


**Last Updated**: January 2026

For questions or issues, please open an issue on GitHub.
