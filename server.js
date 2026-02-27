const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = process.env.DATA_PATH || path.join(__dirname, 'data.json');
const TIMESHEET_DATA_FILE = process.env.TIMESHEET_DATA_PATH || path.join(__dirname, 'timesheet_data.json');

// Ensure the directory for DATA_FILE exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure the directory for TIMESHEET_DATA_FILE exists
const timesheetDataDir = path.dirname(TIMESHEET_DATA_FILE);
if (!fs.existsSync(timesheetDataDir)) {
    fs.mkdirSync(timesheetDataDir, { recursive: true });
}

app.use(cors());
app.use(bodyParser.json());

// Serve static files
app.use('/invoice', express.static(path.join(__dirname, 'invoice')));
app.use('/mainpage', express.static(path.join(__dirname, 'mainpage')));
app.use('/EnglishAngel', express.static(path.join(__dirname, 'englishangel')));
app.use('/timesheet', express.static(path.join(__dirname, 'timesheet')));

// Root redirect to /mainpage
app.get('/', (req, res) => {
    res.redirect('/mainpage/');
});

// API for English Angel persistence
app.get('/api/angels', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            console.error("Error reading data file:", err);
            res.json([]);
        }
    } else {
        res.json([]);
    }
});

app.post('/api/angels', (req, res) => {
    const newData = req.body;
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error("Error writing data file:", err);
        res.status(500).json({ error: "Failed to save data" });
    }
});

// API for Timesheet persistence
app.get('/api/timesheet', (req, res) => {
    if (fs.existsSync(TIMESHEET_DATA_FILE)) {
        try {
            const data = fs.readFileSync(TIMESHEET_DATA_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            console.error("Error reading timesheet data file:", err);
            res.json({});
        }
    } else {
        res.json({});
    }
});

app.post('/api/timesheet', (req, res) => {
    const newData = req.body;
    try {
        fs.writeFileSync(TIMESHEET_DATA_FILE, JSON.stringify(newData, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error("Error writing timesheet data file:", err);
        res.status(500).json({ error: "Failed to save timesheet data" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
