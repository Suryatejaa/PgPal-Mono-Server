// Quick validation script to check plan restrictions implementation
// Run this to verify all components are properly configured

const fs = require('fs');
const path = require('path');

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`);
const logCheck = (passed, message, details = '') => {
    const status = passed ? `${colors.green}✅` : `${colors.red}❌`;
    console.log(`${status} ${message}${colors.reset}`);
    if (details) console.log(`   ${colors.yellow}${details}${colors.reset}`);
};

const checkFileExists = (filePath, description) => {
    const exists = fs.existsSync(filePath);
    logCheck(exists, `${description}`, exists ? filePath : `Missing: ${filePath}`);
    return exists;
};

const checkFileContent = (filePath, searchTerms, description) => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const hasAllTerms = searchTerms.every(term => content.includes(term));
        logCheck(hasAllTerms, description,
            hasAllTerms ? 'All required content found' : `Missing: ${searchTerms.filter(term => !content.includes(term)).join(', ')}`);
        return hasAllTerms;
    } catch (error) {
        logCheck(false, description, `Error reading file: ${error.message}`);
        return false;
    }
};

const validateImplementation = () => {
    log('cyan', '\n🔍 Validating Plan Restrictions Implementation');
    log('blue', '═'.repeat(60));

    let allChecks = [];

    // Check core configuration files
    log('yellow', '\n📁 Core Configuration Files');
    allChecks.push(checkFileExists('src/config/planLimits.js', 'Plan limits configuration'));
    allChecks.push(checkFileContent('src/config/planLimits.js',
        ['free:', 'trial:', 'starter:', 'professional:', 'maxProperties', 'features'],
        'Plan limits has all plan types and properties'));

    // Check middleware files
    log('yellow', '\n🛡️ Middleware Files');
    allChecks.push(checkFileExists('src/middleware/planValidates.js', 'Plan validation middleware'));
    allChecks.push(checkFileContent('src/middleware/planValidates.js',
        ['validatePlanAccess', 'validateResourceLimit', 'validateBulkOperation', 'validateAdvancedSearch'],
        'Middleware has all validation functions'));

    // Check utility files
    log('yellow', '\n🔧 Utility Files');
    allChecks.push(checkFileExists('src/utils/planHelper.js', 'Plan helper utility'));
    allChecks.push(checkFileContent('src/utils/planHelper.js',
        ['getUserPlan', 'hasFeature', 'checkResourceLimit', 'getPlanSummary'],
        'Plan helper has all required methods'));

    // Check controller implementations
    log('yellow', '\n🎮 Controller Implementations');
    allChecks.push(checkFileExists('src/controllers/propertyController.js', 'Property controller'));
    allChecks.push(checkFileContent('src/controllers/propertyController.js',
        ['PlanHelper', 'getPlanInfo', 'getPlanUsage', 'PLAN_LIMITS'],
        'Property controller has plan integration'));

    allChecks.push(checkFileExists('src/controllers/imagesController.js', 'Images controller'));
    allChecks.push(checkFileContent('src/controllers/imagesController.js',
        ['PLAN_LIMITS', 'maxImagesPerProperty'],
        'Images controller has plan restrictions'));

    allChecks.push(checkFileExists('src/controllers/reviewController.js', 'Review controller'));
    allChecks.push(checkFileContent('src/controllers/reviewController.js',
        ['PLAN_LIMITS', 'maxReviewsDisplayed'],
        'Review controller has plan restrictions'));

    // Check route protections
    log('yellow', '\n🛣️ Route Protections');
    allChecks.push(checkFileExists('src/routes/propertyRoutes.js', 'Property routes'));
    allChecks.push(checkFileContent('src/routes/propertyRoutes.js',
        ['validatePlanAccess', 'add_property', 'manage_amenities', 'manage_rules', 'analytics'],
        'Routes have plan validation middleware'));

    // Check documentation
    log('yellow', '\n📚 Documentation');
    allChecks.push(checkFileExists('PLAN_RESTRICTIONS.md', 'Plan restrictions documentation'));
    allChecks.push(checkFileContent('PLAN_RESTRICTIONS.md',
        ['Free Plan', 'Trial Plan', 'Starter Plan', 'Professional Plan', 'Implementation Details'],
        'Documentation is comprehensive'));

    // Check test files
    log('yellow', '\n🧪 Test Files');
    allChecks.push(checkFileExists('tests/planRestrictions.test.js', 'Jest test suite'));
    allChecks.push(checkFileExists('scripts/testPlanRestrictions.js', 'Manual testing script'));

    // Summary
    log('blue', '\n═'.repeat(60));
    const passedChecks = allChecks.filter(Boolean).length;
    const totalChecks = allChecks.length;
    const percentage = Math.round((passedChecks / totalChecks) * 100);

    if (percentage === 100) {
        log('green', `🎉 All checks passed! (${passedChecks}/${totalChecks}) - ${percentage}%`);
        log('green', '✨ Plan restrictions implementation is complete and ready for testing!');
    } else if (percentage >= 80) {
        log('yellow', `⚠️  Most checks passed (${passedChecks}/${totalChecks}) - ${percentage}%`);
        log('yellow', '🔧 Minor issues detected, but implementation is mostly complete');
    } else {
        log('red', `❌ Several checks failed (${passedChecks}/${totalChecks}) - ${percentage}%`);
        log('red', '🚨 Implementation needs attention before testing');
    }

    log('cyan', '\n📋 Next Steps:');
    if (percentage === 100) {
        console.log('   1. Run the manual test script: npm run test:plan-restrictions');
        console.log('   2. Install missing dev dependencies: npm install');
        console.log('   3. Test specific endpoints using the provided test users');
        console.log('   4. Verify plan upgrade flows in frontend integration');
    } else {
        console.log('   1. Review and fix any missing files or content');
        console.log('   2. Ensure all plan validation middleware is properly implemented');
        console.log('   3. Re-run this validation script');
        console.log('   4. Proceed with testing once all checks pass');
    }

    return percentage === 100;
};

// Run validation if called directly
if (require.main === module) {
    validateImplementation();
}

module.exports = { validateImplementation };
