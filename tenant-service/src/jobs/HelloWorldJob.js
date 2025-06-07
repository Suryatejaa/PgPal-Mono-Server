// src/jobs/HelloWorldJob.js
const cron = require('node-cron');

class HelloWorldJob {
    constructor() {
        this.jobName = 'Hello World Job';
        this.cronExpression = '*/10 * * * * *'; // Every 10 seconds for testing
    }

    async processHelloWorld() {
        console.log(`[${this.jobName}] Hello World! Current time: ${new Date().toISOString()}`);
        return { message: 'Hello World executed', timestamp: new Date() };
    }

    start() {
        console.log(`[${this.jobName}] Starting job...`);

        const task = cron.schedule(this.cronExpression, async () => {
            await this.processHelloWorld();
        }, {
            scheduled: true,
            timezone: "Asia/Kolkata"
        });

        console.log(`[${this.jobName}] Job scheduled successfully`);
        return task;
    }

    async runManually() {
        console.log(`[${this.jobName}] Manual execution`);
        return await this.processHelloWorld();
    }
}

module.exports = HelloWorldJob;