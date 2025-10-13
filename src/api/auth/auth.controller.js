const jwt = require('jsonwebtoken');
const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');

// Function to sign a JWT
const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '90d',
    });
};

// @desc    Register a new organization and its admin user
// @route   POST /api/v1/auth/register
exports.register = async (req, res) => {
    try {
        const { name, email, password, organizationName } = req.body;

        if (!name || !email || !password || !organizationName) {
            return res.status(400).json({ message: 'Please provide name, email, password, and organization name' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        // 1. Create the organization
        const newOrganization = await Organization.create({ name: organizationName });

        // 2. Create the admin user for the organization
        const newUser = await User.create({
            name,
            email,
            password,
            role: 'admin',
            organizationId: newOrganization._id,
        });
        
        // 3. Link the organization to its owner (the new admin)
        newOrganization.owner = newUser._id;
        await newOrganization.save();
        
        const token = signToken(newUser._id);
        
        res.status(201).json({
            status: 'success',
            token,
            data: {
                user: { _id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role },
                organization: { _id: newOrganization._id, name: newOrganization.name }
            },
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};


// @desc    Login a user
// @route   POST /api/v1/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: 'Incorrect email or password' });
        }

        const token = signToken(user._id);
        user.password = undefined; // Remove password from the output

        res.status(200).json({
            status: 'success',
            token,
            data: {
                user, // Send user data to the frontend
            },
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};