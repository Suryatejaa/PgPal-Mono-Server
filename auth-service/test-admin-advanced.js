// Enhanced test script for admin dashboard endpoints
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:4001/api/auth-service';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

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

// Test additional admin endpoints
async function testAdvancedEndpoints() {
    const token = generateAdminToken();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    try {
        // Test 1: Registration Trends
        console.log('\n📈 Testing Registration Trends...');
        const trendsResponse = await axios.get(`${BASE_URL}/admin/analytics/registration-trends?period=30`, { headers });
        console.log('Status:', trendsResponse.status);
        console.log('Data:', JSON.stringify(trendsResponse.data, null, 2));

        // Test 2: User Activity Analytics
        console.log('\n🔥 Testing User Activity...');
        const activityResponse = await axios.get(`${BASE_URL}/admin/analytics/user-activity?period=7`, { headers });
        console.log('Status:', activityResponse.status);
        console.log('Data:', JSON.stringify(activityResponse.data, null, 2));

        // Test 3: System Report
        console.log('\n📋 Testing System Report...');
        const reportResponse = await axios.get(`${BASE_URL}/admin/system/report`, { headers });
        console.log('Status:', reportResponse.status);
        console.log('Data:', JSON.stringify(reportResponse.data, null, 2));

        // Test 4: Database Integrity Check
        console.log('\n🔍 Testing Database Integrity Check...');
        const integrityResponse = await axios.get(`${BASE_URL}/admin/system/integrity-check`, { headers });
        console.log('Status:', integrityResponse.status);
        console.log('Data:', JSON.stringify(integrityResponse.data, null, 2));        // Test 5: Cache Management
        console.log('\n🗄️ Testing Cache Management...');
        const cacheResponse = await axios.post(`${BASE_URL}/admin/cache/manage`, {
            action: 'clear_pattern',
            pattern: 'user:*'
        }, { headers });
        console.log('Status:', cacheResponse.status);
        console.log('Data:', JSON.stringify(cacheResponse.data, null, 2));

        // Test 6: User Search
        console.log('\n🔍 Testing User Search...');
        const searchResponse = await axios.get(`${BASE_URL}/admin/users?search=surya&page=1&limit=5`, { headers });
        console.log('Status:', searchResponse.status);
        console.log('Data:', JSON.stringify(searchResponse.data.data.users[0], null, 2));

        console.log('\n✅ All admin dashboard endpoints are working perfectly!');

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
testAdvancedEndpoints();
