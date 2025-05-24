const express = require('express');
const router = express.Router();
const TenantController = require('../controllers/tenantController');
const TenantGetController = require('../controllers/tenantGetController');
const VacateController = require('../controllers/vacateController');
const OwnerVacateController = require('../controllers/ownerVacateController');
const rentController = require('../controllers/paymentController');

const cacheMiddleware = require('../utils/cacheMiddleware');


router.post('/', TenantController.addTenant);
router.put('/update', TenantController.updateTenant);
router.put('/tenants/:id/currentstay/location', TenantController.updateTenantCurrentStayLocation);
router.delete('/delete', TenantController.deleteTenant);

router.get('/', cacheMiddleware, TenantGetController.getTenants);
router.get('/tenant-history', cacheMiddleware, TenantGetController.getTenantHistory);
router.get('/tenants', cacheMiddleware, TenantGetController.getTenantByQuery);
router.get('/active-tenants/:pppId', cacheMiddleware, TenantGetController.getActiveTenantsForProperty);
router.get('/tenants-int/:phnum', cacheMiddleware, TenantGetController.getTenantByPhNum);
router.get('/tenant-currentStay', cacheMiddleware, TenantGetController.getTenantStayStatus);
router.get('/tenants/:pppId/:pprId', cacheMiddleware, TenantGetController.getTenantsByRoom);
router.get('/profile', cacheMiddleware, TenantGetController.getTenantProfile);
router.get('/myStay', cacheMiddleware, TenantGetController.getMyStay);

router.get('/tenantDocs/:pppid', cacheMiddleware, TenantGetController.getTenantDocs);
router.get('/checkins/:pppid', cacheMiddleware, TenantGetController.getCheckins);
router.get('/vacates/:pppid', cacheMiddleware, TenantGetController.getVacates);
router.get('/notify-tenant', TenantController.notifyTenant);

router.post('/vacate', VacateController.raiseVacate);
router.post('/withdraw-vacate', VacateController.withdrawVacate);

router.post('/remove-tenant/:ppid', OwnerVacateController.removeTenant);
router.post('/retain-tenant/:vacateId', OwnerVacateController.retainTenant);
router.get('/vacateHistory/:pppid', cacheMiddleware, OwnerVacateController.getVacateHistotyByProperty);

//rent-service
router.post('/rent/update', rentController.updateRent);               // Owner-only
router.get('/rent/:tenantId/status', rentController.getRentStatus);   // Owner-only
router.get('/rent/:propertyPpid/summary', rentController.getRentSummary); // Owner-only
router.get('/rent/:propertyPpid/defaulters', rentController.getRentDefaulters); // Owner-only

module.exports = router;
