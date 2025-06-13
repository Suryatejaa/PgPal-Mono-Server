// Admin Dashboard Startup Script
// This script helps initialize and start the admin dashboard with proper configuration

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 PGPaal Admin Dashboard Startup');
console.log('=====================================');

// Check environment variables
function checkEnvironment() {
    console.log('🔍 Checking environment configuration...');

    const requiredEnvVars = [
        'MONGO_URI',
        'PORT'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        console.log('❌ Missing environment variables:');
        missingVars.forEach(varName => {
            console.log(`   - ${varName}`);
        });
        console.log('\n📝 Please create a .env file with the required variables.');
        return false;
    }

    console.log('✅ Environment variables configured');
    return true;
}

// Check database connectivity
async function checkDatabase() {
    console.log('🔍 Checking database connectivity...');

    try {
        const mongoose = require('mongoose');
        await mongoose.connect(process.env.MONGO_URI, {
            tls: true,
            tlsAllowInvalidCertificates: false,
            serverSelectionTimeoutMS: 5000
        });

        console.log('✅ Database connection successful');
        await mongoose.disconnect();
        return true;
    } catch (error) {
        console.log('❌ Database connection failed:', error.message);
        return false;
    }
}

// Check required dependencies
function checkDependencies() {
    console.log('🔍 Checking dependencies...');

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = [
        'express',
        'mongoose',
        'axios',
        'cors',
        'dotenv',
        'cookie-parser',
        'moment'
    ];

    const missingDeps = requiredDeps.filter(dep =>
        !packageJson.dependencies[dep] && !packageJson.devDependencies[dep]
    );

    if (missingDeps.length > 0) {
        console.log('❌ Missing dependencies:');
        missingDeps.forEach(dep => {
            console.log(`   - ${dep}`);
        });
        console.log('\n📦 Installing missing dependencies...');

        try {
            execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
            console.log('✅ Dependencies installed successfully');
        } catch (error) {
            console.log('❌ Failed to install dependencies:', error.message);
            return false;
        }
    } else {
        console.log('✅ All dependencies available');
    }

    return true;
}

// Verify admin controller exists and is complete
function verifyAdminController() {
    console.log('🔍 Verifying admin controller...');

    const controllerPath = './src/controllers/adminController.js';
    if (!fs.existsSync(controllerPath)) {
        console.log('❌ Admin controller not found');
        return false;
    }

    const controllerContent = fs.readFileSync(controllerPath, 'utf8');
    const requiredMethods = [
        'getDashboardOverview',
        'getAllPropertiesAdmin',
        'getPropertyDetailsAdmin',
        'forceDeleteProperty',
        'togglePropertyStatus',
        'getAllUsersAdmin',
        'getUserDetailsAdmin',
        'toggleUserStatus',
        'getSystemAnalytics',
        'bulkOperations',
        'systemMaintenance',
        'sendSystemNotification',
        'exportData'
    ];

    const missingMethods = requiredMethods.filter(method =>
        !controllerContent.includes(`async ${method}(`)
    );

    if (missingMethods.length > 0) {
        console.log('❌ Missing admin controller methods:');
        missingMethods.forEach(method => {
            console.log(`   - ${method}`);
        });
        return false;
    }

    console.log('✅ Admin controller is complete');
    return true;
}

// Verify admin routes are configured
function verifyAdminRoutes() {
    console.log('🔍 Verifying admin routes...');

    const routesPath = './src/routes/adminRoutes.js';
    if (!fs.existsSync(routesPath)) {
        console.log('❌ Admin routes file not found');
        return false;
    }

    const routesContent = fs.readFileSync(routesPath, 'utf8');
    const requiredRoutes = [
        'dashboard/overview',
        'properties',
        'users',
        'analytics',
        'bulk-operations',
        'maintenance',
        'notifications/send',
        'export'
    ];

    const missingRoutes = requiredRoutes.filter(route =>
        !routesContent.includes(`'/${route}'`) && !routesContent.includes(`"/${route}"`)
    );

    if (missingRoutes.length > 0) {
        console.log('❌ Missing admin routes:');
        missingRoutes.forEach(route => {
            console.log(`   - /${route}`);
        });
        return false;
    }

    console.log('✅ Admin routes are configured');
    return true;
}

// Verify admin middleware exists
function verifyAdminMiddleware() {
    console.log('🔍 Verifying admin middleware...');

    const middlewarePath = './src/middleware/adminAuth.js';
    if (!fs.existsSync(middlewarePath)) {
        console.log('❌ Admin middleware not found');
        return false;
    }

    const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
    const requiredFunctions = [
        'validateAdminAccess',
        'adminRateLimit',
        'auditLogger'
    ];

    const missingFunctions = requiredFunctions.filter(fn =>
        !middlewareContent.includes(fn)
    );

    if (missingFunctions.length > 0) {
        console.log('❌ Missing admin middleware functions:');
        missingFunctions.forEach(fn => {
            console.log(`   - ${fn}`);
        });
        return false;
    }

    console.log('✅ Admin middleware is configured');
    return true;
}

// Create sample admin user configuration
function createAdminUserGuide() {
    console.log('📝 Creating admin user setup guide...');

    const adminGuide = `
# Admin User Setup Guide

## Creating Admin Users

To create admin users for the dashboard, you need to set the appropriate role and adminLevel in your user records.

### Admin User Structure
\`\`\`javascript
{
    "_id": "admin_user_id",
    "email": "admin@pgpaal.com",
    "role": "admin",           // or "super_admin"
    "adminLevel": "admin",     // or "super_admin"
    "name": "Admin User",
    "createdAt": new Date(),
    "isActive": true
}
\`\`\`

### Permission Levels
- **admin**: Can view dashboard, manage properties/users, perform bulk operations
- **super_admin**: All admin permissions plus system maintenance, configuration changes

### Authentication Headers
When making API requests, include the user information in headers:
\`\`\`javascript
const headers = {
    'x-user': JSON.stringify({
        data: {
            user: {
                id: 'admin_user_id',
                email: 'admin@pgpaal.com',
                role: 'admin',
                adminLevel: 'admin'
            }
        }
    }),
    'Content-Type': 'application/json'
};
\`\`\`

### Testing Admin Access
Run the test script to verify admin functionality:
\`\`\`bash
node scripts/testAdminDashboard.js
\`\`\`
`;

    fs.writeFileSync('./ADMIN_USER_SETUP.md', adminGuide);
    console.log('✅ Admin user setup guide created: ADMIN_USER_SETUP.md');
}

// Display startup information
function displayStartupInfo() {
    console.log('\n🎉 Admin Dashboard Ready!');
    console.log('=========================');
    console.log('');
    console.log('📍 Server URL: http://localhost:' + (process.env.PORT || 4002));
    console.log('🔧 Admin API Base: http://localhost:' + (process.env.PORT || 4002) + '/api/property-service/admin');
    console.log('');
    console.log('📊 Available Admin Endpoints:');
    console.log('  - GET  /dashboard/overview     - Dashboard statistics');
    console.log('  - GET  /properties             - Property management');
    console.log('  - GET  /users                  - User management');
    console.log('  - GET  /analytics              - System analytics');
    console.log('  - POST /bulk-operations        - Bulk operations');
    console.log('  - POST /maintenance            - System maintenance');
    console.log('  - POST /notifications/send     - Send notifications');
    console.log('  - GET  /export                 - Data export');
    console.log('');
    console.log('🧪 Testing:');
    console.log('  - Run: node scripts/testAdminDashboard.js');
    console.log('');
    console.log('📚 Documentation:');
    console.log('  - Admin Dashboard: ADMIN_DASHBOARD_README.md');
    console.log('  - User Setup: ADMIN_USER_SETUP.md');
    console.log('  - API Testing: scripts/testAdminDashboard.js');
    console.log('');
    console.log('🎨 Frontend Example:');
    console.log('  - React Component: examples/AdminDashboard.jsx');
    console.log('  - Styles: examples/AdminDashboard.css');
    console.log('');
    console.log('⚠️  Security Notes:');
    console.log('  - Admin access requires proper authentication headers');
    console.log('  - Super admin operations have additional restrictions');
    console.log('  - All admin actions are logged for audit purposes');
    console.log('  - Rate limiting is applied to prevent abuse');
}

// Main startup function
async function main() {
    try {
        // Load environment variables
        require('dotenv').config();

        // Run all checks
        const checks = [
            checkEnvironment(),
            checkDependencies(),
            verifyAdminController(),
            verifyAdminRoutes(),
            verifyAdminMiddleware()
        ];

        const allPassed = checks.every(check => check === true);

        if (!allPassed) {
            console.log('\n❌ Some checks failed. Please fix the issues above before starting the admin dashboard.');
            process.exit(1);
        }

        // Check database connectivity
        const dbConnected = await checkDatabase();
        if (!dbConnected) {
            console.log('\n⚠️  Database connectivity issues detected. The server may still start, but admin features requiring database access will fail.');
        }

        // Create admin setup guide
        createAdminUserGuide();

        // Display startup information
        displayStartupInfo();

        console.log('\n🚀 Starting the server...');
        console.log('Press Ctrl+C to stop the server');

    } catch (error) {
        console.error('💥 Startup error:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Admin dashboard stopped');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = {
    checkEnvironment,
    checkDatabase,
    checkDependencies,
    verifyAdminController,
    verifyAdminRoutes,
    verifyAdminMiddleware
};
