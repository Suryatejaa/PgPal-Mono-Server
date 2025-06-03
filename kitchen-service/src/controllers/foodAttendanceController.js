const FoodAttendance = require('../models/foodAttendanceSchema');
const { getActiveTenantsForProperty, getTenantConfirmation, getAllProperties } = require('./internalApis');
const notificationQueue = require('../utils/notificationQueue');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const redisClient = require('../utils/redis');
const JobStatus = require('../models/jobStatusSchema');


const sendMealConfirmationNotifications = async (req, res) => {

    const { propertyPpid, meal } = req.body;

    if (!propertyPpid || !meal) {
        return res.status(400).json({ error: 'Property ID and meal type are required' });
    }

    if (!['breakfast', 'lunch', 'dinner'].includes(meal)) {
        return res.status(400).json({ error: 'Invalid meal type' });
    }

    try {
        // Handle 'ALL' to process all properties
        const properties = propertyPpid === 'ALL'
            ? await getAllProperties() // Fetch all properties
            : [{ pgpalId: propertyPpid }]; // Process a single property

        for (const property of properties) {
            const tenants = await getActiveTenantsForProperty(property.pgpalId);
            if (!tenants || tenants.length === 0) {
                console.log(`No active tenants found for property ${property.pgpalId}`);
                continue;
            }

            const date = new Date();
            if (meal === 'breakfast') {
                date.setDate(date.getDate() + 1); // Breakfast is for the next day
            }
            const formattedDate = date.toISOString().split('T')[0];

            for (const tenant of tenants) {
                // Create attendance record and send notification
                await FoodAttendance.create({
                    propertyPpid: property.pgpalId,
                    tenantPpid: tenant.pgpalId,
                    meal,
                    date: formattedDate
                });

                await notificationQueue.add('notifications', {
                    tenantId: tenant.pgpalId,
                    propertyPpid: property.pgpalId,
                    audience: 'tenant',
                    title: `Confirm your attendance for ${meal}`,
                    message: `Please confirm if you will attend ${meal} on ${formattedDate}.`,
                    type: 'meal-attendance-reminder',
                    method: ['in-app'],
                    createdBy: 'system'
                });
            }
        }

        if (res) {
            res.status(200).json({ message: `Notifications sent for ${meal}` });
        }
    } catch (error) {
        console.error('Error sending meal confirmation notifications:', error.message);
        if (res) {
            res.status(500).json({ error: error.message });
        }
    }
};

const manualTriggerNotifications = async (req, res) => {
    const { propertyPpid, meal } = req.body;

    if (!propertyPpid || !meal) {
        return res.status(400).json({ error: 'Property ID and meal type are required' });
    }

    if (!['breakfast', 'lunch', 'dinner'].includes(meal)) {
        return res.status(400).json({ error: 'Invalid meal type' });
    }

    try {
        // Disable automatic job for this meal
        await JobStatus.findOneAndUpdate(
            { propertyPpid, jobName: meal },
            { enabled: false, manual: true },
            { upsert: true, new: true }
        );

        // Send notifications manually
        await sendMealConfirmationNotifications({ body: { propertyPpid, meal } });

        res.status(200).json({ message: `Manual notifications sent for ${meal}` });
    } catch (error) {
        console.error('Error triggering manual notifications:', error.message);
        res.status(500).json({ error: error.message });
    }
};

const confirmMealAttendance = async (req, res) => {
    const xUserHeader = req.headers['x-user'];
    if (!xUserHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let currentUser;
    try {
        currentUser = JSON.parse(xUserHeader);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { meal, date } = req.body;
    const tenantPpid = currentUser.data.user.pgpalId;

    if (!meal || !date) {
        return res.status(400).json({ error: 'Meal type and date are required' });
    }

    const tenantConfirmation = await getTenantConfirmation(tenantPpid, meal, date);
    console.log('Tenant Confirmation:', tenantConfirmation[0]);
    if (!tenantConfirmation) {
        return res.status(404).json({ error: 'Tenant confirmation not found' });
    }

    try {
        const attendance = await FoodAttendance.findOneAndUpdate(
            { tenantPpid, meal, date },
            { confirmed: true },
            { new: true }
        );

        if (!attendance) {
            return res.status(404).json({ error: 'Attendance record not found' });
        }

        const propertyPpid = tenantConfirmation[0].currentStay.propertyPpid;
        console.log(propertyPpid);
        await invalidateCacheByPattern(`*${propertyPpid}*`);

        res.status(200).json({ message: 'Attendance confirmed', attendance });
    } catch (error) {
        console.error('Error confirming meal attendance:', error.message);
        res.status(500).json({ error: error.message });
    }
};

const getMealAttendance = async (req, res) => {
    const { propertyPpid, meal, date } = req.query;

    if (!propertyPpid || !meal || !date) {
        return res.status(400).json({ error: 'Property ID, meal type, and date are required' });
    }

    const cacheKey = '/api' + req.originalUrl; // Always add /api


    try {

        const totalActiveTenants = await getActiveTenantsForProperty(propertyPpid);

        const attendance = await FoodAttendance.find({ propertyPpid, meal, date, confirmed: true });

        const response = {
            message: `${attendance.length} Confirmed attendance for ${meal} on ${date} out of ${totalActiveTenants}`,
            totalActiveTenants,
            attendance
        };

        await redisClient.set(cacheKey, JSON.stringify(
            response), { EX: 300 });

        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching meal attendance:', error.message);
        res.status(500).json({ error: error.message });
    }
};

const updateJobStatus = async (req, res) => {
    const { propertyPpid, jobName, enabled } = req.body;

    if (!propertyPpid || !jobName || enabled === undefined) {
        return res.status(400).json({ error: 'Property ID, job name, and enabled status are required' });
    }

    try {
        // Enable automatic job and disable manual trigger
        const jobStatus = await JobStatus.findOneAndUpdate(
            { propertyPpid, jobName },
            { enabled, manual: !enabled },
            { upsert: true, new: true }
        );

        res.status(200).json({ message: 'Job status updated', jobStatus });
    } catch (error) {
        console.error('Error updating job status:', error.message);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    sendMealConfirmationNotifications,
    manualTriggerNotifications,
    confirmMealAttendance,
    getMealAttendance,
    updateJobStatus
};