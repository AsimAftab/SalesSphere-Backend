const LocationTracking = require('./tracking.model');
const BeatPlan = require('../beat-plan.model');
const Party = require('../../parties/party.model');
const Site = require('../../sites/sites.model');
const Prospect = require('../../prospect/prospect.model');

// @desc    Get tracking session for a beat plan
// @route   GET /api/v1/beat-plans/tracking/:beatPlanId
// @access  Protected
exports.getTrackingSession = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { beatPlanId } = req.params;

        // Verify beat plan access
        const beatPlan = await BeatPlan.findOne({
            _id: beatPlanId,
            organizationId,
        });

        if (!beatPlan) {
            return res.status(404).json({
                success: false,
                message: 'Beat plan not found',
            });
        }

        // Get active tracking session
        const trackingSession = await LocationTracking.findOne({
            beatPlanId,
            organizationId,
            status: { $in: ['active', 'paused'] },
        }).populate('userId', 'name email avatarUrl phone role');

        if (!trackingSession) {
            return res.status(404).json({
                success: false,
                message: 'No active tracking session found',
            });
        }

        res.status(200).json({
            success: true,
            data: trackingSession,
        });
    } catch (error) {
        console.error('Error fetching tracking session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tracking session',
            error: error.message,
        });
    }
};

// @desc    Get tracking history for a beat plan
// @route   GET /api/v1/beat-plans/tracking/:beatPlanId/history
// @access  Protected
exports.getTrackingHistory = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { beatPlanId } = req.params;

        // Verify beat plan access
        const beatPlan = await BeatPlan.findOne({
            _id: beatPlanId,
            organizationId,
        });

        if (!beatPlan) {
            return res.status(404).json({
                success: false,
                message: 'Beat plan not found',
            });
        }

        // Get all tracking sessions for this beat plan
        const trackingSessions = await LocationTracking.find({
            beatPlanId,
            organizationId,
        })
            .populate('userId', 'name email avatarUrl role')
            .sort({ sessionStartedAt: -1 });

        res.status(200).json({
            success: true,
            data: trackingSessions,
        });
    } catch (error) {
        console.error('Error fetching tracking history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tracking history',
            error: error.message,
        });
    }
};

// @desc    Get location breadcrumb trail for a tracking session
// @route   GET /api/v1/beat-plans/tracking/session/:sessionId/breadcrumbs
// @access  Protected
exports.getBreadcrumbs = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { sessionId } = req.params;

        const trackingSession = await LocationTracking.findOne({
            _id: sessionId,
            organizationId,
        }).select('locations beatPlanId userId sessionStartedAt sessionEndedAt status');

        if (!trackingSession) {
            return res.status(404).json({
                success: false,
                message: 'Tracking session not found',
            });
        }

        res.status(200).json({
            success: true,
            data: {
                sessionId: trackingSession._id,
                beatPlanId: trackingSession.beatPlanId,
                userId: trackingSession.userId,
                sessionStartedAt: trackingSession.sessionStartedAt,
                sessionEndedAt: trackingSession.sessionEndedAt,
                status: trackingSession.status,
                breadcrumbs: trackingSession.locations,
                totalPoints: trackingSession.locations.length,
            },
        });
    } catch (error) {
        console.error('Error fetching breadcrumbs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch breadcrumbs',
            error: error.message,
        });
    }
};

// @desc    Get current location for an active tracking session
// @route   GET /api/v1/beat-plans/tracking/:beatPlanId/current-location
// @access  Protected
exports.getCurrentLocation = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { beatPlanId } = req.params;

        const trackingSession = await LocationTracking.findOne({
            beatPlanId,
            organizationId,
            status: 'active',
        })
            .select('currentLocation userId sessionStartedAt')
            .populate('userId', 'name email avatarUrl');

        if (!trackingSession || !trackingSession.currentLocation) {
            return res.status(404).json({
                success: false,
                message: 'No active location found',
            });
        }

        res.status(200).json({
            success: true,
            data: {
                beatPlanId,
                user: trackingSession.userId,
                location: trackingSession.currentLocation,
                sessionStartedAt: trackingSession.sessionStartedAt,
            },
        });
    } catch (error) {
        console.error('Error fetching current location:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch current location',
            error: error.message,
        });
    }
};

// @desc    Get tracking summary/analytics for a session
// @route   GET /api/v1/beat-plans/tracking/session/:sessionId/summary
// @access  Protected
exports.getTrackingSummary = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { sessionId } = req.params;

        const trackingSession = await LocationTracking.findOne({
            _id: sessionId,
            organizationId,
        })
            .populate('userId', 'name email avatarUrl role')
            .populate('beatPlanId', 'name status schedule');

        if (!trackingSession) {
            return res.status(404).json({
                success: false,
                message: 'Tracking session not found',
            });
        }

        // Calculate summary if not already calculated
        let summary = trackingSession.summary;
        if (trackingSession.status === 'completed' && summary.totalDistance === 0) {
            const totalDistance = trackingSession.calculateTotalDistance();
            const durationMs = trackingSession.sessionEndedAt - trackingSession.sessionStartedAt;
            const durationMinutes = durationMs / (1000 * 60);
            const averageSpeed = durationMinutes > 0 ? (totalDistance / durationMinutes) * 60 : 0;

            summary = {
                totalDistance,
                totalDuration: durationMinutes,
                averageSpeed,
                directoriesVisited: trackingSession.summary.directoriesVisited || 0,
            };

            // Update the session
            trackingSession.summary = summary;
            await trackingSession.save();
        }

        res.status(200).json({
            success: true,
            data: {
                sessionId: trackingSession._id,
                beatPlan: trackingSession.beatPlanId,
                user: trackingSession.userId,
                sessionStartedAt: trackingSession.sessionStartedAt,
                sessionEndedAt: trackingSession.sessionEndedAt,
                status: trackingSession.status,
                summary,
                totalLocationsRecorded: trackingSession.locations.length,
            },
        });
    } catch (error) {
        console.error('Error fetching tracking summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tracking summary',
            error: error.message,
        });
    }
};

// @desc    Get all active tracking sessions for organization
// @route   GET /api/v1/beat-plans/tracking/active
// @access  Protected (Admin, Manager)
exports.getActiveTrackingSessions = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const activeSessions = await LocationTracking.find({
            organizationId,
            status: 'active',
        })
            .populate('userId', 'name email avatarUrl phone role')
            .populate('beatPlanId', 'name status schedule')
            .sort({ sessionStartedAt: -1 });

        // Add current location to each session
        const sessionsWithLocation = activeSessions.map(session => ({
            sessionId: session._id,
            beatPlan: session.beatPlanId,
            user: session.userId,
            currentLocation: session.currentLocation,
            sessionStartedAt: session.sessionStartedAt,
            locationsRecorded: session.locations.length,
            status: session.status,
        }));

        res.status(200).json({
            success: true,
            data: sessionsWithLocation,
            count: sessionsWithLocation.length,
        });
    } catch (error) {
        console.error('Error fetching active tracking sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active tracking sessions',
            error: error.message,
        });
    }
};

// @desc    Delete tracking session (admin only)
// @route   DELETE /api/v1/beat-plans/tracking/session/:sessionId
// @access  Protected (Admin only)
exports.deleteTrackingSession = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const { sessionId } = req.params;

        const trackingSession = await LocationTracking.findOneAndDelete({
            _id: sessionId,
            organizationId,
        });

        if (!trackingSession) {
            return res.status(404).json({
                success: false,
                message: 'Tracking session not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tracking session deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting tracking session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete tracking session',
            error: error.message,
        });
    }
};
