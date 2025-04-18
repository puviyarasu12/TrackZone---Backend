const express = require('express');
const Notification = require('../models/Notification');
const Employee = require('../models/employee');
const router = express.Router();

router.post('/send-notification', async (req, res) => {
  const { title, message, recipients, priority } = req.body;

  if (!title || !message || !recipients || !recipients.type) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  const notification = new Notification({
    title,
    message,
    recipients,
    priority: priority || 'Normal'
  });

  await notification.save();
  console.log(`📨 Notification sent: ${title} (${priority})`);

  res.status(200).json({ message: 'Notification sent successfully.' });
});

module.exports = router;
