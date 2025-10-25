const User = require('./user.model');
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
            name, email, role, phone, address, gender, age,
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
            name, email, role, phone, address, gender, age,
            panNumber, citizenshipNumber, dateJoined,
            password: temporaryPassword,
            organizationId: req.user.organizationId
            // avatarUrl will be added after upload
        });

        let avatarUrl = newUser.avatarUrl; // Initialize with default if any

        // --- Step 2: Handle avatar upload AFTER getting newUser._id ---
        if (req.file && req.file.fieldname === 'avatar') {
             try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: `sales-sphere/avatars`,
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
    try {
        const userToUpdate = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
        if (!userToUpdate) return res.status(404).json({ success: false, message: 'User not found' });

        // --- Permission Checks ---
        if (userToUpdate.role === 'admin' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the org admin can modify another admin.' });
        if (req.user.id === req.params.id) return res.status(403).json({ success: false, message: 'Use the /me endpoint to update your own profile.' });
        // --- End Permission Checks ---

        // Whitelist fields & Validate Types
        const allowedUpdates = [ 'name', 'email', 'phone', 'address', 'gender', 'age', 'panNumber', 'citizenshipNumber' ];
        const updateData = {};
        for (const field of allowedUpdates) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                const value = req.body[field];
                if (field === 'age' && value !== null && typeof value !== 'number') return res.status(400).json({ message: `Invalid type for age` });
                if (field !== 'age' && value !== null && typeof value !== 'string') return res.status(400).json({ message: `Invalid type for ${field}` });
                updateData[field] = value;
            }
        }

        // Role update logic
        if (req.body.role) {
             if (typeof req.body.role !== 'string') return res.status(400).json({ success: false, message: 'Invalid type for field: role' });
            if (req.body.role === 'superadmin' || req.body.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot assign admin/superadmin role.' });
            if (req.body.role === 'manager' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admins can assign manager role.' });
            if (!User.schema.path('role').enumValues.includes(req.body.role)) return res.status(400).json({ success: false, message: 'Invalid role specified.' });
            updateData.role = req.body.role;
        }

        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        res.status(200).json({ success: true, data: user });
    } catch (error) { next(error); }
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

        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: `sales-sphere/avatars`,
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
        if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'Please upload at least one document file' });

        const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
        if (!user) {
            tempFilePaths.forEach(cleanupTempFile);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

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
                 console.error(`Failed to upload ${file.originalname}:`, uploadError);
                 throw uploadError;
            }
        });

        const uploadedDocuments = await Promise.all(uploadPromises);

        user.documents.push(...uploadedDocuments);
        await user.save();

        res.status(200).json({ success: true, message: `${uploadedDocuments.length} document(s) uploaded successfully`, data: uploadedDocuments });
    } catch (error) {
        tempFilePaths.forEach(cleanupTempFile);
        console.error("Multiple Document upload error:", error);
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
        const allowedUpdates = [ 'name', 'email', 'phone', 'address', 'gender', 'age', 'panNumber', 'citizenshipNumber' ];
        const updateData = {};
        for (const field of allowedUpdates) {
             if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                const value = req.body[field];
                 if (field === 'age' && value !== null && typeof value !== 'number') return res.status(400).json({ message: `Invalid type for age` });
                if (field !== 'age' && value !== null && typeof value !== 'string') return res.status(400).json({ message: `Invalid type for ${field}` });
                updateData[field] = value;
            }
        }

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

