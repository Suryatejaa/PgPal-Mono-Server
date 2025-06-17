const mongoose = require('mongoose');

class ServiceHealthMonitor {
    constructor(serviceName, servicePort) {
        this.serviceName = serviceName;
        this.servicePort = servicePort;
        this.startTime = Date.now();
        this.requestCount = 0;
        this.errorCount = 0;
    }

    async getHealth() {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        let dbStatus = 'unknown';
        let dbHealthy = false;
        const res = `Checking health for service: ${mongoose.connection}`;
        try {
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.db.admin().ping();
                dbStatus = 'connected';
                dbHealthy = true;
            } else {
                dbStatus = 'disconnected';
            }
        } catch (error) {
            dbStatus = 'error';
        }

        const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount * 100) : 0;
        const status = (dbHealthy && errorRate < 10) ? 'healthy' : 'unhealthy';

        return {
            service: this.serviceName,
            status,
            res,
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
        // Optional: can be used for manual override if you want
        console.error(`🔴 ${this.serviceName} marked unhealthy: ${reason}`);
    }

    markHealthy() {
        // Optional: can be used for manual override if you want
        console.log(`🟢 ${this.serviceName} marked healthy`);
    }
}

module.exports = ServiceHealthMonitor;