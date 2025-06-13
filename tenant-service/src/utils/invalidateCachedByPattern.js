
const CacheHelper = require('../utils/CacheHelper');

const invalidateCacheByPattern = async (pattern) => {
    try {
        // Check if Redis is ready
        if (!CacheHelper.isReady()) {
            console.warn(`⚠️ [CACHE] Redis not ready, skipping cache invalidation for pattern: ${pattern}`);
            return false;
        }

        let cursor = '0';
        const keys = [];
        let scanCount = 0;
        const maxScans = 1000; // Prevent infinite loops

        console.log(`🔍 [CACHE] Starting cache invalidation for pattern: ${pattern}`);

        do {
            try {
                const scanResult = await CacheHelper.scan(cursor, { MATCH: pattern, COUNT: 100 });
                cursor = scanResult.cursor;
                const foundKeys = scanResult.keys;

                if (foundKeys && foundKeys.length > 0) {
                    keys.push(...foundKeys);
                    console.log(`🔍 [CACHE] Scan ${scanCount + 1}: Found ${foundKeys.length} keys`);
                }

                scanCount++;

                // Safety check to prevent infinite loops
                if (scanCount > maxScans) {
                    console.error(`❌ [CACHE] Max scan limit reached (${maxScans}), stopping scan`);
                    break;
                }

            } catch (scanError) {
                console.error(`❌ [CACHE] Error during scan iteration ${scanCount}:`, scanError.message);
                break;
            }
        } while (cursor !== 0 && cursor !== '0');

        console.log(`📊 [CACHE] Scan completed: ${keys.length} total keys found for pattern "${pattern}"`);

        if (keys.length > 0) {
            try {
                // Delete keys in batches to avoid overwhelming Redis
                const batchSize = 100;
                let deletedCount = 0;

                for (let i = 0; i < keys.length; i += batchSize) {
                    const batch = keys.slice(i, i + batchSize);
                    try {
                        const result = await CacheHelper.del(batch);
                        deletedCount += result;
                        console.log(`🗑️ [CACHE] Deleted batch ${Math.floor(i / batchSize) + 1}: ${result}/${batch.length} keys`);
                    } catch (deleteError) {
                        console.error(`❌ [CACHE] Error deleting batch ${Math.floor(i / batchSize) + 1}:`, deleteError.message);
                    }
                }

                console.log(`✅ [CACHE] Successfully deleted ${deletedCount}/${keys.length} keys for pattern "${pattern}"`);
                return deletedCount;
            } catch (deleteError) {
                console.error(`❌ [CACHE] Error deleting keys for pattern "${pattern}":`, deleteError.message);
                return 0;
            }
        } else {
            console.log(`ℹ️ [CACHE] No matching keys found for pattern: ${pattern}`);
            return 0;
        }
    } catch (err) {
        console.error(`❌ [CACHE] Error invalidating cache for pattern "${pattern}":`, err.message);
        console.error(`❌ [CACHE] Stack trace:`, err.stack);
        return 0;
    }
};

module.exports = invalidateCacheByPattern;