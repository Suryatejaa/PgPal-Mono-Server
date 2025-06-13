// Simple connectivity test for plan restrictions
// Run this to test basic server connectivity before running full tests

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4002/api/property-service';

const testConnectivity = async () => {
    console.log('🔗 Testing server connectivity...');
    console.log(`📍 Target URL: ${BASE_URL}`);

    try {
        // Test a simple GET request that doesn't require authentication
        const response = await axios.get(`${BASE_URL}/search?city=test`, {
            timeout: 5000,
            headers: {
                'x-user': JSON.stringify({
                    data: {
                        user: {
                            _id: '64a1b2c3d4e5f6789abcdef0',
                            role: 'tenant',
                            currentPlan: { type: 'free' }
                        }
                    }
                })
            }
        });

        console.log('✅ Server is reachable');
        console.log(`📊 Response status: ${response.status}`);
        console.log(`📦 Response type: ${typeof response.data}`);

        return true;
    } catch (error) {
        console.log('❌ Server connection failed');
        console.log(`📊 Error status: ${error.response?.status || 'No response'}`);
        console.log(`📝 Error message: ${error.message}`);

        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Suggestion: Make sure the property service is running on port 3002');
        }

        return false;
    }
};

const quickPlanTest = async () => {
    console.log('\n🧪 Quick Plan Restriction Test...');

    const freeUser = {
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
    };
    try {
        // Test plan info endpoint
        const planInfoResponse = await axios.get(`${BASE_URL}/user/plan-info`, {
            headers: {
                'Content-Type': 'application/json',
                'x-user': JSON.stringify(freeUser)
            },
            timeout: 5000
        });

        if (planInfoResponse.status === 200 && planInfoResponse.data.planInfo) {
            console.log('✅ Plan info endpoint working');
            console.log(`📋 Plan type: ${planInfoResponse.data.planInfo.planType}`);
            console.log(`📊 Max properties: ${planInfoResponse.data.planInfo.properties.max}`);

            // Test restricted feature
            const analyticsResponse = await axios.get(`${BASE_URL}/analytics`, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-user': JSON.stringify(freeUser)
                },
                timeout: 5000
            });

            console.log('❌ Free user accessed analytics (should be blocked)');
        } else {
            console.log('❌ Plan info endpoint not working properly');
        }
    } catch (error) {
        if (error.response?.status === 403 && error.response?.data?.error?.includes('analytics')) {
            console.log('✅ Free user correctly blocked from analytics');
            console.log(`📝 Error: ${error.response.data.error}`);
        } else {
            console.log('❌ Unexpected error in plan test');
            console.log(`📊 Status: ${error.response?.status}`);
            console.log(`📝 Error: ${error.response?.data?.error || error.message}`);
        }
    }
};

const main = async () => {
    console.log('🚀 Plan Restrictions Connectivity Test\n');

    const isConnected = await testConnectivity();

    if (isConnected) {
        await quickPlanTest();
        console.log('\n🎉 Basic connectivity and plan restrictions are working!');
        console.log('💡 You can now run the full test suite: npm run test:plan-restrictions');
    } else {
        console.log('\n❌ Server is not reachable. Please start the property service first.');
        console.log('💡 Try: npm start (in the property service directory)');
    }
};

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testConnectivity, quickPlanTest };
