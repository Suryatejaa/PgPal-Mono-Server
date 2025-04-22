const express = require('express');
const router = express.Router();
const TenantController = require('../controllers/tenantController');
const TenantGetController = require('../controllers/tenantGetController');
const VacateController = require('../controllers/vacateController');

router.post('/', TenantController.addTenant);
router.put('/update', TenantController.updateTenant);
router.delete('/delete', TenantController.deleteTenant);

router.get('/', TenantGetController.getTenants);    
router.get('/tenants', TenantGetController.getTenantByQuery);
router.get('/tenants-int/:phnum', TenantGetController.getTenantByPhNum);
router.get('/tenant-currentStay', TenantGetController.getTenantStayStatus);
router.get('/tenant-history', TenantGetController.getTenantHistory);
router.get('/tenants/:pppId/:pprId', TenantGetController.getTenantsByRoom);
router.get('/profile', TenantGetController.getTenantProfile);

router.get('/vacate', VacateController.raiseVacate);
router.get('/withdraw-vacate', VacateController.withdrawVacate);    

module.exports = router;
