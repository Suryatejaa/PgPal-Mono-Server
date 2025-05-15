const express = require('express');
const router = express.Router();
const UserController = require('../controllers/authController');
const passwordController = require('../controllers/passwordController');
const authenticate = require('../utils/authenticate');
const { validateRequest, updateUserValidation } = require('../utils/validateRequest');
const validateLogin = require('../utils/validatelogin');
const passport = require('../controllers/googleLogin');
const updateProfileGoogle = require('../controllers/updateProfileGoogle');
const cacheMiddleware = require('../utils/cacheMiddleware');

// const ProfileController = require('../Apis/Profile.api');
// const authRoutes = require('../Middleware/refreshToken');

const restrictToInternal = (req, res, next) => {
    if (req.headers['x-internal-service']) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied: internal use only' });
};

router.get('/', (req, res) => {
    res.status(200).json({ message: 'Auth Service is running' });
});

router.post('/register', validateRequest, UserController.registerUser);
router.post('/login', validateLogin, UserController.loginUser);
router.post('/otp/send', validateRequest, UserController.sendOtp);
router.patch('/me', authenticate, updateUserValidation, UserController.updateUser);

router.get('/me', authenticate, cacheMiddleware, UserController.getUser);
router.post('/otp/verify', UserController.verifyOtp);
router.get('/user', restrictToInternal, UserController.getUserById);

router.post('/forgot-password-request', passwordController.forgotPasswordRequestUser);
router.post('/forgot-password-verify-otp', passwordController.forgotPasswordVerifyOtp);
router.post('/forgot-password-reset', passwordController.forgotPasswordResetUser);
router.patch('/password-reset', authenticate, passwordController.passwordResetUser);

router.post('/logout', authenticate, UserController.logoutUser);


router.get('/test-auth', authenticate, (req, res) => {
    res.send(`Hello, ${req.user.name}! Authentication successful.` +
        `User Object: ${JSON.stringify(req.user)}`
    );
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google callback URL
router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication
        const { token, refreshToken } = req.user;

        // Set tokens in cookies
        res.cookie('token', token, { httpOnly: true, sameSite: 'None', maxAge: 5 * 60 * 1000 }); // 5 minutes
        res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'None', maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7 days

        res.status(200).json({
            message: 'Login successful',
            user: req.user,
        });
    }
);

router.post('/google/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        // Clear cookies
        res.clearCookie('token', { httpOnly: true, sameSite: 'None' });
        res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'None' });

        // Remove refresh token from the database
        if (refreshToken) {
            const user = await GoogleUser.findOne({ refreshToken });
            if (user) {
                user.refreshToken = null; // Invalidate the refresh token
                await user.save();
            }
        }

        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to log out', error: error.message });
    }
});

router.get('/update-profile', authenticate, updateProfileGoogle);

router.get('/check-username', UserController.checkUsernameAvailability);
router.get('/check-email', UserController.checkEmailAvailability);
router.get('/check-phonenumber', UserController.checkPhoneNumberAvailability);

router.post('/protected', authenticate, (req, res) => {
    res.status(200).json({
        message: 'Protected route accessed!',
        user: req.user
    });
});

router.get('/refresh-token', authenticate, UserController.refreshToken);

// router.put('/profile/update-profile/:id', authenticate, ProfileController.updateProfile);

module.exports = router;
