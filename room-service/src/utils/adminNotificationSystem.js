const nodemailer = require('nodemailer');
const axios = require('axios');
const adminConfig = require('../config/adminConfig');

class AdminNotificationSystem {
    constructor() {
        this.emailTransporter = null;
        this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
        this.webhookUrls = process.env.ADMIN_WEBHOOK_URLS ? process.env.ADMIN_WEBHOOK_URLS.split(',') : [];

        this.initializeEmailTransporter();
    }

    // Initialize email transporter
    initializeEmailTransporter() {
        if (adminConfig.notifications.enableEmail && process.env.SMTP_HOST) {
            this.emailTransporter = nodemailer.createTransporter({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }
    }

    // Send alert notification
    async sendAlert(alert, priority = 'medium') {
        const notification = {
            title: this.formatAlertTitle(alert),
            message: this.formatAlertMessage(alert),
            priority,
            timestamp: new Date(),
            alert
        };

        const promises = [];

        // Send email notification
        if (adminConfig.notifications.enableEmail && this.emailTransporter) {
            promises.push(this.sendEmailNotification(notification));
        }

        // Send Slack notification
        if (adminConfig.notifications.enableSlack && this.slackWebhookUrl) {
            promises.push(this.sendSlackNotification(notification));
        }

        // Send webhook notifications
        if (adminConfig.notifications.enableWebhook && this.webhookUrls.length > 0) {
            promises.push(this.sendWebhookNotifications(notification));
        }

        try {
            await Promise.allSettled(promises);
            console.log(`📧 Alert notification sent: ${alert.type}`);
        } catch (error) {
            console.error('❌ Failed to send alert notification:', error);
        }
    }

    // Send system status notification
    async sendSystemStatus(status, metrics) {
        const notification = {
            title: 'PG Management System Status Report',
            message: this.formatStatusMessage(status, metrics),
            priority: status === 'healthy' ? 'low' : 'high',
            timestamp: new Date(),
            status,
            metrics
        };

        if (adminConfig.notifications.enableEmail && this.emailTransporter) {
            await this.sendEmailNotification(notification);
        }
    }

    // Send daily/weekly reports
    async sendReport(reportType, data) {
        const notification = {
            title: `${reportType.toUpperCase()} Admin Report`,
            message: this.formatReportMessage(reportType, data),
            priority: 'low',
            timestamp: new Date(),
            reportType,
            data
        };

        if (adminConfig.notifications.enableEmail && this.emailTransporter) {
            await this.sendEmailNotification(notification);
        }
    }

    // Email notification implementation
    async sendEmailNotification(notification) {
        if (!this.emailTransporter) return;

        const emailAddresses = adminConfig.notifications.adminEmails || [process.env.ADMIN_EMAIL];

        const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@pgpaal.com',
            to: emailAddresses.join(','),
            subject: notification.title,
            html: this.generateEmailTemplate(notification)
        };

        await this.emailTransporter.sendMail(mailOptions);
    }

    // Slack notification implementation
    async sendSlackNotification(notification) {
        if (!this.slackWebhookUrl) return;

        const slackPayload = {
            text: notification.title,
            attachments: [
                {
                    color: this.getPriorityColor(notification.priority),
                    fields: [
                        {
                            title: 'Message',
                            value: notification.message,
                            short: false
                        },
                        {
                            title: 'Priority',
                            value: notification.priority.toUpperCase(),
                            short: true
                        },
                        {
                            title: 'Time',
                            value: notification.timestamp.toISOString(),
                            short: true
                        }
                    ]
                }
            ]
        };

        await axios.post(this.slackWebhookUrl, slackPayload);
    }

    // Webhook notifications implementation
    async sendWebhookNotifications(notification) {
        const payload = {
            event: 'admin_notification',
            data: notification
        };

        const promises = this.webhookUrls.map(url =>
            axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            }).catch(error => {
                console.warn(`Webhook delivery failed: ${url}`, error.message);
            })
        );

        await Promise.allSettled(promises);
    }

    // Format alert title
    formatAlertTitle(alert) {
        const alertTypes = {
            'low-occupancy': '🔶 Low Occupancy Alert',
            'high-occupancy': '🔥 High Occupancy Alert',
            'stale-data': '⚠️ Stale Data Alert',
            'system-error': '🚨 System Error Alert',
            'performance-issue': '⚡ Performance Issue',
            'security-alert': '🔒 Security Alert'
        };

        return alertTypes[alert.type] || `🔔 Admin Alert: ${alert.type}`;
    }

    // Format alert message
    formatAlertMessage(alert) {
        switch (alert.type) {
            case 'low-occupancy':
                return `Property has low occupancy rate: ${alert.occupancyRate}%. Immediate attention may be needed to improve bookings.`;

            case 'high-occupancy':
                return `Property is nearly full: ${alert.occupancyRate}% occupied. Consider preparing for capacity management.`;

            case 'stale-data':
                return `${alert.count} rooms haven't been updated in 30+ days. Data accuracy may be compromised.`;

            default:
                return alert.message || 'Admin system alert triggered';
        }
    }

    // Format system status message
    formatStatusMessage(status, metrics) {
        if (status === 'healthy') {
            return `System is operating normally. Database: ${metrics.database.status}, Memory: ${Math.round(metrics.memory.heapUsed / 1024 / 1024)}MB used.`;
        } else {
            return `System health issues detected. Please check dashboard for details.`;
        }
    }

    // Format report message
    formatReportMessage(reportType, data) {
        switch (reportType) {
            case 'daily':
                return `Daily summary: ${data.totalRooms} rooms, ${data.occupancyRate}% occupancy, ₹${data.revenue} revenue.`;

            case 'weekly':
                return `Weekly summary: ${data.newBookings} new bookings, ${data.averageOccupancy}% avg occupancy.`;

            default:
                return `${reportType} report generated with latest data.`;
        }
    }

    // Generate HTML email template
    generateEmailTemplate(notification) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background: ${this.getPriorityColor(notification.priority)}; color: white; padding: 20px; }
                .content { padding: 30px; }
                .footer { background: #f8f9fa; padding: 15px 30px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d; }
                .priority { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
                .priority-high { background: #dc3545; color: white; }
                .priority-medium { background: #ffc107; color: black; }
                .priority-low { background: #28a745; color: white; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0; font-size: 24px;">${notification.title}</h1>
                </div>
                <div class="content">
                    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                        ${notification.message}
                    </p>
                    <p>
                        <span class="priority priority-${notification.priority}">${notification.priority} Priority</span>
                    </p>
                    <p style="color: #6c757d; font-size: 14px;">
                        <strong>Time:</strong> ${notification.timestamp.toLocaleString()}
                    </p>
                </div>
                <div class="footer">
                    <p style="margin: 0;">
                        This is an automated notification from PG Management System Admin Dashboard.
                        <br>
                        Please do not reply to this email.
                    </p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Get priority color
    getPriorityColor(priority) {
        const colors = {
            low: '#28a745',
            medium: '#ffc107',
            high: '#dc3545'
        };
        return colors[priority] || '#6c757d';
    }

    // Test notification system
    async testNotifications() {
        const testAlert = {
            type: 'system-test',
            message: 'This is a test notification from the admin system.',
            severity: 'info'
        };

        await this.sendAlert(testAlert, 'low');
        console.log('🧪 Test notification sent');
    }
}

module.exports = AdminNotificationSystem;
