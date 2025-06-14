const Redis = require('ioredis');

class WebSocketEmitter {
    constructor(serviceName) {
        this.serviceName = serviceName;
        this.redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
        this.channel = `${serviceName}-events`;
    }

    async emit(eventType, data, audience = 'all', userId = null) {
        try {
            const message = {
                eventType,
                data,
                audience,
                userId,
                timestamp: new Date().toISOString(),
                service: this.serviceName
            };

            await this.redis.publish(this.channel, JSON.stringify(message));
            console.log(`📡 [${this.serviceName}] WebSocket event emitted: ${eventType}`);
        } catch (error) {
            console.error(`❌ [${this.serviceName}] WebSocket emit error:`, error);
        }
    }

    // Specific event methods
    async notifyPropertyUpdate(propertyData, ownerId) {
        await this.emit('property-updated', propertyData, 'owners', ownerId);
    }

    async notifyTenantUpdate(tenantData, tenantId) {
        await this.emit('tenant-updated', tenantData, 'tenants', tenantId);
    }

    async notifyComplaintUpdate(complaintData, userId) {
        await this.emit('complaint-updated', complaintData, null, userId);
    }

    async notifySystemUpdate(data) {
        await this.emit('system-update', data, 'all');
    }
}

module.exports = WebSocketEmitter;