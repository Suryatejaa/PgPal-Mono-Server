const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const sendOtpEmail = async (email, otp) => {
    if (!process.env.EMAIL || !process.env.EMAIL_PASSWORD) {
        console.error('❌ [EMAIL] Missing EMAIL or EMAIL_PASSWORD in .env file. Cannot send email.');
        return;
    }

    const transporter = nodemailer.createTransport({
        port: 587,
        secure: false,
        service: 'gmail',
        host: 'smtp.gmail.com',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.EMAIL_PASSWORD,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: `"Purple PG" <${process.env.EMAIL}>`,
        to: email,
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
    };

    try {
        console.log(`✉️ [EMAIL] Attempting to send OTP to ${email}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ [EMAIL] OTP Email sent successfully to ${email}. Response: ${info.response}`);
    } catch (error) {
        console.error(`❌ [EMAIL] Failed to send OTP email to ${email}.`);
        console.error(`   Error Code: ${error.code}`);
        console.error(`   Error Message: ${error.message}`);
    }
};

module.exports = sendOtpEmail;