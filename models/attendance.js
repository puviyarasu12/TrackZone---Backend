const mongoose = require('mongoose');

const attendanceDaySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true // Ensure no duplicate dates within the days array
  },
  status: {
    type: String,
    enum: ['Present', 'Late', 'Absent', 'Half-day', 'Holiday', 'Leave'],
    required: true
  },
  checkInTime: Date,
  checkOutTime: Date,
  hoursWorked: Number,
  notes: String
});

const attendanceSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    index: true
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  monthlyData: [{
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    days: [attendanceDaySchema],
    totalWorkingDays: {
      type: Number,
      default: 0
    },
    presentDays: {
      type: Number,
      default: 0
    },
    absentDays: {
      type: Number,
      default: 0
    },
    lateDays: {
      type: Number,
      default: 0
    },
    halfDays: {
      type: Number,
      default: 0
    },
    leavesTaken: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending'
    }
  }],
  yearlySummary: {
    totalWorkingDays: Number,
    presentDays: Number,
    absentDays: Number,
    lateDays: Number,
    halfDays: Number,
    leavesTaken: Number
  }
}, { timestamps: true });

// Compound index for efficient queries
attendanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

// Virtual for easy access to current month
attendanceSchema.virtual('currentMonth').get(function() {
  const now = new Date();
  return this.monthlyData.find(m => m.month === now.getMonth() + 1);
});

// Pre-save hook to calculate yearly summary and ensure unique days
attendanceSchema.pre('save', function(next) {
  // Ensure only one entry per month
  this.monthlyData = this.monthlyData.reduce((uniqueMonths, monthData) => {
    const existingMonth = uniqueMonths.find(m => m.month === monthData.month);
    if (existingMonth) {
      // Merge days, avoiding duplicates by date
      existingMonth.days = [...new Map(
        [...existingMonth.days, ...monthData.days].map(day => [day.date.toISOString(), day])
      ).values()].map(day => ({
        ...day,
        // Update hoursWorked if checkOutTime is present
        hoursWorked: day.checkOutTime ? ((day.checkOutTime - day.checkInTime) / 3600000) : day.hoursWorked
      }));
      // Recalculate summary for the merged month
      existingMonth.totalWorkingDays = existingMonth.days.length;
      existingMonth.presentDays = existingMonth.days.filter(d => d.status === 'Present').length;
      existingMonth.absentDays = existingMonth.days.filter(d => d.status === 'Absent').length;
      existingMonth.lateDays = existingMonth.days.filter(d => d.status === 'Late').length;
      existingMonth.halfDays = existingMonth.days.filter(d => d.status === 'Half-day').length;
      existingMonth.leavesTaken = existingMonth.days.filter(d => d.status === 'Leave').length;
    } else {
      uniqueMonths.push({
        ...monthData,
        days: monthData.days.map(day => ({
          ...day,
          // Calculate hoursWorked if checkOutTime is present
          hoursWorked: day.checkOutTime ? ((day.checkOutTime - day.checkInTime) / 3600000) : day.hoursWorked
        })),
        totalWorkingDays: monthData.days.length,
        presentDays: monthData.days.filter(d => d.status === 'Present').length,
        absentDays: monthData.days.filter(d => d.status === 'Absent').length,
        lateDays: monthData.days.filter(d => d.status === 'Late').length,
        halfDays: monthData.days.filter(d => d.status === 'Half-day').length,
        leavesTaken: monthData.days.filter(d => d.status === 'Leave').length
      });
    }
    return uniqueMonths;
  }, []);

  // Calculate yearly summary
  this.yearlySummary = {
    totalWorkingDays: this.monthlyData.reduce((sum, month) => sum + month.totalWorkingDays, 0),
    presentDays: this.monthlyData.reduce((sum, month) => sum + month.presentDays, 0),
    absentDays: this.monthlyData.reduce((sum, month) => sum + month.absentDays, 0),
    lateDays: this.monthlyData.reduce((sum, month) => sum + month.lateDays, 0),
    halfDays: this.monthlyData.reduce((sum, month) => sum + month.halfDays, 0),
    leavesTaken: this.monthlyData.reduce((sum, month) => sum + month.leavesTaken, 0)
  };
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);