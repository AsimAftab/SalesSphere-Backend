const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    // The employee who this record belongs to
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // The date of the attendance (normalized to start of day)
    date: {
        type: Date,
        required: true,
    },
    // P: Present, A: Absent, W: Weekly Off, L: Leave, H: Half Day
    status: {
        type: String,
        required: [true, 'Attendance status is required'],
        enum: ['P', 'A', 'W', 'L', 'H'],
    },

    // Check-in related fields
    checkInTime: {
        type: Date, // Full timestamp of check-in
    },
    checkInLocation: {
        latitude: Number,
        longitude: Number,
    },
    checkInAddress: {
        type: String,
        trim: true,
    },
    // Check-out related fields
    checkOutTime: {
        type: Date, // Full timestamp of check-out
    },
    checkOutLocation: {
        latitude: Number,
        longitude: Number,
    },
    checkOutAddress: {
        type: String,
        trim: true,
    },
    markedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    notes: {
        type: String,
        trim: true,
    },
    // Organization settings at time of attendance (for multi-tenant history)
    orgCheckInTime: {
        type: String,
        trim: true,
    },
    orgCheckOutTime: {
        type: String,
        trim: true,
    },
    orgHalfDayCheckOutTime: {
        type: String,
        trim: true,
    },
    orgWeeklyOffDay: {
        type: String,
        trim: true,
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });



// Unique index to prevent an employee from having two records on the same day
attendanceSchema.index({ employee: 1, date: 1, organizationId: 1 }, { unique: true });

// Indexes for faster reporting
attendanceSchema.index({ organizationId: 1, date: 1 });


const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;