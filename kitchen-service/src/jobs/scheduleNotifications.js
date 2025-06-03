const cron = require('node-cron');
const { sendMealConfirmationNotifications } = require('../controllers/foodAttendanceController');
const JobStatus = require('../models/jobStatusSchema');
const { getAllProperties } = require('../controllers/internalApis');

const sendNotificationsIfEnabled = async (propertyPpid, meal) => {
    // Fetch all properties if 'ALL' is specified, otherwise process a single property
    const properties = propertyPpid === 'ALL'
        ? await getAllProperties() // Fetch all properties
        : [{ ppid: propertyPpid }]; // Process a single property

    if (!properties || properties.length === 0) {
        console.log(`No properties found for propertyPpid: ${propertyPpid}`);
        return;
    }

    // Check if any property has the job disabled
    if (propertyPpid === 'ALL') {
        const disabledJobs = await JobStatus.find({ jobName: meal, enabled: false });
        if (disabledJobs.length > 0) {
            console.log(`Skipping notifications for ALL because some properties have ${meal} jobs disabled.`);
            return;
        }
    }

    // console.log(properties);

    // Iterate through each property
    for (const property of properties) {
        const ppid = property.pgpalId; // Use ppid or pgpalId based on your schema
        // console.log(`Processing notifications for property: ${ppid} and meal: ${meal}`);

        try {
            const jobStatus = await JobStatus.find({ propertyPpid: ppid, jobName: meal });
            // console.log(jobStatus);
            // Skip if the job is disabled or set to manual
            if (jobStatus && (!jobStatus.enabled || jobStatus.manual)) {
                console.log(`Job for ${meal} is disabled or set to manual for property ${ppid}`);
                continue;
            } else {
                // Send notifications for the meal
                await sendMealConfirmationNotifications({ body: { propertyPpid: ppid, meal } });
            }
        } catch (error) {
            console.error(`Error processing notifications for property ${ppid} and meal ${meal}:`, error);
        }
    }
};
// Schedule notifications
const scheduleNotifications = () => {
    //schedule job for every minute

    cron.schedule('* 21 * * *', async () => {
        console.log('Checking breakfast notifications...');
        await sendNotificationsIfEnabled('ALL', 'breakfast');
    });

    cron.schedule('0 8 * * *', async () => {
        console.log('Checking lunch notifications...');
        await sendNotificationsIfEnabled('ALL', 'lunch');
    });

    cron.schedule('0 13 * * *', async () => {
        console.log('Checking dinner notifications...');
        await sendNotificationsIfEnabled('ALL', 'dinner');
    });
};

module.exports = { scheduleNotifications };