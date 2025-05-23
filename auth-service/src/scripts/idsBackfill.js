// scripts/backfill-ids.js
const mongoose = require('mongoose');
const User = require('../models/userModel');
const { generatePPT, generatePPO } = require('../utils/idGenerator');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://host.docker.internal:27017/pgpaal_auth_service';
//console.log(MONGO_URI);

mongoose.connect(MONGO_URI);

const backfillTenantIds = async () => {
    const users = await User.find({ pgpalId: { $exists: false } });
    //console.log(`Found ${users.length} users to update...`);
    let pgpalId;
    for (const user of users) {
        if (user.role === 'owner') {
            pgpalId = generatePPO();
        }
        else if (user.role === 'tenant') {
            pgpalId = generatePPT();
        } else {
            //console.log(`Unknown role for user ${user._id}: ${user.role}`); // Updated log message to reflect 'user'
            continue; // Skip this user if the role is unknown
        }
        await user.updateOne({ pgpalId });
        //console.log(`Updated user: ${user._id} with pgpalId: ${pgpalId}`); // Updated log message to reflect 'user._id'
        //console.log(`Updated user: ${user.name}`);
    }

    //console.log('All done!');
};

backfillTenantIds();
