const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  centerLat: {
    type: Number,
    required: true
  },
  centerLong: {
    type: Number,
    required: true
  },
  radius: {
    type: Number,
    required: true
  }
});

const Geofence = mongoose.model('Geofence', geofenceSchema);
module.exports = Geofence;
