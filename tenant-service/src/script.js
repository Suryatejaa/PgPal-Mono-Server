const mongoose = require('mongoose');
const Tenant = require('../src/models/tenantModel'); // Adjust path as needed
const Property = require('../../property-service/src/models/propertyModel'); // Adjust path as needed
const dotenv = require('dotenv');

dotenv.config();

async function migrateTenantLocations() {
    await mongoose.connect('mongodb://localhost:27017/pgpaal_tenant_service'); // Adjust URI as needed

    const tenants = await Tenant.find({ "currentStay.location": { $exists: false } });
    const tenants1 = await Tenant.find()
    console.log(tenants1)
    console.log(`Found ${tenants} tenants without location`);
    for (const tenant of tenants) {
        try {
            // Get property for this tenant
            const property = await Property.findOne({ pgpalId: tenant.currentStay.propertyPpid });
            if (!property || !property.location || !property.location.coordinates) {
                console.log(`No property/location for tenant ${tenant._id}`);
                continue;
            }

            tenant.currentStay.location = {
                type: "Point",
                coordinates: [
                    property.location.coordinates[0],
                    property.location.coordinates[1]
                ]
            };

            await tenant.save();
            console.log(`Updated tenant ${tenant._id} with location`);
        } catch (err) {
            console.error(`Error updating tenant ${tenant._id}:`, err.message);
        }
    }

    mongoose.disconnect();
}

migrateTenantLocations();