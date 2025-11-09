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
    
    // --- NEW FIELDS ---
    checkInTime: {
        type: Date, // Full timestamp of check-in
    },
    checkOutTime: {
        type: Date, // Full timestamp of check-out
    },
    checkOutLocation: {
        latitude: Number,
        longitude: Number,
    },
    // --- END NEW FIELDS ---

    checkInLocation: {
        latitude: Number,
        longitude: Number,
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
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
}, { timestamps: true });

// Helper function to get the start of a given day (to ignore time)
const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Pre-save hook to normalize the date
attendanceSchema.pre('save', function(next) {
    if (this.isModified('date')) {
        this.date = getStartOfDay(this.date);
    }
    next();
});

// Unique index to prevent an employee from having two records on the same day
attendanceSchema.index({ employee: 1, date: 1, organizationId: 1 }, { unique: true });

// Indexes for faster reporting
attendanceSchema.index({ organizationId: 1, date: 1 });


const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;