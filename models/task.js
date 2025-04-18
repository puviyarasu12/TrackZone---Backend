const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    employeeId: { type: String, required: true }, // Custom string ID
    title: { type: String, required: true },
    description: { type: String, required: true },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
    dueDate: { type: Date, required: true },
    status: { 
        type: String, 
        enum: ['Pending', 'Partially Completed', 'Completed'], 
        default: 'Pending' 
    },
    comments: [{
        text: { type: String, required: true },
        postedBy: { type: String, required: true }, // Changed to String to match employeeId
        userModel: { type: String, enum: ['Admin', 'Employee'], required: true },
        createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);