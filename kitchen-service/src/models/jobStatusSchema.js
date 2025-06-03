const mongoose = require('mongoose');

const jobStatusSchema = new mongoose.Schema({
    propertyPpid: { type: String, required: true },
    jobName: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    enabled: { type: Boolean, default: true }, // For automatic jobs
    manual: { type: Boolean, default: false }  // For manual triggers
});

module.exports = mongoose.model('JobStatus', jobStatusSchema);