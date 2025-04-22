const express = require('express');
const router = express.Router();
const TenantController = require('../controllers/tenantController');

router.post('/', TenantController.addTenant);
router.get('/', TenantController.getTenants);
router.get('/tenants', TenantController.getTenantByQuery);
router.get('/tenants-int/:phnum', TenantController.getTenantByPhNum);
router.put('/:id', TenantController.updateTenant);
router.delete('/:id', TenantController.deleteTenant);

module.exports = router;
