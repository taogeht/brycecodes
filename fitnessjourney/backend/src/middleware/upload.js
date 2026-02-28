const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

function createUploader(subdir) {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, path.join(UPLOAD_DIR, subdir));
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `${uuidv4()}${ext}`);
        }
    });

    return multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            const allowed = /jpeg|jpg|png|webp|heic/;
            const ext = allowed.test(path.extname(file.originalname).toLowerCase());
            const mime = allowed.test(file.mimetype);
            if (ext && mime) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed'));
            }
        }
    });
}

const mealUpload = createUploader('meals');
const photoUpload = createUploader('photos');

module.exports = { mealUpload, photoUpload };
