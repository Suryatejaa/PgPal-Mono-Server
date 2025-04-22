const User = require('../models/userModel');
const otpStore = {};
const bcrypt = require('bcryptjs');
const sendOtp = require('./authController').sendOtp;

const forgotPasswordRequestUser = async (req, res) => {
    const { credential } = req.body;
    const email = (await User.findOne({
        $or: [
            { email: credential },
            { phoneNumber: credential },
            { username: credential }
        ]
    }).select('email').lean())?.email;

    if (!email) return res.status(404).send({ message: 'User not found' });

    const userDetails = { body: { email } };

    try {
        await sendOtp(userDetails, res);
    } catch (error) {
        return res.status(400).send({
            message: 'Error send otp',
            error: error.response?.data?.message || error.message
        });
    }
};

const forgotPasswordVerifyOtp = async (req, res) => {
    const { otp, newPassword, confirmPassword } = req.body;
    const otpString = otp.toString();
    console.log("otpStore: ", otpStore);
    for (const email in otpStore) {
        if (otpStore[email].otp === otpString) {
            if (Date.now() > otpStore[email].otpExpiry) {
                return res.status(400).send({ message: 'OTP expired. Request a new OTP.' });
            }
            req.body.email = email;
            return forgotPasswordResetUser({ body: { email, newPassword, confirmPassword } }, res);
        }
    }
    return res.status(400).send({ message: 'Invalid OTP' });
};

const forgotPasswordResetUser = async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
        return res.status(400).send({ message: `Passwords doesn't match` });
    }
    const user = await User.findOne({ email });

    if (!user) return res.status(401).send({ message: 'User not found' });
    delete otpStore[email];
    await user.updateOne({ password: await bcrypt.hash(newPassword, 12), otp: null });
    res.send({ message: 'Password reset successfully' });
};

const passwordResetUser = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = req.user;
    const isValid = await user.comparePassword(oldPassword);
    if (!isValid) return res.status(401).send({ message: 'Invalid old password' });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.send({ message: 'Password reset successfully' });
};

module.exports = {
    forgotPasswordRequestUser,
    forgotPasswordVerifyOtp,
    forgotPasswordResetUser,
    passwordResetUser
};
