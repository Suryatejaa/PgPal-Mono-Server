const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const sendMail = async ({ to, subject, text }) => {
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

    const mailOptions = {
        from: process.env.EMAIL,
        to,
        subject,
        text,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
};

module.exports = sendMail;