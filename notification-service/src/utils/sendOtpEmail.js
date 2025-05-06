const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();
const sendOtpEmail = async (email, otp) => {
    const transporter = nodemailer.createTransport({
        port: 587,
        secureConnection: false,
        service: 'gmail',
        host: 'smtp.gmail.com',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.EMAIL_PASSWORD,

        },
    });
    console.log(email, otp)
    // console.log(process.env.EMAIL);
    // console.log(process.env.EMAIL_PASSWORD);
    const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: 'OTP Verification for PG Paal',
        text: `Your OTP is ${otp}`,
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
        }
        else {
            console.log("Email sent: " + info.response);
        }
    });
};
module.exports = sendOtpEmail;
