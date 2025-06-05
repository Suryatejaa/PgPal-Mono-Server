const { Redis } = require('ioredis');
require('dotenv').config();

console.log(process.env.REDIS);
const redis = new Redis(process.env.REDIS);

module.exports = redis;
