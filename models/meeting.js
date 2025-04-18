const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    title: String,
    time: Date,
    host: String,
    participants: [{ type: String }], // Changed to array of Strings
    joinLink: String
});

module.exports = mongoose.model('Meeting', meetingSchema);