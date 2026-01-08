const LocationTracking = require('./tracking.model');
const BeatPlan = require('../beat-plan.model');
const Party = require('../../parties/party.model');
const Site = require('../../sites/sites.model');
const Prospect = require('../../prospect/prospect.model');
const User = require('../../users/user.model');
const { isSystemRole } = require('../../../utils/defaultPermissions');

// Helper to check if requester can view target user's tracking
const checkTrackingAccess = async (reqUser, targetUserId) => {
    const { role, _id: requesterId } = reqUser;

    // 1. Admin / System Role: Access Granted
    if (role === 'admin' || isSystemRole(role)) return true;

    // 2. Self: Access Granted
    if (requesterId.toString() === targetUserId.toString()) return true;

    // 3. Manager: Check if target reports to requester
    const targetUser = await User.findById(targetUserId).select('reportsTo');
    if (targetUser && targetUser.reportsTo && targetUser.reportsTo.includes(requesterId)) {
        return true;
    }

    return false;
};
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

        // Security Check
        const canView = await checkTrackingAccess(req.user, trackingSession.userId._id);
        if (!canView) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this tracking session' });
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

        // Security Check - Filter sessions user is allowed to see
        // For history list, we might implement a filter or post-filter
        // Since this is getting history for a SPECIFIC Beat Plan, we should check if the user has access.
        // Assuming Beat Plan assignment implies some access, but strict hierarchy is better.

        // Better approach: Since a Beat Plan might have multiple users over time (if reassigned),
        // we should filter the list to only show sessions of users the requester can view.

        const visibleSessions = [];
        for (const session of trackingSessions) {
            if (await checkTrackingAccess(req.user, session.userId._id)) {
                visibleSessions.push(session);
            }
        }

        res.status(200).json({
            success: true,
            data: visibleSessions,
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

        // Security Check
        if (!(await checkTrackingAccess(req.user, trackingSession.userId))) {
            return res.status(403).json({ success: false, message: 'Not authorized to view these breadcrumbs' });
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

        // Security Check
        if (!(await checkTrackingAccess(req.user, trackingSession.userId._id))) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this location' });
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

        // Security Check
        if (!(await checkTrackingAccess(req.user, trackingSession.userId._id))) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this summary' });
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
        const { organizationId, role, _id: userId } = req.user;

        // --- HIERARCHY LOGIC ---
        let userFilter = {};

        // 1. Admin / System Role: View All
        if (role === 'admin' || isSystemRole(role)) {
            userFilter = {};
        }
        // 2. Manager with viewLiveTracking: View Subordinates Only
        else if (req.user.hasFeature('liveTracking', 'viewLiveTracking')) {
            const subordinates = await User.find({ reportsTo: { $in: [userId] } }).select('_id');
            const subordinateIds = subordinates.map(u => u._id);
            userFilter = { userId: { $in: subordinateIds } };
        }
        // 3. Regular User: View Self Only
        else {
            userFilter = { userId: userId };
        }

        const activeSessions = await LocationTracking.find({
            organizationId,
            status: 'active',
            ...userFilter
        })
            .populate('userId', 'name email avatarUrl phone role')
            .populate('beatPlanId', 'name status schedule')
            .sort({ sessionStartedAt: -1 });

        // Filter out sessions where beat plan is completed
        // This prevents showing "active" sessions for completed beat plans
        const validSessions = activeSessions.filter(session => {
            return session.beatPlanId && session.beatPlanId.status === 'active';
        });

        // Add current location to each session
        const sessionsWithLocation = validSessions.map(session => ({
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

// @desc    Utility function to close all active tracking sessions for a beat plan
// @access  Internal use (called when beat plan is completed)
exports.closeTrackingSessionsForBeatPlan = async (beatPlanId, io = null) => {
    try {
        console.log(`🔒 Closing all active tracking sessions for beat plan: ${beatPlanId}`);

        // Find all active or paused tracking sessions for this beat plan
        const activeSessions = await LocationTracking.find({
            beatPlanId,
            status: { $in: ['active', 'paused'] },
        });

        if (activeSessions.length === 0) {
            console.log(`✅ No active tracking sessions found for beat plan: ${beatPlanId}`);
            return { closed: 0 };
        }

        const closedSessionIds = [];

        // Close each session
        for (const session of activeSessions) {
            session.status = 'completed';
            session.sessionEndedAt = new Date();

            // Calculate summary statistics
            const totalDistance = session.calculateTotalDistance();
            const durationMs = session.sessionEndedAt - session.sessionStartedAt;
            const durationMinutes = durationMs / (1000 * 60);
            const averageSpeed = durationMinutes > 0 ? (totalDistance / durationMinutes) * 60 : 0;

            session.summary.totalDistance = totalDistance;
            session.summary.totalDuration = durationMinutes;
            session.summary.averageSpeed = averageSpeed;

            await session.save();
            closedSessionIds.push(session._id);

            console.log(`✅ Closed tracking session: ${session._id} for user: ${session.userId}`);

            // Emit socket event to notify clients if io is provided
            if (io) {
                const roomName = `beatplan-${beatPlanId}`;
                io.to(roomName).emit('tracking-force-stopped', {
                    beatPlanId,
                    userId: session.userId,
                    trackingSessionId: session._id,
                    reason: 'beat_plan_completed',
                    message: 'Beat plan has been completed. Tracking session has been automatically closed.',
                    summary: session.summary,
                });
            }
        }

        console.log(`🎉 Successfully closed ${closedSessionIds.length} tracking session(s) for beat plan: ${beatPlanId}`);

        return {
            closed: closedSessionIds.length,
            sessionIds: closedSessionIds,
        };
    } catch (error) {
        console.error('❌ Error closing tracking sessions:', error);
        throw error;
    }
};
