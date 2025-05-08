// scripts/backfill-ids.js
const mongoose = require('mongoose');
const Room = require('../models/roomModel'); // Assuming you meant to import the property model here
const { generatePPR } = require('../utils/idGenerator');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://host.docker.internal:27017/pgpaal_room_service';
console.log(MONGO_URI);

mongoose.connect(MONGO_URI);

const backfillPropertyIds = async () => {
    const rooms = await Room.find({ pgpalId: { $exists: false } });
    console.log(`Found ${rooms.length} rooms to update...`);
    let pgpalId;
    for (const room of rooms) {
        pgpalId = generatePPR();
        await room.updateOne({ pgpalId });
        console.log(`Updated room: ${room._id} with pgpalId: ${pgpalId}`); // Updated log message to reflect 'room._id'
        console.log(`Updated room: ${room.name}`); // Updated log message to reflect 'room.name'
    }

    console.log('All done!');
};

backfillPropertyIds();