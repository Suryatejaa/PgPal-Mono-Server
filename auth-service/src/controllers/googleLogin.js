const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const GoogleUser = require('../models/googleModel'); // Use the GoogleUser schema

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if Google user already exists
                let user = await GoogleUser.findOne({ googleId: profile.id });
                if (!user) {
                    // Create a new Google user
                    user = new GoogleUser({
                        googleId: profile.id,
                        name: profile.displayName,
                        email: profile.emails[0].value,
                        isVerified: true,
                    });
                }

                // Generate tokens
                const tokenPayload = { id: user._id, email: user.email };
                const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
                const newRefreshToken = jwt.sign(tokenPayload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

                // Save the refresh token in the database
                user.refreshToken = newRefreshToken;
                await user.save();

                // Attach tokens to the user object
                user.token = token;
                user.refreshToken = newRefreshToken;

                return done(null, user);
            } catch (error) {
                return done(error, null);
            }
        }
    )
);

// Serialize user into session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await GoogleUser.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;