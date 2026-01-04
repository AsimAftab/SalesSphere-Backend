// src/api/notes/notes.route.js
// Notes management routes - permission-based access

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
const { protect, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

const imageUpload = multer({
    dest: 'tmp/',
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files up to 5MB are allowed!'), false);
    }
});

router.use(protect);

// ============================================
// VIEW OPERATIONS
// ============================================
router.get('/my-notes', requirePermission('notes', 'view'), getMyNotes);
router.get('/', requirePermission('notes', 'view'), getAllNotes);
router.get('/:id', requirePermission('notes', 'view'), getNoteById);
router.get('/:id/images', requirePermission('notes', 'view'), getNoteImages);

// ============================================
// ADD OPERATIONS
// ============================================
router.post('/', requirePermission('notes', 'add'), createNote);
router.post('/:id/images', requirePermission('notes', 'add'), imageUpload.single('image'), uploadNoteImage);

// ============================================
// UPDATE OPERATIONS
// ============================================
router.patch('/:id', requirePermission('notes', 'update'), updateNote);

// ============================================
// DELETE OPERATIONS
// ============================================
router.delete('/:id', requirePermission('notes', 'delete'), deleteNote);
router.delete('/bulk-delete', requirePermission('notes', 'delete'), bulkDeleteNotes);
router.delete('/:id/images/:imageNumber', requirePermission('notes', 'delete'), deleteNoteImage);

module.exports = router;