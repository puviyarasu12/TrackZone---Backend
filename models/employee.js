const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  photoPath: { type: String, default: '' },
  fingerprintHash: { type: String, default: null },
  isRegistered: { type: Boolean, default: false },
  department: { type: String, required: true },
  designation: { type: String, required: true },
  contactNumber: { type: String, required: true },
  onLeave: { type: Boolean, default: false },
  passwordResetOtp: { type: String },
  passwordResetExpires: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
