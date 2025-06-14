const User = require('../models/userModel');
const otpStore = {};
const axios = require('axios');
const jwt = require('jsonwebtoken');
const CacheHelper = require('../utils/CacheHelper'); // Adjust the path as needed
const { generatePPT } = require('../utils/idGenerator.js');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');
const { makeInternalApiCall, getMyProperties, updateMaxRoomsnBeds } = require('./internalApis');

const getCookieOptions = (maxAge) => {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax',
        secure: isProduction,
        path: '/',
        maxAge,
        domain: isProduction ? process.env.COOKIE_DOMAIN : undefined
    };
};

const setHeader = (res, token) => {
    res.setHeader('Authorization', `Bearer ${token}`);
};

const isNewLoginSession = (user, req) => {
    const now = Date.now();
    const lastLoginTime = user.lastLogin ? user.lastLogin.getTime() : 0;
    const timeDifference = now - lastLoginTime;

    // Consider it a new login if:
    // 1. More than 30 minutes since last login, OR
    // 2. Different IP address, OR  
    // 3. Different User-Agent
    const thirtyMinutes = 30 * 60 * 1000;
    const userAgent = req.headers['user-agent'];
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];

    const isNewSession = timeDifference > thirtyMinutes ||
        user.lastLoginIP !== clientIP ||
        user.lastUserAgent !== userAgent;

    console.log(`🔍 [AUTH] Login session check for ${user.username}:`);
    console.log(`   Time difference: ${Math.round(timeDifference / 1000 / 60)} minutes`);
    console.log(`   Is new session: ${isNewSession}`);

    return isNewSession;
};

const registerUser = async (req, res) => {
    try {
        const { username, email, phoneNumber, gender, role, password, location } = req.body;

        const toLowerCase = (str) => str ? str.toLowerCase() : str;
        const usernameLower = toLowerCase(username);

        // Store user data temporarily
        userDetails = { username: usernameLower, email: toLowerCase(email), phoneNumber: toLowerCase(phoneNumber), gender, role, password, location };
        try {
            await sendOtpInternal(userDetails);

            res.status(200).send({
                message: 'OTP sent to your email. Verify OTP to complete registration.'
            });
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

        // Find user by credential and role
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
                { role: role }
            ]
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credential or role' });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({ message: 'Incorrect password' });
        }

        if (user.isSuspended) {
            return res.status(403).json({
                code: 'SUSPENDED',
                message: 'Your account is suspended, please contact support.'
            });
        }

        // ✅ Check if this is a genuinely new login session
        const isNewSession = isNewLoginSession(user, req);

        const token = user.generateAuthToken();
        const refreshToken = user.generateRefreshToken();

        // Set cookies
        res.cookie('token', token, getCookieOptions(15 * 60 * 1000)); // 15 minutes
        res.cookie('refreshToken', refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000)); // 7 days


        res.setHeader('Authorization', `Bearer ${token}`);
        res.setHeader('Refresh-Token', refreshToken);
        setHeader(res, token);

        // ✅ Enhanced user update with session tracking
        const userAgent = req.headers['user-agent'];
        const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];

        await User.findByIdAndUpdate(user._id, {
            lastLogin: new Date(),
            refreshToken: refreshToken,
            lastLoginIP: clientIP,
            lastUserAgent: userAgent
        });

        try {
            const currentPlan = user.currentPlan; // Default to 'free' if not set
            const subscriptionStatus = user.subscriptionStatus; // Default to 'inactive' if not set
            const subscriptionEndDate = user.currentPlan !== 'free' ? user.subscriptionStatus.subscriptionEndDate : null; // Default to null if not set
            const today = new Date();

            if (currentPlan !== 'free' && subscriptionStatus === 'active' && subscriptionEndDate) {
                // Check if subscription is still valid
                if (new Date(subscriptionEndDate) < today) {
                    // Subscription has expired, update user plan to 'free'
                    await User.findByIdAndUpdate(user._id, {
                        currentPlan: 'free',
                        isInFreePlan: true,
                        isStarterPack: false,
                        isProfessionalPack: false,
                        isInTrialPeriod: false,
                        subscriptionStatus: {
                            plan: 'free',
                            status: 'inactive',
                            subscriptionStartDate: null,
                            subscriptionEndDate: null

                        }
                    });
                }
            }
        } catch (error) {
            console.error(`❌ [AUTH] Error updating user plan for ${user.username}:`, error.message);
        }

        // Send response first
        res.send({
            message: 'Logged in successfully',
            user: {
                _id: user._id,
                name: user.username,
                email: user.email,
                role: user.role,
                phone: user.phoneNumber,
                pgpalId: user.pgpalId,
                gender: user.gender,
                currentPlan: user.currentPlan,
                isTrialClaimed: user.isTrialClaimed,
            },
            authToken: token,
            refreshToken: refreshToken
        });

        // ✅ Only send notification for genuinely new login sessions
        if (isNewSession) {
            try {
                console.log(`🔔 [AUTH] Sending new login notification for ${user.username}`);

                const title = 'New login detected';
                const message = `A new login was detected for your account from ${clientIP || 'unknown location'}. If this was not you, please secure your account immediately.`;
                const type = 'security';
                const method = ['in-app', 'email'];

                const notificationData = role === 'tenant' ? {
                    tenantId: user.pgpalId,
                    audience: 'tenant',
                    title,
                    message,
                    type,
                    method,
                    createdBy: 'system',
                    meta: {
                        loginIP: clientIP,
                        loginTime: new Date().toISOString(),
                        userAgent: userAgent
                    }
                } : {
                    ownerId: user._id,
                    audience: 'owner',
                    title,
                    message,
                    type,
                    method,
                    createdBy: 'system',
                    meta: {
                        loginIP: clientIP,
                        loginTime: new Date().toISOString(),
                        userAgent: userAgent
                    }
                };

                await notificationQueue.add('notifications', notificationData, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    },
                    delay: 2000 // 2 second delay to ensure user session is established
                });

                console.log(`✅ [AUTH] New login notification queued for ${user.username}`);

            } catch (error) {
                console.error(`❌ [AUTH] Error sending login notification for ${user.username}:`, error.message);
            }
        } else {
            console.log(`🔄 [AUTH] Skipping notification - not a new session for ${user.username}`);
        }

    } catch (error) {
        console.error('❌ [AUTH] Login error:', error);
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

        const isProduction = process.env.NODE_ENV === 'production';
        const clearCookieOptions = {
            httpOnly: true,
            sameSite: isProduction ? 'none' : 'lax',
            secure: isProduction,
            path: '/',
            domain: isProduction ? process.env.COOKIE_DOMAIN : undefined
        };

        res.clearCookie('token', clearCookieOptions);
        res.clearCookie('refreshToken', clearCookieOptions);


        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Logout failed', error: error.message });
    }
};

const getUser = async (req, res) => {
    try {
        const user = req.user;
        res.send({ user });
    } catch (error) {
        res.status(400).send({
            error: error.message,
            message: 'Error getting user'
        });
    }
};

const checkUsernameAvailability = async (req, res) => {
    console.log('Checking username availability');
    try {
        const cacheKey = 'all_usernames';
        let usernames;

        // 1. Try to get usernames from cache
        if (CacheHelper.isReady()) {
            // console.log(`Checking cache for ${cacheKey}`);
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                // console.log(`Cache hit for ${cacheKey}`);
                usernames = cached; // Remove JSON.parse() - already parsed by CacheHelper.get()
            }
        }

        // console.log('usernames');

        // 2. If not cached, fetch from DB and cache it
        if (!usernames) {
            // console.log(`Cache miss for ${cacheKey}, fetching from DB`);
            const users = await User.find({}, 'username');
            usernames = users.map(u => u.username.toLowerCase());
            // console.log(usernames);
            if (CacheHelper.isReady()) {
                await CacheHelper.set(cacheKey, usernames, 600);
            }
        }

        // 3. Check availability
        let { username } = req.query;
        // console.log('Checking username:', username);
        if (username) username = username.toLowerCase();
        const isTaken = usernames.includes(username);

        res.status(200).send({
            available: !isTaken,
            message: isTaken ? 'Username is not available' : 'Username is available'
        });
    } catch (error) {
        console.error('Username check error:', error);
        res.status(500).send({
            message: 'Error checking usernames availability',
            error: error.message
        });
    }
};

const checkEmailAvailability = async (req, res) => {
    try {
        const cacheKey = 'all_emails';
        let emails;

        // 1. Try to get emails from cache
        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                emails = cached;
            }
        }

        // 2. If not cached, fetch from DB and cache it
        if (!emails) {
            const users = await User.find({}, 'email');
            emails = users.map(u => u.email.toLowerCase());
            if (CacheHelper.isReady()) {
                await CacheHelper.set(cacheKey, emails, 600); // 10 min cache
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
        if (CacheHelper.isReady()) {
            const cached = await CacheHelper.get(cacheKey);
            if (cached) {
                phoneNumbers = cached;
            }
        }

        // 2. If not cached, fetch from DB and cache it
        if (!phoneNumbers) {
            const users = await User.find({}, 'phoneNumber');
            phoneNumbers = users.map(u => u.phoneNumber);
            if (CacheHelper.isReady()) {
                await CacheHelper.set(cacheKey, phoneNumbers, 600); // 10 min cache
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
    const currentUser = JSON.parse(req.headers['x-user']) || {};
    if (!currentUser) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
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

const sendOtpInternal = async (userDetails) => {
    try {
        const email = userDetails.email;
        const otp = otpGenerator();
        const otpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store OTP with user details
        otpStore[email] = { otp, otpExpiry, ...userDetails };

        // Send OTP email
        await sendOtpEmail(email, otp);

        console.log(`✅ [AUTH] OTP sent to ${email}`);
        return { success: true, message: 'OTP sent successfully' };
    } catch (error) {
        console.error('❌ [AUTH] Error sending OTP:', error.message);
        throw new Error('Failed to send OTP. Please try again later.');
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

        res.status(200).json({
            message: 'Email updated successfully.',
            user
        });
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
                const result = await makeInternalApiCall(
                    'GET',
                    `http://tenant-service:4004/api/tenant-service/tenants-int/${userData.phoneNumber}`,
                    null,
                    { 'x-internal-service': true },
                    'getTenantPpid',
                    'tenant-service',
                    'auth-service'
                );

                if (result.success) {
                    console.log(`✅ [AUTH] Found existing PPID for tenant ${userData.phoneNumber}: ${result.data}`);
                    return result.data;
                } else {
                    console.log(`⚠️ [AUTH] No existing PPID found for tenant ${userData.phoneNumber}: ${result.error}`);
                    return null;
                }
            } catch (error) {
                console.error(`❌ [AUTH] Error fetching PPID for ${userData.phoneNumber}:`, error.message);
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
            lastLogin: new Date(),
            lastPasswordChange: new Date(),
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

        res.cookie('token', token, getCookieOptions(15 * 60 * 1000)); // 15 minutes
        res.cookie('refreshToken', refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000)); // 7 days
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
                email: user.email,
                role: user.role,
                phone: user.phoneNumber,
                pgpalId: user.pgpalId,
                gender: user.gender,
                currentPlan: user.currentPlan,
                isTrialClaimed: user.isTrialClaimed,
            },
            authToken: token,
            refreshToken: refreshToken
        });
    } catch (error) {
        console.error('Error verifying OTP: ', error);
        res.status(500).send({ message: 'Error verifying OTP. Please try again.' });
    }
};

const updateCurrentPlan = async (req, res) => {
    const currentUser = req.user || JSON.parse(req.headers['x-user']) || {};
    if (!currentUser) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log(`🔍 [updateCurrentPlan] Updating plan for user ${currentUser}`);

    try {
        const userId = req.user._id;
        const { currentPlan, subscriptionDuration } = req.body;

        if (!currentPlan) {
            return res.status(400).json({ message: 'Current plan is required.' });
        }

        // Validate plan type
        const validPlans = ['free', 'trial', 'starter', 'professional'];
        if (!validPlans.includes(currentPlan)) {
            return res.status(400).json({ message: 'Invalid plan type.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Prepare update object
        const updateData = {
            currentPlan,
            updatedAt: new Date()
        };

        // Handle different plan types
        switch (currentPlan) {
            case 'free':
                updateData.isInFreePlan = true;
                updateData.isInTrialPeriod = false;
                updateData.isStarterPack = false;
                updateData.isProfessionalPack = false;
                updateData.trialEndDate = null;
                updateData.subscriptionStatus = {
                    plan: 'free',
                    status: 'active',
                    subscriptionStartDate: new Date(),
                    subscriptionEndDate: null
                };
                break;

            case 'trial':
                const trialDuration = 30;
                updateData.isInTrialPeriod = true;
                updateData.isStarterPack = false;
                updateData.isInFreePlan = false;
                updateData.isTrialClaimed = true;
                updateData.isProfessionalPack = false;
                updateData.trialStartDate = user.trialStartDate || new Date();
                updateData.trialEndDate = new Date(Date.now() + (trialDuration * 24 * 60 * 60 * 1000));
                updateData.subscriptionStatus = {
                    plan: 'trial',
                    status: 'active',
                    subscriptionStartDate: new Date(),
                    subscriptionEndDate: updateData.trialEndDate
                };
                break;

            case 'starter':
                const starterDuration = subscriptionDuration || 1;
                updateData.isInTrialPeriod = false;
                updateData.isStarterPack = true;
                updateData.isProfessionalPack = false;
                updateData.trialEndDate = new Date();
                const starterEndDate = new Date();
                starterEndDate.setMonth(starterEndDate.getMonth() + starterDuration);
                updateData.subscriptionStatus = {
                    plan: 'starter',
                    status: 'active',
                    subscriptionStartDate: new Date(),
                    subscriptionEndDate: starterEndDate
                };
                break;

            case 'professional':
                const professionalDuration = subscriptionDuration || 1;
                updateData.isInTrialPeriod = false;
                updateData.isStarterPack = false;
                updateData.isProfessionalPack = true;
                updateData.trialEndDate = new Date();
                const professionalEndDate = new Date();
                professionalEndDate.setMonth(professionalEndDate.getMonth() + professionalDuration);
                updateData.subscriptionStatus = {
                    plan: 'professional',
                    status: 'active',
                    subscriptionStartDate: new Date(),
                    subscriptionEndDate: professionalEndDate
                };
                break;
        }

        // ✅ Update user plan first
        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        console.log(`📋 [AUTH] Plan updated for user ${userId}: ${user.currentPlan} -> ${currentPlan}`);

        try {
            await notificationQueue.add('notifications', {
                ownerId: updatedUser._id, // Fix: should be ownerId for owners
                audience: 'owner',
                title: 'Plan Updated',
                message: `Your plan has been updated to ${currentPlan}. ${propertyUpdateSummary?.totalProperties > 0 ? `Property limits have been updated for ${propertyUpdateSummary.totalProperties} properties.` : ''}`,
                type: 'info',
                method: ['in-app', 'email'],
                createdBy: 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });

            console.log(`📬 [AUTH] Plan update notification queued for user ${userId}`);
        } catch (error) {
            console.error(`❌ [AUTH] Error sending notification:`, error.message);
        }

        // ✅ Enhanced response with property update summary
        res.status(200).json({
            message: 'Current plan updated successfully.',
            user: {
                _id: updatedUser._id,
                name: updatedUser.username,
                email: updatedUser.email,
                role: updatedUser.role,
                phone: updatedUser.phoneNumber,
                pgpalId: updatedUser.pgpalId,
                currentPlan: updatedUser.currentPlan,
                isInTrialPeriod: updatedUser.isInTrialPeriod,
                isStarterPack: updatedUser.isStarterPack,
                isProfessionalPack: updatedUser.isProfessionalPack,
                subscriptionStatus: updatedUser.subscriptionStatus,
                trialEndDate: updatedUser.trialEndDate
            }
        });

    } catch (error) {
        console.error('❌ [AUTH] Error updating current plan:', error);
        res.status(500).json({
            message: 'Error updating current plan',
            error: error.message
        });
    }
};

const cancelSubscription = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Update user's plan to free
        const updateData = {
            currentPlan: 'free',
            isInTrialPeriod: false,
            isStarterPack: false,
            isProfessionalPack: false,
            subscriptionStatus: {
                plan: 'free',
                status: 'active',
                subscriptionStartDate: new Date(),
                subscriptionEndDate: null // Free plan doesn't expire
            },
            trialEndDate: null // Reset trial end date
        };
        await User.findByIdAndUpdate(userId, updateData, { new: true });

        notificationQueue.add('notifications', {
            tenantId: user._id,
            audience: 'owner',
            title: 'Subscription Cancelled',
            message: 'Your subscription has been cancelled and you have been downgraded to the free plan.',
            type: 'info',
            method: ['in-app', 'email'],
            createdBy: 'system'
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 3000
            }
        });

        res.status(200).json({
            message: 'Subscription cancelled successfully. You have been downgraded to the free plan.',
            user: {
                _id: user._id,
                name: user.username,
                email: user.email,
                role: user.role,
                phone: user.phoneNumber,
                pgpalId: user.pgpalId,
                currentPlan: user.currentPlan
            }
        });

    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({
            message: 'Error cancelling subscription',
            error: error.message
        });
    }
};

// Add this method to check if user's plan is expired
const checkPlanStatus = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const now = new Date();
        let planStatus = 'active';
        let needsUpgrade = false;

        // Check trial expiry
        if (user.isInTrialPeriod && user.trialEndDate && now > user.trialEndDate) {
            planStatus = 'expired';
            needsUpgrade = true;

            // Auto-downgrade to free if trial expired
            await User.findByIdAndUpdate(userId, {
                currentPlan: 'free',
                isInTrialPeriod: false,
                subscriptionStatus: {
                    plan: 'free',
                    status: 'active'
                }
            });
        }

        // Check subscription expiry
        if (user.subscriptionEndDate && now > user.subscriptionEndDate) {
            planStatus = 'expired';
            needsUpgrade = true;

            // Auto-downgrade to free if subscription expired
            await User.findByIdAndUpdate(userId, {
                currentPlan: 'free',
                isInTrialPeriod: false,
                isStarterPack: false,
                isProfessionalPack: false,
                subscriptionStatus: {
                    plan: 'free',
                    status: 'active'
                }
            });
        }

        res.status(200).json({
            planStatus,
            needsUpgrade,
            currentPlan: user.currentPlan,
            daysRemaining: user.subscriptionEndDate ?
                Math.ceil((user.subscriptionEndDate - now) / (1000 * 60 * 60 * 24)) : null
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error checking plan status',
            error: error.message
        });
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

        if (user.isSuspended) {
            return res.status(403).json({
                code: 'SUSPENDED',
                message: 'Your account is suspended, Cannot refresh token.'
            });
        }

        const newToken = user.generateAuthToken();
        const newRefreshToken = user.generateRefreshToken();

        await User.findByIdAndUpdate(user._id, { refreshToken: newRefreshToken });

        res.cookie('token', newToken, { httpOnly: true, sameSite: 'lax', maxAge: 15 * 60 * 1000, path: '/', secure: false }); // 5 mins
        res.cookie('refreshToken', newRefreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/', secure: false }); // 7 days
        res.setHeader('Authorization', `Bearer ${newToken}`);
        res.setHeader('Refresh-Token', newRefreshToken);
        setHeader(res, newToken);

        console.log("Token refreshed successfully");
        res.status(200).json({
            message: 'Token refreshed successfully',
            authToken: newToken,
            refreshToken: newRefreshToken
        });
    }
    catch (error) {
        console.error('Error refreshing token: ', error);
        res.status(500).json({
            message: 'Error refreshing token',
            error: error.message
        });
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
    resendOtp,
    updateCurrentPlan,
    checkPlanStatus,
    cancelSubscription
};