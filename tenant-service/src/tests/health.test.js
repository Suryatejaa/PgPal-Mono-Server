const request = require('supertest');
const app = require('../../index');

// Mock the database
jest.mock('../models/tenantModel');

describe('Tenant Controller', () => {
    describe('GET /api/tenant-service/tenants', () => {
        test('should require authentication', async () => {
            const response = await request(app)
                .get('/api/tenant-service/tenants')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /api/tenant-service/add', () => {
        test('should require authentication', async () => {
            const response = await request(app)
                .post('/api/tenant-service/add')
                .send({
                    name: 'Test Tenant',
                    phone: '1234567890'
                })
                .expect(400); // Missing x-user header

            expect(response.body).toHaveProperty('error');
        });
    });
});