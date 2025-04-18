const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  photo: {
    type: String, // Store file path or URL
    required: false
  },
  email: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    trim: true
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true // Will be hashed before saving
  },
  role: {
    type: String,
    default: 'admin',
    enum: ['admin']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Admin', adminSchema);
