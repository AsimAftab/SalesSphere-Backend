const Product = require('./product.model');
const mongoose = require('mongoose');

// @desc    Create a new product (matches addProduct)
// @route   POST /api/v1/products
// @access  Private (Admin, Manager)
exports.createProduct = async (req, res) => {
    try {
        const { organizationId, _id: userId } = req.user;
        const { name, description, price, sku, piece, imageUrl, category } = req.body;

        const newProduct = await Product.create({
            name,
            description,
            price,
            sku,
            piece,
            imageUrl,
            category,
            organizationId: organizationId, // Set organization from logged-in user
            createdBy: userId,              // Set creator from logged-in user
        });

        res.status(201).json({ success: true, data: newProduct });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get all products (matches getProducts)
// @route   GET /api/v1/products
// @access  Private (All roles)
exports.getAllProducts = async (req, res) => {
    try {
        const { organizationId } = req.user;

        // Find only active products for the user's organization
        const products = await Product.find({
            organizationId: organizationId,
            isActive: true
        });

        res.status(200).json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get a single product by ID
// @route   GET /api/v1/products/:id
// @access  Private (All roles)
exports.getProductById = async (req, res) => {
    try {
        const { organizationId } = req.user;

        const product = await Product.findOne({
            _id: req.params.id,
            organizationId: organizationId, // Security check
            isActive: true
        });

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update a product (matches updateProduct)
// @route   PUT /api/v1/products/:id
// @access  Private (Admin, Manager)
exports.updateProduct = async (req, res) => {
    try {
        const { organizationId } = req.user;

        // Whitelist fields that are allowed to be updated
        const allowedUpdates = ['name', 'description', 'price', 'sku', 'piece', 'imageUrl', 'category'];
        const updateData = {};

        for (const field of allowedUpdates) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                updateData[field] = req.body[field];
            }
        }

        const product = await Product.findOneAndUpdate(
            {
                _id: req.params.id,
                organizationId: organizationId // Ensure it's in their org
            },
            updateData,
            { new: true, runValidators: true } // Return updated doc & run schema validators
        );

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Deactivate a product (matches deleteProduct)
// @route   DELETE /api/v1/products/:id
// @access  Private (Admin, Manager)
exports.deleteProduct = async (req, res) => {
    try {
        const { organizationId } = req.user;

        const product = await Product.findOneAndUpdate(
            {
                _id: req.params.id,
                organizationId: organizationId
            }
        );

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, message: 'Product deactivated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Bulk update/create products (matches bulkUpdateProducts)
// @route   POST /api/v1/products/bulk-update
// @access  Private (Admin, Manager)
exports.bulkUpdateProducts = async (req, res) => {
    const productsToUpdate = req.body; // Expects an array of products
    if (!Array.isArray(productsToUpdate)) {
        return res.status(400).json({ success: false, message: 'Request body must be an array of products' });
    }
    
    const { organizationId, _id: userId } = req.user;
    const session = await mongoose.startSession();
    session.startTransaction();
    const updatedProductsList = [];

    try {
        for (const productData of productsToUpdate) {
            // Find existing product by name (case-insensitive) within the org
            // Uses the index from product.model.js
            const existingProduct = await Product.findOne({
                name: { $regex: new RegExp(`^${productData.name}$`, 'i') },
                organizationId: organizationId
            }).session(session);

            if (existingProduct) {
                // If found, update its piece count
                existingProduct.piece += (productData.piece || 0);
                await existingProduct.save({ session });
                updatedProductsList.push(existingProduct);
            } else {
                // If not found, create it
                const newProduct = new Product({
                    name: productData.name,
                    category: productData.category || 'Uncategorized',
                    price: productData.price || 0,
                    piece: productData.piece || 0,
                    imageUrl: productData.imageUrl || 'https://placehold.co/40x40/cccccc/ffffff?text=N/A',
                    organizationId: organizationId,
                    createdBy: userId,
                });
                await newProduct.save({ session });
                updatedProductsList.push(newProduct);
            }
        }

        await session.commitTransaction();
        session.endSession();
        // Return the list of updated/created products
        res.status(200).json({ success: true, data: updatedProductsList });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Decrease stock for multiple products (matches decreaseProductStock)
// @route   POST /api/v1/products/decrease-stock
// @access  Private (All roles - e.g., for placing orders)
exports.decreaseProductStock = async (req, res) => {
    // Expects an array of { productId: string; quantity: number }
    const items = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Request body must be an array of items' });
    }

    const { organizationId } = req.user;

    try {
        // Create an array of bulk write operations
        const operations = items.map(item => ({
            updateOne: {
                filter: {
                    _id: item.productId,
                    organizationId: organizationId, // Security check
                    piece: { $gte: item.quantity } // IMPORTANT: Check for sufficient stock
                },
                update: {
                    $inc: { piece: -item.quantity } // Decrement the 'piece' field atomically
                }
            }
        }));

        const result = await Product.bulkWrite(operations);

        // Check if all requested updates were successful
        if (result.modifiedCount !== items.length) {
            // This means one or more items failed, likely due to insufficient stock.
            console.warn(`Stock decrease: ${items.length} items requested, ${result.modifiedCount} items modified.`);
        }

        res.status(200).json({ success: true, message: 'Stock updated successfully', data: result });

    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

