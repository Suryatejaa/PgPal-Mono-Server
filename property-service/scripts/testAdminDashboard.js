// Test script for Admin Dashboard functionality
// This script tests all admin endpoints and functionality

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:4002/api/property-service';
const ADMIN_BASE_URL = `${BASE_URL}/admin`;

// Mock admin user headers
const adminHeaders = {
    'x-user': JSON.stringify({
        data: {
            user: {
                id: 'admin-test-123',
                email: 'admin@pgpaal.com',
                role: 'admin',
                adminLevel: 'admin'
            }
        }
    }),
    'Content-Type': 'application/json'
};

const superAdminHeaders = {
    'x-user': JSON.stringify({
        data: {
            user: {
                id: 'super-admin-test-123',
                email: 'superadmin@pgpaal.com',
                role: 'super_admin',
                adminLevel: 'super_admin'
            }
        }
    }),
    'Content-Type': 'application/json'
};

class AdminDashboardTester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async test(name, testFn) {
        try {
            console.log(`\n🧪 Testing: ${name}`);
            await testFn();
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASSED' });
            console.log(`✅ PASSED: ${name}`);
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAILED', error: error.message });
            console.log(`❌ FAILED: ${name} - ${error.message}`);
        }
    }

    async testDashboardOverview() {
        const response = await axios.get(`${ADMIN_BASE_URL}/dashboard/overview`, { headers: adminHeaders });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const data = response.data;
        if (!data.summary || !data.planDistribution) {
            throw new Error('Invalid dashboard overview response structure');
        }

        console.log(`📊 Dashboard Overview - Total Properties: ${data.summary.totalProperties}`);
    }

    async testPropertyManagement() {
        // Test get all properties
        const propertiesResponse = await axios.get(`${ADMIN_BASE_URL}/properties`, { headers: adminHeaders });

        if (propertiesResponse.status !== 200) {
            throw new Error(`Expected status 200, got ${propertiesResponse.status}`);
        }

        console.log(`🏠 Properties found: ${propertiesResponse.data.properties?.length || 0}`);

        // Test property filters
        const filteredResponse = await axios.get(`${ADMIN_BASE_URL}/properties?status=active&limit=5`, { headers: adminHeaders });

        if (filteredResponse.status !== 200) {
            throw new Error(`Filtered properties request failed with status ${filteredResponse.status}`);
        }
    }

    async testUserManagement() {
        const usersResponse = await axios.get(`${ADMIN_BASE_URL}/users`, { headers: adminHeaders });

        if (usersResponse.status !== 200) {
            throw new Error(`Expected status 200, got ${usersResponse.status}`);
        }

        console.log(`👥 Users found: ${usersResponse.data.users?.length || 0}`);
    }

    async testSystemAnalytics() {
        const analyticsResponse = await axios.get(`${ADMIN_BASE_URL}/analytics`, { headers: adminHeaders });

        if (analyticsResponse.status !== 200) {
            throw new Error(`Expected status 200, got ${analyticsResponse.status}`);
        }

        const data = analyticsResponse.data;
        if (!data.properties || !data.users) {
            throw new Error('Invalid analytics response structure');
        }

        console.log(`📈 Analytics - Property Growth: ${data.properties.growth || 'N/A'}`);
    }

    async testBulkOperations() {
        const bulkData = {
            operation: 'suspend',
            entityType: 'properties',
            entityIds: [], // Empty array for test
            reason: 'Testing bulk operations'
        };

        const response = await axios.post(`${ADMIN_BASE_URL}/bulk-operations`, bulkData, { headers: adminHeaders });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        console.log(`🔄 Bulk operation test completed`);
    }

    async testSystemMaintenance() {
        const maintenanceData = {
            operation: 'clear-cache',
            options: {
                pattern: 'test:*'
            }
        };

        const response = await axios.post(`${ADMIN_BASE_URL}/maintenance`, maintenanceData, { headers: superAdminHeaders });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        console.log(`🔧 System maintenance test completed`);
    }

    async testNotificationSystem() {
        const notificationData = {
            title: 'Test Admin Notification',
            message: 'This is a test notification from admin dashboard',
            type: 'info',
            audience: 'all'
        };

        const response = await axios.post(`${ADMIN_BASE_URL}/notifications/send`, notificationData, { headers: superAdminHeaders });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        console.log(`📢 Notification test sent successfully`);
    }

    async testDataExport() {
        const exportResponse = await axios.get(`${ADMIN_BASE_URL}/export?type=properties&format=json&limit=10`, { headers: adminHeaders });

        if (exportResponse.status !== 200) {
            throw new Error(`Expected status 200, got ${exportResponse.status}`);
        }

        console.log(`📥 Data export test completed`);
    }

    async testUnauthorizedAccess() {
        try {
            const response = await axios.get(`${ADMIN_BASE_URL}/dashboard/overview`, {
                headers: {
                    'x-user': JSON.stringify({
                        data: {
                            user: {
                                id: 'regular-user-123',
                                email: 'user@pgpaal.com',
                                role: 'user'
                            }
                        }
                    }),
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                throw new Error('Unauthorized access was allowed - security issue!');
            }
        } catch (error) {
            if (error.response && (error.response.status === 403 || error.response.status === 401)) {
                console.log(`🔒 Unauthorized access properly blocked`);
                return;
            }
            throw error;
        }
    }

    async testSuperAdminRestrictions() {
        try {
            const response = await axios.post(`${ADMIN_BASE_URL}/maintenance`,
                { operation: 'clear-cache' },
                { headers: adminHeaders } // Using regular admin instead of super admin
            );

            if (response.status === 200) {
                throw new Error('Super admin operation allowed for regular admin - security issue!');
            }
        } catch (error) {
            if (error.response && error.response.status === 403) {
                console.log(`🔐 Super admin restrictions working properly`);
                return;
            }
            throw error;
        }
    }

    async runAllTests() {
        console.log('🚀 Starting Admin Dashboard Test Suite');
        console.log('=====================================');

        await this.test('Dashboard Overview', () => this.testDashboardOverview());
        await this.test('Property Management', () => this.testPropertyManagement());
        await this.test('User Management', () => this.testUserManagement());
        await this.test('System Analytics', () => this.testSystemAnalytics());
        await this.test('Bulk Operations', () => this.testBulkOperations());
        await this.test('System Maintenance', () => this.testSystemMaintenance());
        await this.test('Notification System', () => this.testNotificationSystem());
        await this.test('Data Export', () => this.testDataExport());
        await this.test('Unauthorized Access Prevention', () => this.testUnauthorizedAccess());
        await this.test('Super Admin Restrictions', () => this.testSuperAdminRestrictions());

        this.printResults();
    }

    printResults() {
        console.log('\n🏁 Test Results Summary');
        console.log('========================');
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📊 Total: ${this.results.passed + this.results.failed}`);

        if (this.results.failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.results.tests
                .filter(test => test.status === 'FAILED')
                .forEach(test => {
                    console.log(`  - ${test.name}: ${test.error}`);
                });
        }

        // Save results to file
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                passed: this.results.passed,
                failed: this.results.failed,
                total: this.results.passed + this.results.failed
            },
            tests: this.results.tests
        };

        fs.writeFileSync('./admin-dashboard-test-report.json', JSON.stringify(report, null, 2));
        console.log('\n📋 Test report saved to: admin-dashboard-test-report.json');
    }
}

// Check if the server is running
async function checkServerHealth() {
    try {
        const response = await axios.get(`${BASE_URL}/test-route`);
        if (response.status === 200) {
            console.log('✅ Server is running and accessible');
            return true;
        }
    } catch (error) {
        console.log('❌ Server is not accessible. Please ensure the property service is running on port 4002');
        console.log('   Run: npm start or node index.js');
        return false;
    }
}

// Main execution
async function main() {
    console.log('🔍 Admin Dashboard Test Suite');
    console.log('============================');

    const serverRunning = await checkServerHealth();
    if (!serverRunning) {
        process.exit(1);
    }

    const tester = new AdminDashboardTester();
    await tester.runAllTests();

    process.exit(tester.results.failed > 0 ? 1 : 0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Test interrupted by user');
    process.exit(0);
});

if (require.main === module) {
    main().catch(error => {
        console.error('💥 Unexpected error:', error.message);
        process.exit(1);
    });
}

module.exports = AdminDashboardTester;
