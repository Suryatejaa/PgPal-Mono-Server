// Test script for admin dashboard endpoints
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:4001/api/auth-service';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; // Use your actual JWT secret

// Generate a test admin token
function generateAdminToken() {
    const adminPayload = {
        _id: '68011399371720e87db789e9', // Existing admin user ID
        email: 'illasuryanani2001@gmail.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    };
    return jwt.sign(adminPayload, JWT_SECRET);
}

// Test admin endpoints
async function testAdminEndpoints() {
    const token = generateAdminToken();
    console.log('🔑 Generated admin token:', token.substring(0, 50) + '...');

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    }; try {
        // Test 1: Dashboard Stats
        console.log('\n📊 Testing Dashboard Stats...');
        const statsResponse = await axios.get(`${BASE_URL}/admin/dashboard/stats`, { headers });
        console.log('Status:', statsResponse.status);
        console.log('Response:', JSON.stringify(statsResponse.data, null, 2));

        // Test 2: System Health
        console.log('\n🏥 Testing System Health...');
        const healthResponse = await axios.get(`${BASE_URL}/admin/system/health`, { headers });
        console.log('Status:', healthResponse.status);
        console.log('Response:', JSON.stringify(healthResponse.data, null, 2));

        // Test 3: Users List (first page)
        console.log('\n👥 Testing Users List...');
        const usersResponse = await axios.get(`${BASE_URL}/admin/users?page=1&limit=10`, { headers });
        console.log('Status:', usersResponse.status);
        console.log('Response:', JSON.stringify(usersResponse.data, null, 2));

    } catch (error) {
        console.error('❌ Error testing endpoints:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Run tests
testAdminEndpoints();
