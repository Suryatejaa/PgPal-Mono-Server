const User = require('../models/userModel');
const otpStore = {};
const axios = require('axios');
const jwt = require('jsonwebtoken');
const redisClient = require('../utils/redis.js'); // Adjust the path as needed
const { generatePPT } = require('../utils/idGenerator.js');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');



const setHeader = (res, token) => {
    res.setHeader('Authorization', `Bearer ${token}`);
};

const registerUser = async (req, res) => {
    try {
        const { username, email, phoneNumber, gender, role, password, location } = req.body;

        // Store user data temporarily
        userDetails = { username, email, phoneNumber, gender, role, password, location };
        try {
            const otpResponse = await axios.post('http://localhost:4001/api/auth-service/otp/send', userDetails);
            if (otpResponse.status === 200) {
                res.status(200).send({
                    message: 'OTP sent to your email. Verify OTP to complete registration.'
                });
            }
        } catch (error) {
            return res.status(400).send({
                message: 'Error sending otp',
                error: error.response?.data?.message || error.message
            });
        }
    } catch (error) {
        res.status(400).send({
            message: 'Error registering user',
            error: error.message
        });
    }
};

const loginUser = async (req, res) => {
    try {
        const { credential, password, role } = req.body;
        //Find user by credential and role;
        const user = await User.findOne({
            $and: [
                {
                    $or: [
                        { email: credential },
                        { phoneNumber: credential },
                        { username: credential },
                        { pgpalId: credential }
                    ]
                },
                { role: role } // Ensure the role matches
            ]
        });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credential or role' });
        }
        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({ message: 'Incorrect password' });
        }

        const token = user.generateAuthToken();
        const refreshToken = user.generateRefreshToken();
        const cookieExpires = 3600000; // 1 hour in milliseconds
        res.cookie('token', token, {
            httpOnly: false,
            sameSite: 'None',
            secure: 'lax',
            maxAge: 15 * 60 * 1000,
            path: '/',
        }); // 5 mins
        res.cookie('refreshToken', refreshToken, {
            httpOnly: false,
            sameSite: 'None',
            secure: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        }); // 7 days
        res.setHeader('Authorization', `Bearer ${token}`);
        res.setHeader('Refresh-Token', refreshToken);
        setHeader(res, token);
        res.send({
            message: 'Logged in successfully',
            user: {
                _id: user._id,
                name: user.username,
                email: user.email,
                role: user.role,
                phone: user.phoneNumber,
                pgpalId: user.pgpalId,
                gender: user.gender
            },
            authToken: token,
            refreshToken: refreshToken
        });

        await User.findByIdAndUpdate(user._id, { refreshToken: refreshToken });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            message: 'Error logging in user',
            error: error.message
        });
    }
};

const logoutUser = async (req, res) => {
    try {
        const { _id: userId } = req.user;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        await User.findByIdAndUpdate(user._id, { refreshToken: null });

        res.clearCookie('token', { httpOnly: true, sameSite: 'None', secure: 'Lax' });
        res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'None', secure: 'Lax' });


        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Logout failed', error: error.message });
    }
};

const getUser = async (req, res) => {
    try {


        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const user = req.user;

        res.send(user);
    } catch (error) {
        res.status(400).send({
            error: error.message,
            message: 'Error getting user'
        });
    }
};

const checkUsernameAvailability = async (req, res) => {
    try {
        const cacheKey = 'all_usernames'; // Use a fixed key for all usernames
        let usernames;

        // 1. Try to get usernames from cache
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                usernames = JSON.parse(cached);
            }
        }

        // 2. If not cached, fetch from DB and cache it
        if (!usernames) {
            const users = await User.find({}, 'username');
            usernames = users.map(u => u.username.toLowerCase());
            if (redisClient.isReady) {
                await redisClient.set(cacheKey, JSON.stringify(usernames), { EX: 600 }); // 10 min cache
            }
        }

        // 3. Check availability
        let { username } = req.query;
        if (username) username = username.toLowerCase();
        const isTaken = usernames.includes(username);
        res.status(200).send({
            available: !isTaken,
            message: isTaken ? 'Username is not available' : 'Username is available'
        });
    } catch (error) {
        res.status(500).send({ message: 'Error checking username availability', error: error.message });
    }
};

const checkEmailAvailability = async (req, res) => {
    try {
        const cacheKey = 'all_emails';
        let emails;

        // 1. Try to get emails from cache
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                emails = JSON.parse(cached);
            }
        }

        // 2. If not cached, fetch from DB and cache it
        if (!emails) {
            const users = await User.find({}, 'email');
            emails = users.map(u => u.email.toLowerCase());
            if (redisClient.isReady) {
                await redisClient.set(cacheKey, JSON.stringify(emails), { EX: 600 }); // 10 min cache
            }
        }

        // 3. Check availability
        let { email } = req.query;
        if (email) email = email.toLowerCase();
        const isTaken = emails.includes(email);

        res.status(200).send({
            available: !isTaken,
            message: isTaken ? 'Email is not available' : 'Email is available'
        });
    } catch (error) {
        res.status(500).send({ message: 'Error checking email availability', error: error.message });
    }
};

const checkPhoneNumberAvailability = async (req, res) => {
    try {
        const cacheKey = 'all_phone_numbers';
        let phoneNumbers;

        // 1. Try to get phone numbers from cache
        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                phoneNumbers = JSON.parse(cached);
            }
        }

        // 2. If not cached, fetch from DB and cache it
        if (!phoneNumbers) {
            const users = await User.find({}, 'phoneNumber');
            phoneNumbers = users.map(u => u.phoneNumber);
            if (redisClient.isReady) {
                await redisClient.set(cacheKey, JSON.stringify(phoneNumbers), { EX: 600 }); // 10 min cache
            }
        }

        // 3. Check availability
        let { phoneNumber } = req.query;
        const isTaken = phoneNumbers.includes(phoneNumber);

        res.status(200).send({
            available: !isTaken,
            message: isTaken ? 'Phone number is not available' : 'Phone number is available'
        });
    } catch (error) {
        res.status(500).send({ message: 'Error checking phone number availability', error: error.message });
    }
};


const getUserById = async (req, res) => {
    try {
        const id = req.query.id;
        const phoneNumber = req.query.phnum;
        const pgpalId = req.query.ppid;
        const query = {};
        if (id) query._id = id;
        if (phoneNumber) query.phoneNumber = phoneNumber;
        if (pgpalId) query.pgpalId = pgpalId;

        const user = await User.findOne({ $or: Object.entries(query).map(([key, value]) => ({ [key]: value })) }
            , { password: 0, refreshToken: 0 });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.send(user);
    } catch (error) {
        res.status(400).send({
            error: error.message,
            message: 'Error getting user by ID'
        });
    }
};

const otpGenerator = require('../utils/otpGenerator');
const sendOtpEmail = require('../utils/sendOtpEmail');


const updateUser = async (req, res) => {
    try {
        const userId = req.user._id;
        const { username, email, phoneNumber, currentPassword, newPassword, confirmNewPassword } = req.body;
        const updateFields = {};

        // Only allow username and phoneNumber direct update
        if (username) {
            const existingUser = await User.findOne({ username: username.toLowerCase(), _id: { $ne: userId } });
            if (existingUser) {
                return res.status(400).json({ message: 'Username is already taken.' });
            }
            updateFields.username = username;
        }
        if (phoneNumber) {
            const existingUser = await User.findOne({ phoneNumber, _id: { $ne: userId } });
            if (existingUser) {
                return res.status(400).json({ message: 'Phone number is already taken.' });
            }
            const user = await User.findByIdAndUpdate(userId, { phoneNumber }, { new: true });

        }
        // Email change: check if email is already taken
        if (email) {
            const existingUser = await User.findOne({ email, _id: { $ne: userId } });
            if (existingUser) {
                return res.status(400).json({ message: 'Email is already taken.' });
            }

            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found.' });

            const otp = otpGenerator();
            otpStore[email] = { otp, otpExpiry: Date.now() + 5 * 60 * 1000, userId };
            await sendOtpEmail(email, otp);
            return res.status(200).json({ message: 'OTP sent to new email. Please verify OTP to update email.' });
        }

        // Password change
        if (currentPassword || newPassword || confirmNewPassword) {
            if (!currentPassword || !newPassword || !confirmNewPassword) {
                return res.status(400).json({ message: 'Current, new, and confirm new passwords are required.' });
            }
            if (newPassword !== confirmNewPassword) {
                return res.status(400).json({ message: 'New passwords do not match.' });
            }
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found.' });
            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) {
                return res.status(400).json({ message: 'Current password is incorrect.' });
            }
            await User.findOneAndUpdate(userId, { password: newPassword }, { new: true });
            return res.status(200).json({ message: "Password Updated Successfully" });
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'No valid fields to update.' });
        }

        const user = await User.findByIdAndUpdate(userId, updateFields, { new: true });
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Invalidate caches
        await invalidateCacheByPattern('*all_usernames*');
        await invalidateCacheByPattern('*all_emails*');
        await invalidateCacheByPattern('*all_phone_numbers*');

        res.send(user);
    } catch (error) {
        res.status(400).send({ message: 'Error updating user', error: error.message });
    }
};

const sendOtp = async (req, res) => {
    try {
        const userDetails = req.body;
        const email = userDetails.email;
        const otp = otpGenerator();
        const otpExpiry = Date.now() + 5 * 60 * 1000;

        otpStore[email] = { otp, otpExpiry, ...userDetails };

        await sendOtpEmail(email, otp);
        res.status(200).send({ message: 'OTP sent to your email. Verify OTP to complete registration.' });
    } catch (error) {
        console.error('Error sending OTP: ', error.message);
        throw new Error('Failed to send OTP. Please try again later.');
    }
};

const verifyEmailOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const userData = otpStore[email];
        const userId = userData.userId;

        if (!userData) {
            return res.status(400).json({ message: 'OTP expired or not found.' });
        }
        const otpString = otp.toString();
        if (userData.otp !== otpString) {
            return res.status(400).send({ message: 'Invalid OTP' });
        }

        if (userData.otp !== otp.toString()) {
            return res.status(400).json({ message: 'Invalid OTP.' });
        }
        if (Date.now() > userData.otpExpiry) {
            delete otpStore[email];
            return res.status(400).json({ message: 'OTP expired. Request a new OTP.' });
        }

        // Update the user's email
        const user = await User.findByIdAndUpdate(userId, { email }, { new: true });
        if (!user) return res.status(404).json({ message: 'User not found.' });

        delete otpStore[email];

        // Invalidate caches
        await invalidateCacheByPattern('*all_emails*');

        res.status(200).json({ message: 'Email updated successfully.', user });
    } catch (error) {
        res.status(400).json({ message: 'Error verifying OTP', error: error.message });
    }
};
const resendOtp = async (req, res) => {
    try {
        const { email, ...userDetails } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required to resend OTP.' });
        }

        const otp = otpGenerator();
        const otpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store OTP and any relevant user details for later verification
        otpStore[email] = { otp, otpExpiry, ...userDetails };

        await sendOtpEmail(email, otp);

        res.status(200).json({ message: 'OTP resent to your email. Please check your inbox.' });
    } catch (error) {
        console.error('Error resending OTP:', error.message);
        res.status(500).json({ message: 'Failed to resend OTP. Please try again later.' });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const userData = otpStore[email];
        //console.log(email, otp);
        //console.log('from verify otp ', otpStore);

        if (!userData) {
            return res.status(400).send({ message: 'User data not found or OTP expired.' });
        }
        const otpString = otp.toString();
        if (userData.otp !== otpString) {
            return res.status(400).send({ message: 'Invalid OTP' });
        }

        if (Date.now() > userData.otpExpiry) {
            return res.status(400).send({ message: 'OTP expired. Request a new OTP.' });
        }

        const getPgpalId = async () => {
            try {
                const response = await axios.get(`http://tenant-service:4004/api/tenant-service/tenants-int/${userData.phoneNumber}`,
                    {
                        headers: {
                            'x-internal-service': true,
                        }
                    }
                );
                const ppid = response.data;
                return ppid;
            } catch (error) {
                console.error('Error fetching pgpalId:', error.message);
                return null;
            }
        };

        let pgpalId;
        if (userData.role === 'tenant') {
            pgpalId = await getPgpalId();
            if (!pgpalId) {
                pgpalId = generatePPT();
            }
        }

        let usernameLower;
        if (userData.username) {
            usernameLower = userData.username.toLowerCase();
        }

        const user = new User({
            name: userData.name,
            username: usernameLower,
            email: userData.email,
            phoneNumber: userData.phoneNumber,
            gender: userData.gender,
            role: userData.role,
            password: userData.password, // Make sure to hash password before saving in production
            isVerified: true,
            pgpalId: pgpalId ? pgpalId : undefined,
        });
        await user.save();

        const allUsernames = 'all_usernames';
        const allEmails = 'all_emails';
        const allPhoneNumbers = 'all_phone_numbers';
        await invalidateCacheByPattern(`*${allUsernames}*`);
        await invalidateCacheByPattern(`*${allEmails}*`);
        await invalidateCacheByPattern(`*${allPhoneNumbers}*`);


        delete otpStore[email];
        const token = user.generateAuthToken();
        const refreshToken = user.generateRefreshToken();


        try {
            await User.findByIdAndUpdate(user._id, { refreshToken: refreshToken });
        } catch (error) {
            console.error('Error saving refresh token to database:', error.message);
        }

        res.cookie('token', token, { httpOnly: true, sameSite: 'None', maxAge: 15 * 60 * 1000, path: '/', secure: 'lax' }); // 5 mins
        res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'None', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/', secure: 'lax' }); // 7 days
        res.setHeader('Authorization', `Bearer ${token}`);
        res.setHeader('Refresh-Token', refreshToken);
        setHeader(res, token);

        console.log({
            message: 'Registration successful',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phoneNumber,
                pgpalId: user.pgpalId,
                gender: user.gender
            },
            authToken: token,
            refreshToken: refreshToken
        });

        res.status(200).send({
            message: 'Registration successful',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email
            },
            authToken: token,
            refreshToken: refreshToken
        });
    } catch (error) {
        console.error('Error verifying OTP: ', error);
        res.status(500).send({ message: 'Error verifying OTP. Please try again.' });
    }
};



const refreshToken = async (req, res) => {
    const { refreshToken } = req.cookies;
    if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh token not found' });
    }
    try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decoded._id);
        if (!user) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }
        const newToken = user.generateAuthToken();
        const newRefreshToken = user.generateRefreshToken();

        await User.findByIdAndUpdate(user._id, { refreshToken: newRefreshToken });

        res.cookie('token', newToken, { httpOnly: true, sameSite: 'None', maxAge: 15 * 60 * 1000, path: '/', secure: 'lax' }); // 5 mins
        res.cookie('refreshToken', newRefreshToken, { httpOnly: true, sameSite: 'None', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/', secure: 'lax' }); // 7 days
        res.setHeader('Authorization', `Bearer ${newToken}`);
        res.setHeader('Refresh-Token', newRefreshToken);
        setHeader(res, newToken);

        res.status(200).json({
            message: 'Token refreshed successfully',
            authToken: newToken,
            refreshToken: newRefreshToken
        });
    }
    catch (error) {
        console.error('Error refreshing token: ', error);
        res.status(500).json({ message: 'Error refreshing token', error: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    getUser,
    updateUser,
    sendOtp,
    verifyOtp,
    checkUsernameAvailability,
    checkEmailAvailability,
    checkPhoneNumberAvailability,
    refreshToken,
    getUserById,
    verifyEmailOtp,
    resendOtp
};