const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');
const { sendEmail, sendWelcomeEmail } = require('../../utils/emailSender');
const { isSystemRole } = require('../../utils/defaultPermissions');

// Function to sign an access token (short-lived)
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m', // Short-lived: 15 minutes
  });
};

// Function to sign a refresh token (long-lived)
const signRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', // Long-lived: 7 days
  });
};

// Helper to send tokens (access + refresh) as both cookie AND in response
const sendTokenResponse = async (
  user,
  statusCode,
  res,
  includeTokenInResponse = false,
  options = {}
) => {
  const { setCookie = true, orgWithPlan = null } = options; // orgWithPlan for subscription intersection
  const accessToken = signToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Save refresh token to database
  user.refreshToken = refreshToken;
  user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days (sliding)

  // Set absolute session expiry from environment variable (default 30 days) - only if not already set
  if (!user.sessionExpiresAt) {
    const maxSessionDays = parseInt(process.env.MAX_SESSION_DURATION_DAYS) || 30;
    user.sessionExpiresAt = new Date(Date.now() + maxSessionDays * 24 * 60 * 60 * 1000);
  }

  await user.save({ validateBeforeSave: false });

  // Set access token cookie
  if (setCookie) {
    const accessTokenCookieOptions = {
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging',
      sameSite:
        process.env.NODE_ENV === 'production'
          ? 'strict'
          : process.env.NODE_ENV === 'staging'
            ? 'none'
            : 'lax',
    };
    res.cookie('token', accessToken, accessTokenCookieOptions);

    // Set refresh token cookie (longer expiry, httpOnly)
    const refreshTokenCookieOptions = {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging',
      sameSite:
        process.env.NODE_ENV === 'production'
          ? 'strict'
          : process.env.NODE_ENV === 'staging'
            ? 'none'
            : 'lax',
    };
    res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
  }

  // Remove sensitive fields from the user object before sending
  user.password = undefined;
  user.refreshToken = undefined;
  user.refreshTokenExpiry = undefined;

  // Get user's effective permissions (intersected with plan if org provided)
  let permissions;
  if (typeof user.getEffectivePermissions === 'function') {
    permissions = orgWithPlan
      ? user.getEffectivePermissionsWithPlan(orgWithPlan)
      : user.getEffectivePermissions();
  } else {
    permissions = {};
  }

  // Build subscription info for response
  let subscriptionInfo = null;
  if (orgWithPlan && orgWithPlan.subscriptionPlanId) {
    const plan = orgWithPlan.subscriptionPlanId;
    subscriptionInfo = {
      planName: plan.name,
      tier: plan.tier,
      maxEmployees: plan.maxEmployees,
      enabledModules: plan.enabledModules,
      subscriptionEndDate: orgWithPlan.subscriptionEndDate,
      isActive: orgWithPlan.subscriptionEndDate ? new Date() < new Date(orgWithPlan.subscriptionEndDate) : true
    };
  }

  const response = {
    status: 'success',
    data: {
      user,
      permissions,
      mobileAppAccess: typeof user.hasMobileAccess === 'function' ? user.hasMobileAccess() : false,
      webPortalAccess: typeof user.hasWebAccess === 'function' ? user.hasWebAccess() : false,
      subscription: subscriptionInfo
    },
  };

  // For mobile clients, include tokens in response
  if (includeTokenInResponse) {
    response.accessToken = accessToken;
    response.refreshToken = refreshToken;
  }

  res.status(statusCode).json(response);
};


// @desc    Register a superadmin (no organization required)
// @route   POST /api/v1/auth/register/superadmin
exports.registerSuperAdmin = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      address,
      gender,
      dateOfBirth,
      citizenshipNumber,
      avatarUrl
    } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Please provide name, email, and password',
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: { $eq: email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Build user data object
    const userData = {
      name,
      email,
      password,
      role: 'superadmin',
    };

    // Add optional fields if provided
    if (phone) userData.phone = phone;
    if (address) userData.address = address;
    if (gender) userData.gender = gender;
    if (dateOfBirth) userData.dateOfBirth = dateOfBirth;
    if (citizenshipNumber) userData.citizenshipNumber = citizenshipNumber;
    if (avatarUrl) userData.avatarUrl = avatarUrl;

    // Create superadmin user (no organization)
    const newUser = await User.create(userData);

    // Send token response (cookie for web, JSON for mobile if X-Client-Type header present)
    const isMobileClient = req.headers['x-client-type'] === 'mobile';
    sendTokenResponse(newUser, 201, res, isMobileClient);
  } catch (error) {
    console.error('❌ SuperAdmin registration error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Register a new organization and its admin user
// @route   POST /api/v1/auth/register
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      organizationName,
      panVatNumber,
      phone,
      address,
      country,
      latitude,
      longitude,
      googleMapLink,
      subscriptionType,
      subscriptionPlanId,
      checkInTime,
      checkOutTime,
      halfDayCheckOutTime,
      weeklyOffDay,
      timezone
    } = req.body;

    // Basic validation - password is no longer required from user
    if (!name || !email) {
      return res.status(400).json({
        message: 'Please provide name and email',
      });
    }

    // Organization-specific validation
    if (!organizationName || !panVatNumber || !phone || !address) {
      return res.status(400).json({
        message: 'Please provide organization name, PAN/VAT number, phone, and address'
      });
    }

    if (!subscriptionType || !['6months', '12months'].includes(subscriptionType)) {
      return res.status(400).json({
        message: 'Please provide a valid subscription type (6months or 12months)'
      });
    }

    // Validate subscription plan
    if (!subscriptionPlanId) {
      return res.status(400).json({
        message: 'Please provide a subscription plan ID'
      });
    }

    // Verify that the subscription plan exists
    const SubscriptionPlan = require('../subscriptions/subscriptionPlan.model');
    const planExists = await SubscriptionPlan.findById(subscriptionPlanId);
    if (!planExists || !planExists.isActive) {
      return res.status(400).json({
        message: 'Invalid or inactive subscription plan'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: { $eq: email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Check if PAN/VAT number already exists
    const existingOrg = await Organization.findOne({ panVatNumber: { $eq: panVatNumber } });
    if (existingOrg) {
      return res.status(400).json({ message: 'Organization with this PAN/VAT number already exists' });
    }

    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('hex');

    // 1️⃣ Create organization with all details
    const organizationData = {
      name: organizationName,
      panVatNumber,
      phone,
      address,
      subscriptionType,
      subscriptionPlanId,
    };

    // Add optional location fields if provided
    if (latitude !== undefined && latitude !== null) {
      organizationData.latitude = latitude;
    }
    if (longitude !== undefined && longitude !== null) {
      organizationData.longitude = longitude;
    }
    if (googleMapLink) {
      organizationData.googleMapLink = googleMapLink;
    }
    if (country) {
      organizationData.country = country;
    }

    // Add optional check-in/check-out times if provided
    if (checkInTime) {
      organizationData.checkInTime = checkInTime;
    }
    if (checkOutTime) {
      organizationData.checkOutTime = checkOutTime;
    }
    if (halfDayCheckOutTime) {
      organizationData.halfDayCheckOutTime = halfDayCheckOutTime;
    }

    // Add optional weekly off day if provided
    if (weeklyOffDay) {
      organizationData.weeklyOffDay = weeklyOffDay;
    }

    // Add optional timezone if provided (defaults to Asia/Kolkata in model)
    if (timezone) {
      organizationData.timezone = timezone;
    }

    const newOrganization = await Organization.create(organizationData);

    // 2️⃣ Create admin user with temporary password
    const newUser = await User.create({
      name,
      email,
      password: temporaryPassword,
      role: 'admin',
      organizationId: newOrganization._id,
    });

    // 3️⃣ Link organization owner
    newOrganization.owner = newUser._id;
    await newOrganization.save();

    // 4️⃣ Send welcome email with temporary password
    await sendWelcomeEmail(newUser.email, temporaryPassword);

    // 🔑 Send token response (cookie for web, JSON for mobile if X-Client-Type header present)
    // Include organization data in response
    newUser.organization = {
      _id: newOrganization._id,
      name: newOrganization.name,
      panVatNumber: newOrganization.panVatNumber,
      phone: newOrganization.phone,
      address: newOrganization.address,
      country: newOrganization.country,
      checkInTime: newOrganization.checkInTime,
      checkOutTime: newOrganization.checkOutTime,
      halfDayCheckOutTime: newOrganization.halfDayCheckOutTime,
      weeklyOffDay: newOrganization.weeklyOffDay,
      timezone: newOrganization.timezone,
      subscriptionType: newOrganization.subscriptionType,
      subscriptionEndDate: newOrganization.subscriptionEndDate,
      isSubscriptionActive: newOrganization.isSubscriptionActive,
    };

    // Fetch organization with populated subscription plan for response
    const orgWithPlan = await Organization.findById(newOrganization._id).populate('subscriptionPlanId');

    const isMobileClient = req.headers['x-client-type'] === 'mobile';
    sendTokenResponse(newUser, 201, res, isMobileClient, { setCookie: false, orgWithPlan });
  } catch (error) {
    console.error('❌ Registration error:', error);

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        message: `An organization with this ${field} already exists`
      });
    }

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

    const user = await User.findOne({ email: { $eq: email } })
      .select('+password')
      .populate('customRoleId');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }
    if (user.isActive === false) {
      return res.status(403).json({
        status: 'error',
        message: 'Your account is inactive. Please contact the administrator to reactivate your account.'
      });
    }

    // Check if this is a mobile client
    // Check if this is a mobile client (header or body flag)
    const isMobileClient = req.headers['x-client-type'] === 'mobile' || req.body.isMobileApp === true;

    // Mobile App Access Check
    if (isMobileClient) {
      if (!user.hasMobileAccess()) {
        return res.status(403).json({
          status: 'error',
          message: 'Mobile app access is disabled for your account. Please contact your administrator.'
        });
      }
    } else {
      // 2. Web Portal Access Check
      if (typeof user.hasWebAccess === 'function' && !user.hasWebAccess()) {
        return res.status(403).json({
          status: 'error',
          message: 'Web portal access is disabled for your account. Please use the mobile application.'
        });
      }
    }

    // Fetch organization with subscription plan for permission intersection
    let orgWithPlan = null;
    if (user.organizationId && !isSystemRole(user.role)) {
      orgWithPlan = await Organization.findById(user.organizationId)
        .populate('subscriptionPlanId')
        .lean();
    }

    // Send token response (cookie for web, JSON for mobile if X-Client-Type header present)
    sendTokenResponse(user, 200, res, isMobileClient, { orgWithPlan });
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

    // 8) Log the user in by sending token response (cookie for web, JSON for mobile)
    const isMobileClient = req.headers['x-client-type'] === 'mobile';
    sendTokenResponse(user, 200, res, isMobileClient);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  // simple, permissive email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

const isValidPreferredDate = (d) => {
  if (!d) return false;
  // allow Date objects or strings
  const date = typeof d === 'string' ? new Date(d) : new Date(d);
  return !Number.isNaN(date.getTime());
};

const validatePhone = (phone) => {
  if (!phone) return false;
  if (typeof phone !== 'string') return false;
  const cleaned = phone.trim();
  return /^[+\d\-\s()]{6,20}$/.test(cleaned);
};
// Simple HTML-escape helper (use a library for stronger guarantees)
const escapeHtml = (str = '') =>
  String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

// -----------------------------
// Contact Admin controller
// -----------------------------
// @desc    Handle 'Contact Admin' form submission
// @route   POST /api/v1/auth/contact-admin
exports.contactAdmin = async (req, res) => {
  try {
    const {
      fullName = '',
      email = '',
      department = '',
      requestType = '',
      message = '',
    } = req.body || {};

    if (!fullName || !email || !message) {
      return res.status(400).json({ status: 'error', message: 'Please provide fullName, email and message.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Please provide a valid email address.' });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
    if (!adminEmail) {
      console.error('❌ CRITICAL: ADMIN_EMAIL is not set in environment.');
      return res.status(500).json({ status: 'error', message: 'Server error: Cannot process request.' });
    }

    const subject = `New Admin Request: ${requestType || 'General Inquiry'} from ${fullName}`;

    const textMessage = [
      'New support request received from the "Contact Admin" form:',
      '',
      `Full Name: ${fullName}`,
      `Email: ${email}`,
      `Department / Role: ${department || 'Not provided'}`,
      `Request Type: ${requestType || 'Not provided'}`,
      '',
      'Message:',
      `${message}`,
    ].join('\n');

    const htmlMessage = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #2563eb;">New Support Request</h2>
        <p>A new request has been submitted via the "Contact Admin" form.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 5px; color: #6b7280; width: 150px;">Full Name:</td>
            <td style="padding: 10px 5px; font-weight: bold;">${escapeHtml(fullName)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 5px; color: #6b7280;">Email ID:</td>
            <td style="padding: 10px 5px; font-weight: bold;">${escapeHtml(email)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 5px; color: #6b7280;">Department / Role:</td>
            <td style="padding: 10px 5px; font-weight: bold;">${escapeHtml(department || 'Not provided')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 5px; color: #6b7280;">Request Type:</td>
            <td style="padding: 10px 5px; font-weight: bold;">${escapeHtml(requestType || 'Not provided')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 5px; color: #6b7280; vertical-align: top;">Message:</td>
            <td style="padding: 10px 5px; font-weight: bold; white-space: pre-wrap;">${escapeHtml(message)}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 12px; color: #6b7280;">This is an automated notification.</p>
      </div>
    `;

    // sendEmail signature: { email, subject, message, html, ... }
    // If your email util expects `replyTo` instead of `reply_to` use that. We include both keys
    await sendEmail({
      email: adminEmail,
      subject,
      message: textMessage,
      html: htmlMessage,
      replyTo: email,
      reply_to: email,
    });

    return res.status(200).json({ status: 'success', message: 'Your request has been sent to the admin.' });
  } catch (error) {
    console.error('❌ Error in contactAdmin controller:', error);
    return res.status(500).json({ status: 'error', message: 'Server Error while processing your request.' });
  }
};



// Schedule Demo controller
// -----------------------------
// @desc    Handle 'Schedule a Demo' form submission
// @route   POST /api/v1/auth/schedule-demo
exports.scheduleDemo = async (req, res) => {
  try {
    const {
      fullName = '',
      company = '',
      email = '',
      phone = '',
      preferredDate = '',
      message = '',
    } = req.body || {};

    // required fields: fullName, email, message
    if (!fullName || !email || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide fullName, email and message.',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address.',
      });
    }

    if (phone && !validatePhone(phone)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid phone number (including country code).',
      });
    }

    if (preferredDate && !isValidPreferredDate(preferredDate)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid preferredDate (ISO date string or parseable date).',
      });
    }

    // target recipient: DEMO_EMAIL or fallback to ADMIN_EMAIL
    const demoEmail = (process.env.DEMO_EMAIL || process.env.ADMIN_EMAIL || '').trim();
    if (!demoEmail) {
      console.error('❌ CRITICAL: DEMO_EMAIL / ADMIN_EMAIL is not set in environment.');
      return res.status(500).json({ status: 'error', message: 'Server error: Cannot process request.' });
    }

    const subject = `Demo Request: ${fullName}${company ? ` — ${company}` : ''}`;

    const textMessageParts = [
      'New demo request received:',
      '',
      `Full Name: ${fullName}`,
      `Company: ${company || 'Not provided'}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      `Preferred Date: ${preferredDate || 'Not provided'}`,
      '',
      'Message:',
      `${message}`,
    ];
    const textMessage = textMessageParts.join('\n');

    const htmlMessage = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #2563eb;">New Demo Request</h2>
        <p>A new demo request has been submitted via the "Schedule a Demo" form.</p>
        <table style="width:100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding:10px 5px; color:#6b7280; width:150px;">Full Name:</td>
            <td style="padding:10px 5px; font-weight:bold;">${escapeHtml(fullName)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding:10px 5px; color:#6b7280;">Company:</td>
            <td style="padding:10px 5px; font-weight:bold;">${escapeHtml(company || 'Not provided')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding:10px 5px; color:#6b7280;">Email:</td>
            <td style="padding:10px 5px; font-weight:bold;">${escapeHtml(email)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding:10px 5px; color:#6b7280;">Phone:</td>
            <td style="padding:10px 5px; font-weight:bold;">${escapeHtml(phone || 'Not provided')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding:10px 5px; color:#6b7280;">Preferred Date:</td>
            <td style="padding:10px 5px; font-weight:bold;">${escapeHtml(preferredDate || 'Not provided')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding:10px 5px; color:#6b7280; vertical-align: top;">Message:</td>
            <td style="padding:10px 5px; font-weight:bold; white-space: pre-wrap;">${escapeHtml(message)}</td>
          </tr>
        </table>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;">
        <p style="font-size:12px; color:#6b7280;">This is an automated notification.</p>
      </div>
    `;

    // sendEmail signature: { email, subject, message, html, replyTo/ reply_to }
    await sendEmail({
      email: demoEmail,
      subject,
      message: textMessage,
      html: htmlMessage,
      replyTo: email,
      reply_to: email,
    });

    return res.status(200).json({ status: 'success', message: 'Your demo request has been sent. Our team will reach out soon.' });
  } catch (error) {
    console.error('❌ Error in scheduleDemo controller:', error);
    return res.status(500).json({ status: 'error', message: 'Server Error while processing your request.' });
  }
};


// @desc    Logout user by clearing cookies and invalidating refresh token
// @route   POST /api/v1/auth/logout
exports.logout = async (req, res) => {
  try {
    // Invalidate refresh token in database if user is authenticated
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        refreshToken: null,
        refreshTokenExpiry: null,
        sessionExpiresAt: null
      });
    }

    // Clear access token cookie
    res.cookie('token', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000), // Expires in 10 seconds
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging',
      sameSite: process.env.NODE_ENV === 'production'
        ? 'strict'
        : process.env.NODE_ENV === 'staging'
          ? 'none'
          : 'lax',
    });

    // Clear refresh token cookie
    res.cookie('refreshToken', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000), // Expires in 10 seconds
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging',
      sameSite: process.env.NODE_ENV === 'production'
        ? 'strict'
        : process.env.NODE_ENV === 'staging'
          ? 'none'
          : 'lax',
    });

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Check if user's JWT is valid
// @route   GET /api/v1/auth/check-status
exports.checkAuthStatus = (req, res) => {
  // If the 'protect' middleware passed, req.user is attached.
  // The middleware handles the 401 error if the token is invalid/expired.

  // The frontend just needs to know if the token is good.
  // If it gets this 200 OK, it proceeds.
  // If it gets a 401 (handled by 'protect'), it redirects to login.
  res.status(200).json({
    status: 'success',
    message: 'Token is valid.',
    data: {
      user: req.user // Return user data from protect middleware
    }
  });
};

// @desc    Refresh access token using refresh token
// @route   POST /api/v1/auth/refresh
// @desc    Refresh access token using refresh token
// @route   POST /api/v1/auth/refresh
exports.refreshToken = async (req, res, next) => {
  try {
    // 1. Unified extraction (Handles Web Cookies & Mobile Body)
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ status: 'error', message: 'No refresh token provided' });
    }

    // 2. Token Verification
    let decoded;
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );
    } catch (error) {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired refresh token' });
    }

    // 3. Database Check (Verify token hasn't been rotated/revoked)
    const user = await User.findById(decoded.id).select('+refreshToken +refreshTokenExpiry +sessionExpiresAt');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ status: 'error', message: 'Token is invalid or has been reused' });
    }

    // 4. Security Checks (Sliding Expiry, Absolute Expiry, & Active Status)
    const now = Date.now();
    const isExpired = !user.refreshTokenExpiry || user.refreshTokenExpiry < now;
    const isSessionOver = user.sessionExpiresAt && user.sessionExpiresAt < now;

    if (isExpired || isSessionOver) {
      // Cleanup on expiry
      user.refreshToken = null;
      user.refreshTokenExpiry = null;
      await user.save({ validateBeforeSave: false });

      const msg = isSessionOver ? 'Session has expired (30-day limit)' : 'Refresh token expired';
      return res.status(401).json({ status: 'error', message: `${msg}. Please login again.` });
    }

    if (user.isActive === false) {
      return res.status(403).json({ status: 'error', message: 'Account is inactive.' });
    }

    // 5. Use existing helper to handle Cookie setting and JSON response
    // This ensures Web and Mobile are handled exactly like the login route
    const isMobileClient = req.headers['x-client-type'] === 'mobile';

    // We pass includeTokenInResponse = isMobileClient to the helper
    return sendTokenResponse(user, 200, res, isMobileClient);

  } catch (error) {
    console.error('❌ Refresh token error:', error);
    res.status(500).json({ status: 'error', message: 'Server Error' });
  }
};