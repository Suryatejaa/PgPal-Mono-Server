const otp = require('otp-generator');
const otpGenerator = () => {
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    return otp.toString();
};
module.exports = otpGenerator;
