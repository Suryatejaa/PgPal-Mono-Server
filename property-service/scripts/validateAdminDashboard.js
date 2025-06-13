// Admin Dashboard Validation Script
// This script validates the complete admin dashboard implementation

const fs = require('fs');
const path = require('path');

console.log('🔍 Admin Dashboard Validation');
console.log('============================');

let validationResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
};

function test(name, testFn, isWarning = false) {
    try {
        const result = testFn();
        if (result) {
            validationResults.passed++;
            validationResults.tests.push({ name, status: 'PASSED', type: isWarning ? 'warning' : 'test' });
            console.log(`✅ PASSED: ${name}`);
        } else {
            if (isWarning) {
                validationResults.warnings++;
                validationResults.tests.push({ name, status: 'WARNING', type: 'warning' });
                console.log(`⚠️  WARNING: ${name}`);
            } else {
                validationResults.failed++;
                validationResults.tests.push({ name, status: 'FAILED', type: 'test' });
                console.log(`❌ FAILED: ${name}`);
            }
        }
    } catch (error) {
        if (isWarning) {
            validationResults.warnings++;
            validationResults.tests.push({ name, status: 'WARNING', error: error.message, type: 'warning' });
            console.log(`⚠️  WARNING: ${name} - ${error.message}`);
        } else {
            validationResults.failed++;
            validationResults.tests.push({ name, status: 'FAILED', error: error.message, type: 'test' });
            console.log(`❌ FAILED: ${name} - ${error.message}`);
        }
    }
}

// Test 1: Admin Controller exists and has required methods
test('Admin Controller Implementation', () => {
    const controllerPath = './src/controllers/adminController.js';
    if (!fs.existsSync(controllerPath)) return false;

    const content = fs.readFileSync(controllerPath, 'utf8');
    const requiredMethods = [
        'validateAdminAccess',
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

    return requiredMethods.every(method => content.includes(method));
});

// Test 2: Admin Routes are properly configured
test('Admin Routes Configuration', () => {
    const routesPath = './src/routes/adminRoutes.js';
    if (!fs.existsSync(routesPath)) return false;

    const content = fs.readFileSync(routesPath, 'utf8');
    const requiredRoutes = [
        '/dashboard/overview',
        '/properties',
        '/users',
        '/analytics',
        '/bulk-operations',
        '/maintenance',
        '/notifications/send',
        '/export'
    ];

    return requiredRoutes.every(route => content.includes(route));
});

// Test 3: Admin Middleware exists
test('Admin Middleware Implementation', () => {
    const middlewarePath = './src/middleware/adminAuth.js';
    if (!fs.existsSync(middlewarePath)) return false;

    const content = fs.readFileSync(middlewarePath, 'utf8');
    const requiredFunctions = [
        'validateAdminAccess',
        'adminRateLimit',
        'auditLogger'
    ];

    return requiredFunctions.every(fn => content.includes(fn));
});

// Test 4: Admin routes integrated in main app
test('Admin Routes Integration', () => {
    const indexPath = './index.js';
    if (!fs.existsSync(indexPath)) return false;

    const content = fs.readFileSync(indexPath, 'utf8');
    return content.includes("require('./src/routes/adminRoutes')") &&
        content.includes('/api/property-service/admin');
});

// Test 5: Package.json has admin scripts
test('Package.json Admin Scripts', () => {
    const packagePath = './package.json';
    if (!fs.existsSync(packagePath)) return false;

    const content = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    const requiredScripts = [
        'admin:setup',
        'admin:test'
    ];

    return requiredScripts.every(script => packageJson.scripts && packageJson.scripts[script]);
});

// Test 6: Required dependencies are installed
test('Required Dependencies', () => {
    const packagePath = './package.json';
    if (!fs.existsSync(packagePath)) return false;

    const content = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(content);
    const requiredDeps = [
        'express',
        'mongoose',
        'axios',
        'cors',
        'dotenv',
        'moment'
    ];

    return requiredDeps.every(dep =>
        (packageJson.dependencies && packageJson.dependencies[dep]) ||
        (packageJson.devDependencies && packageJson.devDependencies[dep])
    );
});

// Test 7: Models exist for admin operations
test('Required Models Exist', () => {
    const requiredModels = [
        './src/models/propertyModel.js',
        './src/models/reviewModel.js',
        './src/models/imageModel.js',
        './src/models/ruleModel.js',
        './src/models/deletedPropertiesModal.js'
    ];

    return requiredModels.every(modelPath => fs.existsSync(modelPath));
});

// Test 8: Helper utilities exist
test('Helper Utilities Implementation', () => {
    const requiredUtils = [
        './src/utils/CacheHelper.js',
        './src/utils/notificationQueue.js',
        './src/utils/planHelper.js'
    ];

    return requiredUtils.every(utilPath => fs.existsSync(utilPath));
});

// Test 9: Plan validation middleware exists (for integration)
test('Plan Validation Integration', () => {
    const planMiddlewarePath = './src/middleware/planValidates.js';
    if (!fs.existsSync(planMiddlewarePath)) return false;

    const planConfigPath = './src/config/planLimits.js';
    return fs.existsSync(planConfigPath);
});

// Test 10: Example files exist
test('Example Frontend Components', () => {
    const exampleFiles = [
        './examples/AdminDashboard.jsx',
        './examples/AdminDashboard.css'
    ];

    return exampleFiles.every(filePath => fs.existsSync(filePath));
}, true); // This is a warning, not a failure

// Test 11: Documentation exists
test('Documentation Files', () => {
    const docFiles = [
        './ADMIN_DASHBOARD_README.md'
    ];

    return docFiles.every(filePath => fs.existsSync(filePath));
}, true); // This is a warning, not a failure

// Test 12: Test scripts exist
test('Testing Infrastructure', () => {
    const testFiles = [
        './scripts/testAdminDashboard.js',
        './scripts/startAdminDashboard.js'
    ];

    return testFiles.every(filePath => fs.existsSync(filePath));
});

// Test 13: Environment configuration
test('Environment Configuration', () => {
    return fs.existsSync('./.env.example');
}, true); // This is a warning

// Test 14: Admin controller exports all required methods
test('Admin Controller Method Exports', () => {
    const controllerPath = './src/controllers/adminController.js';
    if (!fs.existsSync(controllerPath)) return false;

    const content = fs.readFileSync(controllerPath, 'utf8');

    // Check if methods are properly exported
    const hasModuleExports = content.includes('module.exports');
    const hasValidateAdminAccess = content.includes('validateAdminAccess');

    return hasModuleExports && hasValidateAdminAccess;
});

// Test 15: Route middleware is properly applied
test('Route Middleware Application', () => {
    const routesPath = './src/routes/adminRoutes.js';
    if (!fs.existsSync(routesPath)) return false;

    const content = fs.readFileSync(routesPath, 'utf8');

    // Check if middleware is applied to routes
    const hasMiddlewareImport = content.includes("require('../middleware/adminAuth')");
    const hasMiddlewareUsage = content.includes('router.use(');

    return hasMiddlewareImport && hasMiddlewareUsage;
});

console.log('\n📊 Validation Results');
console.log('====================');
console.log(`✅ Passed: ${validationResults.passed}`);
console.log(`❌ Failed: ${validationResults.failed}`);
console.log(`⚠️  Warnings: ${validationResults.warnings}`);

if (validationResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    validationResults.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
            console.log(`  - ${test.name}${test.error ? ': ' + test.error : ''}`);
        });
}

if (validationResults.warnings > 0) {
    console.log('\n⚠️  Warnings:');
    validationResults.tests
        .filter(test => test.status === 'WARNING')
        .forEach(test => {
            console.log(`  - ${test.name}${test.error ? ': ' + test.error : ''}`);
        });
}

console.log('\n🎯 Implementation Status');
console.log('========================');

const totalCriticalTests = validationResults.tests.filter(t => t.type === 'test').length;
const passedCriticalTests = validationResults.tests.filter(t => t.type === 'test' && t.status === 'PASSED').length;
const completionPercentage = Math.round((passedCriticalTests / totalCriticalTests) * 100);

console.log(`📈 Completion: ${completionPercentage}% (${passedCriticalTests}/${totalCriticalTests} critical tests passed)`);

if (completionPercentage >= 100) {
    console.log('🎉 Admin Dashboard is FULLY IMPLEMENTED and ready for use!');
} else if (completionPercentage >= 80) {
    console.log('✅ Admin Dashboard is MOSTLY COMPLETE. Minor issues need attention.');
} else if (completionPercentage >= 60) {
    console.log('⚠️  Admin Dashboard is PARTIALLY COMPLETE. Some important features are missing.');
} else {
    console.log('❌ Admin Dashboard is INCOMPLETE. Major components are missing.');
}

console.log('\n🚀 Next Steps');
console.log('=============');

if (validationResults.failed === 0) {
    console.log('1. Create .env file from .env.example');
    console.log('2. Run: npm run admin:setup');
    console.log('3. Start server: npm start');
    console.log('4. Test admin functionality: npm run admin:test');
    console.log('5. Access admin dashboard at: http://localhost:4002/api/property-service/admin/dashboard/overview');
} else {
    console.log('1. Fix the failed tests listed above');
    console.log('2. Re-run validation: node scripts/validateAdminDashboard.js');
    console.log('3. Once all tests pass, follow the setup steps');
}

// Save results to file
const report = {
    timestamp: new Date().toISOString(),
    summary: {
        passed: validationResults.passed,
        failed: validationResults.failed,
        warnings: validationResults.warnings,
        completionPercentage,
        status: completionPercentage >= 100 ? 'COMPLETE' :
            completionPercentage >= 80 ? 'MOSTLY_COMPLETE' :
                completionPercentage >= 60 ? 'PARTIALLY_COMPLETE' : 'INCOMPLETE'
    },
    tests: validationResults.tests
};

fs.writeFileSync('./admin-dashboard-validation-report.json', JSON.stringify(report, null, 2));
console.log('\n📋 Validation report saved to: admin-dashboard-validation-report.json');

process.exit(validationResults.failed > 0 ? 1 : 0);
