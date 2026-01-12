// controllers/odometer.controller.js
const Odometer = require('./odometer.model');
const User = require('../users/user.model');
const Organization = require('../organizations/organization.model');
const { z } = require('zod');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');
const { isSystemRole } = require('../../utils/defaultPermissions');
const { getAllSubordinateIds } = require('../../utils/hierarchyHelper');

/* ======================
   Helpers & Timezone utils
   ====================== */

// Convert string or ObjectId to mongoose.Types.ObjectId (safe)
function toObjectIdIfNeeded(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    return new mongoose.Types.ObjectId(String(id));
}

// Returns start of today in organization's timezone for storage
const getStartOfTodayInOrgTZ = (timezone = 'Asia/Kolkata') => {
    const dt = DateTime.now().setZone(timezone).startOf('day');
    const { year, month, day } = dt;
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// Returns start and end of a month in the org timezone for date range queries
const getMonthRangeInOrgTZ = (year, month, timezone = 'Asia/Kolkata') => {
    const startDt = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone });
    const start = new Date(Date.UTC(startDt.year, startDt.month - 1, startDt.day, 0, 0, 0, 0));

    const endDt = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone }).endOf('month');
    const end = new Date(Date.UTC(endDt.year, endDt.month - 1, endDt.day, 23, 59, 59, 999));

    return { start, end };
};

/* ======================
   Zod Validation Schemas
   ====================== */

const startReadingSchema = z.object({
    startReading: z.coerce.number({ required_error: "Start reading is required" }).min(0, "Reading cannot be negative"),
    startUnit: z.enum(['km', 'miles'], { required_error: "Unit is required" }),
    startDescription: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    address: z.string().optional(),
});

const stopReadingSchema = z.object({
    stopReading: z.coerce.number({ required_error: "Stop reading is required" }).min(0, "Reading cannot be negative"),
    stopUnit: z.enum(['km', 'miles'], { required_error: "Unit is required" }),
    stopDescription: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    address: z.string().optional(),
});

const reportQuerySchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2020).max(2100),
});

/* ======================
   1. FOR THE APP (Employee)
   ====================== */

// @desc    Record start odometer reading
// @route   POST /api/v1/odometer/start
// @access  Private (odometer:record permission)
exports.startReading = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

        const { _id: userId, organizationId } = req.user;
        const orgObjectId = toObjectIdIfNeeded(organizationId);

        const validatedData = startReadingSchema.parse(req.body);

        // Fetch organization for timezone
        const organization = await Organization.findById(orgObjectId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';
        const today = getStartOfTodayInOrgTZ(timezone);

        // Check if a record exists for today
        const existingRecord = await Odometer.findOne({
            employee: userId,
            date: today,
            organizationId: orgObjectId,
        });

        if (existingRecord && existingRecord.startReading !== undefined) {
            return res.status(400).json({ success: false, message: 'You have already recorded start reading for today.' });
        }

        // Build location object
        const startLocation = {};
        if (validatedData.latitude) startLocation.latitude = validatedData.latitude;
        if (validatedData.longitude) startLocation.longitude = validatedData.longitude;
        if (validatedData.address) startLocation.address = validatedData.address;

        // Upsert odometer record
        const updatedRecord = await Odometer.findOneAndUpdate(
            {
                employee: userId,
                date: today,
                organizationId: orgObjectId,
            },
            {
                $set: {
                    status: 'in_progress',
                    startReading: validatedData.startReading,
                    startUnit: validatedData.startUnit,
                    startDescription: validatedData.startDescription,
                    startTime: new Date(),
                    startLocation: Object.keys(startLocation).length > 0 ? startLocation : undefined,
                }
            },
            { new: true, upsert: true, runValidators: true }
        );

        res.status(201).json({
            success: true,
            message: 'Start reading recorded successfully',
            data: updatedRecord,
            organizationTimezone: timezone
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Odometer reading already recorded for today.' });
        }
        next(error);
    }
};

// @desc    Record stop odometer reading
// @route   PUT /api/v1/odometer/stop
// @access  Private (odometer:record permission)
exports.stopReading = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

        const { _id: userId, organizationId } = req.user;
        const orgObjectId = toObjectIdIfNeeded(organizationId);

        const validatedData = stopReadingSchema.parse(req.body);

        // Fetch organization for timezone
        const organization = await Organization.findById(orgObjectId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';
        const today = getStartOfTodayInOrgTZ(timezone);

        // Find today's record
        const existingRecord = await Odometer.findOne({
            employee: userId,
            date: today,
            organizationId: orgObjectId,
        });

        if (!existingRecord || existingRecord.startReading === undefined) {
            return res.status(400).json({ success: false, message: 'You have not recorded start reading yet.' });
        }

        if (existingRecord.status === 'completed') {
            return res.status(400).json({ success: false, message: 'You have already recorded stop reading for today.' });
        }

        // Warn if stop reading is less than start reading (but allow it)
        let warning = null;
        if (validatedData.stopReading < existingRecord.startReading) {
            warning = 'Stop reading is less than start reading. Please verify.';
        }

        // Build location object
        const stopLocation = {};
        if (validatedData.latitude) stopLocation.latitude = validatedData.latitude;
        if (validatedData.longitude) stopLocation.longitude = validatedData.longitude;
        if (validatedData.address) stopLocation.address = validatedData.address;

        // Update record
        existingRecord.status = 'completed';
        existingRecord.stopReading = validatedData.stopReading;
        existingRecord.stopUnit = validatedData.stopUnit;
        existingRecord.stopDescription = validatedData.stopDescription;
        existingRecord.stopTime = new Date();
        if (Object.keys(stopLocation).length > 0) {
            existingRecord.stopLocation = stopLocation;
        }

        await existingRecord.save();

        // Calculate distance traveled
        const distance = existingRecord.stopReading - existingRecord.startReading;

        res.status(200).json({
            success: true,
            message: 'Stop reading recorded successfully',
            data: existingRecord,
            distance: distance,
            distanceUnit: existingRecord.stopUnit,
            warning: warning,
            organizationTimezone: timezone
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

// @desc    Get today's odometer status
// @route   GET /api/v1/odometer/status/today
// @access  Private (odometer:view permission)
exports.getStatusToday = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

        const { _id: userId, organizationId } = req.user;
        const orgObjectId = toObjectIdIfNeeded(organizationId);

        // Fetch organization for timezone
        const organization = await Organization.findById(orgObjectId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';
        const today = getStartOfTodayInOrgTZ(timezone);

        const record = await Odometer.findOne({
            employee: userId,
            date: today,
            organizationId: orgObjectId,
        });

        if (!record) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'No odometer reading for today',
                status: 'not_started',
                organizationTimezone: timezone
            });
        }

        // Calculate distance if completed
        let distance = null;
        if (record.status === 'completed' && record.startReading !== undefined && record.stopReading !== undefined) {
            distance = record.stopReading - record.startReading;
        }

        res.status(200).json({
            success: true,
            data: record,
            distance: distance,
            organizationTimezone: timezone
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get odometer details by ID
// @route   GET /api/v1/odometer/:id
// @access  Private (odometer:view permission)
exports.getOdometerById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        // Fetch organization for timezone
        const organization = await Organization.findById(organizationId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';

        const record = await Odometer.findOne({
            _id: id,
            organizationId: organizationId
        });

        if (!record) {
            return res.status(404).json({ success: false, message: 'Odometer record not found' });
        }

        // Calculate distance
        let distance = null;
        if (record.status === 'completed' && record.startReading !== undefined && record.stopReading !== undefined) {
            distance = record.stopReading - record.startReading;
        }

        res.status(200).json({
            success: true,
            data: record,
            distance: distance,
            organizationTimezone: timezone
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get my monthly odometer report
// @route   GET /api/v1/odometer/my-monthly-report
// @access  Private (odometer:view permission)
exports.getMyMonthlyReport = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

        const { _id: userId, organizationId } = req.user;
        const orgObjectId = toObjectIdIfNeeded(organizationId);

        const { month, year } = reportQuerySchema.parse(req.query);

        // Fetch organization for timezone
        const organization = await Organization.findById(orgObjectId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';

        // Get month range
        const { start: startDate, end: endDate } = getMonthRangeInOrgTZ(year, month, timezone);

        // Fetch records for the month
        const records = await Odometer.find({
            employee: userId,
            organizationId: orgObjectId,
            date: { $gte: startDate, $lte: endDate }
        }).select('date status startReading startUnit stopReading stopUnit startTime stopTime').lean();

        // Build response
        const odometerByDate = {};
        const summary = {
            totalDistance: 0,
            daysRecorded: 0,
            daysCompleted: 0,
            daysInProgress: 0,
        };

        for (const record of records) {
            const localDate = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate();
            const day = Number(localDate.split('-')[2]);

            let distance = null;
            if (record.status === 'completed' && record.startReading !== undefined && record.stopReading !== undefined) {
                distance = record.stopReading - record.startReading;
                summary.totalDistance += distance;
                summary.daysCompleted++;
            } else if (record.status === 'in_progress') {
                summary.daysInProgress++;
            }

            summary.daysRecorded++;

            odometerByDate[day] = {
                _id: record._id, // Added _id for navigation
                status: record.status,
                startReading: record.startReading,
                startUnit: record.startUnit,
                stopReading: record.stopReading,
                stopUnit: record.stopUnit,
                distance: distance,
                startTime: record.startTime,
                stopTime: record.stopTime,
            };
        }

        // Fill in not_started days
        const daysInMonth = DateTime.fromJSDate(endDate, { zone: 'UTC' }).day;
        for (let day = 1; day <= daysInMonth; day++) {
            if (!odometerByDate[day]) {
                odometerByDate[day] = { status: 'not_started' };
            }
        }

        // Calculate average
        summary.avgDailyDistance = summary.daysCompleted > 0 ? Math.round(summary.totalDistance / summary.daysCompleted) : 0;

        res.status(200).json({
            success: true,
            data: {
                month,
                year,
                odometer: odometerByDate,
                summary
            },
            organizationTimezone: timezone
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

/* ======================
   2. FOR THE WEB (Admin / Manager)
   ====================== */

// @desc    Get team/org odometer report
// @route   GET /api/v1/odometer/report
// @access  Private (odometer:view permission)
// @desc    Get team/org odometer report
// @route   GET /api/v1/odometer/report
// @access  Private (odometer:view permission)
exports.getOdometerReport = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;
        const orgObjectId = toObjectIdIfNeeded(organizationId);

        const { month, year } = reportQuerySchema.parse(req.query);

        // Fetch organization for timezone
        const organization = await Organization.findById(orgObjectId).select('timezone');
        const timezone = organization?.timezone || 'Asia/Kolkata';

        // Get month range
        const { start: startDate, end: endDate } = getMonthRangeInOrgTZ(year, month, timezone);

        // Dynamic role filtering (similar to attendance)
        let employeeQuery = { organizationId: orgObjectId };

        if (isSystemRole(role) || role === 'admin') {
            employeeQuery.role = { $nin: ['superadmin', 'developer'] };
        } else if (req.user.hasFeature('odometer', 'viewAllOdometer')) {
            // View All
        } else {
            // View self + subordinates
            const subordinateIds = await getAllSubordinateIds(userId, organizationId);

            if (subordinateIds.length > 0) {
                employeeQuery.$or = [
                    { _id: userId },
                    { _id: { $in: subordinateIds } }
                ];
            } else {
                employeeQuery._id = userId;
            }
        }

        const employees = await User.find(employeeQuery).select('name email role').lean();

        if (employees.length === 0) {
            return res.status(200).json({ success: true, data: { report: [], summary: {} } });
        }

        const employeeIds = employees.map(e => e._id);

        // Fetch odometer records
        const records = await Odometer.find({
            organizationId: orgObjectId,
            employee: { $in: employeeIds },
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 }).lean();

        // Group records by employee
        const recordsByEmployee = {};
        for (const record of records) {
            const empId = record.employee.toString();
            if (!recordsByEmployee[empId]) {
                recordsByEmployee[empId] = [];
            }
            recordsByEmployee[empId].push(record);
        }

        const report = [];

        for (const employee of employees) {
            const empId = employee._id.toString();
            const empRecords = recordsByEmployee[empId] || [];

            let totalDistance = 0;
            let daysCompleted = 0;
            const recordList = [];

            for (const record of empRecords) {
                let distance = null;
                if (record.status === 'completed' && record.startReading !== undefined && record.stopReading !== undefined) {
                    distance = record.stopReading - record.startReading;
                    totalDistance += distance;
                    daysCompleted++;
                }

                recordList.push({
                    _id: record._id,
                    date: DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate(), // Send pure date string
                    status: record.status,
                    startReading: record.startReading,
                    startUnit: record.startUnit,
                    stopReading: record.stopReading,
                    stopUnit: record.stopUnit,
                    distance: distance,
                    startTime: record.startTime,
                    stopTime: record.stopTime,
                    // location details could be added if needed, keeping it light for report list
                });
            }

            // Only add to report if user wants to see everyone, OR filter out empty? 
            // Usually report should show all queried employees even if 0 data, 
            // but for "odometer reading wont be everyday" typically we still list the employee.
            // If the user wants ONLY days with data, we successfully changed `records` to a list.

            report.push({
                employee: {
                    _id: employee._id,
                    name: employee.name,
                    email: employee.email,
                    role: employee.role
                },
                records: recordList,
                totalDistance: totalDistance,
                daysCompleted: daysCompleted
            });
        }

        res.status(200).json({
            success: true,
            data: {
                month,
                year,
                report,
            },
            organizationTimezone: timezone
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        next(error);
    }
};

/* ======================
   3. IMAGE UPLOAD ENDPOINTS
   ====================== */

// @desc    Upload start image
// @route   POST /api/v1/odometer/:id/start-image
// @access  Private (odometer:record permission)
exports.uploadStartImage = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image file' });
        }

        // OPTIMIZED: Parallel lookup for record and organization
        const [record, organization] = await Promise.all([
            Odometer.findOne({
                _id: id,
                employee: userId,
                organizationId: organizationId
            }),
            Organization.findById(organizationId).select('name').lean()
        ]);

        if (!record) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Odometer record not found' });
        }

        if (!organization) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const dateStr = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate();
        const folderPath = `sales-sphere/${organization.name}/odometer/${userId}/${dateStr}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: 'start_image',
            overwrite: true,
            eager: [{ width: 1200, height: 1600, crop: "limit", fetch_format: "auto", quality: "auto" }],
            eager_async: true
        });

        // OPTIMIZED: Cleanup temp file and save record in parallel
        await Promise.all([
            new Promise(resolve => fs.unlink(tempFilePath, resolve)),
            Odometer.updateOne({ _id: id }, { $set: { startImage: result.secure_url } })
        ]);
        tempFilePath = null;

        res.status(200).json({
            success: true,
            message: 'Start image uploaded successfully',
            data: {
                startImage: result.secure_url
            }
        });
    } catch (error) {
        if (tempFilePath) fs.unlink(tempFilePath, () => { });
        console.error('Error uploading start image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Upload stop image
// @route   POST /api/v1/odometer/:id/stop-image
// @access  Private (odometer:record permission)
exports.uploadStopImage = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an image file' });
        }

        // OPTIMIZED: Parallel lookup for record and organization
        const [record, organization] = await Promise.all([
            Odometer.findOne({
                _id: id,
                employee: userId,
                organizationId: organizationId
            }),
            Organization.findById(organizationId).select('name').lean()
        ]);

        if (!record) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Odometer record not found' });
        }

        if (!organization) {
            if (tempFilePath) fs.unlink(tempFilePath, () => { });
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const dateStr = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate();
        const folderPath = `sales-sphere/${organization.name}/odometer/${userId}/${dateStr}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            public_id: 'stop_image',
            overwrite: true,
            eager: [{ width: 1200, height: 1600, crop: "limit", fetch_format: "auto", quality: "auto" }],
            eager_async: true
        });

        // OPTIMIZED: Cleanup temp file and save record in parallel
        await Promise.all([
            new Promise(resolve => fs.unlink(tempFilePath, resolve)),
            Odometer.updateOne({ _id: id }, { $set: { stopImage: result.secure_url } })
        ]);
        tempFilePath = null;

        res.status(200).json({
            success: true,
            message: 'Stop image uploaded successfully',
            data: {
                stopImage: result.secure_url
            }
        });
    } catch (error) {
        if (tempFilePath) fs.unlink(tempFilePath, () => { });
        console.error('Error uploading stop image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete start image
// @route   DELETE /api/v1/odometer/:id/start-image
// @access  Private (odometer:record permission)
exports.deleteStartImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;

        // Find the record
        const record = await Odometer.findOne({
            _id: id,
            employee: userId,
            organizationId: organizationId
        });

        if (!record) {
            return res.status(404).json({ success: false, message: 'Odometer record not found' });
        }

        if (!record.startImage) {
            return res.status(404).json({ success: false, message: 'No start image to delete' });
        }

        // Get organization for folder path
        const organization = await Organization.findById(organizationId).select('name').lean();
        if (organization) {
            const dateStr = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate();
            const publicId = `sales-sphere/${organization.name}/odometer/${userId}/${dateStr}/start_image`;
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (err) {
                console.error('Error deleting from Cloudinary:', err);
            }
        }

        record.startImage = null;
        await record.save();

        res.status(200).json({
            success: true,
            message: 'Start image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting start image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete stop image
// @route   DELETE /api/v1/odometer/:id/stop-image
// @access  Private (odometer:record permission)
exports.deleteStopImage = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;
        const { id } = req.params;

        // Find the record
        const record = await Odometer.findOne({
            _id: id,
            employee: userId,
            organizationId: organizationId
        });

        if (!record) {
            return res.status(404).json({ success: false, message: 'Odometer record not found' });
        }

        if (!record.stopImage) {
            return res.status(404).json({ success: false, message: 'No stop image to delete' });
        }

        // Get organization for folder path
        const organization = await Organization.findById(organizationId).select('name').lean();
        if (organization) {
            const dateStr = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate();
            const publicId = `sales-sphere/${organization.name}/odometer/${userId}/${dateStr}/stop_image`;
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (err) {
                console.error('Error deleting from Cloudinary:', err);
            }
        }

        record.stopImage = null;
        await record.save();

        res.status(200).json({
            success: true,
            message: 'Stop image deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting stop image:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/* ======================
   4. DELETE ENDPOINTS
   ====================== */

// @desc    Delete odometer entry
// @route   DELETE /api/v1/odometer/:id
// @access  Private (odometer:delete permission)
exports.deleteOdometerEntry = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { id } = req.params;

        const record = await Odometer.findOneAndDelete({
            _id: id,
            organizationId: organizationId
        });

        if (!record) {
            return res.status(404).json({ success: false, message: 'Odometer record not found' });
        }

        // Delete images from Cloudinary if they exist
        const organization = await Organization.findById(organizationId).select('name').lean();
        if (organization) {
            const dateStr = DateTime.fromJSDate(record.date, { zone: 'UTC' }).toISODate();
            const basePath = `sales-sphere/${organization.name}/odometer/${record.employee}/${dateStr}`;

            const deletePromises = [];
            if (record.startImage) {
                deletePromises.push(cloudinary.uploader.destroy(`${basePath}/start_image`).catch(() => { }));
            }
            if (record.stopImage) {
                deletePromises.push(cloudinary.uploader.destroy(`${basePath}/stop_image`).catch(() => { }));
            }
            await Promise.all(deletePromises);
        }

        res.status(200).json({
            success: true,
            message: 'Odometer record deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
