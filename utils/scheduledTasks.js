const cron = require('node-cron');
const CheckIn = require('../models/checkin');
const Attendance = require('../models/attendance');

// Function to perform automatic check-in/check-out
const autoCheckInOut = async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentHour = now.getHours();

    // Logic for automatic check-in
    if (currentHour === 17) { // 5 PM
        const employees = await CheckIn.find({ date: today });
        for (const employee of employees) {
            if (!employee.checkInTime) {
                // Auto check-in logic
                employee.checkInTime = now;
                employee.isAuto = true; // Mark as automatic check-in
                await employee.save();

                // Update attendance record
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
    }
};

// Schedule the task to run daily at 5 PM
cron.schedule('0 17 * * *', autoCheckInOut);

module.exports = { autoCheckInOut };
