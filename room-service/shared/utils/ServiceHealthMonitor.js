// auth-service/shared/utils/ServiceHealthMonitor.js
const mongoose = require('mongoose');

class ServiceHealthMonitor {
    constructor(serviceName, servicePort) {
        this.serviceName = serviceName;
        this.servicePort = servicePort;
        this.startTime = Date.now();
        this.requestCount = 0;
        this.errorCount = 0;
        this.isHealthy = true;
    }

    async getHealth() {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        let dbStatus = 'unknown';
        try {
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.db.admin().ping();
                dbStatus = 'connected';
                this.isHealthy = true;
            } else {
                dbStatus = 'disconnected';
                this.isHealthy = false;
            }
        } catch (error) {
            dbStatus = 'error';
            this.isHealthy = false;
        }

        const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount * 100) : 0;
        const status = this.isHealthy && dbStatus === 'connected' && errorRate < 10 ? 'healthy' : 'unhealthy';

        return {
            service: this.serviceName,
            status,
            port: this.servicePort,
            uptime: Math.floor(uptime),
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
            },
            database: {
                status: dbStatus,
                readyState: mongoose.connection.readyState
            },
            requests: {
                total: this.requestCount,
                errors: this.errorCount,
                errorRate: errorRate.toFixed(2) + '%'
            },
            timestamp: new Date().toISOString()
        };
    }

    trackRequest() {
        this.requestCount++;
    }

    trackError() {
        this.errorCount++;
    }

    markUnhealthy(reason) {
        this.isHealthy = false;
        console.error(`🔴 ${this.serviceName} marked unhealthy: ${reason}`);
    }

    markHealthy() {
        this.isHealthy = true;
        console.log(`🟢 ${this.serviceName} marked healthy`);
    }
}

module.exports = ServiceHealthMonitor;