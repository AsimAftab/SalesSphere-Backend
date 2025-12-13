const User = require('./user.model');
const Organization = require('../organizations/organization.model'); // Import Organization model
const cloudinary = require('../../config/cloudinary');
const crypto = require('crypto');
const { sendWelcomeEmail } = require('../../utils/emailSender');
const path = require('path');
const fs = require('fs'); // Import fs for cleanup

// Helper function to safely delete a file
const cleanupTempFile = (filePath) => {
    if (filePath) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error removing temp file ${filePath}:`, err);
        });
    }
};

// Create a new user within an organization
exports.createUser = async (req, res, next) => {
    let tempAvatarPath = req.file ? req.file.path : null;
    let newUser = null; // Define newUser outside the try block for potential rollback/cleanup

    try {
        const {
            name, email, role, phone, address, gender, dateOfBirth,
            panNumber, citizenshipNumber, dateJoined
        } = req.body;

        // --- Permission Checks ---
        if (role === 'superadmin') return res.status(403).json({ success: false, message: 'Cannot create superadmin via this route.' });
        if (role === 'admin') return res.status(403).json({ success: false, message: 'Cannot create another admin account for this organization.' });
        if ((role === 'manager' || role === 'admin') && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admins can create manager accounts.' });
        // --- End Permission Check ---

        const temporaryPassword = crypto.randomBytes(8).toString('hex');

        // --- Step 1: Create user WITHOUT avatarUrl first ---
        newUser = await User.create({
            name, email, role, phone, address, gender, dateOfBirth,
            panNumber, citizenshipNumber, dateJoined,
            password: temporaryPassword,
            organizationId: req.user.organizationId
            // avatarUrl will be added after upload
        });

        let avatarUrl = newUser.avatarUrl; // Initialize with default if any

        // --- Step 2: Handle avatar upload AFTER getting newUser._id ---
        if (req.file && req.file.fieldname === 'avatar') {
            try {
                // Fetch Organization Name
                const organization = await Organization.findById(req.user.organizationId);
                const orgName = organization ? organization.name : 'UnknownOrg';
                const folderPath = `sales-sphere/${orgName}/usersImage/${newUser.name}/${newUser._id}`;

                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: folderPath,
                    // --- FIX: Use newUser._id for public_id ---
                    public_id: `${newUser._id}_avatar`,
                    // --- END FIX ---
                    overwrite: true,
                    transformation: [
                        { width: 250, height: 250, gravity: "face", crop: "thumb" },
                        { fetch_format: "auto", quality: "auto" }
                    ]
                });
                avatarUrl = result.secure_url;
                cleanupTempFile(tempAvatarPath); // Clean up temp file on success
                tempAvatarPath = null; // Prevent cleanup again in final catch

                // --- Step 3: Update the newly created user with the avatarUrl ---
                newUser.avatarUrl = avatarUrl;
                await newUser.save({ validateBeforeSave: false }); // Save the updated URL

            } catch (uploadError) {
                console.error("Avatar upload failed during user creation:", uploadError);
                // Keep tempAvatarPath for cleanup in final catch
                // User is created, but without the avatar. Might want to log this.
            }
        }

        // --- Step 4: Send Email ---
        await sendWelcomeEmail(newUser.email, temporaryPassword);

        // Prepare response data (ensure password isn't included)
        const responseData = newUser.toObject(); // Convert to plain object if needed
        delete responseData.password;

        res.status(201).json({
            success: true,
            message: 'User created successfully. Temporary password sent via email.',
            data: responseData // Send the user data including avatarUrl if uploaded
        });

    } catch (error) {
        cleanupTempFile(tempAvatarPath); // Clean up temp file if any error occurred

        // Optional: If user creation failed AFTER avatar was uploaded (unlikely here but possible elsewhere)
        // you might want logic to delete the uploaded Cloudinary image.
        // Or if the user was created but email failed, maybe log that.

        if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already exists.' });
        if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: error.message });
        next(error);
    }
};

// @desc    Create a system user (superadmin or developer)
// @route   POST /api/v1/users/system-user
// @access  Protected (Superadmin only)
exports.addSystemUser = async (req, res, next) => {
    let tempAvatarPath = req.file ? req.file.path : null;
    let newUser = null;

    try {
        // Only superadmin can create system users
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only superadmin can create system users.'
            });
        }

        let {
            name, email, role, phone, address, gender, dateOfBirth,
            citizenshipNumber
        } = req.body;

        // Trim ALL string fields to remove leading/trailing spaces
        name = name?.trim();
        email = email?.trim();
        role = role?.trim().toLowerCase();
        phone = phone?.trim();
        address = address?.trim();
        gender = gender?.trim();
        dateOfBirth = dateOfBirth?.trim();
        citizenshipNumber = citizenshipNumber?.trim();

        // Validate required fields
        if (!name || !email || !role || !phone || !address || !gender || !dateOfBirth || !citizenshipNumber) {
            cleanupTempFile(tempAvatarPath);
            return res.status(400).json({
                success: false,
                message: 'All fields are required except avatar: name, email, role, phone, address, gender, dateOfBirth, citizenshipNumber'
            });
        }

        // Validate role (only superadmin or developer allowed)
        if (!['superadmin', 'developer'].includes(role)) {
            cleanupTempFile(tempAvatarPath);
            return res.status(400).json({
                success: false,
                message: `Invalid role: "${role}". System users can only be superadmin or developer.`
            });
        }

        // Check superadmin limit (maximum 2 superadmins)
        if (role === 'superadmin') {
            const superadminCount = await User.countDocuments({ role: 'superadmin', isActive: true });
            if (superadminCount >= 2) {
                cleanupTempFile(tempAvatarPath);
                return res.status(400).json({
                    success: false,
                    message: 'Maximum limit of 2 superadmins reached. Cannot create more superadmin accounts.'
                });
            }
        }

        // Generate temporary password
        const temporaryPassword = crypto.randomBytes(8).toString('hex');

        // Create user (system users don't have organizationId)
        newUser = await User.create({
            name,
            email,
            role,
            phone,
            address,
            gender,
            dateOfBirth: new Date(dateOfBirth),
            citizenshipNumber,
            password: temporaryPassword,
            dateJoined: new Date(),
            // No organizationId for system users
        });

        let avatarUrl = newUser.avatarUrl;

        // Handle optional avatar upload
        if (req.file && req.file.fieldname === 'avatar') {
            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: `sales-sphere/system-users/avatars`,
                    public_id: `${newUser._id}_avatar`,
                    overwrite: true,
                    transformation: [
                        { width: 250, height: 250, gravity: "face", crop: "thumb" },
                        { fetch_format: "auto", quality: "auto" }
                    ]
                });
                avatarUrl = result.secure_url;
                cleanupTempFile(tempAvatarPath);
                tempAvatarPath = null;

                newUser.avatarUrl = avatarUrl;
                await newUser.save({ validateBeforeSave: false });

            } catch (uploadError) {
                console.error("Avatar upload failed during system user creation:", uploadError);
            }
        }

        // Send welcome email with temporary password
        await sendWelcomeEmail(newUser.email, temporaryPassword);

        // Prepare response
        const responseData = newUser.toObject();
        delete responseData.password;

        res.status(201).json({
            success: true,
            message: `${role === 'superadmin' ? 'Superadmin' : 'Developer'} created successfully. Temporary password sent via email.`,
            data: responseData
        });

    } catch (error) {
        cleanupTempFile(tempAvatarPath);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists.'
            });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        next(error);
    }
};

// @desc    Create a new user in any organization (for system users: superadmin/developer)
// @route   POST /api/v1/users/org-user
// @access  Protected (Superadmin, Developer only)
exports.createOrgUser = async (req, res, next) => {
    let tempAvatarPath = req.file ? req.file.path : null;
    let newUser = null;

    try {
        // Only superadmin and developer can create users in any organization
        if (req.user.role !== 'superadmin' && req.user.role !== 'developer') {
            cleanupTempFile(tempAvatarPath);
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only superadmin and developer can create users in organizations.'
            });
        }

        let {
            name, email, role, phone, address, gender, dateOfBirth,
            panNumber, citizenshipNumber, dateJoined, organizationId
        } = req.body;

        // Trim all string fields
        name = name?.trim();
        email = email?.trim();
        role = role?.trim().toLowerCase();
        phone = phone?.trim();
        address = address?.trim();
        gender = gender?.trim();
        dateOfBirth = dateOfBirth?.trim();
        panNumber = panNumber?.trim();
        citizenshipNumber = citizenshipNumber?.trim();
        organizationId = organizationId?.trim();

        // Validate required fields
        if (!name || !email || !role || !organizationId) {
            cleanupTempFile(tempAvatarPath);
            return res.status(400).json({
                success: false,
                message: 'Required fields: name, email, role, organizationId'
            });
        }

        // Validate organization exists
        const Organization = require('../organizations/organization.model');
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            cleanupTempFile(tempAvatarPath);
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Role validation - cannot create superadmin or admin via this route
        const allowedRoles = ['manager', 'salesperson', 'user'];
        if (!allowedRoles.includes(role)) {
            cleanupTempFile(tempAvatarPath);
            return res.status(400).json({
                success: false,
                message: `Invalid role: "${role}". Allowed roles: ${allowedRoles.join(', ')}`
            });
        }

        // Generate temporary password
        const temporaryPassword = crypto.randomBytes(8).toString('hex');

        // Create user
        newUser = await User.create({
            name,
            email,
            role,
            phone,
            address,
            gender,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            panNumber,
            citizenshipNumber,
            dateJoined: dateJoined ? new Date(dateJoined) : new Date(),
            password: temporaryPassword,
            organizationId
        });

        let avatarUrl = newUser.avatarUrl;

        // Handle optional avatar upload
        if (req.file && req.file.fieldname === 'avatar') {
            try {
                // Organization name is already fetched into 'organization' variable above (line 284)
                const orgName = organization.name;
                const folderPath = `sales-sphere/${orgName}/usersImage/${newUser.name}/${newUser._id}`;

                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: folderPath,
                    public_id: `${newUser._id}_avatar`,
                    overwrite: true,
                    transformation: [
                        { width: 250, height: 250, gravity: "face", crop: "thumb" },
                        { fetch_format: "auto", quality: "auto" }
                    ]
                });
                avatarUrl = result.secure_url;
                cleanupTempFile(tempAvatarPath);
                tempAvatarPath = null;

                newUser.avatarUrl = avatarUrl;
                await newUser.save({ validateBeforeSave: false });

            } catch (uploadError) {
                console.error("Avatar upload failed during org user creation:", uploadError);
            }
        }

        // Send welcome email with temporary password
        await sendWelcomeEmail(newUser.email, temporaryPassword);

        // Prepare response
        const responseData = newUser.toObject();
        delete responseData.password;

        res.status(201).json({
            success: true,
            message: 'User created successfully in organization. Temporary password sent via email.',
            data: responseData
        });

    } catch (error) {
        cleanupTempFile(tempAvatarPath);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists.'
            });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        next(error);
    }
};

// @desc    Get all system users (superadmin and developers)
// @route   GET /api/v1/users/system-users
// @access  Protected (Superadmin only)
exports.getAllSystemUsers = async (req, res, next) => {
    try {
        // Only superadmin can view system users
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only superadmin can view system users.'
            });
        }

        const systemUsers = await User.find({
            role: { $in: ['superadmin', 'developer'] },
            isActive: true
        }).select('-password -refreshToken -refreshTokenExpiry -sessionExpiresAt')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: systemUsers.length,
            data: systemUsers
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get specific system user by ID
// @route   GET /api/v1/users/system-user/:id
// @access  Protected (Superadmin only)
exports.getSystemUserById = async (req, res, next) => {
    try {
        // Only superadmin can view system user details
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only superadmin can view system user details.'
            });
        }

        const systemUser = await User.findOne({
            _id: req.params.id,
            role: { $in: ['superadmin', 'developer'] },
            isActive: true
        }).select('-password -refreshToken -refreshTokenExpiry -sessionExpiresAt');

        if (!systemUser) {
            return res.status(404).json({
                success: false,
                message: 'System user not found'
            });
        }

        res.status(200).json({
            success: true,
            data: systemUser
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update system user (developer or superadmin)
// @route   PUT /api/v1/users/system-user/:id
// @access  Protected (Superadmin only)
exports.updateSystemUser = async (req, res, next) => {
    let tempAvatarPath = req.file ? req.file.path : null;

    try {
        // Only superadmin can update system users
        if (req.user.role !== 'superadmin') {
            cleanupTempFile(tempAvatarPath);
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only superadmin can update system users.'
            });
        }

        const userIdToUpdate = req.params.id;

        // Prevent updating own profile (use /me endpoint)
        if (req.user._id.toString() === userIdToUpdate) {
            cleanupTempFile(tempAvatarPath);
            return res.status(403).json({
                success: false,
                message: 'Use the /me endpoint to update your own profile.'
            });
        }

        // Find the system user
        const systemUser = await User.findOne({
            _id: userIdToUpdate,
            role: { $in: ['superadmin', 'developer'] },
            isActive: true
        });

        if (!systemUser) {
            cleanupTempFile(tempAvatarPath);
            return res.status(404).json({
                success: false,
                message: 'System user not found'
            });
        }

        let {
            name, email, phone, address, gender, dateOfBirth, citizenshipNumber
        } = req.body;

        // Trim all fields
        name = name?.trim();
        email = email?.trim();
        phone = phone?.trim();
        address = address?.trim();
        gender = gender?.trim();
        dateOfBirth = dateOfBirth?.trim();
        citizenshipNumber = citizenshipNumber?.trim();

        // Update fields if provided
        if (name) systemUser.name = name;
        if (email) systemUser.email = email;
        if (phone) systemUser.phone = phone;
        if (address) systemUser.address = address;
        if (gender) systemUser.gender = gender;
        if (dateOfBirth) systemUser.dateOfBirth = new Date(dateOfBirth);
        if (citizenshipNumber) systemUser.citizenshipNumber = citizenshipNumber;

        // Handle avatar upload if provided
        if (req.file && req.file.fieldname === 'avatar') {
            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: `sales-sphere/system-users/avatars`,
                    public_id: `${systemUser._id}_avatar`,
                    overwrite: true,
                    transformation: [
                        { width: 250, height: 250, gravity: "face", crop: "thumb" },
                        { fetch_format: "auto", quality: "auto" }
                    ]
                });
                systemUser.avatarUrl = result.secure_url;
                cleanupTempFile(tempAvatarPath);
                tempAvatarPath = null;
            } catch (uploadError) {
                console.error("Avatar upload failed:", uploadError);
            }
        }

        await systemUser.save({ validateBeforeSave: true });

        // Prepare response
        const responseData = systemUser.toObject();
        delete responseData.password;
        delete responseData.refreshToken;
        delete responseData.refreshTokenExpiry;
        delete responseData.sessionExpiresAt;

        res.status(200).json({
            success: true,
            message: 'System user updated successfully',
            data: responseData
        });

    } catch (error) {
        cleanupTempFile(tempAvatarPath);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists.'
            });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        next(error);
    }
};

// Get all users WITHIN the same organization
exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find({ organizationId: req.user.organizationId, isActive: true });
        res.status(200).json({ success: true, count: users.length, data: users });
    } catch (error) { next(error); }
};

// Get a single user BY ID, ensuring they are in the same organization
exports.getUserById = async (req, res, next) => {
    try {
        const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId, isActive: true });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.status(200).json({ success: true, data: user });
    } catch (error) { next(error); }
};

// Update a user, enforcing role permissions
exports.updateUser = async (req, res, next) => {
    let tempAvatarPath = req.file ? req.file.path : null; // Track potential new avatar file
    try {
        const userIdToUpdate = req.params.id;

        const userToUpdate = await User.findOne({ _id: userIdToUpdate, organizationId: req.user.organizationId });
        if (!userToUpdate) return res.status(404).json({ success: false, message: 'User not found' });

        // --- Permission Checks ---
        if (req.user.id === userIdToUpdate) return res.status(403).json({ success: false, message: 'Use the /me endpoint to update your own profile.' });
        if (req.user.role === 'manager' && (userToUpdate.role === 'admin' || userToUpdate.role === 'manager')) return res.status(403).json({ success: false, message: 'Managers cannot modify admin or other manager accounts.' });
        if (userToUpdate.role === 'admin' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the organization admin can modify another admin account.' });
        // --- End Permission Checks ---

        // Whitelist fields & Validate Types
        const allowedUpdates = ['name', 'email', 'phone', 'address', 'gender', 'dateOfBirth', 'panNumber', 'citizenshipNumber'];
        const updateData = {};
        for (const field of allowedUpdates) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                const value = req.body[field];
                // Prevent NoSQL injection: disallow objects/arrays
                if (
                    value !== null &&
                    (typeof value === "object" || Array.isArray(value))
                ) return res.status(400).json({ success: false, message: `Invalid value for ${field}. No objects or arrays allowed.` });
                if (field === 'dateOfBirth') {
                    if (value !== null && isNaN(Date.parse(value))) return res.status(400).json({ success: false, message: `Invalid type or format for dateOfBirth` });
                    updateData[field] = value ? new Date(value) : null;
                } else if (value !== null && typeof value !== 'string') return res.status(400).json({ success: false, message: `Invalid type for ${field}. Expected string.` });
                else if (value !== null) updateData[field] = value;
            }
        }

        // Role update logic
        if (req.body.role) {
            if (typeof req.body.role !== 'string') return res.status(400).json({ success: false, message: 'Invalid type for field: role' });
            if (req.body.role === 'superadmin' || req.body.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot assign admin or superadmin role.' });
            if (req.body.role === 'manager' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admins can assign the manager role.' });
            if (!User.schema.path('role').enumValues.includes(req.body.role)) return res.status(400).json({ success: false, message: 'Invalid role specified.' });
            if (userToUpdate.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot change the role of an admin account.' });
            updateData.role = req.body.role;
        }

        // --- Handle Optional Avatar Update ---
        if (req.file && req.file.fieldname === 'avatar') {
            try {
                // Fetch Organization Name
                const organization = await Organization.findById(req.user.organizationId);
                const orgName = organization ? organization.name : 'UnknownOrg';
                // Use userToUpdate.name (or new name if updating) - best to use current DB name or explicit new name
                // But generally ID is stable. Folder structure relies on Name, so if name changes... 
                // Currently keeping it simple based on current userToUpdate state unless name is in body.
                // However, folder names usually stick to creation time names or need complex migration.
                // For simplicity and consistency with Party/Prospect controller which just grabs current name:
                const userName = updateData.name || userToUpdate.name;
                const folderPath = `sales-sphere/${orgName}/usersImage/${userName}/${userIdToUpdate}`;

                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: folderPath,
                    public_id: `${userIdToUpdate}_avatar`, // Use the target user's ID
                    overwrite: true,
                    transformation: [
                        { width: 250, height: 250, gravity: "face", crop: "thumb" },
                        { fetch_format: "auto", quality: "auto" }
                    ]
                });
                updateData.avatarUrl = result.secure_url; // Add avatar URL to the update data
                cleanupTempFile(tempAvatarPath);
                tempAvatarPath = null;
            } catch (uploadError) {
                console.error(`Avatar upload failed during update for user ${userIdToUpdate}:`, uploadError);
                // Decide: Fail the whole update or just skip avatar? Skipping for now.
                // Keep tempAvatarPath for cleanup in final catch
            }
        }
        // --- End Avatar Update ---


        const user = await User.findByIdAndUpdate(userIdToUpdate, updateData, { new: true, runValidators: true });
        // No need to check !user again as findOneAndUpdate handles the not found case implicitly (returns null)
        // Although the findOne check at the start makes this robust.

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        cleanupTempFile(tempAvatarPath); // Clean up avatar temp file on any error
        if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already in use.' });
        next(error);
    }
};
// Soft delete a user (deactivate), enforcing role permissions
exports.deleteUser = async (req, res, next) => {
    try {
        const userToDeactivate = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
        if (!userToDeactivate) return res.status(404).json({ success: false, message: 'User not found' });

        // --- Permission Checks ---
        if (userToDeactivate.role === 'admin' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Managers cannot deactivate admin accounts.' });
        if (req.user.id === req.params.id) return res.status(403).json({ success: false, message: 'Cannot deactivate own account via this endpoint.' });
        // --- End Permission Checks ---

        const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        res.status(200).json({ success: true, message: 'User deactivated successfully' });
    } catch (error) { next(error); }
};

// Update logged-in user's own profile image
exports.updateMyProfileImage = async (req, res, next) => { // Added next for error handling consistency
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.file) return res.status(400).json({ message: 'Please upload an image file' });

        // Fetch Organization Name
        const organization = await Organization.findById(req.user.organizationId);
        const orgName = organization ? organization.name : 'UnknownOrg';
        const folderPath = `sales-sphere/${orgName}/usersImage/${req.user.name}/${req.user.id}`;

        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: `${req.user.id}_avatar`, // Correct: Uses user ID
            overwrite: true,
            transformation: [
                { width: 250, height: 250, gravity: "face", crop: "thumb" },
                { fetch_format: "auto", quality: "auto" }
            ]
        });
        cleanupTempFile(tempFilePath);
        tempFilePath = null;

        const user = await User.findByIdAndUpdate(req.user.id, { avatarUrl: result.secure_url }, { new: true });
        if (!user) return res.status(404).json({ message: 'User not found after image update' });

        res.status(200).json({ success: true, message: 'Profile image updated successfully', data: { avatarUrl: user.avatarUrl } });
    } catch (error) {
        cleanupTempFile(tempFilePath);
        console.error("Profile image upload error:", error);
        next(error);
    }
};

// Upload MULTIPLE documents for a specific user
exports.uploadUserDocuments = async (req, res, next) => {
    const tempFilePaths = req.files ? req.files.map(f => f.path) : [];
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Please upload at least one document file' });
        }

        const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
        if (!user) {
            tempFilePaths.forEach(cleanupTempFile);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // 🔒 Enforce a maximum of 5 total documents per user
        const MAX_DOCUMENTS = 2;
        const currentCount = user.documents.length;
        const newFilesCount = req.files.length;

        if (currentCount + newFilesCount > MAX_DOCUMENTS) {
            tempFilePaths.forEach(cleanupTempFile);
            return res.status(400).json({
                success: false,
                message: `User already has ${currentCount} document(s). Maximum allowed is ${MAX_DOCUMENTS}. You can upload up to ${MAX_DOCUMENTS - currentCount} more.`
            });
        }

        // Continue uploading files
        const uploadPromises = req.files.map(async (file) => {
            let currentFilePath = file.path;
            try {
                const originalNameBase = path.parse(file.originalname).name;
                const userNameClean = user.name.replace(/\s+/g, '_');
                const desiredPublicIdWithExt = `${userNameClean}_${originalNameBase}_${Date.now()}.pdf`;

                const result = await cloudinary.uploader.upload(currentFilePath, {
                    folder: `sales-sphere/documents/${user._id}`,
                    resource_type: "raw",
                    public_id: desiredPublicIdWithExt,
                    flags: "attachment",
                    use_filename: false,
                    unique_filename: false,
                    overwrite: false
                });
                cleanupTempFile(currentFilePath);

                const correctFileUrl = result.secure_url.replace('/image/upload/', '/raw/upload/');
                return { fileName: file.originalname, fileUrl: correctFileUrl };
            } catch (uploadError) {
                cleanupTempFile(currentFilePath);
                console.error("Failed to upload file:", file.originalname, uploadError);
                throw uploadError;
            }
        });

        const uploadedDocuments = await Promise.all(uploadPromises);

        user.documents.push(...uploadedDocuments);
        await user.save();

        res.status(200).json({
            success: true,
            message: `${uploadedDocuments.length} document(s) uploaded successfully`,
            data: uploadedDocuments
        });
    } catch (error) {
        tempFilePaths.forEach(cleanupTempFile);
        console.error("Multiple Document upload error:", error);
        next(error);
    }
};



// Delete a specific document for a user
exports.deleteUserDocument = async (req, res, next) => {
    try {
        const { id, documentId } = req.params;

        const user = await User.findOne({ _id: id, organizationId: req.user.organizationId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const document = user.documents.id(documentId);
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        let publicId = null;
        try {
            // Extract public_id from URL
            const regex = /\/upload\/(?:v\d+\/)?(.+)$/;
            const match = document.fileUrl.match(regex);
            if (match && match[1]) {
                publicId = match[1];
                publicId = decodeURIComponent(publicId);
            }
        } catch (err) {
            console.warn("Could not extract public_id from URL, attempting database removal anyway", err);
        }

        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
            } catch (cloudinaryError) {
                console.error("Cloudinary deletion failed:", cloudinaryError);
            }
        }

        document.deleteOne();
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Document deleted successfully'
        });

    } catch (error) {
        console.error("Delete Document error:", error);
        next(error);
    }
};

// Get logged-in user's profile
exports.getMyProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-documents');
        if (!user || !user.isActive) return res.status(404).json({ success: false, message: 'User not found or inactive' });
        res.status(200).json({ success: true, data: user });
    } catch (error) { next(error); }
};

// Update logged-in user's profile details
exports.updateMyProfile = async (req, res, next) => {
    try {
        // --- Whitelist updated ---
        const allowedUpdates = ['name', 'email', 'phone', 'address', 'gender', 'dateOfBirth', 'panNumber', 'citizenshipNumber']; // Changed age to dateOfBirth
        const updateData = {};
        for (const field of allowedUpdates) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                const value = req.body[field];
                // --- Type/Format validation for dateOfBirth ---
                if (field === 'dateOfBirth') {
                    if (value !== null && isNaN(Date.parse(value))) {
                        return res.status(400).json({ message: `Invalid type or format for dateOfBirth` });
                    }
                    // Allow setting dateOfBirth to null or a valid date
                    updateData[field] = value ? new Date(value) : null;
                } else if (value !== null && typeof value !== 'string') {
                    // Allow null for other string fields if needed, otherwise check type
                    return res.status(400).json({ success: false, message: `Invalid type for ${field}. Expected string.` });
                } else if (value !== null) { // Only assign non-null string values
                    updateData[field] = value;
                }
                // If you want to allow explicitly setting string fields to null or empty string:
                // else {
                //    updateData[field] = value; // Assign null or "" if provided
                // }
            }
        }
        // --- End Whitelist/Validation ---

        // Prevent unwanted updates
        delete updateData.role; // Already preventing role changes here
        delete updateData.organizationId;
        delete updateData.isActive;

        const user = await User.findByIdAndUpdate(req.user.id, updateData, { new: true, runValidators: true }).select('-documents');
        if (!user) return res.status(404).json({ success: false, message: 'User not found during update' });

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already in use.' });
        next(error);
    }
};

// Update logged-in user's password
exports.updateMyPassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;
        if (!currentPassword || !newPassword || !confirmNewPassword) return res.status(400).json({ message: 'Please provide all password fields' });
        if (newPassword !== confirmNewPassword) return res.status(400).json({ message: 'New password and confirmation do not match' });

        const user = await User.findById(req.user.id).select('+password');
        if (!user) return res.status(404).json({ message: 'User not found' }); // Should not happen

        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) return res.status(401).json({ message: 'Incorrect current password' });

        user.password = newPassword;
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) { next(error); }
};

// --- SUPERADMIN ONLY: Get system overview ---
// @desc    Get all organizations and system users (superadmin & developers without organizationId)
// @route   GET /api/v1/users/system-overview
// @access  Private (Superadmin only)
exports.getSystemOverview = async (req, res, next) => {
    try {
        // Fetch all organizations
        const Organization = require('../organizations/organization.model');
        const organizations = await Organization.find()
            .select('name panVatNumber phone address subscriptionType subscriptionStartDate subscriptionEndDate isActive')
            .populate('owner', 'name email phone')
            .sort({ createdAt: -1 });

        // Fetch all system users (users without organizationId)
        const systemUsers = await User.find({
            organizationId: { $exists: false }
        }).select('name email role phone address isActive createdAt');

        res.status(200).json({
            success: true,
            data: {
                organizations: {
                    count: organizations.length,
                    list: organizations
                },
                systemUsers: {
                    count: systemUsers.length,
                    list: systemUsers
                }
            }
        });
    } catch (error) {
        console.error('Error fetching system overview:', error);
        next(error);
    }
};

// @desc    Get attendance summary for a specific employee for current month
// @route   GET /api/v1/users/:employeeId/attendance-summary
// @access  Private (Admin, Manager, or Self)
exports.getEmployeeAttendanceSummary = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        const { organizationId, role: requestorRole, _id: requestorId } = req.user;
        const { employeeId } = req.params;

        const Attendance = require('../attendance/attendance.model');
        const Organization = require('../organizations/organization.model');
        const mongoose = require('mongoose');
        const { DateTime } = require('luxon');

        // Validate employeeId
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ success: false, message: 'Invalid employee ID' });
        }

        // Fetch the employee
        const employee = await User.findOne({
            _id: employeeId,
            organizationId: organizationId,
            isActive: true
        }).select('name email role').lean();

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found in your organization'
            });
        }

        // Check if employee is admin
        if (employee.role === 'admin') {
            return res.status(200).json({
                success: true,
                message: 'Admins do not have attendance tracking',
                data: {
                    employee: {
                        _id: employee._id,
                        name: employee.name,
                        email: employee.email,
                        role: employee.role
                    },
                    attendance: null
                }
            });
        }

        // Permission check: Only admin, manager, or the employee themselves can view
        if (requestorRole !== 'admin' && requestorRole !== 'manager' && requestorId.toString() !== employeeId) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this employee\'s attendance'
            });
        }

        // Get month and year from query params (default to current month/year)
        const now = new Date();
        const currentMonth = parseInt(req.query.month) || (now.getMonth() + 1);
        const currentYear = parseInt(req.query.year) || now.getFullYear();

        // Validate month and year
        if (currentMonth < 1 || currentMonth > 12) {
            return res.status(400).json({ success: false, message: 'Invalid month. Must be between 1 and 12.' });
        }
        if (currentYear < 2020 || currentYear > 2100) {
            return res.status(400).json({ success: false, message: 'Invalid year. Must be between 2020 and 2100.' });
        }

        // Fetch organization to get weekly off day and timezone
        const organization = await Organization.findById(organizationId).select('weeklyOffDay timezone');
        const weeklyOffDay = organization?.weeklyOffDay || 'Saturday';
        const timezone = organization?.timezone || 'Asia/Kolkata';

        // Calculate start and end of month using Luxon (timezone-aware)
        const startDate = DateTime.fromObject({ year: currentYear, month: currentMonth, day: 1 }, { zone: timezone })
            .startOf('day').toUTC().toJSDate();
        const endDate = DateTime.fromObject({ year: currentYear, month: currentMonth, day: 1 }, { zone: timezone })
            .endOf('month').endOf('day').toUTC().toJSDate();

        // Map day names to JavaScript day numbers
        const dayNameToNumber = {
            'Sunday': 0,
            'Monday': 1,
            'Tuesday': 2,
            'Wednesday': 3,
            'Thursday': 4,
            'Friday': 5,
            'Saturday': 6
        };
        const weeklyOffDayNumber = dayNameToNumber[weeklyOffDay];

        // Fetch attendance records for this specific employee for current month
        const attendanceRecords = await Attendance.find({
            employee: employeeId,
            organizationId: organizationId,
            date: { $gte: startDate, $lte: endDate }
        }).select('date status').lean();

        // Calculate summary
        const daysInMonth = DateTime.fromJSDate(endDate, { zone: timezone }).day;
        const summary = {
            present: 0,
            absent: 0,
            leave: 0,
            halfDay: 0,
            weeklyOff: 0,
            workingDays: 0,
            totalDays: daysInMonth
        };

        // Build map of attendance records by date
        const attendanceByDate = {};
        for (const record of attendanceRecords) {
            const dateIso = DateTime.fromJSDate(record.date, { zone: timezone }).toISODate(); // YYYY-MM-DD
            const day = parseInt(dateIso.split('-')[2]);
            attendanceByDate[day] = record.status;

            // Update summary counts for existing records only
            if (record.status === 'P') {
                summary.present += 1;
                summary.workingDays += 1;
            } else if (record.status === 'H') {
                summary.halfDay += 1;
                summary.workingDays += 0.5;
            } else if (record.status === 'A') {
                summary.absent += 1;
            } else if (record.status === 'L') {
                summary.leave += 1;
                summary.workingDays += 1;
            } else if (record.status === 'W') {
                summary.weeklyOff += 1;
                summary.workingDays += 1;
            }
        }

        // Fill in days without records (weekly offs and not marked/absent)
        for (let day = 1; day <= daysInMonth; day++) {
            if (!attendanceByDate[day]) {
                const dt = DateTime.fromObject({ year: currentYear, month: currentMonth, day }, { zone: timezone });
                const dayOfWeek = dt.weekday % 7; // Convert 1..7 to 0..6 where 0=Sunday

                if (dayOfWeek === weeklyOffDayNumber) {
                    // Inferred weekly off - increment both weeklyOff and workingDays
                    summary.weeklyOff += 1;
                    summary.workingDays += 1;
                } else {
                    // Not marked - count as absent
                    summary.absent += 1;
                }
            }
        }

        // Calculate attendance percentage: working days / total days
        // Working days includes: Present (P), Leave (L), Half-day (H), and Weekly Off (W)
        // Only absents do NOT count as working days
        const attendancePercentage = summary.totalDays > 0
            ? ((summary.workingDays / summary.totalDays) * 100).toFixed(2)
            : 0;

        res.status(200).json({
            success: true,
            month: currentMonth,
            year: currentYear,
            weeklyOffDay: weeklyOffDay,
            data: {
                employee: {
                    _id: employee._id,
                    name: employee.name,
                    email: employee.email,
                    role: employee.role
                },
                attendance: summary,
                attendancePercentage: attendancePercentage
            }
        });

    } catch (error) {
        console.error('Error fetching employee attendance summary:', error);
        next(error);
    }
};