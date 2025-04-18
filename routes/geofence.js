const express = require('express');
const Geofence = require('../models/geofence');
const router = express.Router();

router.post('/configure-geofence', async (req, res) => {
  const { name, latitude, longitude, radius } = req.body;

  if (!name || latitude === undefined || longitude === undefined || radius === undefined) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  const rad = parseFloat(radius);

  if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0) {
    return res.status(400).json({ message: 'Latitude, longitude must be valid numbers and radius must be greater than 0.' });
  }

  try {
    const existing = await Geofence.findOne({ name });
    if (existing) {
      return res.status(409).json({ message: 'A geofence with this name already exists.' });
    }

    const geofence = new Geofence({
      name,
      latitude: lat,
      longitude: lon,
      radius: rad
    });

    await geofence.save();
    console.log(`📍 Geofence created: ${name} (${lat}, ${lon}, ${rad}m)`);

    res.status(201).json({
      message: 'Geofence configured successfully.',
      geofence
    });
  } catch (err) {
    console.error('Geofence Configuration Error:', err);
    res.status(500).json({ message: 'Server error while configuring geofence.' });
  }
});

module.exports = router;
