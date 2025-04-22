// scripts/backfill-ids.js
const mongoose = require('mongoose');
const User = require('../models/propertyModel');
const {  generatePPP } = require('../utils/idGenerator');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pgpaal_property_service';
console.log(MONGO_URI)

mongoose.connect(MONGO_URI)

const backfillPropertyIds = async () => {
    const properties = await User.find({ pgpalId: { $exists: false } });
    console.log(`Found ${properties.length} properties to update...`);
    let pgpalId;
    for (const property of properties) {
        pgpalId = generatePPP(); // Generate a new property ID
        await property.updateOne({ pgpalId }); // Updated to use 'property' instead of 'user'
        console.log(`Updated property: ${property._id} with pgpalId: ${pgpalId}`); // Updated log message to reflect 'property._id'
        console.log(`Updated property: ${property.name}`); // Updated log message to reflect 'property.name'
    }

    console.log('All done!');
};

backfillPropertyIds();