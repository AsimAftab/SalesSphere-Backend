const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');
const { sendEmail } = require('../../utils/emailSender'); // <-- 1. IMPORTED your email util

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
    const { name, email, password, organizationName, role } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Please provide name, email, and password',
      });
    }

    const existingUser = await User.findOne({ email: { $eq: email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    let newUser;
    let newOrganization;

    // 👑 CASE 1: SUPERADMIN CREATION (no organization)
    if (role === 'superadmin') {
      newUser = await User.create({
        name,
        email,
        password,
        role: 'superadmin',
      });

    // 🏢 CASE 2: NORMAL REGISTRATION (admin + organization)
    } else {
      if (!organizationName) {
        return res.status(400).json({ message: 'Organization name is required for non-superadmin users' });
      }

      // 1️⃣ Create organization
      newOrganization = await Organization.create({ name: organizationName });

      // 2️⃣ Create admin user
      newUser = await User.create({
        name,
        email,
        password,
        role: 'admin',
        organizationId: newOrganization._id,
      });

      // 3️⃣ Link organization owner
      newOrganization.owner = newUser._id;
      await newOrganization.save();
    }

    // 🔑 Create token
    const token = signToken(newUser._id);

    // TODO: You could send a generic "Welcome!" email here if you want
    // (but not the 'sendWelcomeEmail' with a temp password)

    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
        },
        organization: newOrganization
          ? { _id: newOrganization._id, name: newOrganization.name }
          : null,
      },
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
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
        if (typeof email !== 'string') {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        const user = await User.findOne({ email: { $eq: email } }).select('+password');

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


// @desc    User forgot password (sends email link)
// @route   POST /api/v1/auth/forgotpassword
exports.forgotPassword = async (req, res) => {
  try {
    // 1) Get user based on posted email
    const user = await User.findOne({ email: req.body.email });

    // 2) If user doesn't exist, send a generic success response
    if (!user) {
      return res.status(200).json({ 
        status: 'success', 
        message: 'If that email is registered, a token has been sent.' 
      });
    }

    // 3) Generate the random reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false }); 

    // 4) Create the reset URL for your frontend
    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // 5) Create email content (HTML + plain text)
    const textMessage = `Forgot your password? Reset it by visiting this link: ${resetURL}\n\nIf you didn't forget your password, please ignore this email! This link is valid for 10 minutes.`;

    const htmlMessage = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>We received a request to reset the password for your <span style="color: #1e3a8a; font-weight: bold;">SalesSphere</span> account.</p>
        <p>Please click the button below to set a new password. This link is only valid for 10 minutes.</p>
        <a href="${resetURL}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px; margin-bottom: 20px;">
          Reset Your Password
        </a>
        <p>If you did not request a password reset, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 12px; color: #6b7280;">This is an automated email — please do not reply.</p>
      </div>
    `;

    try {
      // 6) Send the email using your Resend utility
      await sendEmail({
        email: user.email,
        subject: 'Your SalesSphere Password Reset Link (Valid 10 Mins)',
        message: textMessage, // Plain text fallback
        html: htmlMessage,    // Rich HTML content
      });

      res.status(200).json({
        status: 'success',
        message: 'Token sent to email!',
      });
    } catch (err) {
      // If email fails, clear the token so user can try again
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ message: 'Error sending email. Please try again.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};



// @desc    Reset user's password
// @route   PATCH /api/v1/auth/resetpassword/:token
exports.resetPassword = async (req, res) => {
  try {
    // 1) Get the unhashed token from the URL params
    const unhashedToken = req.params.token;

    // 2) Hash it to match the version in the database
    const hashedToken = crypto
      .createHash('sha256')
      .update(unhashedToken)
      .digest('hex');

    // 3) Find the user by the hashed token AND ensure it has not expired
    //    ⬇️ --- MODIFIED: Added .select('+password') --- ⬇️
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }, 
    }).select('+password'); // <-- We need the password to compare it

    // 4) If no user, the token is invalid or has expired
    if (!user) {
      return res.status(400).json({ message: 'Token is invalid or has expired' });
    }

    // ⬇️ --- NEW STEP: Check if password is the same --- ⬇️
    // 5) Check if the new password is the same as the old one
    if (await user.matchPassword(req.body.password)) {
      return res.status(400).json({
        message: 'Cannot reuse old password. Please choose a new one.',
      });
    }
    // ⬆️ --- END OF NEW STEP --- ⬆️

    // 6) If token is valid and password is new, set the new password
    user.password = req.body.password;

    // 7) CRITICAL: Invalidate the token
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    
    await user.save(); // This triggers the pre-save hook to hash the new password

    // 8) Log the user in by sending a new JWT
    const token = signToken(user._id);
    user.password = undefined; // Remove password from output

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user,
      },
    });

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};