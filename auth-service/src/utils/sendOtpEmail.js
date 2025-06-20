const { Resend } = require('resend');
const dotenv = require('dotenv');
dotenv.config();

const sendOtpEmail = async (email, otp) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

    if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
        console.error('❌ [EMAIL] Missing RESEND_API_KEY or RESEND_FROM_EMAIL in .env file.');
        return;
    }

    const resend = new Resend(RESEND_API_KEY);

    try {
        console.log(`✉️ [EMAIL] Attempting to send OTP to ${email} via Resend...`);

        const { data, error } = await resend.emails.send({
            from: `PG Paal <${RESEND_FROM_EMAIL}>`,
            to: [email], // Resend expects an array of strings for the 'to' field
            subject: 'Your OTP for PG Paal Verification',
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2>PG Paal Verification</h2>
                    <p>Dear User,</p>
                    <p>Your One-Time Password (OTP) is:</p>
                    <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #5A2E8A;">${otp}</p>
                    <p>This code is valid for 5 minutes. Please use it to complete your verification.</p>
                    <p>If you did not request this, please ignore this email.</p>
                    <br>
                    <p>Thank you,</p>
                    <p><strong>Team Purple PG</strong></p>
                </div>
            `,
        });

        if (error) {
            console.error(`❌ [EMAIL] Failed to send OTP email to ${email}. Resend Error:`, error);
            return;
        }

        console.log(`✅ [EMAIL] OTP Email sent successfully to ${email}. Response ID: ${data.id}`);

    } catch (e) {
        console.error(`❌ [EMAIL] An unexpected error occurred while sending email to ${email}.`);
        console.error(e);
    }
};

module.exports = sendOtpEmail;