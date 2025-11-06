const Product = require('./product.model');
const Category = require('../product/category/category.model.js');
const Organization = require('../organizations/organization.model.js');
const { z } = require('zod');
const cloudinary = require('../../config/cloudinary');
const fs = require('fs');

// --- Zod Validation Schema ---
const productSchemaValidation = z.object({
    productName: z.string({ required_error: "Product name is required" }).min(1, "Product name is required"),
    category: z.string({ required_error: "Category is required" }).min(1, "Category is required"),
    price: z.coerce.number({ required_error: "Price is required" }).min(0, "Price cannot be negative"),
    qty: z.coerce.number({ required_error: "Quantity is required" }).min(0, "Quantity cannot be negative"),
    // --- NEW FIELD ---
    serialNo: z.string().optional().nullable(),
    // --- END NEW FIELD ---
});

// --- HELPER FUNCTIONS ---

// Find or create a category
const getOrCreateCategory = async (categoryName, organizationId) => {
    const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
        organizationId: organizationId
    });
    if (existingCategory) {
        return existingCategory;
    }
    return await Category.create({
        name: categoryName,
        organizationId: organizationId
    });
};

// Upload image to Cloudinary
const uploadToCloudinary = async (file, orgName, productId) => {
    const sanitizedOrgName = orgName.replace(/\s+/g, '-').toLowerCase();

    const result = await cloudinary.uploader.upload(file.path, {
        folder: `sales-sphere/${sanitizedOrgName}/products`,
        public_id: productId, 
        overwrite: true,
        transformation: [
            { width: 400, height: 400, crop: "fill" },
            { fetch_format: "auto", quality: "auto" }
        ]
    });
    return { public_id: result.public_id, url: result.secure_url };
};

// Cleanup temp file
const cleanupTempFile = (filePath) => {
    if (filePath) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error removing temp file ${filePath}:`, err);
        });
    }
};

// --- CONTROLLER FUNCTIONS ---

// @desc    Create a new product
exports.createProduct = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // 1. Validate text data
        const validatedData = productSchemaValidation.parse(req.body);

        // --- NEW: Check for duplicate product name ---
        const existingProduct = await Product.findOne({
            productName: { $regex: new RegExp(`^${validatedData.productName}$`, 'i') },
            organizationId: organizationId
        });
        if (existingProduct) {
            cleanupTempFile(tempFilePath);
            return res.status(400).json({ success: false, message: 'A product with this name already exists in your organization.' });
        }
        // --- END CHECK ---

        // 2. Find or Create the Category
        const category = await getOrCreateCategory(validatedData.category, organizationId);
        
        // 3. Fetch Organization name
        const organization = await Organization.findById(organizationId).select('name');
        if (!organization) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // 4. Create the Product document
        const newProduct = new Product({
            productName: validatedData.productName,
            serialNo: validatedData.serialNo, // Added serialNo
            price: validatedData.price,
            qty: validatedData.qty,
            category: category._id,
            organizationId: organizationId,
            createdBy: userId,
        });
        
        // 5. Handle Image Upload
        if (req.file) {
            tempFilePath = req.file.path;
            const imageObject = await uploadToCloudinary(
                req.file, 
                organization.name,
                newProduct._id.toString()
            );
            newProduct.image = imageObject;
            cleanupTempFile(tempFilePath);
            tempFilePath = null;
        }

        // 6. Save the product
        await newProduct.save();

        res.status(201).json({ success: true, data: newProduct });

    } catch (error) {
        cleanupTempFile(tempFilePath);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        // --- NEW: Catch database-level unique constraint error ---
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'A product with this name already exists.' });
        }
        console.error("Error creating product:", error);
        next(error);
    }
};

// @desc    Get all products
exports.getAllProducts = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const products = await Product.find({
            organizationId: organizationId,
            isActive: true
        })
        .populate('category', 'name')
        .sort({ createdAt: -1 }); 

        res.status(200).json({ success: true, count: products.length, data: products });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a single product by ID
exports.getProductById = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const product = await Product.findOne({
            _id: req.params.id,
            organizationId: organizationId,
            isActive: true
        })
        .populate('category', 'name');

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
};

// @desc    Update a product
exports.updateProduct = async (req, res, next) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;
        const productId = req.params.id;

        // 1. Find the product
        const product = await Product.findOne({
            _id: productId,
            organizationId: organizationId
        });
        if (!product) {
            cleanupTempFile(tempFilePath);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // 2. Validate text data
        const validatedData = productSchemaValidation.partial().parse(req.body);

        // 3. Handle Category Update
        if (validatedData.category) {
            const category = await getOrCreateCategory(validatedData.category, organizationId);
            product.category = category._id;
        }

        // 4. Handle Image Update
        if (req.file) {
            const organization = await Organization.findById(organizationId).select('name');
            if (!organization) {
                cleanupTempFile(tempFilePath);
                return res.status(404).json({ success: false, message: 'Organization not found' });
            }
            tempFilePath = req.file.path;
            const imageObject = await uploadToCloudinary(
                req.file, 
                organization.name, 
                product._id.toString()
            );
            product.image = imageObject;
            cleanupTempFile(tempFilePath);
            tempFilePath = null;
        }

        // 5. Apply other updates
        
        // --- NEW: Check for duplicate name on update ---
        if (validatedData.productName && validatedData.productName !== product.productName) {
            const existingProduct = await Product.findOne({
                productName: { $regex: new RegExp(`^${validatedData.productName}$`, 'i') },
                organizationId: organizationId,
                _id: { $ne: productId } // Check other products
            });
            if (existingProduct) {
                cleanupTempFile(tempFilePath);
                return res.status(400).json({ success: false, message: 'A product with this name already exists.' });
            }
            product.productName = validatedData.productName;
        }
        // --- END CHECK ---

        // --- FIXED: Allow updating price/qty to 0 ---
        if (Object.prototype.hasOwnProperty.call(validatedData, 'price')) {
            product.price = validatedData.price;
        }
        if (Object.prototype.hasOwnProperty.call(validatedData, 'qty')) {
            product.qty = validatedData.qty;
        }
        // --- END FIX ---
        
        // --- NEW: Handle serialNo update ---
        if (Object.prototype.hasOwnProperty.call(validatedData, 'serialNo')) {
            product.serialNo = validatedData.serialNo;
        }
        // --- END ---

        // 6. Save the updated product
        const updatedProduct = await product.save();

        res.status(200).json({ success: true, data: updatedProduct });
    
    } catch (error) {
        cleanupTempFile(tempFilePath);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: error.flatten().fieldErrors });
        }
        // --- NEW: Catch database-level unique constraint error ---
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'A product with this name already exists.' });
        }
        console.error("Error updating product:", error);
        next(error);
    }
};

// @desc    Delete a product (Hard Delete)
exports.deleteProduct = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        const product = await Product.findOneAndDelete({
            _id: req.params.id,
            organizationId: organizationId
        });

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (product.image && product.image.public_id) {
            try {
                await cloudinary.uploader.destroy(product.image.public_id);
            } catch (cloudinaryError) {
                console.error("Cloudinary delete failed:", cloudinaryError);
            }
        }

        res.status(200).json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        next(error);
    }
};