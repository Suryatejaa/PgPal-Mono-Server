const express = require('express');
const router = express.Router();
const kitchenMenuController = require('../controllers/kitchenMenuController');
const cacheMiddleware = require('../utils/cacheMiddleware')

router.post('/menu', kitchenMenuController.addWeeklyMenu);//only owners
router.put('/update', kitchenMenuController.updateWeeklyMenu);//only owners
router.put('/select-menu', kitchenMenuController.selectMenu); //only owners
router.delete('/delete', kitchenMenuController.deleteWeeklyMenu);//only owners

router.get('/:id',cacheMiddleware, kitchenMenuController.getMenuList); //only owners
router.get('/:id/menu-today',cacheMiddleware, kitchenMenuController.getTodayMenu);

module.exports = router;
