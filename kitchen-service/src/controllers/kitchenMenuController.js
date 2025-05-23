const WeeklyMenu = require('../models/kitchenMenuModel');
const { getPropertyOwner } = require('./internalApis');
const { getTenantConfirmation, getActiveTenantsForProperty } = require('./internalApis');
const { getFormattedDayName } = require('../utils/getFormatedDay');
const redisClient = require('../utils/redis');
const invalidateCacheByPattern = require('../utils/invalidateCachedByPattern');
const notificationQueue = require('../utils/notificationQueue.js');


exports.selectMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const ppid = currentUser.data.user.pgpalId;
    if (role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can select menu' });
    }
    const propertyPpid = req.query.pppid;
    const menuNo = req.query.menuNo;

    if (!propertyPpid || !menuNo) {
        return res.status(400).json({ error: 'Property ID and Menu Number are required' });
    }

    const ownerConfirmation = await getPropertyOwner(propertyPpid, currentUser);
    if (!ownerConfirmation) {
        return res.status(404).json({ error: 'Property not found' });
    }
    if (ownerConfirmation.ownerId !== currentUser.data.user._id) {
        return res.status(403).json({ error: 'You are not the owner of this property' });
    }

   
    try {
        // Set `selected` to false for all menus
        await WeeklyMenu.updateMany({ propertyPpid }, { $set: { selected: false } });

        // Set `selected` to true for the specified menuNo
        const updatedMenu = await WeeklyMenu.findOneAndUpdate(
            { propertyPpid, menuNo },
            { $set: { selected: true } },
            { new: true }
        );

        if (!updatedMenu) {
            return res.status(404).json({ error: 'Menu not found' });
        }

        const title = 'Menu Selected for the Week';
        const message = `The weekly menu has been finalized. Get ready to serve what's cooking!`;
        const type = 'reminder';
        const method = ['in-app'];

        const tenants = await getActiveTenantsForProperty(propertyPpid); // Implement this utility
        const tenantIds = tenants.map(t => t.pgpalId);
        try {
            console.log('Adding notification job to the queue...');

            for (const tenantId of tenantIds) {
                await notificationQueue.add('notifications', {
                    tenantId,
                    propertyPpid,
                    audience: 'tenant',
                    title,
                    message,
                    type,
                    method,
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });
            }
            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${ownerConfirmation._id}*`);

        res.status(200).json({ message: 'Menu selection updated successfully', menu: updatedMenu });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.addWeeklyMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const ppid = currentUser.data.user.pgpalId;

    if (currentUser.data.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can add menu' });
    }

    const { propertyPpid, date, meals, menuNo } = req.body;

    if (!propertyPpid || !date || !meals || menuNo === undefined) {
        return res.status(400).json({ error: 'Property ID, date, meals, and menu number are required' });
    }

    if (menuNo < 1 || menuNo > 4) {
        return res.status(400).json({ error: 'Menu number must be between 1 and 4' });
    }

    const ownerConfirmation = await getPropertyOwner(propertyPpid, currentUser);
    if (!ownerConfirmation) {
        return res.status(404).json({ error: 'Property not found' });
    }
    if (ownerConfirmation.ownerId !== currentUser.data.user._id) {
        return res.status(403).json({ error: 'You are not the owner of this property' });
    }

    // Check if a menu with the same menuNo already exists
    const existingMenu = await WeeklyMenu.findOne({ propertyPpid, menuNo });
    if (existingMenu) {
        return res.status(400).json({ error: `Menu number ${menuNo} already exists. Please choose a different number.` });
    }

    try {
        const weeklyMenu = await WeeklyMenu.create({
            propertyPpid,
            weekStartDate: new Date(date), // Assuming `date` is the start of the week
            menu: meals, // Ensure `meals` matches the `menu` structure in the schema
            menuNo,
            createdBy: currentUser.data.user.pgpalId,
            updatedAt: new Date()
        });

        const title = 'New Weekly Menu Added';
        const message = `A new weekly menu has been added to the kitchen schedule. Check it out and stay prepared!`;
        const type = 'info';
        const method = ['in-app'];

        const tenants = await getActiveTenantsForProperty(propertyPpid); // Implement this utility
        const tenantIds = tenants.map(t => t.pgpalId);
        try {
            console.log('Adding notification job to the queue...');

            for (const tenantId of tenantIds) {
                await notificationQueue.add('notifications', {
                    tenantId,
                    propertyPpid,
                    audience: 'tenant',
                    title,
                    message,
                    type,
                    method,
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });
            }
            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${ownerConfirmation._id}*`);

        res.status(201).json(weeklyMenu);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTodayMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const ppid = currentUser.data.user.pgpalId;
    const role = currentUser.data.user.role;
    if (role !== 'tenant' && role !== 'owner') {
        return res.status(403).json({ error: 'Only tenants and owners can view the menu' });
    }

    const propertyId = req.params.id;
    if (!propertyId) {
        return res.status(400).json({ error: 'Property ID is required' });
    }

    const cacheKey = '/api' + req.originalUrl; // Always add /api

    if (role === 'owner') {
        try {
            const propertyConfirmation = await getPropertyOwner(propertyId, currentUser);
            if (!propertyConfirmation) {
                return res.status(404).json({ error: 'Property not found' });
            }
            if (propertyConfirmation.ownerId !== currentUser.data.user._id) {
                return res.status(403).json({ error: 'You are not the owner of this property' });
            }
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch property details' });
        }
    }

    if (role === 'tenant') {
        const tenantConfirmation = await getTenantConfirmation(ppid, currentUser);
        //console.log(tenantConfirmation);
        if (!tenantConfirmation) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        if (tenantConfirmation.status !== 'active') {
            return res.status(403).json({ error: 'Tenant is not active' });
        }
        if (propertyId !== tenantConfirmation.currentStay.propertyPpid) {
            return res.status(403).json({ error: 'Tenant is not staying in this property' });
        }
    }

    const dayName = getFormattedDayName();

    try {

        if (redisClient.isReady) {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                //console.log('Returning cached username availability');
                return res.status(200).send(JSON.parse(cached));
            }
        }

        const menu = await WeeklyMenu.find({ propertyPpid: propertyId, selected: true })
            .populate('menu.meals.items', 'name');
        if (!menu || menu.length === 0) return res.status(404).json({ error: 'Menu not found' });


        const allMenus = menu.map(m => m.toObject());

        const todayMenu = allMenus
            .map(menu => ({
                menuNo: menu.menuNo, // Include menuNo
                meals: menu.menu
                    .filter(dayMenu => dayMenu.day === dayName) // Filter menus for today's day
                    .map(dayMenu => dayMenu.meals) // Extract the meals for today
                    .flat() // Flatten the array of meals
            }))
            .filter(menu => menu.meals.length > 0); // Filter out menus with no meals for today


        //console.log(todayMenu);
        if (!todayMenu || todayMenu.length === 0)
            return res.status(404).json({ error: 'Today\'s menu not found' });

        const day = dayName;

        const formattedMenus = todayMenu.map(menu => ({
            menuNo: menu.menuNo,
            meals: menu.meals.map(meal => {
                const repeatMap = {
                    'weekly': `Every ${dayName}`,
                    'alternateWeeks': `Every alternate ${dayName}`,
                    'none': 'One time or specific day'
                };
                return {
                    [`For ${meal.meal}`]: meal.items,
                    repeat: repeatMap[meal.repeatPattern] || 'One time or specific day'
                };
            })
        }));

        const response = {
            propertyId,
            day: dayName,
            totalMenus: formattedMenus.length,
            meals: formattedMenus
        };

        // Cache the response in Redis with a TTL of 10 minutes
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getMenuList = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const ppid = currentUser.data.user.pgpalId;
    const role = currentUser.data.user.role;
    const cacheKey = '/api' + req.originalUrl; // Always add /api

    if (role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can view the menu list' });
    }

    const ownerConfirmation = await getPropertyOwner(req.params.id, currentUser);
    if (!ownerConfirmation) {
        return res.status(404).json({ error: 'Property not found' });
    }
    if (ownerConfirmation.ownerId !== currentUser.data.user._id) {
        return res.status(403).json({ error: 'You are not the owner of this property' });
    }

    const propertyId = req.params.id;
    if (!propertyId) {
        return res.status(400).json({ error: 'Property ID is required' });
    }

    try {

        if (redisClient.isReady) {
            //console.log('CacheKey:', cacheKey);
            const cached = await redisClient.get(cacheKey);
            if (cached) {
                //console.log('Returning cached menu list availability: ', cached);
                return res.status(200).send(JSON.parse(cached));
            }
        }

        //console.log("Not returned from cache");
        const menus = await WeeklyMenu.find({ propertyPpid: propertyId });
        if (!menus || menus.length === 0) return res.status(404).json({ message: 'No menus found' });
        //console.log(menus ? menus : 'No menus found');
        const response = {
            propertyId,
            totalMenus: menus.length,
            menus
        };

        // Cache the response in Redis with a TTL of 10 minutes
        await redisClient.set(cacheKey, JSON.stringify(response), { EX: 300 });

        res.status(200).json(response.totalMenus ? response : { message: 'No menus found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateWeeklyMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const ppid = currentUser.data.user.pgpalId;

    if (currentUser.data.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can update menu' });
    }
    const { meals } = req.body;
    const propertyPpid = req.query.pppId;
    const menuNo = req.query.menuNo;

    if (!propertyPpid || !menuNo || !meals) {
        return res.status(400).json({ error: 'Property ID, menu number, and meals are required' });
    }
    const ownerConfirmation = await getPropertyOwner(propertyPpid, currentUser);
    //console.log(ownerConfirmation);
    if (!ownerConfirmation) {
        return res.status(404).json({ error: 'Property not found' });
    }
    if (ownerConfirmation.ownerId !== currentUser.data.user._id) {
        return res.status(403).json({ error: 'You are not the owner of this property' });
    }

    const existingMenu = await WeeklyMenu.findOne({ propertyPpid, menuNo });
    if (existingMenu === 0) {
        return res.status(404).json({ error: 'Menu not found' });
    }
    try {

        existingMenu.menu = meals;
        existingMenu.updatedAt = new Date();

        const savedMenu = await existingMenu.save();

        const title = 'Weekly Menu Updated';
        const message = `The kitchen's weekly menu has been updated. Review the changes to stay in sync.`;
        const type = 'alert';
        const method = ['in-app'];

        const tenants = await getActiveTenantsForProperty(propertyPpid); // Implement this utility
        const tenantIds = tenants.map(t => t.pgpalId);
        try {
            console.log('Adding notification job to the queue...');

            for (const tenantId of tenantIds) {
                await notificationQueue.add('notifications', {
                    tenantId,
                    propertyPpid,
                    audience: 'tenant',
                    title,
                    message,
                    type,
                    method,
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });
            }
            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*${propertyPpid}*`);
        await invalidateCacheByPattern(`*${ownerConfirmation._id}*`);

        res.status(200).json(savedMenu);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteWeeklyMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const ppid = currentUser.data.user.pgpalId;

    if (currentUser.data.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can delete menu' });
    }

    const propertyPpid = req.query.pppId;
    const menuNo = req.query.menuNo;
    if (!propertyPpid || !menuNo) {
        return res.status(400).json({ error: 'Property ID and menu number are required' });
    }
    const ownerConfirmation = await getPropertyOwner(propertyPpid, currentUser);
    if (!ownerConfirmation) {
        return res.status(404).json({ error: 'Property not found' });
    }
    if (ownerConfirmation.ownerId !== currentUser.data.user._id) {
        return res.status(403).json({ error: 'You are not the owner of this property' });
    }
    try {
        const deletedMenu = await WeeklyMenu.findOneAndDelete({ propertyPpid, menuNo });
        if (!deletedMenu) {
            return res.status(404).json({ error: 'Menu not found' });
        }

        const remainingMenus = await WeeklyMenu.find({ propertyPpid });

        const title = 'Weekly Menu Removed';
        const message = `A weekly menu has been deleted. Make sure a new one is added to avoid disruption.`;
        const type = 'alert';
        const method = ['in-app', 'email'];

        const tenants = await getActiveTenantsForProperty(propertyPpid); // Implement this utility
        const tenantIds = tenants.map(t => t.pgpalId);
        try {
            console.log('Adding notification job to the queue...');

            for (const tenantId of tenantIds) {
                await notificationQueue.add('notifications', {
                    tenantId,
                    propertyPpid,
                    audience: 'tenant',
                    title,
                    message,
                    type,
                    method,
                    createdBy: currentUser?.data?.user?.pgpalId || 'system'
                }, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 3000
                    }
                });
            }
            console.log('Notification job added successfully');

        } catch (err) {
            console.error('Failed to queue notification:', err.message);
        }

        await invalidateCacheByPattern(`*/api/api/kitchen-service/${propertyPpid}*`);
        await invalidateCacheByPattern(`*${ownerConfirmation._id}*`);

        const cacheKey = `/api/api/kitchen-service/${propertyPpid}`;
        await redisClient.del(cacheKey);


        // Send the updated menus as response


        res.status(200).json({ message: 'Menu deleted successfully', remainingMenus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};