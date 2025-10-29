const Order = require('./order-list.model');
const Party = require('../parties/party.model');
const Product = require('../product/product.model');
const mongoose = require('mongoose');

// @desc    Create a new order (from the app)
// @route   POST /api/v1/orders
// @access  Private (Salesperson)
exports.createOrder = async (req, res) => {
    // items is expected to be: [{ productId: "...", quantity: 2 }, ...]
    const { partyId, items } = req.body;

    // This guard ensures req.user exists before you try to use it.
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
    }

    const { organizationId, _id: userId } = req.user;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Get the Party details
        const party = await Party.findOne({ _id: partyId, organizationId }).session(session);
        if (!party) {
            throw new Error('Party not found in this organization.');
        }

        let totalAmount = 0;
        const orderItems = [];
        const stockUpdateOperations = [];

        // 2. Validate items and calculate total
        for (const item of items) {
            const product = await Product.findOne({
                _id: item.productId,
                organizationId: organizationId,
            }).session(session);

            // Check if product exists and has stock
            if (!product) {
                throw new Error(`Product with ID ${item.productId} not found.`);
            }
            if (product.piece < item.quantity) {
                throw new Error(`Insufficient stock for ${product.name}. Available: ${product.piece}, Requested: ${item.quantity}`);
            }

            // Add to total
            totalAmount += product.price * item.quantity;

            // Add to order items list
            orderItems.push({
                productId: product._id,
                productName: product.name,
                quantity: item.quantity,
                price: product.price, // Store price at time of purchase
            });

            // Prepare stock update
            stockUpdateOperations.push({
                updateOne: {
                    filter: { _id: product._id, organizationId: organizationId },
                    update: { $inc: { piece: -item.quantity } },
                },
            });
        }

        // 3. Update all product stock in one go
        await Product.bulkWrite(stockUpdateOperations, { session });

        // 4. Create the new order
        const newOrder = new Order({
            organizationId: organizationId,
            partyId: party._id,
            createdBy: userId,
            partyName: party.name,
            address: party.contact.address,
            panVat: party.panVat,
            items: orderItems,
            totalAmount: totalAmount,
            status: 'Pending', // Default status for a new order
        });

        await newOrder.save({ session });
        
        // 5. Commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.status(201).json({ success: true, data: newOrder });

    } catch (error) {
        // If anything fails, abort the transaction
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get all orders (for web list page)
// @route   GET /api/v1/orders
// @access  Private (All roles)
exports.getAllOrders = async (req, res) => {
    try {
        // This guard ensures req.user exists
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId } = req.user;
        
        // Base filter for the user's organization
        const filter = { organizationId: organizationId, isActive: true };

        // --- Filtering Logic ---
        // 1. Filter by panVat (for party detail page)
        if (req.query.panVat) {
            filter.panVat = req.query.panVat;
        }
        // 2. Filter by partyName (for search)
        if (req.query.partyName) {
            filter.partyName = { $regex: req.query.partyName, $options: 'i' };
        }
        // 3. Filter by orderNumber (for ID search)
        if (req.query.id) {
            filter.orderNumber = { $regex: req.query.id, $options: 'i' };
        }

        const orders = await Order.find(filter)
            .select('-items') // Don't send all items in the list view, it's too much data
            .sort({ orderDate: -1 }); // Show newest first

        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get a single order by ID (for order detail page)
// @route   GET /api/v1/orders/:id
// @access  Private (All roles)
exports.getOrderById = async (req, res) => {
    try {
        // This guard ensures req.user exists
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId } = req.user;

        const order = await Order.findOne({
            _id: req.params.id,
            organizationId: organizationId,
        }); // .populate('items.productId', 'sku'); // Optionally populate more product info

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update an order's status (for web)
// @route   PUT /api/v1/orders/:id/status
// @access  Private (Admin, Manager)
exports.updateOrderStatus = async (req, res) => {
    try {
        // This guard ensures req.user exists
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated or token expired. Please log in again.' });
        }
        const { organizationId } = req.user;
        const { status } = req.body;

        // Validate the status
        const allowedStatuses = ['Pending', 'In Progress', 'Completed', 'Rejected', 'In Transit'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value.' });
        }

        const order = await Order.findOneAndUpdate(
            {
                _id: req.params.id,
                organizationId: organizationId,
            },
            { status: status }, // Only update the status
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(44).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};