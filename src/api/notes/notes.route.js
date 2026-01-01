const express = require('express');
const multer = require('multer');
const {
    createNote,
    getAllNotes,
    getMyNotes,
    getNoteById,
    updateNote,
    deleteNote,
    bulkDeleteNotes,
    uploadNoteImage,
    deleteNoteImage,
    getNoteImages
} = require('./notes.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Multer Config (Moved to a separate utility usually, but kept here for now)
const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files up to 5MB are allowed!'), false);
    }
});

// 1. Global Authentication
router.use(protect);

// ============================================
// NOTES ROUTES
// ============================================

// Specialized & Administrative Routes
router.get('/my-notes', getMyNotes);
router.delete('/bulk-delete', restrictTo('admin', 'manager'), bulkDeleteNotes);

// Collection Routes
router.route('/')
    .get(restrictTo('admin', 'manager'), getAllNotes)
    .post(createNote);

// Specific Note ID Routes
router.route('/:id')
    .get(getNoteById)
    .patch(updateNote) // Changed to PATCH for partial updates
    .delete(restrictTo('admin', 'manager'), deleteNote);

// ============================================
// IMAGE MANAGEMENT ROUTES
// ============================================

router.route('/:id/images')
    .get(getNoteImages)
    .post(imageUpload.single('image'), uploadNoteImage);

router.delete('/:id/images/:imageNumber', deleteNoteImage);

module.exports = router;