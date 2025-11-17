const jwt = require('jsonwebtoken');
const User = require('../../users/user.model');
const LocationTracking = require('./tracking.model');
const BeatPlan = require('../beat-plan.model');
const { calculateDistance } = require('../../../utils/distanceCalculator');
const cookie = require('cookie'); // For parsing cookies from web clients

// Store active tracking sessions
const activeSessions = new Map(); // beatPlanId -> { userId, socketId, organizationId }

/**
 * Initialize WebSocket handlers for beat plan tracking
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
const initializeTrackingSocket = (io) => {
    // Use the default namespace (/) since the path is already /api/tracking
    const trackingNamespace = io;

    // Middleware: Authenticate socket connections
    trackingNamespace.use(async (socket, next) => {
        try {
            console.log('🔌 New WebSocket connection attempt from:', socket.handshake.address);
            console.log('🔧 Transport:', socket.conn.transport.name);
            console.log('🌐 Origin:', socket.handshake.headers.origin);

            let token = null;

            // 1. Check for auth payload (for mobile apps)
            if (socket.handshake.auth.token) {
                token = socket.handshake.auth.token;
                console.log('🔐 Token found in auth payload (mobile client)');
            }
            // 2. Check for Authorization header (alternative mobile method)
            else if (socket.handshake.headers.authorization) {
                token = socket.handshake.headers.authorization.split(' ')[1];
                console.log('🔐 Token found in Authorization header');
            }
            // 3. Check for httpOnly cookie (for web app)
            else if (socket.handshake.headers.cookie) {
                const cookies = cookie.parse(socket.handshake.headers.cookie);
                token = cookies.token; // Your auth cookie name
                if (token) {
                    console.log('🍪 Token found in cookies (web client)');
                }
            }

            if (!token) {
                console.log('❌ No token found in auth payload, headers, or cookies');
                return next(new Error('Authentication token required'));
            }

            console.log('🔐 Verifying token...');

            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');

            if (!user) {
                console.log('❌ User not found for decoded token ID:', decoded.id);
                return next(new Error('User not found'));
            }

            console.log('✅ User authenticated:', user.name, user.email);

            // Attach user to socket
            socket.user = user;
            next();
        } catch (error) {
            console.error('❌ Socket authentication error:', error.message);
            next(new Error('Invalid or expired token'));
        }
    });

    trackingNamespace.on('connection', (socket) => {
        console.log(`✅ Client connected to tracking: ${socket.id}, User: ${socket.user.name}`);

        // Event: Start tracking a beat plan
        socket.on('start-tracking', async (data) => {
            try {
                const { beatPlanId } = data;
                const userId = socket.user._id;
                const organizationId = socket.user.organizationId;

                console.log(`🚀 Start tracking request: BeatPlan ${beatPlanId} by User ${userId}`);

                // Verify beat plan exists and user is assigned
                const beatPlan = await BeatPlan.findOne({
                    _id: beatPlanId,
                    organizationId,
                    employees: userId,
                });

                if (!beatPlan) {
                    return socket.emit('tracking-error', {
                        message: 'Beat plan not found or you are not assigned to it',
                    });
                }

                // Check if tracking session already exists
                let trackingSession = await LocationTracking.findOne({
                    beatPlanId,
                    userId,
                    status: 'active',
                });

                if (!trackingSession) {
                    // Create new tracking session
                    trackingSession = await LocationTracking.create({
                        beatPlanId,
                        userId,
                        organizationId,
                        sessionStartedAt: new Date(),
                        status: 'active',
                        locations: [],
                    });
                }

                // Join room for this beat plan
                const roomName = `beatplan-${beatPlanId}`;
                socket.join(roomName);

                // Store active session
                activeSessions.set(beatPlanId.toString(), {
                    userId: userId.toString(),
                    socketId: socket.id,
                    organizationId: organizationId.toString(),
                    trackingSessionId: trackingSession._id.toString(),
                });

                socket.emit('tracking-started', {
                    success: true,
                    trackingSessionId: trackingSession._id,
                    beatPlanId,
                    message: 'Tracking started successfully',
                });

                // Notify web clients that tracking has started
                trackingNamespace.to(roomName).emit('tracking-status-update', {
                    beatPlanId,
                    userId,
                    status: 'active',
                    trackingSessionId: trackingSession._id,
                });

                console.log(`✅ Tracking started for BeatPlan ${beatPlanId}`);
            } catch (error) {
                console.error('Error starting tracking:', error);
                socket.emit('tracking-error', {
                    message: 'Failed to start tracking',
                    error: error.message,
                });
            }
        });

        // Event: Update location in real-time
        socket.on('update-location', async (data) => {
            try {
                const { beatPlanId, latitude, longitude, accuracy, speed, heading, address } = data;
                const userId = socket.user._id;

                // Validate location data
                if (!beatPlanId || latitude == null || longitude == null) {
                    return socket.emit('tracking-error', {
                        message: 'Invalid location data',
                    });
                }

                // Find active tracking session
                const trackingSession = await LocationTracking.findOne({
                    beatPlanId,
                    userId,
                    status: 'active',
                });

                if (!trackingSession) {
                    return socket.emit('tracking-error', {
                        message: 'No active tracking session found',
                    });
                }

                // Get beat plan to find nearest directory
                const beatPlan = await BeatPlan.findById(beatPlanId)
                    .populate('parties', 'partyName location')
                    .populate('sites', 'siteName location')
                    .populate('prospects', 'prospectName location');

                // Find nearest directory
                let nearestDirectory = null;
                let minDistance = Infinity;

                // Check all directories
                const allDirectories = [
                    ...beatPlan.parties.map(p => ({ ...p.toObject(), type: 'party', name: p.partyName })),
                    ...beatPlan.sites.map(s => ({ ...s.toObject(), type: 'site', name: s.siteName })),
                    ...beatPlan.prospects.map(pr => ({ ...pr.toObject(), type: 'prospect', name: pr.prospectName })),
                ];

                for (const directory of allDirectories) {
                    if (directory.location?.latitude && directory.location?.longitude) {
                        const distance = calculateDistance(
                            latitude,
                            longitude,
                            directory.location.latitude,
                            directory.location.longitude
                        );

                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestDirectory = {
                                directoryId: directory._id,
                                directoryType: directory.type,
                                distance: distance,
                                name: directory.name,
                            };
                        }
                    }
                }

                // Add location to tracking session
                const locationEntry = {
                    latitude,
                    longitude,
                    accuracy: accuracy || null,
                    speed: speed || null,
                    heading: heading || null,
                    timestamp: new Date(),
                };

                // Add address if provided by mobile app
                if (address) {
                    locationEntry.address = {
                        formattedAddress: address.formattedAddress || null,
                        street: address.street || null,
                        city: address.city || null,
                        state: address.state || null,
                        country: address.country || null,
                        postalCode: address.postalCode || null,
                        locality: address.locality || null,
                    };
                }

                if (nearestDirectory) {
                    locationEntry.nearestDirectory = {
                        directoryId: nearestDirectory.directoryId,
                        directoryType: nearestDirectory.directoryType,
                        name: nearestDirectory.name,
                        distance: nearestDirectory.distance,
                    };
                }

                trackingSession.locations.push(locationEntry);

                // Update current location
                trackingSession.currentLocation = {
                    latitude,
                    longitude,
                    accuracy: accuracy || null,
                    timestamp: new Date(),
                };

                // Add address to current location if provided
                if (address) {
                    trackingSession.currentLocation.address = {
                        formattedAddress: address.formattedAddress || null,
                        street: address.street || null,
                        city: address.city || null,
                        state: address.state || null,
                        country: address.country || null,
                        postalCode: address.postalCode || null,
                        locality: address.locality || null,
                    };
                }

                await trackingSession.save();

                // Broadcast location update to all clients watching this beat plan
                const roomName = `beatplan-${beatPlanId}`;
                trackingNamespace.to(roomName).emit('location-update', {
                    beatPlanId,
                    userId,
                    location: {
                        latitude,
                        longitude,
                        accuracy,
                        speed,
                        heading,
                        timestamp: new Date(),
                        address: address || null, // Include address for web clients
                    },
                    nearestDirectory: nearestDirectory ? {
                        id: nearestDirectory.directoryId,
                        type: nearestDirectory.directoryType,
                        name: nearestDirectory.name,
                        distance: nearestDirectory.distance,
                    } : null,
                });

                console.log(`📍 Location updated for BeatPlan ${beatPlanId}: ${latitude}, ${longitude}${address ? ` - ${address.formattedAddress}` : ''}`);
            } catch (error) {
                console.error('Error updating location:', error);
                socket.emit('tracking-error', {
                    message: 'Failed to update location',
                    error: error.message,
                });
            }
        });

        // Event: Pause tracking
        socket.on('pause-tracking', async (data) => {
            try {
                const { beatPlanId } = data;
                const userId = socket.user._id;

                const trackingSession = await LocationTracking.findOne({
                    beatPlanId,
                    userId,
                    status: 'active',
                });

                if (trackingSession) {
                    trackingSession.status = 'paused';
                    await trackingSession.save();

                    const roomName = `beatplan-${beatPlanId}`;
                    trackingNamespace.to(roomName).emit('tracking-status-update', {
                        beatPlanId,
                        userId,
                        status: 'paused',
                    });

                    socket.emit('tracking-paused', {
                        success: true,
                        message: 'Tracking paused',
                    });
                }
            } catch (error) {
                console.error('Error pausing tracking:', error);
                socket.emit('tracking-error', {
                    message: 'Failed to pause tracking',
                    error: error.message,
                });
            }
        });

        // Event: Resume tracking
        socket.on('resume-tracking', async (data) => {
            try {
                const { beatPlanId } = data;
                const userId = socket.user._id;

                const trackingSession = await LocationTracking.findOne({
                    beatPlanId,
                    userId,
                    status: 'paused',
                });

                if (trackingSession) {
                    trackingSession.status = 'active';
                    await trackingSession.save();

                    const roomName = `beatplan-${beatPlanId}`;
                    trackingNamespace.to(roomName).emit('tracking-status-update', {
                        beatPlanId,
                        userId,
                        status: 'active',
                    });

                    socket.emit('tracking-resumed', {
                        success: true,
                        message: 'Tracking resumed',
                    });
                }
            } catch (error) {
                console.error('Error resuming tracking:', error);
                socket.emit('tracking-error', {
                    message: 'Failed to resume tracking',
                    error: error.message,
                });
            }
        });

        // Event: Stop tracking
        socket.on('stop-tracking', async (data) => {
            try {
                const { beatPlanId } = data;
                const userId = socket.user._id;

                const trackingSession = await LocationTracking.findOne({
                    beatPlanId,
                    userId,
                    status: { $in: ['active', 'paused'] },
                });

                if (trackingSession) {
                    trackingSession.status = 'completed';
                    trackingSession.sessionEndedAt = new Date();

                    // Calculate summary statistics
                    const totalDistance = trackingSession.calculateTotalDistance();
                    const durationMs = trackingSession.sessionEndedAt - trackingSession.sessionStartedAt;
                    const durationMinutes = durationMs / (1000 * 60);
                    const averageSpeed = durationMinutes > 0 ? (totalDistance / durationMinutes) * 60 : 0;

                    trackingSession.summary.totalDistance = totalDistance;
                    trackingSession.summary.totalDuration = durationMinutes;
                    trackingSession.summary.averageSpeed = averageSpeed;

                    await trackingSession.save();

                    // Remove from active sessions
                    activeSessions.delete(beatPlanId.toString());

                    const roomName = `beatplan-${beatPlanId}`;
                    trackingNamespace.to(roomName).emit('tracking-status-update', {
                        beatPlanId,
                        userId,
                        status: 'completed',
                        summary: trackingSession.summary,
                    });

                    socket.emit('tracking-stopped', {
                        success: true,
                        summary: trackingSession.summary,
                        message: 'Tracking stopped successfully',
                    });

                    // Leave the room
                    socket.leave(roomName);
                }
            } catch (error) {
                console.error('Error stopping tracking:', error);
                socket.emit('tracking-error', {
                    message: 'Failed to stop tracking',
                    error: error.message,
                });
            }
        });

        // Event: Web client wants to watch a beat plan
        socket.on('watch-beatplan', async (data) => {
            try {
                const { beatPlanId } = data;
                const organizationId = socket.user.organizationId;

                // Verify user has access to this beat plan
                const beatPlan = await BeatPlan.findOne({
                    _id: beatPlanId,
                    organizationId,
                });

                if (!beatPlan) {
                    return socket.emit('tracking-error', {
                        message: 'Beat plan not found or access denied',
                    });
                }

                // Join the room to receive updates
                const roomName = `beatplan-${beatPlanId}`;
                socket.join(roomName);

                // Send current tracking status
                const activeSession = await LocationTracking.findOne({
                    beatPlanId,
                    status: 'active',
                }).populate('userId', 'name email avatarUrl');

                socket.emit('watch-started', {
                    success: true,
                    beatPlanId,
                    activeSession: activeSession ? {
                        trackingSessionId: activeSession._id,
                        user: activeSession.userId,
                        currentLocation: activeSession.currentLocation,
                        sessionStartedAt: activeSession.sessionStartedAt,
                        locationsCount: activeSession.locations.length,
                    } : null,
                });

                console.log(`👀 Web client watching BeatPlan ${beatPlanId}`);
            } catch (error) {
                console.error('Error watching beat plan:', error);
                socket.emit('tracking-error', {
                    message: 'Failed to watch beat plan',
                    error: error.message,
                });
            }
        });

        // Event: Stop watching a beat plan
        socket.on('unwatch-beatplan', (data) => {
            const { beatPlanId } = data;
            const roomName = `beatplan-${beatPlanId}`;
            socket.leave(roomName);
            console.log(`👋 Client stopped watching BeatPlan ${beatPlanId}`);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`❌ Client disconnected from tracking: ${socket.id}`);
            // Clean up active sessions if needed
            for (const [beatPlanId, session] of activeSessions.entries()) {
                if (session.socketId === socket.id) {
                    console.log(`🧹 Cleaning up session for BeatPlan ${beatPlanId}`);
                    // Note: We don't automatically stop tracking on disconnect
                    // The mobile app should explicitly stop tracking
                }
            }
        });
    });

    console.log('📡 Beat Plan Tracking WebSocket initialized');
    return trackingNamespace;
};

module.exports = { initializeTrackingSocket, activeSessions };
