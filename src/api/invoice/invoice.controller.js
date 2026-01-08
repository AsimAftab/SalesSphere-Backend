const Invoice = require('./invoice.model');
const Party = require('../parties/party.model');
const Product = require('../product/product.model');
const Counter = require('./counter.model');
const Organization = require('../organizations/organization.model');
const User = require('../users/user.model');
const mongoose = require('mongoose');
const { z } = require('zod');
const { isSystemRole } = require('../../utils/defaultPermissions');
const { canApprove } = require('../../utils/hierarchyHelper');

// --- HELPER: Get Hierarchy Filter ---
const getInvoiceHierarchyFilter = async (user) => {
    const { role, _id: userId } = user;

    // 1. Admin / System Role: Access All
    if (role === 'admin' || isSystemRole(role)) {
        return {};
    }

    // 2. Manager with viewTeamInvoices: Access Self + Subordinates
    if (user.hasFeature('invoices', 'viewTeamInvoices')) {
        const subordinates = await User.find({ reportsTo: { $in: [userId] } }).select('_id');
        const subordinateIds = subordinates.map(u => u._id);

        return {
            $or: [
                { createdBy: userId },
                { createdBy: { $in: subordinateIds } }
            ]
        };
    }

    // 3. Regular User: Access Self Only
    return { createdBy: userId };
};

// --- Zod Validation Schema ---
const itemSchema = z.object({
    productId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), "Invalid product ID"),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    price: z.coerce.number().min(0, "Price cannot be negative").optional(),
    discount: z.coerce.number().min(0, "Discount cannot be negative").max(100, "Discount cannot exceed 100%").optional().default(0),
});

const invoiceSchemaValidation = z.object({
    partyId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), "Invalid party ID"),
    expectedDeliveryDate: z.string().refine(val => !isNaN(Date.parse(val)), "Invalid delivery date"),
    discount: z.coerce.number().min(0, "Discount cannot be negative").max(100, "Discount cannot exceed 100%").optional().default(0),
    items: z.array(itemSchema).min(1, "At least one item is required"),
});

// --- Zod Validation Schema for Estimate (same as invoice minus expectedDeliveryDate) ---
const estimateSchemaValidation = z.object({
    partyId: z.string().refine(val => mongoose.Types.ObjectId.isValid(val), "Invalid party ID"),
    discount: z.coerce.number().min(0, "Discount cannot be negative").max(100, "Discount cannot exceed 100%").optional().default(0),
    items: z.array(itemSchema).min(1, "At least one item is required"),
});

// --- HELPER: Generate Invoice Number ---
async function getNextInvoiceNumber(organizationId) {
    const seq = await Counter.getNextSequenceValue(organizationId.toString());
    const year = new Date().getFullYear();
    const formattedSeq = String(seq).padStart(4, '0');
    return `INV-${year}-${formattedSeq}`;
}

// --- HELPER: Generate Estimate Number (short random format) ---
function generateEstimateNumber() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 8; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `EST-${suffix}`;
}

// --- HELPER: Modify Stock ---
async function modifyStock(items, organizationId, session, operation = 'decrease') {
    const operations = items.map(item => {
        const update = {};
        if (operation === 'decrease') {
            update.$inc = { qty: -item.quantity };
        } else {
            update.$inc = { qty: item.quantity };
        }

        const filter = {
            _id: item.productId,
            organizationId: organizationId,
        };

        if (operation === 'decrease') {
            // Check for sufficient stock before decreasing
            filter.qty = { $gte: item.quantity };
        }

        return {
            updateOne: {
                filter: filter,
                update: update,
            }
        };
    });

    const result = await Product.bulkWrite(operations, { session: session });

    // If we tried to decrease stock and not all items were modified, it means stock was insufficient
    if (operation === 'decrease' && result.modifiedCount !== items.length) {
        throw new Error('Insufficient stock for one or more items.');
    }
}


// @desc    Create a new invoice
// @route   POST /api/v1/invoices
// @access  Private (Admin, Manager, Salesperson)
exports.createInvoice = async (req, res, next) => {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
            const { organizationId, _id: userId } = req.user;

            const validatedData = invoiceSchemaValidation.parse(req.body);
            const { partyId, expectedDeliveryDate, discount, items } = validatedData;

            const party = await Party.findOne({ _id: partyId, organizationId: organizationId }).session(session);
            if (!party) {
                throw new Error('Party not found.');
            }

            const organization = await Organization.findById(organizationId).select('name panVatNumber address phone').session(session);
            if (!organization) {
                throw new Error('Organization not found.');
            }

            const productIds = items.map(item => item.productId);
            // --- UPDATED: Fetch product 'price' as well ---
            const products = await Product.find({
                _id: { $in: productIds },
                organizationId: organizationId
            }).select('productName qty price').session(session); // <-- Added 'price'

            if (products.length !== productIds.length) {
                throw new Error('One or more products not found.');
            }

            let subtotal = 0;
            const invoiceItems = [];
            const itemsToDecrement = [];

            for (const item of items) {
                const product = products.find(p => p._id.toString() === item.productId);
                if (!product) {
                    throw new Error(`Product with ID ${item.productId} not found.`);
                }
                if (product.qty < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.productName}. Available: ${product.qty}, Requested: ${item.quantity}`);
                }

                // Use custom price OR default product price
                const priceToUse = item.price !== undefined ? item.price : product.price;
                const itemDiscount = item.discount || 0;

                // Calculate item total with discount
                const itemSubtotal = priceToUse * item.quantity;
                const itemDiscountAmount = (itemSubtotal * itemDiscount) / 100;
                const total = itemSubtotal - itemDiscountAmount;
                subtotal += total;

                invoiceItems.push({
                    productId: product._id,
                    productName: product.productName,
                    price: priceToUse,
                    quantity: item.quantity,
                    discount: itemDiscount,
                    total: total,
                });

                itemsToDecrement.push({
                    productId: item.productId,
                    quantity: item.quantity
                });
            }

            // Calculate discount amount from percentage
            const discountAmount = (subtotal * discount) / 100;
            const totalAmount = subtotal - discountAmount;

            if (totalAmount < 0) {
                throw new Error('Total amount cannot be negative after discount.');
            }

            await modifyStock(itemsToDecrement, organizationId, session, 'decrease');
            const invoiceNumber = await getNextInvoiceNumber(organizationId);

            const newInvoice = new Invoice({
                party: partyId,
                invoiceNumber: invoiceNumber,
                expectedDeliveryDate: new Date(expectedDeliveryDate),
                items: invoiceItems,
                subtotal: subtotal,
                discount: discount,
                totalAmount: totalAmount,
                status: 'pending',
                organizationId: organizationId,
                createdBy: userId,
                // Organization details (for PDF generation)
                organizationName: organization.name,
                organizationPanVatNumber: organization.panVatNumber,
                organizationAddress: organization.address,
                organizationPhone: organization.phone,
                // Party details (for PDF generation)
                partyName: party.partyName,
                partyOwnerName: party.ownerName,
                partyAddress: party.location.address,
                partyPanVatNumber: party.panVatNumber
            });

            await newInvoice.save({ session: session });
            await session.commitTransaction();

            return res.status(201).json({ success: true, data: newInvoice });

        } catch (error) {
            await session.abortTransaction();

            // Check if it's a transient transaction error (WriteConflict)
            if (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) {
                attempt++;
                console.log(`Transaction conflict detected. Retry attempt ${attempt}/${MAX_RETRIES}`);

                if (attempt < MAX_RETRIES) {
                    // Wait a bit before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                    continue; // Retry the transaction
                } else {
                    console.error("Max retries reached for invoice creation");
                    return res.status(503).json({
                        success: false,
                        message: 'Unable to create invoice due to high concurrency. Please try again.'
                    });
                }
            }

            // Handle other errors
            if (error instanceof z.ZodError) {
                return res.status(400).json({ success: false, message: "Validation failed", errors: error.format() });
            }
            if (error.message.includes('Insufficient stock')) {
                return res.status(400).json({ success: false, message: error.message });
            }
            if (error.message.includes('Party not found')) {
                return res.status(404).json({ success: false, message: error.message });
            }
            if (error.message.includes('Organization not found')) {
                return res.status(404).json({ success: false, message: error.message });
            }
            if (error.message.includes('products not found')) {
                return res.status(404).json({ success: false, message: error.message });
            }

            console.error("Error creating invoice:", error);
            return next(error);
        } finally {
            session.endSession();
        }
    }
};

// @desc    Get all invoices
exports.getAllInvoices = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        // Get hierarchy filter
        const hierarchyFilter = await getInvoiceHierarchyFilter(req.user);

        // Combine with base query
        const query = {
            organizationId: organizationId,
            isEstimate: false,
            ...hierarchyFilter
        };

        const invoices = await Invoice.find(query)
            .select('invoiceNumber partyName totalAmount status createdAt expectedDeliveryDate createdBy')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: invoices.length, data: invoices });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single invoice by ID
exports.getInvoiceById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        // Get hierarchy filter
        const hierarchyFilter = await getInvoiceHierarchyFilter(req.user);

        const query = {
            _id: req.params.id,
            organizationId: organizationId,
            ...hierarchyFilter
        };

        const invoice = await Invoice.findOne(query)
            .populate('createdBy', 'name email');

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        res.status(200).json({ success: true, data: invoice });
    } catch (error) {
        next(error);
    }
};

// // @desc    Delete an invoice (and restock items if applicable)
// // @route   DELETE /api/v1/invoices/:id
// // @access  Private (Admin, Manager)
// exports.deleteInvoice = async (req, res, next) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
//         const { organizationId } = req.user;

//         const invoice = await Invoice.findOne({
//             _id: req.params.id,
//             organizationId: organizationId
//         }).session(session);

//         if (!invoice) {
//             return res.status(404).json({ success: false, message: 'Invoice not found' });
//         }

//         const shouldRestock = ['pending', 'in progress', 'in transit'].includes(invoice.status);

//         if (shouldRestock) {
//             const itemsToRestock = invoice.items.map(item => ({
//                 productId: item.productId,
//                 quantity: item.quantity
//             }));
//              await modifyStock(itemsToRestock, organizationId, session, 'increase');
//         }

//         await invoice.deleteOne({ session: session });
//         await session.commitTransaction();

//         res.status(200).json({ 
//             success: true, 
//             message: `Invoice deleted. ${shouldRestock ? 'Stock restored.' : ''}` 
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error("Error deleting invoice:", error);
//         next(error);
//     } finally {
//         session.endSession();
//     }
// };

// @desc    Update an invoice's status
// @route   PUT /api/v1/invoices/:id/status
// @access  Private (Admin or Supervisor with approval permission)
exports.updateInvoiceStatus = async (req, res, next) => {
    const MAX_RETRIES = 3;
    let attempt = 0;

    const statusSchema = z.object({
        status: z.enum(['pending', 'in progress', 'in transit', 'completed', 'rejected']),
    });

    while (attempt < MAX_RETRIES) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
            const { organizationId, _id: userId } = req.user;

            const { status: newStatus } = statusSchema.parse(req.body);

            const invoice = await Invoice.findOne({
                _id: req.params.id,
                organizationId: organizationId
            }).populate('createdBy', 'name email reportsTo role organizationId') // Populate to check hierarchy
                .session(session);

            if (!invoice) {
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            }

            // Hierarchy & Permission Check using canApprove helper
            // This checks if approver is admin OR in the invoice creator's reportsTo array
            const authorized = canApprove(req.user, invoice.createdBy, 'invoices');

            if (!authorized) {
                await session.abortTransaction();
                return res.status(403).json({
                    success: false,
                    message: 'You are not authorized to update this invoice status. You must be the direct supervisor or an admin and have approval permission.'
                });
            }

            // Prevent self-approval (users cannot update their own invoice status)
            if (invoice.createdBy._id.toString() === userId.toString()) {
                await session.abortTransaction();
                return res.status(403).json({
                    success: false,
                    message: 'You cannot update your own invoice status'
                });
            }

            const oldStatus = invoice.status;

            if (oldStatus === newStatus) {
                await session.abortTransaction();
                return res.status(200).json({ success: true, data: invoice, message: "Status is already set." });
            }

            if (oldStatus === 'completed') {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: "Cannot change status of a 'completed' invoice."
                });
            }

            const itemsToModify = invoice.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity
            }));

            if (newStatus === 'rejected') {
                if (oldStatus !== 'rejected') {
                    await modifyStock(itemsToModify, organizationId, session, 'increase');
                }
            } else if (oldStatus === 'rejected') {
                try {
                    await modifyStock(itemsToModify, organizationId, session, 'decrease');
                } catch (stockError) {
                    throw new Error(`Cannot un-reject invoice: ${stockError.message}`);
                }
            }

            invoice.status = newStatus;
            await invoice.save({ session: session });

            await session.commitTransaction();

            return res.status(200).json({ success: true, data: invoice });

        } catch (error) {
            await session.abortTransaction();

            // Check if it's a transient transaction error (WriteConflict)
            if (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) {
                attempt++;
                console.log(`Transaction conflict detected in status update. Retry attempt ${attempt}/${MAX_RETRIES}`);

                if (attempt < MAX_RETRIES) {
                    // Wait a bit before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                    continue; // Retry the transaction
                } else {
                    console.error("Max retries reached for invoice status update");
                    return res.status(503).json({
                        success: false,
                        message: 'Unable to update invoice status due to high concurrency. Please try again.'
                    });
                }
            }

            // Handle other errors
            if (error instanceof z.ZodError) {
                return res.status(400).json({ success: false, message: "Validation failed", errors: error.format() });
            }
            if (error.message.includes('Cannot un-reject invoice')) {
                return res.status(400).json({ success: false, message: error.message });
            }
            console.error("Error updating invoice status:", error);
            return next(error);
        } finally {
            session.endSession();
        }
    }
};

// @desc    Get aggregated order statistics for all parties
// @route   GET /api/v1/invoices/parties/stats
// @access  Private (All roles)
exports.getPartiesOrderStats = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        // Build match condition based on dynamic role
        // Get hierarchy filter
        const hierarchyFilter = await getInvoiceHierarchyFilter(req.user);

        // Build match condition
        const matchCondition = {
            organizationId: organizationId,
            ...hierarchyFilter
        };

        // Aggregation pipeline to get party order statistics
        const partyStats = await Invoice.aggregate([
            {
                $match: matchCondition
            },
            {
                $group: {
                    _id: '$party',
                    partyName: { $first: '$partyName' },
                    partyOwnerName: { $first: '$partyOwnerName' },
                    partyAddress: { $first: '$partyAddress' },
                    partyPanVatNumber: { $first: '$partyPanVatNumber' },
                    totalOrders: { $sum: 1 },
                    totalAmount: { $sum: '$totalAmount' },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    inProgressOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'in progress'] }, 1, 0] }
                    },
                    inTransitOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'in transit'] }, 1, 0] }
                    },
                    completedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    rejectedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
                    },
                    lastOrderDate: { $max: '$createdAt' },
                    firstOrderDate: { $min: '$createdAt' }
                }
            },
            {
                $sort: { totalAmount: -1 } // Sort by total amount (highest first)
            },
            {
                $project: {
                    _id: 1,
                    partyName: 1,
                    partyOwnerName: 1,
                    partyAddress: 1,
                    partyPanVatNumber: 1,
                    totalOrders: 1,
                    totalAmount: 1,
                    ordersByStatus: {
                        pending: '$pendingOrders',
                        inProgress: '$inProgressOrders',
                        inTransit: '$inTransitOrders',
                        completed: '$completedOrders',
                        rejected: '$rejectedOrders'
                    },
                    lastOrderDate: 1,
                    firstOrderDate: 1
                }
            }
        ]);

        res.status(200).json({
            success: true,
            count: partyStats.length,
            data: partyStats
        });

    } catch (error) {
        console.error("Error fetching party order stats:", error);
        next(error);
    }
};

// @desc    Get aggregated order statistics for a specific party
// @route   GET /api/v1/invoices/parties/:partyId/stats
// @access  Private (All roles)
exports.getPartyOrderStats = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;
        const { partyId } = req.params;

        // Validate partyId
        if (!mongoose.Types.ObjectId.isValid(partyId)) {
            return res.status(400).json({ success: false, message: 'Invalid party ID' });
        }

        // Build match condition based on dynamic role
        // Get hierarchy filter
        const hierarchyFilter = await getInvoiceHierarchyFilter(req.user);

        // Build match condition
        const matchCondition = {
            organizationId: organizationId,
            party: new mongoose.Types.ObjectId(partyId),
            ...hierarchyFilter
        };

        // Aggregation pipeline for specific party
        const partyStats = await Invoice.aggregate([
            {
                $match: matchCondition
            },
            {
                $facet: {
                    summary: [
                        {
                            $group: {
                                _id: '$party',
                                partyName: { $first: '$partyName' },
                                partyOwnerName: { $first: '$partyOwnerName' },
                                partyAddress: { $first: '$partyAddress' },
                                partyPanVatNumber: { $first: '$partyPanVatNumber' },
                                totalOrders: { $sum: 1 },
                                totalAmount: { $sum: '$totalAmount' },
                                totalDiscount: { $sum: '$discount' },
                                pendingOrders: {
                                    $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                                },
                                inProgressOrders: {
                                    $sum: { $cond: [{ $eq: ['$status', 'in progress'] }, 1, 0] }
                                },
                                inTransitOrders: {
                                    $sum: { $cond: [{ $eq: ['$status', 'in transit'] }, 1, 0] }
                                },
                                completedOrders: {
                                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                                },
                                rejectedOrders: {
                                    $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
                                },
                                lastOrderDate: { $max: '$createdAt' },
                                firstOrderDate: { $min: '$createdAt' }
                            }
                        }
                    ],
                    allOrders: [
                        { $sort: { createdAt: -1 } },
                        {
                            $project: {
                                _id: 1,
                                invoiceNumber: 1,
                                totalAmount: 1,
                                status: 1,
                                expectedDeliveryDate: 1
                            }
                        }
                    ]
                }
            }
        ]);

        if (!partyStats[0].summary.length) {
            return res.status(404).json({
                success: false,
                message: 'No orders found for this party'
            });
        }

        const result = {
            summary: partyStats[0].summary[0],
            allOrders: partyStats[0].allOrders
        };

        // Format the summary
        result.summary.ordersByStatus = {
            pending: result.summary.pendingOrders,
            inProgress: result.summary.inProgressOrders,
            inTransit: result.summary.inTransitOrders,
            completed: result.summary.completedOrders,
            rejected: result.summary.rejectedOrders
        };

        // Remove individual status fields
        delete result.summary.pendingOrders;
        delete result.summary.inProgressOrders;
        delete result.summary.inTransitOrders;
        delete result.summary.completedOrders;
        delete result.summary.rejectedOrders;

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error("Error fetching party order stats:", error);
        next(error);
    }
};

// ============================================
// ESTIMATE ENDPOINTS
// ============================================

// @desc    Create a new estimate (no stock deduction)
// @route   POST /api/v1/invoices/estimates
// @access  Private (Admin, Manager, Salesperson)
exports.createEstimate = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        const validatedData = estimateSchemaValidation.parse(req.body);
        const { partyId, discount, items } = validatedData;

        // Fetch party
        const party = await Party.findOne({ _id: partyId, organizationId: organizationId });
        if (!party) {
            return res.status(404).json({ success: false, message: 'Party not found.' });
        }

        // Fetch organization
        const organization = await Organization.findById(organizationId).select('name panVatNumber address phone');
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found.' });
        }

        // Fetch products
        const productIds = items.map(item => item.productId);
        const products = await Product.find({
            _id: { $in: productIds },
            organizationId: organizationId
        }).select('productName price');

        if (products.length !== productIds.length) {
            return res.status(404).json({ success: false, message: 'One or more products not found.' });
        }

        let subtotal = 0;
        const estimateItems = [];

        for (const item of items) {
            const product = products.find(p => p._id.toString() === item.productId);
            if (!product) {
                return res.status(404).json({ success: false, message: `Product with ID ${item.productId} not found.` });
            }

            const priceToUse = item.price !== undefined ? item.price : product.price;
            const itemDiscount = item.discount || 0;

            // Calculate item total with discount
            const itemSubtotal = priceToUse * item.quantity;
            const itemDiscountAmount = (itemSubtotal * itemDiscount) / 100;
            const total = itemSubtotal - itemDiscountAmount;
            subtotal += total;

            estimateItems.push({
                productId: product._id,
                productName: product.productName,
                price: priceToUse,
                quantity: item.quantity,
                discount: itemDiscount,
                total: total,
            });
        }

        const discountAmount = (subtotal * discount) / 100;
        const totalAmount = subtotal - discountAmount;

        if (totalAmount < 0) {
            return res.status(400).json({ success: false, message: 'Total amount cannot be negative after discount.' });
        }

        const estimateNumber = generateEstimateNumber();

        const newEstimate = await Invoice.create({
            party: partyId,
            isEstimate: true,
            estimateNumber: estimateNumber,
            items: estimateItems,
            subtotal: subtotal,
            discount: discount,
            totalAmount: totalAmount,
            organizationId: organizationId,
            createdBy: userId,
            // Organization details
            organizationName: organization.name,
            organizationPanVatNumber: organization.panVatNumber,
            organizationAddress: organization.address,
            organizationPhone: organization.phone,
            // Party details
            partyName: party.partyName,
            partyOwnerName: party.ownerName,
            partyAddress: party.location?.address || '',
            partyPanVatNumber: party.panVatNumber
        });

        return res.status(201).json({ success: true, data: newEstimate });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.format() });
        }
        console.error("Error creating estimate:", error);
        return next(error);
    }
};

// @desc    Get all estimates
// @route   GET /api/v1/invoices/estimates
// @access  Private
exports.getAllEstimates = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = { organizationId: organizationId, isEstimate: true };

        // Dynamic role filtering:
        // - System roles and org admin: see all org data
        // - Regular users: see own + subordinates' data only estimates
        if (role !== 'admin' && !isSystemRole(role)) {
            // Find direct subordinates (reportsTo is now an array)
            const subordinates = await User.find({ reportsTo: { $in: [userId] } }).select('_id');
            const subordinateIds = subordinates.map(u => u._id);

            // Show Own estimates OR Subordinate estimates
            query.$or = [
                { createdBy: userId },
                { createdBy: { $in: subordinateIds } }
            ];
        }

        const estimates = await Invoice.find(query)
            .select('estimateNumber partyName totalAmount createdAt createdBy')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: estimates.length, data: estimates });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single estimate by ID
// @route   GET /api/v1/invoices/estimates/:id
// @access  Private
exports.getEstimateById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, role, _id: userId } = req.user;

        const query = {
            _id: req.params.id,
            organizationId: organizationId,
            isEstimate: true
        };

        // Dynamic role filtering: non-system users can only see own or subordinates' estimates
        if (role !== 'admin' && !isSystemRole(role)) {
            // Find direct subordinates (reportsTo is now an array)
            const subordinates = await User.find({ reportsTo: { $in: [userId] } }).select('_id');
            const subordinateIds = subordinates.map(u => u._id);

            query.$or = [
                { createdBy: userId },
                { createdBy: { $in: subordinateIds } }
            ];
        }

        const estimate = await Invoice.findOne(query)
            .populate('createdBy', 'name email');

        if (!estimate) {
            return res.status(404).json({ success: false, message: 'Estimate not found' });
        }

        res.status(200).json({ success: true, data: estimate });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete an estimate
// @route   DELETE /api/v1/invoices/estimates/:id
// @access  Private (Admin, Manager)
exports.deleteEstimate = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const estimate = await Invoice.findOneAndDelete({
            _id: req.params.id,
            organizationId: organizationId,
            isEstimate: true
        });

        if (!estimate) {
            return res.status(404).json({ success: false, message: 'Estimate not found' });
        }

        res.status(200).json({ success: true, message: 'Estimate deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Bulk delete estimates
// @route   DELETE /api/v1/invoices/estimates/bulk-delete
// @access  Private (Admin, Manager)
exports.bulkDeleteEstimates = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // 1. Validate request body
        const { estimateIds } = req.body;

        if (!estimateIds || !Array.isArray(estimateIds) || estimateIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'estimateIds array is required and must not be empty'
            });
        }

        // 2. Limit the number of estimates that can be deleted at once
        if (estimateIds.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 100 estimates can be deleted at once'
            });
        }

        // 3. Find all estimates matching the IDs and belonging to this organization
        const estimates = await Invoice.find({
            _id: { $in: estimateIds },
            organizationId: organizationId,
            isEstimate: true
        });

        if (estimates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No estimates found matching the provided IDs'
            });
        }

        // 4. Delete estimates from database
        const deleteResult = await Invoice.deleteMany({
            _id: { $in: estimates.map(e => e._id) },
            organizationId: organizationId,
            isEstimate: true
        });

        // 5. Prepare response
        const notFoundIds = estimateIds.filter(
            id => !estimates.some(e => e._id.toString() === id)
        );

        res.status(200).json({
            success: true,
            message: 'Bulk delete completed',
            data: {
                totalRequested: estimateIds.length,
                estimatesDeleted: deleteResult.deletedCount,
                notFound: notFoundIds.length,
                notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
            }
        });
    } catch (error) {
        console.error("Error in bulk delete estimates:", error);
        next(error);
    }
};

// @desc    Convert an estimate to an invoice (deducts stock, generates invoice number)
// @route   POST /api/v1/invoices/estimates/:id/convert
// @access  Private (Anyone with estimates:convertToInvoice feature permission)
exports.convertEstimateToInvoice = async (req, res, next) => {
    const MAX_RETRIES = 3;
    let attempt = 0;

    const convertSchema = z.object({
        expectedDeliveryDate: z.string().refine(val => !isNaN(Date.parse(val)), "Invalid delivery date"),
    });

    while (attempt < MAX_RETRIES) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
            const { organizationId } = req.user;

            const { expectedDeliveryDate } = convertSchema.parse(req.body);

            // Find the estimate
            const estimate = await Invoice.findOne({
                _id: req.params.id,
                organizationId: organizationId,
                isEstimate: true
            }).session(session);

            if (!estimate) {
                await session.abortTransaction();
                return res.status(404).json({ success: false, message: 'Estimate not found' });
            }

            // Check stock availability for all items
            const productIds = estimate.items.map(item => item.productId);
            const products = await Product.find({
                _id: { $in: productIds },
                organizationId: organizationId
            }).select('productName qty').session(session);

            for (const item of estimate.items) {
                const product = products.find(p => p._id.toString() === item.productId.toString());
                if (!product) {
                    throw new Error(`Product ${item.productName} not found.`);
                }
                if (product.qty < item.quantity) {
                    throw new Error(`Insufficient stock for ${item.productName}. Available: ${product.qty}, Required: ${item.quantity}`);
                }
            }

            // Deduct stock
            const itemsToDecrement = estimate.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity
            }));
            await modifyStock(itemsToDecrement, organizationId, session, 'decrease');

            // Generate invoice number
            const invoiceNumber = await getNextInvoiceNumber(organizationId);

            // Convert estimate to invoice
            estimate.isEstimate = false;
            estimate.invoiceNumber = invoiceNumber;
            estimate.expectedDeliveryDate = new Date(expectedDeliveryDate);
            estimate.status = 'pending';

            await estimate.save({ session: session });
            await session.commitTransaction();

            return res.status(200).json({
                success: true,
                message: 'Estimate converted to invoice successfully',
                data: estimate
            });

        } catch (error) {
            await session.abortTransaction();

            if (error.errorLabels && error.errorLabels.includes('TransientTransactionError')) {
                attempt++;
                console.log(`Transaction conflict in convert. Retry attempt ${attempt}/${MAX_RETRIES}`);

                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                    continue;
                } else {
                    return res.status(503).json({
                        success: false,
                        message: 'Unable to convert estimate due to high concurrency. Please try again.'
                    });
                }
            }

            if (error instanceof z.ZodError) {
                return res.status(400).json({ success: false, message: "Validation failed", errors: error.format() });
            }
            if (error.message.includes('Insufficient stock')) {
                return res.status(400).json({ success: false, message: error.message });
            }
            console.error("Error converting estimate:", error);
            return next(error);
        } finally {
            session.endSession();
        }
    }
};
