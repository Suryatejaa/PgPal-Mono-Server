const mongoose = require('mongoose');
const { Schema } = mongoose;

const mealItemSchema = new Schema({
    meal: { type: String, enum: ['breakfast', 'lunch', 'snacks', 'dinner'], required: true },
    items: [String], // ["Idli", "Sambar", "Chutney"]
    repeatPattern: {
        type: String,
        enum: ['weekly', 'alternateWeeks', 'none'], // weekly = every week same, alternate = every 2nd week
        default: 'weekly'
    }
}, { _id: false });

const dayMenuSchema = new Schema({
    day: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        required: true
    },
    meals: [mealItemSchema]
}, { _id: false });

const weeklyMenuSchema = new Schema({
    propertyPpid: { type: String, required: true },
    menuNo: { type: Number, required: true }, // 1, 2, 3, etc.
    weekStartDate: { type: Date, required: true }, // Optional: to show when this pattern started
    menu: [dayMenuSchema],
    selected: { type: Boolean, default: false }, // true if this is selected for the week
    createdBy: { type: String, required: true }, // owner's ppid
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('WeeklyMenu', weeklyMenuSchema);
