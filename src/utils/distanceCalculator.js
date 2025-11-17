/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 *
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} - Distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    // Validate inputs
    if (!lat1 || !lon1 || !lat2 || !lon2) {
        return null;
    }

    const R = 6371; // Radius of the Earth in kilometers

    // Convert degrees to radians
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in kilometers

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
};

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number}
 */
const toRadians = (degrees) => {
    return degrees * (Math.PI / 180);
};

/**
 * Calculate total distance for a route (array of coordinates)
 * @param {Array} coordinates - Array of {latitude, longitude} objects
 * @returns {number} - Total distance in kilometers
 */
const calculateRouteDistance = (coordinates) => {
    if (!coordinates || coordinates.length < 2) {
        return 0;
    }

    let totalDistance = 0;

    for (let i = 0; i < coordinates.length - 1; i++) {
        const curr = coordinates[i];
        const next = coordinates[i + 1];

        if (curr.latitude && curr.longitude && next.latitude && next.longitude) {
            const distance = calculateDistance(
                curr.latitude,
                curr.longitude,
                next.latitude,
                next.longitude
            );

            if (distance !== null) {
                totalDistance += distance;
            }
        }
    }

    return Math.round(totalDistance * 100) / 100; // Round to 2 decimal places
};

/**
 * Optimize route using nearest neighbor algorithm (greedy approach)
 * Starts from the first party and always visits the nearest unvisited party next
 *
 * @param {Array} parties - Array of party objects with location {latitude, longitude}
 * @param {Object} startLocation - Optional starting location {latitude, longitude}
 * @returns {Object} - Optimized route with ordered parties and total distance
 */
const optimizeRoute = (parties, startLocation = null) => {
    if (!parties || parties.length === 0) {
        return {
            optimizedParties: [],
            totalDistance: 0,
            originalDistance: 0
        };
    }

    if (parties.length === 1) {
        return {
            optimizedParties: parties,
            totalDistance: 0,
            originalDistance: 0
        };
    }

    // Calculate original route distance
    const originalCoordinates = parties
        .filter(p => p.location?.latitude && p.location?.longitude)
        .map(p => ({
            latitude: p.location.latitude,
            longitude: p.location.longitude
        }));
    const originalDistance = calculateRouteDistance(originalCoordinates);

    // Filter parties that have valid locations
    const validParties = parties.filter(p => p.location?.latitude && p.location?.longitude);
    const invalidParties = parties.filter(p => !p.location?.latitude || !p.location?.longitude);

    if (validParties.length === 0) {
        return {
            optimizedParties: parties,
            totalDistance: 0,
            originalDistance: 0
        };
    }

    const optimizedParties = [];
    const unvisited = [...validParties];

    // Determine starting point
    let currentLocation = startLocation;

    // If no start location provided, use the first party as starting point
    if (!currentLocation) {
        const firstParty = unvisited.shift();
        optimizedParties.push(firstParty);
        currentLocation = {
            latitude: firstParty.location.latitude,
            longitude: firstParty.location.longitude
        };
    }

    // Greedy nearest neighbor algorithm
    while (unvisited.length > 0) {
        let nearestIndex = 0;
        let nearestDistance = Infinity;

        // Find the nearest unvisited party
        for (let i = 0; i < unvisited.length; i++) {
            const party = unvisited[i];
            const distance = calculateDistance(
                currentLocation.latitude,
                currentLocation.longitude,
                party.location.latitude,
                party.location.longitude
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }

        // Add nearest party to optimized route
        const nearestParty = unvisited.splice(nearestIndex, 1)[0];
        optimizedParties.push(nearestParty);

        // Update current location
        currentLocation = {
            latitude: nearestParty.location.latitude,
            longitude: nearestParty.location.longitude
        };
    }

    // Add parties without location at the end
    optimizedParties.push(...invalidParties);

    // Calculate optimized route distance
    const optimizedCoordinates = optimizedParties
        .filter(p => p.location?.latitude && p.location?.longitude)
        .map(p => ({
            latitude: p.location.latitude,
            longitude: p.location.longitude
        }));
    const optimizedDistance = calculateRouteDistance(optimizedCoordinates);

    return {
        optimizedParties,
        totalDistance: optimizedDistance,
        originalDistance: originalDistance,
        distanceSaved: Math.round((originalDistance - optimizedDistance) * 100) / 100
    };
};

module.exports = {
    calculateDistance,
    calculateRouteDistance,
    optimizeRoute
};
