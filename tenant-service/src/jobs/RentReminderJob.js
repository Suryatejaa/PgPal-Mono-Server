// src/jobs/RentReminderJob.js
const cron = require('node-cron');
const Tenant = require('../models/tenantModel');
const notificationQueue = require('../utils/notificationQueue');

async function sendNotifications(notifications) {
    for (const notification of notifications) {
        console.log('Queuing notification:', notification);
        try {
            await notificationQueue.add('notifications', notification, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 3000 }
            });
        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }
    }
}

class RentReminderJob {
    constructor() {
        this.jobName = 'Daily Rent Reminder Job';
        this.cronExpression = '* 9 * * *'; // Every day at 9 AM
    }

    async processRentReminders() {
        console.log(`[${this.jobName}] Starting rent reminder processing at ${new Date().toISOString()}`);

        try {
            const currentDate = new Date();

            // Find all active tenants
            const activeTenants = await Tenant.find({
                status: 'active',
                'currentStay.propertyPpid': { $exists: true, $ne: null }
            });

            if (!activeTenants || activeTenants.length === 0) {
                console.log(`[${this.jobName}] No active tenants found`);
                return { processed: 0, reminded: 0 };
            }

            console.log(`[${this.jobName}] Found ${activeTenants.length} active tenants to process`);

            let reminded = 0;

            for (const tenant of activeTenants) {
                const shouldRemind = this.shouldSendRentReminder(tenant, currentDate);

                if (shouldRemind) {
                    await this.sendRentReminder(tenant, shouldRemind);
                    reminded++;
                }
            }

            console.log(`[${this.jobName}] Processing completed. Reminded: ${reminded}`);
            return { processed: activeTenants.length, reminded };

        } catch (error) {
            console.error(`[${this.jobName}] Fatal error during processing:`, error);
            throw error;
        }
    }

    shouldSendRentReminder(tenant, currentDate) {
        const currentStay = tenant.currentStay;

        if (!currentStay || !currentStay.rentDueDate) {
            return false;
        }

        const rentDueDate = new Date(currentStay.rentDueDate);
        const diffTime = rentDueDate - currentDate;
        const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const isOverdue = daysUntilDue < 0;
        const isDueSoon = daysUntilDue <= 3 && daysUntilDue >= 0;
        const hasUnpaidAmount = (currentStay.rentDue || 0) > 0;

        if (isOverdue || isDueSoon || hasUnpaidAmount) {
            return {
                type: isOverdue ? 'overdue' : isDueSoon ? 'due_soon' : 'due',
                daysUntilDue,
                isOverdue
            };
        }

        return false;
    }

    async sendRentReminder(tenant, reminderInfo) {
        try {
            const currentStay = tenant.currentStay;
            const notifications = [];

            // Get title and message based on reminder type
            const { title, message } = this.getReminderContent(tenant, reminderInfo);

            // Notify tenant
            notifications.push({
                tenantId: tenant.pgpalId,
                propertyPpid: currentStay.propertyPpid,
                audience: 'tenant',
                title,
                message,
                type: reminderInfo.isOverdue ? 'warning' : 'info',
                method: ['in-app', 'email'],
                meta: {
                    rentAmount: currentStay.rent,
                    dueDate: currentStay.rentDueDate,
                    reminderType: reminderInfo.type
                },
                createdBy: 'system'
            });

            sendNotifications(notifications);
            console.log(`[${this.jobName}] Rent reminder sent to ${tenant.pgpalId} (${reminderInfo.type})`);

        } catch (error) {
            console.error(`[${this.jobName}] Failed to send reminder to ${tenant.pgpalId}:`, error.message);
        }
    }

    getReminderContent(tenant, reminderInfo) {
        const currentStay = tenant.currentStay;
        const rentAmount = currentStay.rentDue;
        const dueDate = new Date(currentStay.rentDueDate).toLocaleDateString();

        switch (reminderInfo.type) {
            case 'overdue':
                return {
                    title: '🚨 Rent Payment Overdue',
                    message: `Your rent of ₹${rentAmount} was due on ${dueDate}. Please make the payment immediately to avoid any inconvenience.`
                };
            case 'due_soon':
                return {
                    title: '⏰ Rent Due Soon',
                    message: `Your rent of ₹${rentAmount} is due on ${dueDate}. Please ensure timely payment.`
                };
            default:
                return {
                    title: '💳 Monthly Rent Due',
                    message: `Your monthly rent of ₹${rentAmount} is due on ${dueDate}. Please make the payment.`
                };
        }
    }

    start() {
        console.log(`[${this.jobName}] Scheduling job with cron expression: ${this.cronExpression}`);

        const task = cron.schedule(this.cronExpression, async () => {
            try {
                await this.processRentReminders();
            } catch (error) {
                console.error(`[${this.jobName}] Job execution failed:`, error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Kolkata"
        });

        console.log(`[${this.jobName}] Job scheduled successfully`);
        return task;
    }

    async runManually() {
        console.log(`[${this.jobName}] Manual execution triggered`);
        try {
            const result = await this.processRentReminders();
            console.log(`[${this.jobName}] Manual execution completed:`, result);
            return result;
        } catch (error) {
            console.error(`[${this.jobName}] Manual execution failed:`, error);
            throw error;
        }
    }
}

module.exports = RentReminderJob;