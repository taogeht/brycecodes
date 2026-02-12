const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json());

// Serve static files
app.use('/invoice', express.static(path.join(__dirname, 'invoice')));
app.use('/mainpage', express.static(path.join(__dirname, 'mainpage')));
app.use('/EnglishAngel', express.static(path.join(__dirname, 'englishangel')));

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
