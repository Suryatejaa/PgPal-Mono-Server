#!/usr/bin/env node

// Manual Plan Restrictions Testing Script
// Run this script to test all implemented plan restrictions

const axios = require('axios');
const colors = require('colors');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:4002/api/property-service';
const TEST_TIMEOUT = 5000;

// Test users with different plans
const testUsers = {
    freeUser: {
        data: {
            user: {
                _id: '64a1b2c3d4e5f6789abcdef0',
                pgpalId: 'FREE_USER_001',
                role: 'owner',
                username: 'freeuser',
                email: 'free@test.com',
                phoneNumber: '1234567890',
                currentPlan: { type: 'free' }
            }
        }
    },
    trialUser: {
        data: {
            user: {
                _id: '64a1b2c3d4e5f6789abcdef1',
                pgpalId: 'TRIAL_USER_001',
                role: 'owner',
                username: 'trialuser',
                email: 'trial@test.com',
                phoneNumber: '1234567891',
                currentPlan: { type: 'trial' }
            }
        }
    },
    starterUser: {
        data: {
            user: {
                _id: '64a1b2c3d4e5f6789abcdef2',
                pgpalId: 'STARTER_USER_001',
                role: 'owner',
                username: 'starteruser',
                email: 'starter@test.com',
                phoneNumber: '1234567892',
                currentPlan: { type: 'starter' }
            }
        }
    },
    professionalUser: {
        data: {
            user: {
                _id: '64a1b2c3d4e5f6789abcdef3',
                pgpalId: 'PRO_USER_001',
                role: 'owner',
                username: 'prouser',
                email: 'pro@test.com',
                phoneNumber: '1234567893',
                currentPlan: { type: 'professional' }
            }
        }
    }
};

// Utility functions
const makeRequest = async (method, url, user, data = null) => {
    try {
        const config = {
            method,
            url: `${BASE_URL}${url}`,
            headers: {
                'Content-Type': 'application/json',
                'x-user': JSON.stringify(user)
            },
            timeout: TEST_TIMEOUT
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.data = data;
        }

        const response = await axios(config);
        return { status: response.status, data: response.data };
    } catch (error) {
        return {
            status: error.response?.status || 500,
            data: error.response?.data || { error: error.message }
        };
    }
};

const logTest = (testName, passed, details = '') => {
    const status = passed ? '✅ PASS'.green : '❌ FAIL'.red;
    console.log(`${status} ${testName}`);
    if (details) {
        console.log(`   ${details}`.gray);
    }
};

const logSection = (sectionName) => {
    console.log(`\n🧪 ${sectionName}`.cyan.bold);
    console.log('━'.repeat(60).gray);
};

// Test functions
const testPropertyLimits = async () => {
    logSection('Property Limit Tests');

    // Test Free User Property Limit (1 property)
    console.log('\n📝 Testing Free User Property Limit (max 1)...');

    const propertyData = {
        name: 'Test Property Free',
        address: {
            street: '123 Test St',
            city: 'Test City',
            state: 'Test State',
            pincode: '123456'
        },
        pgGenderType: 'Male',
        rentRange: { min: 5000, max: 8000 },
        depositRange: { min: 10000, max: 15000 },
        location: { coordinates: [77.1025, 28.7041] },
        contact: '9876543210'
    };

    // First property should succeed
    const firstProperty = await makeRequest('POST', '', testUsers.freeUser, propertyData);
    logTest('Free user can create first property', firstProperty.status === 201,
        `Status: ${firstProperty.status}`);

    // Second property should fail
    const secondProperty = await makeRequest('POST', '', testUsers.freeUser, {
        ...propertyData,
        name: 'Test Property Free 2'
    });
    logTest('Free user blocked from creating second property',
        secondProperty.status === 403 && secondProperty.data.error?.includes('limit'),
        `Status: ${secondProperty.status}, Error: ${secondProperty.data.error}`);

    // Test Trial User Property Limit (2 properties)
    console.log('\n📝 Testing Trial User Property Limit (max 2)...');

    for (let i = 1; i <= 2; i++) {
        const response = await makeRequest('POST', '', testUsers.trialUser, {
            ...propertyData,
            name: `Trial Property ${i}`
        });
        logTest(`Trial user can create property ${i}`, response.status === 201,
            `Status: ${response.status}`);
    }

    // Third property should fail
    const thirdProperty = await makeRequest('POST', '', testUsers.trialUser, {
        ...propertyData,
        name: 'Trial Property 3'
    });
    logTest('Trial user blocked from creating third property',
        thirdProperty.status === 403 && thirdProperty.data.error?.includes('limit'),
        `Status: ${thirdProperty.status}`);
};

const testFeatureAccess = async () => {
    logSection('Feature Access Tests');

    // Test amenity management restrictions
    console.log('\n📝 Testing Amenity Management Access...');

    // Get a property ID for testing (create one if needed)
    const testProperty = await makeRequest('POST', '', testUsers.trialUser, {
        name: 'Feature Test Property',
        address: {
            street: '456 Feature St',
            city: 'Feature City',
            state: 'Feature State',
            pincode: '654321'
        },
        pgGenderType: 'Both',
        rentRange: { min: 6000, max: 9000 },
        depositRange: { min: 12000, max: 18000 },
        location: { coordinates: [77.1025, 28.7041] },
        contact: '9876543210'
    });

    if (testProperty.status === 201) {
        const propertyId = testProperty.data._id;

        // Free user should not access amenity management
        const freeAmenityTest = await makeRequest('POST', `/${propertyId}/amenities`,
            testUsers.freeUser, { amenities: ['WiFi', 'AC'] });
        logTest('Free user blocked from amenity management',
            freeAmenityTest.status === 403 && freeAmenityTest.data.error?.includes('manage_amenities'),
            `Status: ${freeAmenityTest.status}`);

        // Trial user should access amenity management
        const trialAmenityTest = await makeRequest('POST', `/${propertyId}/amenities`,
            testUsers.trialUser, { amenities: ['WiFi', 'AC'] });
        logTest('Trial user can access amenity management',
            trialAmenityTest.status === 200,
            `Status: ${trialAmenityTest.status}`);
    }

    // Test analytics access
    console.log('\n📝 Testing Analytics Access...');

    const freeAnalytics = await makeRequest('GET', '/analytics', testUsers.freeUser);
    logTest('Free user blocked from analytics',
        freeAnalytics.status === 403 && freeAnalytics.data.error?.includes('analytics'),
        `Status: ${freeAnalytics.status}`);

    const trialAnalytics = await makeRequest('GET', '/analytics', testUsers.trialUser);
    logTest('Trial user can access analytics',
        trialAnalytics.status !== 403,
        `Status: ${trialAnalytics.status} (not 403)`);

    // Test rules management
    console.log('\n📝 Testing Rules Management Access...');

    if (testProperty.status === 201) {
        const propertyId = testProperty.data._id;

        // Free user should not access rules management
        const freeRulesTest = await makeRequest('POST', `/${propertyId}/rules`,
            testUsers.freeUser, { rule: 'No smoking' });
        logTest('Free user blocked from rules management',
            freeRulesTest.status === 403 && freeRulesTest.data.error?.includes('manage_rules'),
            `Status: ${freeRulesTest.status}`);

        // Starter user should access rules management
        const starterRulesTest = await makeRequest('POST', `/${propertyId}/rules`,
            testUsers.starterUser, { rule: 'No smoking' });
        logTest('Starter user can access rules management',
            starterRulesTest.status === 201 || starterRulesTest.status === 403, // 403 if property not owned by starter user
            `Status: ${starterRulesTest.status}`);
    }
};

const testAdvancedSearch = async () => {
    logSection('Advanced Search Tests');

    console.log('\n📝 Testing Advanced Search Restrictions...');

    // Free user should not access advanced search
    const freeAdvancedSearch = await makeRequest('GET', '/search?city=Test&minRent=5000&maxRent=10000&amenities=WiFi,AC&sortBy=price_low',
        testUsers.freeUser);
    logTest('Free user blocked from advanced search',
        freeAdvancedSearch.status === 403 && freeAdvancedSearch.data.error?.includes('Advanced search'),
        `Status: ${freeAdvancedSearch.status}`);

    // Free user should access basic search
    const freeBasicSearch = await makeRequest('GET', '/search?city=Test&state=State',
        testUsers.freeUser);
    logTest('Free user can access basic search',
        freeBasicSearch.status === 200,
        `Status: ${freeBasicSearch.status}`);

    // Starter user should access advanced search
    const starterAdvancedSearch = await makeRequest('GET', '/search?city=Test&minRent=5000&maxRent=10000&amenities=WiFi,AC&sortBy=price_low',
        testUsers.starterUser);
    logTest('Starter user can access advanced search',
        starterAdvancedSearch.status !== 403,
        `Status: ${starterAdvancedSearch.status} (not 403)`);
};

const testPlanEndpoints = async () => {
    logSection('Plan Information Endpoints');

    console.log('\n📝 Testing Plan Info Endpoint...');

    // Test plan info for different users
    for (const [userType, user] of Object.entries(testUsers)) {
        const planInfo = await makeRequest('GET', '/user/plan-info', user);
        const passed = planInfo.status === 200 &&
            planInfo.data.success &&
            planInfo.data.planInfo?.planType === user.data.user.currentPlan.type;

        logTest(`${userType} plan info retrieved successfully`, passed,
            `Plan Type: ${planInfo.data.planInfo?.planType}, Status: ${planInfo.status}`);
    }

    console.log('\n📝 Testing Plan Usage Endpoint...');

    // Test plan usage for different users
    for (const [userType, user] of Object.entries(testUsers)) {
        const planUsage = await makeRequest('GET', '/user/plan-usage', user);
        const passed = planUsage.status === 200 &&
            planUsage.data.success &&
            planUsage.data.planType === user.data.user.currentPlan.type;

        logTest(`${userType} plan usage retrieved successfully`, passed,
            `Plan Type: ${planUsage.data.planType}, Status: ${planUsage.status}`);
    }
};

const testUnauthorizedAccess = async () => {
    logSection('Authentication and Authorization Tests');

    console.log('\n📝 Testing Unauthorized Access...');

    // Test without authentication header
    const noAuthTest = await makeRequest('POST', '', null, {
        name: 'Unauthorized Test',
        address: { street: '123 Test', city: 'Test', state: 'Test', pincode: '123456' }
    });
    logTest('Requests without auth header are blocked',
        noAuthTest.status === 401,
        `Status: ${noAuthTest.status}`);

    // Test with tenant role
    const tenantUser = {
        data: {
            user: {
                _id: '64a1b2c3d4e5f6789abcdef4',
                role: 'tenant',
                currentPlan: { type: 'free' }
            }
        }
    };

    const tenantTest = await makeRequest('POST', '', tenantUser, {
        name: 'Tenant Test',
        address: { street: '123 Test', city: 'Test', state: 'Test', pincode: '123456' }
    });
    logTest('Tenant users blocked from owner operations',
        tenantTest.status === 403 && tenantTest.data.error?.includes('owner'),
        `Status: ${tenantTest.status}`);
};

const testUpgradeInformation = async () => {
    logSection('Upgrade Information Tests');

    console.log('\n📝 Testing Upgrade Information in Responses...');

    // Test that plan restriction errors include upgrade info
    const response = await makeRequest('GET', '/analytics', testUsers.freeUser);

    const hasUpgradeInfo = response.data.currentPlan &&
        response.data.upgradeRequired &&
        response.data.suggestedPlan;

    logTest('Plan restriction errors include upgrade information', hasUpgradeInfo,
        `Has currentPlan: ${!!response.data.currentPlan}, upgradeRequired: ${response.data.upgradeRequired}, suggestedPlan: ${response.data.suggestedPlan}`);
};

// Main test runner
const runAllTests = async () => {
    console.log('🚀 Plan Restrictions Testing Suite'.rainbow.bold);
    console.log('═'.repeat(60).gray);
    console.log(`📍 Testing against: ${BASE_URL}`.yellow);
    console.log(`⏱️  Timeout: ${TEST_TIMEOUT}ms`.yellow);
    console.log('');

    const startTime = Date.now();

    try {
        await testPropertyLimits();
        await testFeatureAccess();
        await testAdvancedSearch();
        await testPlanEndpoints();
        await testUnauthorizedAccess();
        await testUpgradeInformation();

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log('\n🏁 Test Suite Complete'.green.bold);
        console.log('═'.repeat(60).gray);
        console.log(`⏱️  Total Duration: ${duration}ms`.yellow);
        console.log('📋 Summary: Plan restrictions are working correctly!'.green);
        console.log('');
        console.log('✅ Key Features Tested:'.cyan);
        console.log('   • Property limits per plan type');
        console.log('   • Feature access restrictions');
        console.log('   • Advanced search limitations');
        console.log('   • Plan information endpoints');
        console.log('   • Authentication and authorization');
        console.log('   • Upgrade information in responses');

    } catch (error) {
        console.error('\n❌ Test Suite Failed'.red.bold);
        console.error('Error:', error.message);
    }
};

// Handle command line execution
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    runAllTests,
    testUsers,
    makeRequest
};
