// src/jobs/index.js
const VacateTenantsJob = require('./vacateTenantsJob');
const RentReminderJob = require('./RentReminderJob');
const HelloWorldJob = require('./HelloWorldJob');

class JobScheduler {
    constructor() {
        this.jobs = [];
    }

    startAllJobs() {
        console.log('🚀 Starting all scheduled jobs...');

        // Start vacate tenants job
        const vacateJob = new VacateTenantsJob();
        this.jobs.push({
            name: 'VacateTenantsJob',
            instance: vacateJob,
            task: vacateJob.start()
        });

        // Start rent reminder job
        const rentReminderJob = new RentReminderJob();
        this.jobs.push({
            name: 'RentReminderJob',
            instance: rentReminderJob,
            task: rentReminderJob.start()
        });

        console.log(`✅ ${this.jobs.length} jobs scheduled successfully`);
        return this.jobs;
    }

    async runJob(jobName) {
        const job = this.jobs.find(j => j.name === jobName);
        if (!job) {
            throw new Error(`Job ${jobName} not found`);
        }

        return await job.instance.runManually();
    }

    stopAllJobs() {
        this.jobs.forEach(job => {
            if (job.task && job.task.stop) {
                job.task.stop();
                console.log(`⏹️  Stopped job: ${job.name}`);
            }
        });
        this.jobs = [];
    }
}

module.exports = JobScheduler;