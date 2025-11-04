# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SalesSphere Backend is a Node.js/Express REST API for a sales management system with multi-tenant organization support. The API uses MongoDB for data persistence and JWT-based authentication with role-based access control.

## Commands

### Development
```bash
# Start development server with cloud MongoDB (hot reload)
npm run dev

# Start development server with local MongoDB (hot reload)
npm run dev:local

# Start production server
npm start
```

### Environment Configuration
- `NODE_ENV=development` - Uses MongoDB Atlas (cloud)
- `NODE_ENV=local_development` - Uses local MongoDB
- `NODE_ENV=production` - Production mode

## Architecture & Key Concepts

### Multi-Tenant Organization Model
- Every user (except superadmin) belongs to an `Organization`
- Organizations are created during admin registration
- The admin who creates an organization becomes its `owner`
- All data models (Product, Party, Prospect, etc.) include `organizationId` for tenant isolation
- User roles: `superadmin`, `admin`, `manager`, `developer`, `salesperson`, `user`

### Authentication Flow
1. **Registration** (`POST /api/v1/auth/register`):
   - Superadmin: Created without organization
   - Admin: Creates organization + admin user atomically
   - Other roles: Added by admin through user management
2. **Login** (`POST /api/v1/auth/login`): Returns JWT token
3. **Password Reset**:
   - `POST /api/v1/auth/forgotpassword`: Generates token, sends email via Resend
   - `PATCH /api/v1/auth/resetpassword/:token`: Validates token, prevents password reuse, resets password
   - **Security Enhancement**: Reset endpoint checks if new password matches old password and rejects reuse
4. **Protected Routes**: Use `protect` middleware (validates JWT) and optional `restrictTo(...roles)` for role-based access

### Data Models

**Core Entities:**
- `User`: Authentication + employee details (avatarUrl, phone, documents, etc.)
- `Organization`: Tenant container with owner reference
- `Product`: Inventory items with category, price, piece count, SKU
- `Party`: Registered customers with PAN/VAT (unique per organization)
- `Prospect`: Potential customers (PAN/VAT optional, no uniqueness constraint)

**Key Schema Patterns:**
- All tenant-scoped models have `organizationId` + `createdBy` (User reference)
- Timestamps (`createdAt`, `updatedAt`) on all schemas
- User passwords are hashed via bcrypt pre-save hook
- Password reset uses crypto-generated tokens (hashed in DB, expires in 10 min)

### Email System
- Uses **Resend** API for transactional emails
- Email utility: `src/utils/emailSender.js` (exports `sendEmail` function)
- Used for password reset emails with HTML templates
- Requires `RESEND_API_KEY` in environment

### File Upload & Storage
- Uses **Cloudinary** for image/document storage
- Configuration: `src/config/cloudinary.js`
- Requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **Multer** handles multipart/form-data parsing
- Error handling: `src/middlewares/multerError.middleware.js`

### Middleware Stack
1. **Security**: CORS (origins whitelisted), Helmet, rate limiting (100 req/15min on auth routes)
2. **Compression**: Gzip responses >1KB
3. **Logging**: Morgan in dev mode
4. **Auth**: `protect` (JWT validation) + `restrictTo` (role check)
5. **Error Handling**: Custom `ApiError` class with operational error flagging

### API Structure
```
app.js              # Express app setup, middleware configuration, route mounting
server.js           # Server entry point (listens on PORT)
src/
├── api/            # API modules (auth, users, products, parties, prospects, dashboard)
│   └── [module]/   # Each module: model.js, controller.js, route.js
├── config/         # DB connection, Cloudinary config
├── middlewares/    # Auth, error handling, multer errors
└── utils/          # ApiError, emailSender
```

### Routes
All routes prefixed with `/api/v1` and protected by rate limiter:
- `/auth` - register, login, forgotpassword, resetpassword
- `/users` - User CRUD (employee management)
- `/products` - Product inventory management
- `/parties` - Registered customer management
- `/prospects` - Prospective customer management
- `/dashboard` - Analytics/aggregations

## Important Constraints

### Database Indexes
- `Party.panVatNumber`: Unique per organization (compound index)
- `Prospect.panVatNumber`: NOT unique (differentiates from Party)
- `Product.name`: Indexed per organization with case-insensitive collation
- Always filter queries by `organizationId` for tenant isolation

### Security Considerations
- JWT secret must be set (`JWT_SECRET`)
- Passwords hashed with bcrypt (salt rounds: 12)
- Password reset tokens hashed with SHA256 before storage
- **Password reuse prevention**: Reset password endpoint validates that new password differs from old password
- Auth errors intentionally vague ("Incorrect email or password")
- CORS origins hardcoded in app.js - update for new domains

### Environment Variables
Required `.env` variables (see `.env.example`):
```
PORT, NODE_ENV
MONGO_URI_LOCAL, MONGO_URI_CLOUD
JWT_SECRET, JWT_EXPIRE
RESEND_API_KEY, FRONTEND_URL
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
```

## Development Workflow

### Adding New Features
1. Create model in `src/api/[module]/[module].model.js` with `organizationId` + `createdBy`
2. Create controller in `src/api/[module]/[module].controller.js`
3. Create routes in `src/api/[module]/[module].route.js` with `protect` middleware
4. Mount routes in `app.js` with rate limiter
5. Test locally with `npm run dev:local`

### Working with Organizations
- Always destructure `req.user.organizationId` from authenticated requests
- Filter all queries by organization: `Model.find({ organizationId: req.user.organizationId })`
- Validate ownership before updates/deletes
- Superadmin logic may need separate handling (no organizationId)

### Email Templates
- HTML emails use inline styles for compatibility
- Include plain text fallback in `message` field
- Test emails in development (check Resend dashboard)
- Email subjects should be descriptive and branded

### Error Handling
- Use `ApiError` class for operational errors (4xx, 5xx)
- Validation errors from Mongoose are caught in controllers
- MongoDB duplicate key errors need explicit handling (E11000)
- Global error handler in `src/middlewares/error.handler.js` (if exists)
