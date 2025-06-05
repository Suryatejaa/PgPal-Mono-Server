const { Redis } = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS);

module.exports = redis;
