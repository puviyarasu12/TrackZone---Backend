const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const Employee = require('../models/employee');
const CheckIn = require('../models/checkin');
const Task = require('../models/task');
const Meeting = require('../models/meeting');
const Attendance = require('../models/attendance');
const sendMail = require('../utils/sendMail');

const router = express.Router();

// Constants
const SALT_ROUNDS = 10;
const generateEmployeeId = () => `EMP${Date.now()}`;
const BASE_URL = process.env.BASE_URL || 'https://trackzone-backend.onrender.com';
const OFFICE_LAT = 10.8261981;
const OFFICE_LON = 77.0608064;
const GEOFENCE_RADIUS = 500000;

const { upload } = require('../utils/Cloudinary'); // Assuming you have a Cloudinary utility for file uploads

// Geofencing Utility
const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Middleware: Verify JWT
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(400).json({ message: 'Invalid or expired token.' });
  }
};

// ================= ATTENDANCE ROUTES ================= //



// Get attendance for a specific employee, year, and month
router.get('/attendance/:employeeId/:year/:month', verifyToken, async (req, res) => {
  try {
    const { employeeId, year, month } = req.params;
    const attendance = await Attendance.findOne({
      employeeId,
      year: parseInt(year)
    });

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Find the specific month's data
    const monthData = attendance.monthlyData.find(m => m.month === parseInt(month));

    if (!monthData || !monthData.days.length) {
      return res.status(404).json({ message: 'Month data not found' });
    }

    res.json({ days: monthData.days, summary: {
      totalWorkingDays: monthData.totalWorkingDays,
      presentDays: monthData.presentDays,
      absentDays: monthData.absentDays,
      lateDays: monthData.lateDays,
      halfDays: monthData.halfDays,
      leavesTaken: monthData.leavesTaken
    } });
  } catch (err) {
    console.error('Attendance Error:', err);
    res.status(500).json({ message: 'Error fetching attendance data' });
  }
});

// Update attendance status
router.put('/attendance/:employeeId/:year/:month', verifyToken, async (req, res) => {
  try {
    const { employeeId, year, month } = req.params;
    const { day, status, checkInTime, checkOutTime } = req.body; // Added checkInTime and checkOutTime for flexibility

    const attendance = await Attendance.findOneAndUpdate(
      { employeeId, year: parseInt(year) },
      {
        $set: {
          'monthlyData.$[elem].days.$[dayElem].status': status,
          'monthlyData.$[elem].days.$[dayElem].checkInTime': checkInTime ? new Date(checkInTime) : undefined,
          'monthlyData.$[elem].days.$[dayElem].checkOutTime': checkOutTime ? new Date(checkOutTime) : undefined
        }
      },
      {
        arrayFilters: [
          { 'elem.month': parseInt(month) },
          { 'dayElem.date': { $gte: new Date(year, month - 1, day), $lt: new Date(year, month - 1, day + 1) } }
        ],
        new: true,
        runValidators: true
      }
    );

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Recalculate hoursWorked and summary after update
    const updatedMonthData = attendance.monthlyData.find(m => m.month === parseInt(month));
    if (updatedMonthData) {
      updatedMonthData.days = updatedMonthData.days.map(day => ({
        ...day,
        hoursWorked: day.checkOutTime && day.checkInTime 
          ? (day.checkOutTime - day.checkInTime) / 3600000 // Convert ms to hours
          : day.hoursWorked || 0
      }));
      updatedMonthData.totalWorkingDays = updatedMonthData.days.length;
      updatedMonthData.presentDays = updatedMonthData.days.filter(d => d.status === 'Present').length;
      updatedMonthData.absentDays = updatedMonthData.days.filter(d => d.status === 'Absent').length;
      updatedMonthData.lateDays = updatedMonthData.days.filter(d => d.status === 'Late').length;
      updatedMonthData.halfDays = updatedMonthData.days.filter(d => d.status === 'Half-day').length;
      updatedMonthData.leavesTaken = updatedMonthData.days.filter(d => d.status === 'Leave').length;

      await attendance.save(); // Save the updated document
    }

    res.json({ message: 'Attendance updated successfully', days: updatedMonthData.days });
  } catch (err) {
    console.error('Attendance Update Error:', err);
    res.status(500).json({ message: 'Error updating attendance' });
  }
});

// Get yearly attendance summary
router.get('/attendance/:employeeId/:year', verifyToken, async (req, res) => {
  try {
    const { employeeId, year } = req.params;
    const attendance = await Attendance.findOne({
      employeeId,
      year: parseInt(year)
    });

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json(attendance.yearlySummary || {
      totalWorkingDays: 0,
      presentDays: 0,
      absentDays: 0,
      lateDays: 0,
      halfDays: 0,
      leavesTaken: 0
    });
  } catch (err) {
    console.error('Attendance Summary Error:', err);
    res.status(500).json({ message: 'Error fetching attendance summary' });
  }
});


const Leave = require('../models/leave'); // Import Leave model
const { check, validationResult } = require('express-validator'); // Import validation libraries
const authMiddleware = require('../middleware/auth'); // Import authentication middleware

// ================= LEAVE REQUEST ROUTES ================= //

// POST /api/leave/request
router.post(
  '/leave/request',
  authMiddleware.verifyEmployee,
  [
    check('employeeId').notEmpty().withMessage('Employee ID is required'),
    check('leaveType').isIn(['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid']).withMessage('Invalid leave type'),
    check('startDate').isISO8601().withMessage('Invalid start date'),
    check('endDate').isISO8601().withMessage('Invalid end date'),
    check('reason').notEmpty().withMessage('Reason is required').isLength({ min: 3 }).withMessage('Reason must be 3+ characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ status: "error", errors: errors.array() });

    try {
      const { employeeId, leaveType, startDate, endDate, reason } = req.body;
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ status: "error", message: "End date must be after start date" });
      }

      const employee = await Employee.findOne({ employeeId: employeeId.toUpperCase().trim() });
      if (!employee) return res.status(404).json({ status: "error", message: "Employee not found" });
      if (req.user.id !== employee._id.toString()) {
        return res.status(403).json({ status: "error", message: "Unauthorized: Can only request leave for yourself" });
      }

      const leave = new Leave({ employee: employee._id, leaveType, startDate, endDate, reason });
      await leave.save();

      res.status(201).json({ status: "success", data: formatLeave(leave, employee) });
    } catch (err) {
      handleError(res, err);
    }
  }
);

// GET /api/leave/my-requests/:employeeId
router.get(
  '/leave/my-requests/:employeeId',
  authMiddleware.verifyEmployee,
  async (req, res) => {
    try {
      const employee = await Employee.findOne({ employeeId: req.params.employeeId.toUpperCase().trim() });
      if (!employee) return res.status(404).json({ status: "error", message: "Employee not found" });
      if (req.user.id !== employee._id.toString()) {
        return res.status(403).json({ status: "error", message: "Unauthorized: Can only view your own requests" });
      }

      const leaves = await Leave.find({ employee: employee._id }).sort({ createdAt: -1 });
      res.json({ status: "success", data: leaves.map((leave) => formatLeave(leave, employee)) });
    } catch (err) {
      handleError(res, err);
    }
  }
);

// ✅ Admin Registers Employee
router.post('/register', upload.single('photo'), async (req, res) => {
  const { name, email, password, department, designation, contactNumber } = req.body;
  const photo = req.file;

  if (!name || !email || !password || !photo || !department || !designation || !contactNumber) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const existing = await Employee.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'Employee already exists.' });

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newEmployee = new Employee({
      employeeId: generateEmployeeId(),
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      department,
      designation,
      contactNumber,
      isRegistered: false,
      photoPath: photo.path || photo.filename || ``
    });

    await newEmployee.save();

    const link = `${BASE_URL}/register.html?email=${encodeURIComponent(email)}`;
    const html = `
      <h3>Hello ${name},</h3>
      <p>Please click the link below to register your fingerprint:</p>
      <a href="${link}">Register Fingerprint</a>
      <p>Regards,<br/>Attendance System</p>
    `;

    await sendMail(email, 'Register Your Fingerprint', html);
    res.status(201).json({ message: 'Employee registered. Check email to register fingerprint.' });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ message: 'Error registering employee.' });
  }
});

// ✋ Register Fingerprint
router.post('/register-fingerprint', async (req, res) => {
  const { email, fingerprintHash } = req.body;
  if (!email || !fingerprintHash) {
    return res.status(400).json({ message: 'Email and fingerprintHash are required.' });
  }

  try {
    const employee = await Employee.findOne({ email: email.toLowerCase() });
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    if (employee.isRegistered && employee.fingerprintHash) {
      return res.status(400).json({ message: 'Fingerprint already registered.' });
    }

    if (!fingerprintHash) {
      return res.status(400).json({ message: 'Fingerprint scanning is not supported on your device.' });
    }

    const hashedFingerprint = await bcrypt.hash(fingerprintHash, SALT_ROUNDS);
    employee.fingerprintHash = hashedFingerprint;
    employee.isRegistered = true;
    await employee.save();

    res.status(200).json({ message: 'Fingerprint registered successfully ✅' });
  } catch (err) {
    console.error('Fingerprint Registration Error:', err);
    res.status(500).json({ message: 'Error registering fingerprint.' });
  }
});

// ✅ Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  try {
    const employee = await Employee.findOne({ email: email.toLowerCase() });
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const isPasswordCorrect = await bcrypt.compare(password, employee.password);
    if (!isPasswordCorrect) return res.status(401).json({ message: 'Invalid password ❌' });

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured in environment variables');
      return res.status(500).json({ 
        message: 'Server configuration error',
        details: 'JWT authentication is not properly configured'
      });
    }

    const payload = { employeeId: employee.employeeId, name: employee.name, email: employee.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Check if the employee has already checked in today
    const today = new Date().toISOString().slice(0, 10);
    const checkInRecord = await CheckIn.findOne({ email: employee.email, date: today });

    let requiresFingerprint = false;
    let fingerprintVerified = false;

    if (checkInRecord) {
      // Check-in exists, check fingerprint verification status
      fingerprintVerified = checkInRecord.fingerprintVerified || false;
      requiresFingerprint = !fingerprintVerified; // Fingerprint needed if not verified
    } else {
      // No check-in today, fingerprint is required after check-in
      requiresFingerprint = true;
    }

    res.status(200).json({
      message: 'Login successful ✅',
      token,
      employee: {
        employeeId: employee.employeeId,
        name: employee.name,
        email: employee.email,
        photo: employee.photoPath,
        designation: employee.designation,
        department: employee.department
      },
      requiresFingerprint,
      fingerprintVerified
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// In routes/employee.js
router.post('/checkin', async (req, res) => {
  const { email, latitude, longitude } = req.body;
  if (!email || !latitude || !longitude) 
    return res.status(400).json({ message: 'All fields required for check-in.' });

  try {
    const employee = await Employee.findOne({ email: email.toLowerCase() });
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < 9 || currentHour >= 19) {
      return res.status(403).json({ message: '⛔ Check-in allowed only between 9:00 AM and 5:00 PM' });
    }

    const distance = getDistanceInMeters(latitude, longitude, OFFICE_LAT, OFFICE_LON);
    console.log(`Distance from office: ${distance}m, Geofence radius: ${GEOFENCE_RADIUS}m`);
    if (distance > GEOFENCE_RADIUS) 
      return res.status(403).json({ message: '📍 Outside geofence. Check-in denied.' });

    const checkInRecord = new CheckIn({
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      checkInTime: now,
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      date: now.toISOString().slice(0, 10),
    });
    await checkInRecord.save();

    const attendance = await Attendance.findOneAndUpdate(
      { employeeId: employee.employeeId, year: now.getFullYear() },
      {
        $push: {
          'monthlyData': {
            month: now.getMonth() + 1,
            days: [{ date: now, status: 'present', checkInTime: now, checkOutTime: null }]
          }
        }
      },
      { upsert: true, new: true }
    );

    const io = req.app.get('io');
    io.emit('checkin_notification', {
      employee: employee.name,
      time: checkInRecord.checkInTime.toLocaleTimeString(),
      message: `${employee.name} has checked in`
    });

    const Notification = require('../models/Notification');
    const notification = new Notification({
      title: 'New Check-in',
      message: `${employee.name} has checked in at ${checkInRecord.checkInTime.toLocaleTimeString()}`,
      recipients: { type: 'all', value: 'admin' },
      priority: 'Normal'
    });
    await notification.save();

    res.status(200).json({ 
      message: 'Check-in recorded automatically',
      checkInTime: checkInRecord.checkInTime.toLocaleTimeString(),
      date: checkInRecord.checkInTime.toLocaleDateString()
    });
  } catch (err) {
    console.error('Check-in Error:', err);
    res.status(500).json({ message: 'Server error during check-in.' });
  }
});

// ✅ Fingerprint Verification
router.post('/verify-fingerprint', async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ 
      success: false,
      message: 'Request body is empty or invalid',
      solution: 'Ensure Content-Type: application/json header is set and body contains valid JSON'
    });
  }

  const { token, fingerprintHash } = req.body;
  if (!token || !fingerprintHash) {
    return res.status(400).json({ 
      success: false, 
      message: 'Token and fingerprint required',
      received: {
        token: !!token,
        fingerprintHash: !!fingerprintHash
      }
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const employee = await Employee.findOne({ email: decoded.email });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const match = await bcrypt.compare(fingerprintHash, employee.fingerprintHash);
    if (!match) return res.status(401).json({ success: false, message: 'Fingerprint mismatch ❌' });

    const today = new Date().toISOString().slice(0, 10);
    const checkInRecord = await CheckIn.findOne({ email: decoded.email, date: today });

    if (!checkInRecord) return res.status(404).json({ success: false, message: 'Check-in record not found' });

    checkInRecord.fingerprintVerified = true;
    await checkInRecord.save();

    res.status(200).json({ success: true, message: 'Fingerprint verified successfully ✅' });
  } catch (err) {
    console.error('Fingerprint Verification Error:', err);
    res.status(500).json({ success: false, message: 'Error verifying fingerprint' });
  }
});

// ✅ Salary
router.get('/salary/:email', async (req, res) => {
  const { email } = req.params;
  const records = await CheckIn.find({ email });

  let totalMinutes = 0;
  records.forEach(r => {
    if (r.checkInTime && r.checkOutTime) {
      const diff = (new Date(r.checkOutTime) - new Date(r.checkInTime)) / (1000 * 60);
      totalMinutes += diff;
    }
  });

  const hourlyRate = 100;
  const hoursWorked = totalMinutes / 60;
  const salary = Math.round(hoursWorked * hourlyRate);

  res.status(200).json({
    email,
    hoursWorked: hoursWorked.toFixed(2),
    salary: `₹${salary}`
  });
});

// ✅ Dashboard APIs
router.get('/dashboard/:employeeId/checkin', verifyToken, async (req, res) => {
  const { employeeId } = req.params;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const checkin = await CheckIn.findOne({ 
      employeeId, 
      checkInTime: { $gte: today } 
    }).sort({ checkInTime: -1 });

    if (!checkin) {
      return res.json({ checkInTime: null, checkOutTime: null });
    }

    res.json({
      checkInTime: checkin.checkInTime,
      checkOutTime: checkin.checkOutTime
    });
  } catch (err) {
    console.error('Check-in fetch error:', err);
    res.status(500).json({ message: 'Error fetching check-in data' });
  }
});

router.get('/dashboard/:employeeId/work-metrics', verifyToken, async (req, res) => {
  const { employeeId } = req.params;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const checkins = await CheckIn.find({ employeeId, checkInTime: { $gte: weekAgo } });

  const totalHours = checkins.reduce((total, c) => {
    if (c.checkOutTime) {
      const hours = (new Date(c.checkOutTime) - new Date(c.checkInTime)) / 36e5;
      return total + hours;
    }
    return total;
  }, 0);

  const leaveCount = 3; // You can dynamically calculate leaves later
  res.json({ totalHours, leaveCount });
});

// Get task details
router.get('/tasks/:taskId', verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId)
      .populate('employeeId', 'name email');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(task);
  } catch (err) {
    console.error('Task fetch error:', err);
    res.status(500).json({ message: 'Error fetching task' });
  }
});

// Update task status
router.put('/tasks/:taskId/status', verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Partially Completed', 'Completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { status },
      { new: true }
    );
    res.json(task);
  } catch (err) {
    console.error('Task status update error:', err);
    res.status(500).json({ message: 'Error updating task status' });
  }
});

// Add task comment
router.post('/tasks/:taskId/comments', verifyToken, async (req, res) => {
  try {
    const { text, postedBy, userModel } = req.body;
    if (!text || !postedBy || !userModel) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { $push: { comments: { text, postedBy, userModel } } },
      { new: true }
    );
    res.json(task);
  } catch (err) {
    console.error('Task comment error:', err);
    res.status(500).json({ message: 'Error adding comment' });
  }
});

// Get all tasks for employee
router.get('/dashboard/:employeeId/tasks', verifyToken, async (req, res) => {
  try {
    const tasks = await Task.find({ employeeId: req.params.employeeId });
    res.json(tasks);
  } catch (err) {
    console.error('Tasks fetch error:', err);
    res.status(500).json({ message: 'Error fetching tasks' });
  }
});

// Get all meetings for employee
router.get('/dashboard/:employeeId/meetings', verifyToken, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  try {
    const meetings = await Meeting.find({
      participants: req.params.employeeId,
      time: { $gte: today, $lt: tomorrow }
    });
    res.json(meetings);
  } catch (err) {
    console.error('Meetings fetch error:', err);
    res.status(500).json({ message: 'Error fetching meetings' });
  }
});

// Request password update OTP
router.post('/request-password-update', verifyToken, async (req, res) => {
  const { email, currentPassword } = req.body;
  
  if (!email || !currentPassword) {
    return res.status(400).json({ message: 'Email and current password are required' });
  }

  try {
    if (email !== req.user.email) {
      return res.status(403).json({ message: 'Email does not match authenticated user' });
    }

    const employee = await Employee.findOne({ email });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const isMatch = await bcrypt.compare(currentPassword, employee.password);
    if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes expiry

    await Employee.updateOne(
      { email },
      { $set: { passwordResetOtp: otp, passwordResetExpires: otpExpires } }
    );

    const html = `
      <h3>Password Update OTP</h3>
      <p>Your OTP for password update is: <strong>${otp}</strong></p>
      <p>This OTP will expire in 3 minutes.</p>
    `;
    await sendMail(email, 'Password Update OTP', html);

    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Password Update Error:', err);
    res.status(500).json({ message: 'Error generating OTP' });
  }
});

// Verify OTP and update password
router.put('/update-password', verifyToken, async (req, res) => {
  const { email, otp, newPassword } = req.body;
  
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, OTP and new password are required' });
  }

  try {
    if (email !== req.user.email) {
      return res.status(403).json({ message: 'Email does not match authenticated user' });
    }

    const employee = await Employee.findOne({ email });
    if (!employee) {
      console.log('Employee not found for email:', email);
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (!employee.passwordResetOtp) {
      console.log('No OTP set for employee');
      return res.status(400).json({ message: 'No OTP requested' });
    }

    if (employee.passwordResetOtp !== otp) {
      console.log('OTP mismatch');
      return res.status(400).json({ 
        message: 'Invalid OTP',
        details: {
          received: otp,
          expected: employee.passwordResetOtp
        }
      });
    }

    if (!employee.passwordResetExpires || new Date() > employee.passwordResetExpires) {
      console.log('OTP expired');
      return res.status(400).json({ 
        message: 'OTP has expired',
        details: {
          expires: employee.passwordResetExpires,
          currentTime: new Date() 
        }
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await Employee.updateOne(
      { email },
      { 
        $set: { password: hashedPassword },
        $unset: { passwordResetOtp: "", passwordResetExpires: "" }
      },
      { runValidators: false }
    );

    const html = `
      <h3>Password Update Successful</h3>
      <p>Your password was successfully updated.</p>
      <p>If you didn't make this change, please contact your administrator immediately.</p>
    `;
    await sendMail(email, 'Password Updated', html);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password Update Error:', err);
    res.status(500).json({ message: 'Error updating password' });
  }
});

module.exports = router;
