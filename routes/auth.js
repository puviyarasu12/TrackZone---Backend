const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Employee = require('../models/employee');
const Admin = require('../models/admin');
const Checkin = require('../models/checkin');

const router = express.Router();

// Unified login endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // Check if user is an employee
    let user = await Employee.findOne({ email: email.toLowerCase() });
    let role = 'employee';
    let model = Employee;

    // If not an employee, check if user is an admin
    if (!user) {
      user = await Admin.findOne({ email: email.toLowerCase() });
      role = 'admin';
      model = Admin;
    }

    // If no user found
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );

    // Prepare user data
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      contactNumber: user.contactNumber,
      photo: user.photo || user.photoPath,
      ...(role === 'employee' && {
        employeeId: user.employeeId,
        designation: user.designation,
        department: user.department,
      }),
    };

    // Check if employee has checked in today (for fingerprint bypass)
    let requiresFingerprint = false;
    let fingerprintVerified = true; // Bypass for testing
    if (role === 'employee') {
      const today = new Date().toISOString().slice(0, 10);
      const checkInRecord = await Checkin.findOne({ email: user.email, date: today });
      if (!checkInRecord) {
        requiresFingerprint = true; // Normally true, but we bypass verification
      } else {
        fingerprintVerified = checkInRecord.fingerprintVerified || true;
        requiresFingerprint = !fingerprintVerified;
      }
    }

    res.status(200).json({
      message: 'Login successful.',
      token,
      user: userData,
      role,
      requiresFingerprint,
      fingerprintVerified,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

module.exports = router;