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

// --- Bulk Import Validation Schema ---
const bulkProductSchema = z.object({
    productName: z.string({ required_error: "Product name is required" }).min(1, "Product name is required"),
    category: z.string({ required_error: "Category is required" }).min(1, "Category is required"),
    price: z.coerce.number({ required_error: "Price is required" }).min(0, "Price cannot be negative"),
    qty: z.coerce.number({ required_error: "Quantity is required" }).min(0, "Quantity cannot be negative"),
    serialNo: z.string().optional().nullable(),
}).passthrough(); // Allow extra fields like 'sno' from Excel export

const bulkImportSchema = z.object({
    products: z.array(bulkProductSchema).min(1, "At least one product is required").max(500, "Maximum 500 products per import"),
});

// --- HELPER FUNCTIONS ---

// Find or create a category
const { isSystemRole } = require('../../utils/defaultPermissions');

// --- HELPER FUNCTIONS ---

// Find or create a category with permission check
const getOrCreateCategory = async (categoryName, user) => {
    const { organizationId, role } = user;

    // 1. Check if category exists
    const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
        organizationId: organizationId
    });

    if (existingCategory) {
        return existingCategory;
    }

    // 2. Category doesn't exist - Check permissions to create it
    // Must be Admin, System Role, or have 'manageCategories' feature
    const canCreateCategory =
        role === 'admin' ||
        isSystemRole(role) ||
        (user.hasFeature && user.hasFeature('products', 'manageCategories'));

    if (!canCreateCategory) {
        const error = new Error(`You do not have permission to create the new category '${categoryName}'. Please select an existing category.`);
        error.code = 'PERMISSION_DENIED';
        throw error;
    }

    // 3. Create new category
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

        // 2. Find or Create the Category (with permission check)
        const category = await getOrCreateCategory(validatedData.category, req.user);

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
        // Handle permission error from getOrCreateCategory
        if (error.code === 'PERMISSION_DENIED') {
            return res.status(403).json({ success: false, message: error.message });
        }
        // Catch database-level unique constraint error
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
            // Pass req.user for permission check
            const category = await getOrCreateCategory(validatedData.category, req.user);
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
        // Handle permission error
        if (error.code === 'PERMISSION_DENIED') {
            return res.status(403).json({ success: false, message: error.message });
        }
        // Catch database-level unique constraint error
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

// @desc    Bulk delete products (Hard Delete)
// @route   DELETE /api/v1/products/bulk-delete
// @access  Private (Admin, Manager)
exports.bulkDeleteProducts = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId } = req.user;

        // 1. Validate request body
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'productIds array is required and must not be empty'
            });
        }

        // 2. Limit the number of products that can be deleted at once
        if (productIds.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 100 products can be deleted at once'
            });
        }

        // 3. Find all products matching the IDs and belonging to this organization
        const products = await Product.find({
            _id: { $in: productIds },
            organizationId: organizationId
        });

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No products found matching the provided IDs'
            });
        }

        // 4. Collect public_ids for images to delete from Cloudinary
        const imagePublicIds = products
            .filter(product => product.image && product.image.public_id)
            .map(product => product.image.public_id);

        // 5. Delete products from database
        const deleteResult = await Product.deleteMany({
            _id: { $in: products.map(p => p._id) },
            organizationId: organizationId
        });

        // 6. Delete images from Cloudinary (in parallel)
        const imageDeleteResults = {
            successful: 0,
            failed: 0,
            errors: []
        };

        if (imagePublicIds.length > 0) {
            const deletePromises = imagePublicIds.map(async (publicId) => {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    return { success: true, publicId };
                } catch (error) {
                    console.error(`Cloudinary delete failed for ${publicId}:`, error);
                    return { success: false, publicId, error: error.message };
                }
            });

            const results = await Promise.all(deletePromises);
            results.forEach(result => {
                if (result.success) {
                    imageDeleteResults.successful++;
                } else {
                    imageDeleteResults.failed++;
                    imageDeleteResults.errors.push({
                        publicId: result.publicId,
                        error: result.error
                    });
                }
            });
        }

        // 7. Prepare response
        const notFoundIds = productIds.filter(
            id => !products.some(p => p._id.toString() === id)
        );

        res.status(200).json({
            success: true,
            message: 'Bulk delete completed',
            data: {
                totalRequested: productIds.length,
                productsDeleted: deleteResult.deletedCount,
                notFound: notFoundIds.length,
                notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined,
                imagesDeleted: imageDeleteResults.successful,
                imageDeleteFailed: imageDeleteResults.failed,
                imageErrors: imageDeleteResults.errors.length > 0 ? imageDeleteResults.errors : undefined
            }
        });
    } catch (error) {
        console.error("Error in bulk delete:", error);
        next(error);
    }
};

// @desc    Bulk import products
// @route   POST /api/v1/products/bulk-import
// @access  Private (Admin, Manager)
exports.bulkImportProducts = async (req, res, next) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
        const { organizationId, _id: userId } = req.user;

        // 1. Validate request body
        const validatedData = bulkImportSchema.parse(req.body);
        const { products } = validatedData;

        // 2. Extract unique category names from products
        const categoryNames = [...new Set(products.map(p => p.category.trim()))];

        // 3. Find existing categories for this organization (case-insensitive)
        const existingCategories = await Category.find({
            organizationId: organizationId,
            name: { $in: categoryNames.map(name => new RegExp(`^${name}$`, 'i')) }
        });

        // Create a map of category name (lowercase) to category document
        const categoryMap = new Map();
        existingCategories.forEach(cat => {
            categoryMap.set(cat.name.toLowerCase(), cat);
        });

        // 4. Find categories that need to be created
        const categoriesToCreate = categoryNames.filter(
            name => !categoryMap.has(name.toLowerCase())
        );

        // 5. Bulk create missing categories (WITH PERMISSION CHECK)
        if (categoriesToCreate.length > 0) {
            // Check if user has permission to create categories
            const { role } = req.user;
            const canCreateCategory =
                role === 'admin' ||
                isSystemRole(role) ||
                (req.user.hasFeature && req.user.hasFeature('products', 'manageCategories'));

            if (!canCreateCategory) {
                return res.status(403).json({
                    success: false,
                    message: `Permission denied: Import contains new categories (${categoriesToCreate.join(', ')}). You do not have permission to create categories. Please use existing categories or ask an admin.`
                });
            }

            const newCategories = await Category.insertMany(
                categoriesToCreate.map(name => ({
                    name: name,
                    organizationId: organizationId
                })),
                { ordered: false }
            );
            // Add new categories to the map
            newCategories.forEach(cat => {
                categoryMap.set(cat.name.toLowerCase(), cat);
            });
        }

        // 6. Check for existing product names in the organization
        const productNames = products.map(p => p.productName.trim());
        const existingProducts = await Product.find({
            organizationId: organizationId,
            productName: { $in: productNames.map(name => new RegExp(`^${name}$`, 'i')) }
        }).select('productName');

        const existingProductNames = new Set(
            existingProducts.map(p => p.productName.toLowerCase())
        );

        // 7. Separate products into duplicates and new products
        const duplicates = [];
        const newProducts = [];

        products.forEach((product, index) => {
            const productNameLower = product.productName.trim().toLowerCase();
            if (existingProductNames.has(productNameLower)) {
                duplicates.push({
                    row: index + 1,
                    productName: product.productName,
                    reason: 'Product name already exists'
                });
            } else {
                // Check for duplicates within the import itself
                const isDuplicateInBatch = newProducts.some(
                    p => p.productName.toLowerCase() === productNameLower
                );
                if (isDuplicateInBatch) {
                    duplicates.push({
                        row: index + 1,
                        productName: product.productName,
                        reason: 'Duplicate product name in import batch'
                    });
                } else {
                    newProducts.push(product);
                }
            }
        });

        // 8. Prepare products for bulk insert
        const productsToInsert = newProducts.map(product => {
            const category = categoryMap.get(product.category.trim().toLowerCase());
            return {
                productName: product.productName.trim(),
                serialNo: product.serialNo || null,
                price: product.price,
                qty: product.qty,
                category: category._id,
                organizationId: organizationId,
                createdBy: userId,
                isActive: true
            };
        });

        // 9. Bulk insert products
        let insertedProducts = [];
        if (productsToInsert.length > 0) {
            insertedProducts = await Product.insertMany(productsToInsert, { ordered: false });
        }

        // 10. Prepare response
        const response = {
            success: true,
            message: `Bulk import completed`,
            data: {
                totalReceived: products.length,
                successfullyImported: insertedProducts.length,
                duplicatesSkipped: duplicates.length,
                categoriesCreated: categoriesToCreate.length,
            }
        };

        // Include duplicates info if any
        if (duplicates.length > 0) {
            response.data.duplicates = duplicates;
        }

        res.status(201).json(response);

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: error.flatten().fieldErrors
            });
        }
        console.error("Error in bulk import:", error);
        next(error);
    }
};