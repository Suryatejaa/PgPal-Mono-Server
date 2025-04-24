const WeeklyMenu = require('../models/kitchenMenuModel');
const { getPropertyOwner } = require('./internalApis');
const { getTenantConfirmation } = require('./internalApis');
const { getFormattedDayName } = require('../utils/getFormatedDay');

exports.selectMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const role = currentUser.data.user.role;
    const ppid = currentUser.data.user.pgpalId;
    if (role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can select menu' });
    }
    const propertyPpid = req.query.pppid;
    const menuNo = req.query.menuNo

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

        res.status(200).json({ message: 'Menu selection updated successfully', menu: updatedMenu });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.addWeeklyMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    if (currentUser.data.user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can add menu' });
    }

    const { propertyPpid, date, meals } = req.body;

    if (!propertyPpid || !date || !meals) {
        return res.status(400).json({ error: 'Property ID, date, and meals are required' });
    }
    const ownerConfirmation = await getPropertyOwner(propertyPpid, currentUser);
    if (!ownerConfirmation) {
        return res.status(404).json({ error: 'Property not found' });
    }
    if (ownerConfirmation.ownerId !== currentUser.data.user._id) {
        return res.status(403).json({ error: 'You are not the owner of this property' });
    }

    const isMenusExist = await WeeklyMenu.countDocuments({ propertyPpid });

    const menuNo = isMenusExist > 0 ? isMenusExist + 1 : 1; // Increment menu number if it exists

    if (menuNo > 4) {
        return res.status(400).json({ error: 'Maximum of 4 weekly menus can be added, you can update existing menus' });
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
        if (!tenantConfirmation) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        if (tenantConfirmation[0].status !== 'active') {
            return res.status(403).json({ error: 'Tenant is not active' });
        }
        if (propertyId !== tenantConfirmation[0].currentStay.propertyPpid) {
            return res.status(403).json({ error: 'Tenant is not staying in this property' });
        }
    }

    const dayName = getFormattedDayName();

    try {
        const menu = await WeeklyMenu.find({ propertyPpid: propertyId })
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


        console.log(todayMenu);
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

        res.status(200).json({
            propertyId,
            day: dayName,
            totalMenus: formattedMenus.length,
            meals: formattedMenus
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getMenuList = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
    const ppid = currentUser.data.user.pgpalId;
    const role = currentUser.data.user.role;
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
        const menus = await WeeklyMenu.find({ propertyPpid : propertyId }).populate('menu.meals.items', 'name');
        if (!menus || menus.length === 0) return res.status(404).json({ error: 'No menus found' });

        res.status(200).json({
            propertyId,
            totalMenus: menus.length,
            menus: menus
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

exports.updateWeeklyMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
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
    console.log(existingMenu);
    try {
        const updatedMenu = existingMenu.menu.map(dayMenu => {
            const updatedDay = meals.find(newDay => newDay.day === dayMenu.day);
            if (updatedDay) {
                // Replace the day's meals with the new meals
                return { ...dayMenu, meals: updatedDay.meals };
            }
            // Keep the existing day's meals if not updated
            return dayMenu;
        });

        existingMenu.menu = updatedMenu;
        existingMenu.updatedAt = new Date();

        const savedMenu = await existingMenu.save();
        res.status(200).json(savedMenu);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteWeeklyMenu = async (req, res) => {
    const currentUser = JSON.parse(req.headers['x-user']);
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
        if (remainingMenus.length === 0) {
            return res.status(404).json({ error: 'No remaining menus for this property' });
        }
        // Update menu numbers for remaining menus
        await Promise.all(
            remainingMenus.map(async (menu, index) => {
                menu.menuNo = index + 1; // Update menu number
                await menu.save(); // Save the updated menu
            })
        );
        // Send the updated menus as response
        res.status(200).json(remainingMenus);

        res.status(200).json({ message: 'Menu deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};