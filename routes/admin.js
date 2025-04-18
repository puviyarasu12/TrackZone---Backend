const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const Employee = require('../models/employee');
const Admin = require('../models/admin');
const Checkin = require('../models/checkin');
const Task = require('../models/task');

const router = express.Router();
const SALT_ROUNDS = 10;

const { upload } = require('../utils/Cloudinary');

// ====================== 🧑‍💼 ADMIN REGISTER ======================
router.post('/register', upload.single('photo'), async (req, res) => {
  const { name, email, password, contactNumber } = req.body;
  const photo = req.file;

  if (!name || !email || !password || !contactNumber || !photo) {
    return res.status(400).json({ message: 'All fields including photo are required.' });
  }

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newAdmin = new Admin({
      name,
      email,
      contactNumber,
      photo: photo.path || photo.filename || ``,
      password: hashedPassword,
      role: 'admin'
    });

    await newAdmin.save();
    res.status(201).json({ message: '✅ Admin registered successfully.' });
  } catch (error) {
    console.error('❌ Admin registration error:', error);
    res.status(500).json({ message: 'Server error registering admin.' });
  }
});

// ====================== 🔐 ADMIN LOGIN ======================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: '✅ Login successful.',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        contactNumber: admin.contactNumber,
        photo: admin.photo,
        role: admin.role
      }
    });
  } catch (err) {
    console.error('❌ Admin login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ====================== 📊 DASHBOARD OVERVIEW ======================
router.get('/dashboard-overview', async (req, res) => {
  try {
    const total = await Employee.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const presentToday = await Checkin.countDocuments({ checkInTime: { $gte: today } });
    const onLeave = await Employee.countDocuments({ onLeave: true });
    const avgHours = 6.5;
    res.json({ total, presentToday, onLeave, avgHours });
  } catch (err) {
    console.error('❌ Overview error:', err);
    res.status(500).json({ message: 'Failed to load dashboard overview.' });
  }
});

// ====================== 🧑 ADMIN INFO (NO AUTH) ======================
router.get('/dashboardadmin-overview', async (req, res) => {
  try {
    const admin = await Admin.findOne().sort({ updatedAt: -1 }).select('-password');
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const adminData = {
      name: admin.name,
      photo: admin.photo || 'https://via.placeholder.com/150',
      email: admin.email,
      contactNumber: admin.contactNumber,
      lastLogin: admin.updatedAt,
      position: 'HR Administrator',
      department: 'Human Resources',
    };

    res.json(adminData);
  } catch (err) {
    console.error('Error fetching admin dashboard data:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ====================== 📝 TASK MANAGEMENT ======================

router.post('/tasks', async (req, res) => {
  try {
    const { employeeId, title, description, priority, dueDate, status } = req.body;

    if (!employeeId || !title || !description || !dueDate) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const employee = await Employee.findOne({ employeeId });

    if (!employee) {
      return res.status(400).json({ message: 'Invalid employee ID' });
    }

    const task = new Task({
      employeeId,
      title,
      description,
      priority: priority || 'Medium',
      dueDate,
      status: status || 'Pending'
    });

    await task.save();
    res.status(201).json(task);
  } catch (err) {
    console.error('Task creation error:', err);
    res.status(500).json({ message: 'Error creating task' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const tasks = await Task.find().populate('employeeId', 'name email position');
    res.json(tasks);
  } catch (err) {
    console.error('Tasks fetch error:', err);
    res.status(500).json({ message: 'Error fetching tasks' });
  }
});

router.get('/tasks/employee/:id', async (req, res) => {
  try {
    const tasks = await Task.find({ employeeId: req.params.id })
      .populate('employeeId', 'name email position');
    res.json(tasks);
  } catch (err) {
    console.error('Employee tasks fetch error:', err);
    res.status(500).json({ message: 'Error fetching employee tasks' });
  }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const { title, description, priority, dueDate, status } = req.body;

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        priority,
        dueDate,
        status,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const populatedTask = await Task.findById(task._id)
      .populate('employeeId', 'name email position');

    res.json(populatedTask);
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ message: 'Error updating task' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Task deletion error:', err);
    res.status(500).json({ message: 'Error deleting task' });
  }
});

// ====================== 👥 EMPLOYEE MANAGEMENT ======================
router.get('/employees', async (req, res) => {
  try {
    const employees = await Employee.find().select('employeeId name email position department contactNumber photoPath');
    const sanitizedEmployees = employees.map(emp => ({
      ...emp._doc,
      photoPath: emp.photoPath || 'https://via.placeholder.com/150', // Fallback URL
    }));
    res.json(sanitizedEmployees);
  } catch (err) {
    console.error('Employees fetch error:', err);
    res.status(500).json({ message: 'Error fetching employees' });
  }
});

// ====================== 🟢 ACTIVE EMPLOYEES ======================
router.get('/dashboard/active', async (req, res) => {
  try {
    const active = await Checkin.find({ active: true })
      .populate('employeeId', 'name email position');
    res.json(active);
  } catch (err) {
    console.error('❌ Active employee fetch error:', err);
    res.status(500).json({ message: 'Error fetching active employees.' });
  }
});

module.exports = router;
