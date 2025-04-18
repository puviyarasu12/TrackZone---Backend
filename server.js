const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();

// Initialize automatic check-in/out scheduler
const CheckIn = require('./models/checkin');
const Attendance = require('./models/attendance');

const autoCheckInOut = async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    if (currentHour === 17) { // 5 PM
        try {
            const employees = await CheckIn.find({ date: today });
            for (const employee of employees) {
                if (!employee.checkInTime) {
                    employee.checkInTime = now;
                    employee.isAuto = true;
                    await employee.save();

                    await Attendance.findOneAndUpdate(
                        { employeeId: employee.employeeId, year: now.getFullYear() },
                        {
                            $push: {
                                'monthlyData.$[elem].days': {
                                    date: now,
                                    status: 'Present',
                                    checkInTime: now,
                                    checkOutTime: null
                                }
                            }
                        },
                        {
                            arrayFilters: [{ 'elem.month': now.getMonth() + 1 }],
                            upsert: true
                        }
                    );
                }
            }
        } catch (err) {
            console.error('Auto check-in error:', err);
        }
    }
};

// Schedule the task to run every hour
setInterval(autoCheckInOut, 60 * 60 * 1000);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Make io accessible to routes
app.set('io', io);
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fingerprintDB';

// 🔐 Environment Validation
if (!process.env.MONGO_URI) {
  console.warn('⚠ Warning: MONGO_URI not set in .env, using default Mongo URI.');
}

// 🧹 Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-employee-token');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(cors());
app.use(helmet());
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));

// 📁 Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'frontend'))); // ✅ Serve frontend folder

// 🔠 MongoDB Connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log(`✅ [${new Date().toLocaleTimeString()}] MongoDB connected successfully`))
  .catch((err) => {
    console.error(`❌ MongoDB connection error:`, err);
    process.exit(1); // Exit if DB connection fails
  });

// 🔄 Routes
console.log('⏳ Loading routes...');
try {
  const employeeRoutes = require('./routes/employee');
  console.log('✅ Loaded employee routes');
  const adminRoutes = require('./routes/admin');
  console.log('✅ Loaded admin routes');
  const notificationRoutes = require('./routes/sendNotification');
  console.log('✅ Loaded notification routes');
  const geofenceRoutes = require('./routes/geofence');
  console.log('✅ Loaded geofence routes');

  app.use('/api/employee', employeeRoutes);
  console.log('✅ Registered employee routes');
  app.use('/api/admin', adminRoutes);
  console.log('✅ Registered admin routes');
  app.use('/api/notifications', notificationRoutes);
  console.log('✅ Registered notification routes');
  app.use('/api/geofence', geofenceRoutes);
  console.log('✅ Registered geofence routes');


  // 🌐 Root Route - serve register.html from frontend/
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'register.html'));
  });

} catch (err) {
  console.error('❌ Error loading routes:', err.message);
}

// ❌ 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ message: '⚠ Route not found' });
});

// 🔝 Central Error Handler (Optional for future)
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err);
  res.status(500).json({ message: '🔥 Internal Server Error' });
});

// 🚀 Start Server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
