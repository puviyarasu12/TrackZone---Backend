const Notification = require('../models/Notification');

class NotificationEmitter {
  constructor(io) {
    this.io = io;
  }

  async emitCheckIn(employeeName, checkInTime) {
    try {
      // Emit real-time event
      this.io.emit('checkin_notification', {
        employee: employeeName,
        time: checkInTime.toLocaleTimeString(),
        message: `${employeeName} has checked in`
      });

      // Create persistent notification
      const notification = new Notification({
        title: 'New Check-in',
        message: `${employeeName} has checked in at ${checkInTime.toLocaleTimeString()}`,
        recipients: {
          type: 'all',
          value: 'admin'
        },
        priority: 'Normal'
      });
      await notification.save();
    } catch (err) {
      console.error('Notification emission error:', err);
    }
  }
}

module.exports = NotificationEmitter;
