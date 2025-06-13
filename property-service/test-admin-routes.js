// Simple test of admin routes loading
const express = require('express');
const app = express();

console.log('Testing admin routes loading...');

try {
    const adminRoutes = require('./src/routes/adminRoutes');
    console.log('✅ Admin routes loaded successfully');

    app.use('/admin', adminRoutes);
    console.log('✅ Admin routes mounted successfully');

    const port = 3001;
    app.listen(port, () => {
        console.log(`✅ Test server running on port ${port}`);
        console.log(`🧪 Test URL: http://localhost:${port}/admin/test`);
    });
} catch (error) {
    console.log('❌ Error loading admin routes:', error.message);
    console.log('Stack:', error.stack);
}
