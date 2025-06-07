// src/demo.js
const currentDate = new Date();
console.log('Current UTC:', currentDate.toISOString());
console.log('Current IST:', currentDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

const expiryDate = new Date('2025-06-08T16:04:54.883Z');
console.log('Expiry UTC:', expiryDate.toISOString());
console.log('Expiry IST:', expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

console.log('Has expired?', expiryDate < currentDate);
   