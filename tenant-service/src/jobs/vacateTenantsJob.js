const cron = require('node-cron');
const Tenant = require('../models/tenantModel');
const Vacates = require('../models/vacatesModel');
const { clearBed } = require('../controllers/internalApis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const { notifyVacateCompleted } = require('../utils/vacateNotifications');

/**
 * Daily job to process tenants whose notice period has ended
 * Runs daily at 12:01 AM
 */
class VacateTenantsJob {
    constructor() {
        this.jobName = 'Daily Vacate Processing Job';
        this.cronExpression = '0 * * * *'; // Every hour at minute 0
    }

    async processExpiredNoticePeriods() {
        console.log(`[${this.jobName}] Starting processing at ${new Date().toISOString()}`);

        try {
            // Find all tenants in notice period whose vacate date has passed
            const now = new Date();
            const currentDateIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

            // Set to end of current day (23:59:59)
            const endOfToday = new Date(currentDateIST);
            endOfToday.setHours(23, 59, 59, 999);

            console.log(`[${this.jobName}] Checking for tenants with notice period ending by: ${endOfToday.toISOString()}`);

            const expiredTenants = await Tenant.find({
                status: 'active',
                isInNoticePeriod: true,
                noticePeriodEndDate: { $lte: endOfToday }
            });

            if (!expiredTenants || expiredTenants.length === 0) {
                console.log(`[${this.jobName}] No tenants found with expired notice periods`);
                return { processed: 0, errors: 0 };
            }

            console.log(`[${this.jobName}] Found ${expiredTenants.length} tenants with expired notice periods`);

            const processResults = await Promise.all(
                expiredTenants.map(tenant => this.processSingleTenant(tenant))
            );

            const successCount = processResults.filter(result => result.success).length;
            const errorCount = processResults.filter(result => !result.success).length;

            console.log(`[${this.jobName}] Processing completed. Success: ${successCount}, Errors: ${errorCount}`);

            return { processed: successCount, errors: errorCount };

        } catch (error) {
            console.error(`[${this.jobName}] Fatal error during processing:`, error);
            throw error;
        }
    }

    async processSingleTenant(tenant) {
        const session = await Tenant.startSession();

        try {
            return await session.withTransaction(async () => {
                console.log(`[${this.jobName}] Processing tenant: ${tenant.pgpalId} (${tenant.name})`);

                // Find the corresponding vacate request
                const vacateRequest = await Vacates.findOne({
                    tenantId: tenant.pgpalId,
                    status: 'noticeperiod',
                    vacateDate: { $lte: new Date() }
                }).sort({ createdAt: -1 }).session(session);

                if (!vacateRequest) {
                    console.error(`[${this.jobName}] No matching vacate request found for tenant: ${tenant.pgpalId}`);
                    return { success: false, tenantId: tenant.pgpalId, error: 'No matching vacate request' };
                }

                const currentStay = tenant.currentStay;

                // Create stay history entry for the completed stay
                const stayHistoryEntry = {
                    propertyId: currentStay.propertyPpid,
                    propertyName: currentStay.propertyName,
                    roomId: currentStay.roomPpid,
                    bedId: currentStay.bedId,
                    rent: currentStay.rent,
                    deposit: currentStay.deposit,
                    from: currentStay.assignedAt,
                    to: vacateRequest.vacateDate,
                    createdAt: new Date()
                };

                // Update tenant status to inactive and clear currentStay
                const tenantUpdate = {
                    status: 'inactive',
                    currentStay: {
                        propertyPpid: null,
                        propertyName: null,
                        roomPpid: null,
                        bedId: null,
                        rent: null,
                        deposit: null,
                        assignedAt: null,
                        noticePeriodInMonths: 0,
                        noticePeriodInDays: 0,
                        isInNoticePeriod: false,
                        location: null,
                    },
                    isInNoticePeriod: false,
                    noticePeriodStartDate: null,
                    noticePeriodEndDate: null,
                    updatedAt: new Date(),
                    $push: { stayHistory: stayHistoryEntry }
                };

                // Update tenant
                const updatedTenant = await Tenant.findByIdAndUpdate(
                    tenant._id,
                    tenantUpdate,
                    { new: true, session }
                );

                if (!updatedTenant) {
                    throw new Error(`Failed to update tenant ${tenant.pgpalId}`);
                }

                // Update vacate request status to completed
                const vacateUpdate = {
                    status: 'completed',
                    completedAt: new Date(),
                    completedBy: 'system_job',
                    tenantDepositInfo: `Stay completed on ${vacateRequest.vacateDate.toDateString()}. Please contact owner for deposit settlement.`,
                    ownerDepositInfo: `Tenant vacated on ${vacateRequest.vacateDate.toDateString()}. Please settle deposit if applicable.`
                };

                const updatedVacate = await Vacates.findByIdAndUpdate(
                    vacateRequest._id,
                    vacateUpdate,
                    { new: true, session }
                );

                if (!updatedVacate) {
                    throw new Error(`Failed to update vacate request for tenant ${tenant.pgpalId}`);
                }

                // Clear the bed - create a system user context for the API call
                const systemUser = {
                    data: {
                        user: {
                            _id: 'system',
                            username: 'system_job',
                            role: 'system'
                        }
                    }
                };

                try {
                    const clearBedResponse = await clearBed(
                        currentStay.roomPpid,
                        currentStay.bedId,
                        systemUser
                    );

                    if (!clearBedResponse) {
                        console.error(`[${this.jobName}] Failed to clear bed for tenant ${tenant.pgpalId}, but tenant processing continued`);
                    }
                } catch (bedError) {
                    console.error(`[${this.jobName}] Error clearing bed for tenant ${tenant.pgpalId}:`, bedError.message);
                    // Don't fail the entire transaction for bed clearing issues
                }

                // Clear cache
                try {
                    await invalidateCacheByPattern(`*${currentStay.propertyPpid}*`);
                } catch (cacheError) {
                    console.error(`[${this.jobName}] Cache invalidation failed for tenant ${tenant.pgpalId}:`, cacheError.message);
                    // Don't fail the transaction for cache issues
                }

                // Send notifications (optional - can be done outside transaction)
                try {
                    // You can implement a specific notification for auto-completed vacates
                    console.log(`[${this.jobName}] Notifications would be sent for tenant ${tenant.pgpalId}`);
                } catch (notificationError) {
                    console.error(`[${this.jobName}] Notification failed for tenant ${tenant.pgpalId}:`, notificationError.message);
                    // Don't fail the transaction for notification issues
                }

                console.log(`[${this.jobName}] Successfully processed tenant: ${tenant.pgpalId}`);

                return {
                    success: true,
                    tenantId: tenant.pgpalId,
                    tenantName: tenant.name,
                    vacateDate: vacateRequest.vacateDate,
                    bedId: currentStay.bedId,
                    roomId: currentStay.roomPpid,
                    propertyId: currentStay.propertyPpid
                };
            });

        } catch (error) {
            console.error(`[${this.jobName}] Error processing tenant ${tenant.pgpalId}:`, error.message);
            return {
                success: false,
                tenantId: tenant.pgpalId,
                tenantName: tenant.name,
                error: error.message
            };
        } finally {
            await session.endSession();
        }
    }

    start() {
        console.log(`[${this.jobName}] Scheduling job with cron expression: ${this.cronExpression}`);

        const task = cron.schedule(this.cronExpression, async () => {
            try {
                console.log(`[${this.jobName}] Job triggered at ${new Date().toISOString()}`);
                await this.processExpiredNoticePeriods();
                console.log(`[${this.jobName}] Job execution completed successfully`);
            } catch (error) {
                console.error(`[${this.jobName}] Job execution failed:`, error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Kolkata" // Adjust timezone as needed
        });

        console.log(`[${this.jobName}] Job scheduled successfully`);
        return task;
    }

    // Method to manually trigger the job (useful for testing)
    async runManually() {
        console.log(`[${this.jobName}] Manual execution triggered`);
        try {
            const result = await this.processExpiredNoticePeriods();
            console.log(`[${this.jobName}] Manual execution completed:`, result);
            return result;
        } catch (error) {
            console.error(`[${this.jobName}] Manual execution failed:`, error);
            throw error;
        }
    }
}

// Export the job class
module.exports = VacateTenantsJob;

// If running this file directly, start the job
if (require.main === module) {
    const vacateJob = new VacateTenantsJob();
    vacateJob.start();
}