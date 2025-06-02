const FoodAttendance = require('../models/foodAttendanceSchema');
const { getActiveTenantsForProperty } = require('./internalApis');
const notificationQueue = require('../utils/notificationQueue');

exports.sendMealConfirmationNotifications = async (req, res) => {
    const { propertyPpid, meal } = req.body;

    if (!propertyPpid || !meal) {
        return res.status(400).json({ error: 'Property ID and meal type are required' });
    }

    if (!['breakfast', 'lunch', 'dinner'].includes(meal)) {
        return res.status(400).json({ error: 'Invalid meal type' });
    }

    try {
        const tenants = await getActiveTenantsForProperty(propertyPpid);
        if (!tenants || tenants.length === 0) {
            return res.status(404).json({ error: 'No active tenants found for this property' });
        }

        const date = new Date().toISOString().split('T')[0]; // Today's date

        for (const tenant of tenants) {
            // Create attendance record
            await FoodAttendance.create({
                propertyPpid,
                tenantPpid: tenant.pgpalId,
                meal,
                date
            });

            // Push notification
            await notificationQueue.add('notifications', {
                tenantId: tenant.pgpalId,
                propertyPpid,
                audience: 'tenant',
                title: `Confirm your attendance for ${meal} for ${date}`,
                message: `Please confirm if you will attend today's ${meal}.`,
                type: 'reminder',
                method: ['in-app'],
                createdBy: 'system'
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                }
            });
        }

        res.status(200).json({ message: `Notifications sent for ${meal} for ${date}` });
    } catch (error) {
        console.error('Error sending meal confirmation notifications:', error.message);
        res.status(500).json({ error: error.message });
    }
};


exports.confirmMealAttendance = async (req, res) => {
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

    

    try {
        const attendance = await FoodAttendance.findOneAndUpdate(
            { tenantPpid, meal, date },
            { confirmed: true },
            { new: true }
        );

        if (!attendance) {
            return res.status(404).json({ error: 'Attendance record not found' });
        }

        res.status(200).json({ message: 'Attendance confirmed', attendance });
    } catch (error) {
        console.error('Error confirming meal attendance:', error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.getMealAttendance = async (req, res) => {
    const { propertyPpid, meal, date } = req.query;

    if (!propertyPpid || !meal || !date) {
        return res.status(400).json({ error: 'Property ID, meal type, and date are required' });
    }

    try {
        const attendance = await FoodAttendance.find({ propertyPpid, meal, date, confirmed: true });

        res.status(200).json({
            message: `Confirmed attendance for ${meal} on ${date}`,
            attendance
        });
    } catch (error) {
        console.error('Error fetching meal attendance:', error.message);
        res.status(500).json({ error: error.message });
    }
};