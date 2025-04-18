const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  recipients: {
    type: { type: String, enum: ['all', 'department', 'individual'], required: true },
    value: String // department name or employee email/id based on the type
  },
  priority: { type: String, enum: ['Normal', 'High'], default: 'Normal' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
