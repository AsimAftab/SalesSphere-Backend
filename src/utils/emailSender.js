const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Generic function to send any email using Resend
 */
const sendEmail = async (options) => {
  try {
    const to = Array.isArray(options.emails)
      ? options.emails
      : [options.email || ''];

    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: options.subject,
      text: options.message,
      html: options.html,
    });

    console.log(`✅ Email sent to ${to.join(', ')}`, response.id || '');
    return response;
  } catch (error) {
    console.error('❌ Error sending email via Resend:', error);
    throw error;
  }
};

/**
 * Send Welcome Email (HTML + plain text fallback)
 */
const sendWelcomeEmail = async (toEmail, temporaryPassword) => {
  const subject = 'Welcome to SalesSphere - Your Account Details';

  const textMessage = `Welcome to SalesSphere!

Your account has been created.
Your temporary password is: ${temporaryPassword}

Please log in and change your password.

Thank you!`;

  const htmlMessage = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6;">
      <h2 style="color: #2563eb;">Welcome to <span style="color: #1e3a8a;">SalesSphere</span>!</h2>
      <p>Your account has been successfully created 🎉</p>
      <p style="font-size: 15px;">Here are your login details:</p>
      <div style="background: #f3f4f6; padding: 12px 16px; border-radius: 8px; font-size: 14px;">
        <p><strong>Temporary Password:</strong> <span style="color: #2563eb;">${temporaryPassword}</span></p>
      </div>
      <p style="margin-top: 16px;">Please log in and change your password as soon as possible for security reasons.</p>
      <p>Thank you for joining <strong>SalesSphere</strong>!</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <p style="font-size: 12px; color: #6b7280;">This is an automated email — please do not reply.</p>
    </div>
  `;

  try {
    await sendEmail({
      email: toEmail,
      subject,
      message: textMessage,
      html: htmlMessage,
    });

    console.log(`✅ Welcome email sent to ${toEmail}`);
  } catch (error) {
    console.error(`❌ Error sending welcome email to ${toEmail}:`, error);
    throw error;
  }
};

module.exports = { sendEmail, sendWelcomeEmail };
