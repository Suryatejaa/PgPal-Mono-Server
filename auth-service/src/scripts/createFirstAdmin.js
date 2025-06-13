// Script to create the first admin user
// Run this script with: node src/scripts/createFirstAdmin.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const readline = require('readline');

dotenv.config();

// Import User model
const User = require('../models/userModel');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};

const createFirstAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB successfully');
        console.log('=================================');
        console.log('Create First Admin User');
        console.log('=================================');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            console.log('⚠️  Admin user already exists!');
            console.log('Admin details:');
            console.log(`- Username: ${existingAdmin.username}`);
            console.log(`- Email: ${existingAdmin.email}`);
            console.log(`- PgPaal ID: ${existingAdmin.pgpalId}`);

            const overwrite = await question('Do you want to create another admin? (y/N): ');
            if (overwrite.toLowerCase() !== 'y') {
                console.log('Exiting...');
                process.exit(0);
            }
        }

        // Collect admin details
        const username = await question('Enter admin username: ');
        const email = await question('Enter admin email: ');
        const phoneNumber = await question('Enter admin phone number (10 digits): ');
        const password = await question('Enter admin password (min 8 chars, must include uppercase, lowercase, number, special char): ');
        const gender = await question('Enter gender (male/female/other): ');

        // Validate inputs
        if (!username || username.length < 3) {
            console.log('❌ Username must be at least 3 characters long');
            process.exit(1);
        }

        if (!email || !email.includes('@')) {
            console.log('❌ Please enter a valid email address');
            process.exit(1);
        }

        if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
            console.log('❌ Phone number must be exactly 10 digits');
            process.exit(1);
        }

        if (!password || password.length < 8) {
            console.log('❌ Password must be at least 8 characters long');
            process.exit(1);
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            console.log('❌ Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
            process.exit(1);
        }

        if (!['male', 'female', 'other'].includes(gender.toLowerCase())) {
            console.log('❌ Gender must be male, female, or other');
            process.exit(1);
        }

        // Check for existing users with same credentials
        const existingUser = await User.findOne({
            $or: [
                { username: username.toLowerCase() },
                { email: email },
                { phoneNumber: phoneNumber }
            ]
        });

        if (existingUser) {
            console.log('❌ User with this username, email, or phone number already exists');
            process.exit(1);
        }

        console.log('\n📝 Creating admin user...');

        // Create admin user
        const adminUser = new User({
            username: username.toLowerCase(),
            email: email,
            phoneNumber: phoneNumber,
            gender: gender.toLowerCase(),
            role: 'admin',
            password: password, // Will be hashed by pre-save middleware
            isVerified: true,
            pgpalId: `PPA${Math.floor(100000 + Math.random() * 900000)}` // Admin ID
        });

        await adminUser.save();

        console.log('✅ Admin user created successfully!');
        console.log('=================================');
        console.log('Admin User Details:');
        console.log(`- Username: ${adminUser.username}`);
        console.log(`- Email: ${adminUser.email}`);
        console.log(`- Phone: ${adminUser.phoneNumber}`);
        console.log(`- PgPaal ID: ${adminUser.pgpalId}`);
        console.log(`- Role: ${adminUser.role}`);
        console.log(`- Verified: ${adminUser.isVerified}`);
        console.log('=================================');
        console.log('\n🔑 You can now login using:');
        console.log(`curl -X POST "http://localhost:4001/api/auth-service/login" \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{`);
        console.log(`    "credential": "${email}",`);
        console.log(`    "password": "${password}",`);
        console.log(`    "role": "admin"`);
        console.log(`  }'`);
        console.log('\n📚 Check ADMIN_DASHBOARD_README.md for complete API documentation');

    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        process.exit(1);
    } finally {
        rl.close();
        mongoose.connection.close();
    }
};

// Run the script
createFirstAdmin();
