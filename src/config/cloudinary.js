const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config(); // Make sure .env variables are loaded

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // Optional: Ensures HTTPS URLs are generated
});

module.exports = cloudinary;