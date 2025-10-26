const multer = require('multer');

module.exports = function handleMulterErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    // Handle built-in Multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Each file must be 2 MB or smaller.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded. You can upload up to 2 at a time.'
      });
    }
  } else if (err) {
    // Handle custom errors from fileFilter (like non-PDF)
    return res.status(400).json({
      success: false,
      message: err.message || 'Invalid file upload.'
    });
  }

  next(); // no Multer errors, continue
};

