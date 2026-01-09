// src/api/notes/notes.route.js
// Notes management routes - granular feature-based access control

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
const { protect } = require('../../middlewares/auth.middleware');
const { checkAccess, checkAnyAccess } = require('../../middlewares/compositeAccess.middleware');

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
// GET /my-notes - View own created notes
router.get('/my-notes',
    checkAccess('notes', 'viewOwn'),
    getMyNotes
);

// GET / - View all notes (for admin/managers)
router.get('/',
    checkAccess('notes', 'viewList'),
    getAllNotes
);

// GET /:id - View specific note details
// Users with viewList can view any, users with viewOwn/viewDetails can view accessible notes
router.get('/:id',
    checkAnyAccess([
        { module: 'notes', feature: 'viewList' },
        { module: 'notes', feature: 'viewDetails' },
        { module: 'notes', feature: 'viewOwn' }
    ]),
    getNoteById
);

// GET /:id/images - View images for a specific note
router.get('/:id/images',
    checkAnyAccess([
        { module: 'notes', feature: 'viewList' },
        { module: 'notes', feature: 'viewDetails' },
        { module: 'notes', feature: 'viewOwn' }
    ]),
    getNoteImages
);

// ============================================
// CREATE OPERATION
// ============================================
// POST / - Create new note
router.post('/',
    checkAccess('notes', 'create'),
    createNote
);

// ============================================
// UPDATE OPERATIONS
// ============================================
// PATCH /:id - Edit note content
router.patch('/:id',
    checkAccess('notes', 'update'),
    updateNote
);

// POST /:id/images - Upload images to note
router.post('/:id/images',
    checkAccess('notes', 'create'),
    imageUpload.single('image'),
    uploadNoteImage
);

// ============================================
// DELETE OPERATIONS
// ============================================
// DELETE /:id - Delete specific note
router.delete('/:id',
    checkAccess('notes', 'delete'),
    deleteNote
);

// DELETE /bulk-delete - Bulk delete notes
router.delete('/bulk-delete',
    checkAccess('notes', 'bulkDelete'),
    bulkDeleteNotes
);

// DELETE /:id/images/:imageNumber - Delete image from note
router.delete('/:id/images/:imageNumber',
    checkAccess('notes', 'update'),
    deleteNoteImage
);

// ============================================
// EXPORT ROUTES (Future)
// ============================================
// GET /export/pdf - Export notes list as PDF
// router.get('/export/pdf',
//     checkAccess('notes', 'exportPdf'),
//     exportNotesPdf
// );

// GET /export/excel - Export notes data to Excel
// router.get('/export/excel',
//     checkAccess('notes', 'exportExcel'),
//     exportNotesExcel
// );

module.exports = router;