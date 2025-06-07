// src/utils/testCacheHelper.js
const CacheHelper = require('./CacheHelper');

async function testCacheHelper() {
    console.log('Testing CacheHelper...');

    // Wait for Redis to be ready
    console.log('Waiting for Redis to be ready...');
    let attempts = 0;
    while (!CacheHelper.isReady() && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        console.log(`Attempt ${attempts}: Redis ready: ${CacheHelper.isReady()}`);
    }

    if (!CacheHelper.isReady()) {
        console.error('❌ Redis not ready after 10 seconds');
        return;
    }

    console.log('✅ Redis is ready!');

    // Test set operation
    const testKey = 'test:dashboard:key';
    const testData = { test: 'data', timestamp: Date.now() };

    console.log('Setting test data...');
    const setResult = await CacheHelper.set(testKey, testData, 60);
    console.log('Set result:', setResult);

    // Test get operation
    console.log('Getting test data...');
    const getData = await CacheHelper.get(testKey);
    console.log('Get result:', getData);

    // Clean up
    if (CacheHelper.del) {
        console.log('Cleaning up...');
        await CacheHelper.del(testKey);
    } else {
        console.log('⚠️  del method not available');
    }

    console.log('Test completed');
}

testCacheHelper().catch(console.error);