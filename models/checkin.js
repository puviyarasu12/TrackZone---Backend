const mongoose = require('mongoose');

const checkInSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    index: true
  },
  isAuto: {
    type: Boolean,
    default: false
  },
  isWithinBoundary: {
    type: Boolean,
    default: true
  },
  boundaryViolations: [{
    time: Date,
    duration: Number // minutes
  }],
  email: {
    type: String,
    required: true
  },
  checkInTime: {
    type: Date,
    default: null
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  verified: {
    type: Boolean,
    default: false
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    index: true
  },
  day: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Present', 'Late', 'Absent', 'Half-day'],
    default: 'Present'
  },
  hoursWorked: {
    type: Number,
    default: 0
  },
  attendanceRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance'
  }
}, { timestamps: true });

// Compound index for efficient queries
checkInSchema.index({ employeeId: 1, date: 1 }, { unique: true });

// Pre-save hook to validate and calculate hours worked
checkInSchema.pre('save', function(next) {
  // Prevent duplicate auto check-ins
  if (this.isAuto && this.checkInTime) {
    const today = new Date().toISOString().split('T')[0];
    CheckIn.findOne({
      employeeId: this.employeeId,
      date: today,
      isAuto: true
    }).then(existing => {
      if (existing) {
        throw new Error('Auto check-in already recorded for today');
      }
      next();
    }).catch(err => next(err));
    return;
  }
  if (this.checkInTime && this.checkOutTime) {
    const diffMs = this.checkOutTime - this.checkInTime;
    this.hoursWorked = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
  }
  next();
});

module.exports = mongoose.model('CheckIn', checkInSchema);
