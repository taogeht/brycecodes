// State
let timesheetData = {
    name: '',
    class: '',
    payRate: 735,
    employmentType: 'hourly',
    hourlyConfig: {
        1: { work: false, time: '', mins: '' },
        2: { work: true, time: '4:30-5:30', mins: 60 },
        3: { work: true, time: '3:30-5:30', mins: 120 },
        4: { work: false, time: '', mins: '' },
        5: { work: true, time: '3:30-5:30', mins: 120 }
    },
    salaryConfig: {
        1: true, 2: false, 3: true, 4: true, 5: true
    }
};

// Initialize when the page loads
window.onload = function () {
    const now = new Date();
    document.getElementById('month').value = now.getMonth() + 1;
    document.getElementById('year').value = now.getFullYear();

    loadData();
};

function loadData() {
    fetch('/api/timesheet')
        .then(response => response.json())
        .then(data => {
            if (data && Object.keys(data).length > 0) {
                timesheetData = { ...timesheetData, ...data };
            }
            populateForm();
            handleEmploymentTypeChange();
        })
        .catch(err => {
            console.error('Error loading data:', err);
            populateForm();
            handleEmploymentTypeChange();
        });
}

function saveData() {
    gatherFormData();
    fetch('/api/timesheet', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(timesheetData)
    })
        .catch(err => console.error('Error saving data:', err));
}

function populateForm() {
    document.getElementById('name').value = timesheetData.name || '';
    document.getElementById('class').value = timesheetData.class || '';
    document.getElementById('payRate').value = timesheetData.payRate || 735;
    document.getElementById('employmentType').value = timesheetData.employmentType || 'hourly';

    for (let i = 1; i <= 5; i++) {
        const hConf = timesheetData.hourlyConfig[i];
        if (hConf) {
            document.getElementById(`work${i}`).checked = hConf.work;
            document.getElementById(`time${i}`).value = hConf.time;
            document.getElementById(`mins${i}`).value = hConf.mins;
        }

        const sConf = timesheetData.salaryConfig[i];
        if (sConf !== undefined) {
            document.getElementById(`sal${i}`).checked = sConf;
        }
    }
}

function gatherFormData() {
    timesheetData.name = document.getElementById('name').value;
    timesheetData.class = document.getElementById('class').value;
    timesheetData.payRate = parseFloat(document.getElementById('payRate').value) || 0;
    timesheetData.employmentType = document.getElementById('employmentType').value;

    for (let i = 1; i <= 5; i++) {
        timesheetData.hourlyConfig[i] = {
            work: document.getElementById(`work${i}`).checked,
            time: document.getElementById(`time${i}`).value,
            mins: document.getElementById(`mins${i}`).value
        };
        timesheetData.salaryConfig[i] = document.getElementById(`sal${i}`).checked;
    }
}

// Handle employment type change
function handleEmploymentTypeChange() {
    const type = document.getElementById('employmentType').value;
    document.getElementById('hourlyConfig').style.display = type === 'hourly' ? 'block' : 'none';
    document.getElementById('salaryConfig').style.display = type === 'salary' ? 'block' : 'none';
}

// Generate the signature sheet table
function generateTable() {
    // Save current config to backend first
    saveData();

    // Gather variables just in case
    const name = timesheetData.name;
    const className = timesheetData.class;
    const month = parseInt(document.getElementById('month').value);
    const year = parseInt(document.getElementById('year').value);
    const employmentType = timesheetData.employmentType;

    const daysInMonth = new Date(year, month, 0).getDate();

    let tableHTML = `
        <h2>鐘 點 簽 名 表 (${className} -- ${name} - ${getMonthName(month)} ${year})</h2>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Time</th>
                    <th>Minutes</th>
                    <th>Remarks</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
    `;

    let rowCount = 0;
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month - 1, i);
        const dayOfWeek = date.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        if (employmentType === 'hourly') {
            const hConf = timesheetData.hourlyConfig[dayOfWeek];
            if (!hConf || !hConf.work) continue;

            rowCount++;
            tableHTML += `
                <tr onclick="toggleDay(event)" class="preset-time">
                    <td>${rowCount}</td>
                    <td>${month}/${i}</td>
                    <td>${className}</td>
                    <td>${hConf.time}</td>
                    <td>${hConf.mins}</td>
                    <td contenteditable="true"></td>
                    <td>
                        <button onclick="markDayOff(event)">Day Off</button>
                    </td>
                </tr>
            `;
        } else {
            // Salary type
            const sConf = timesheetData.salaryConfig[dayOfWeek];
            if (!sConf) continue;

            rowCount++;
            tableHTML += `
                <tr onclick="toggleDay(event)">
                    <td>${rowCount}</td>
                    <td>${month}/${i}</td>
                    <td></td>
                    <td></td>
                    <td>40</td>
                    <td contenteditable="true"></td>
                    <td>
                        <button onclick="markDayOff(event)">Day Off</button>
                    </td>
                </tr>
            `;
        }
    }

    tableHTML += `
            </tbody>
        </table>
        <div class="summary" style="margin-top: 20px;">
            <h3>Summary</h3>
            <p>Total Days: <span id="totalDays">0</span></p>
            <p>Total Hours: <span id="totalHours">0</span></p>
            <p>Total $: <span id="totalPay">0</span></p>
        </div>
    `;

    document.getElementById('tableContainer').innerHTML = tableHTML;
    updateSummary();
}

// Get month name from month number
function getMonthName(month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
}

// Toggle day selection
function toggleDay(event) {
    const row = event.currentTarget;
    if (!row) return;
    row.classList.toggle('selected');
    updateSummary();
}

// Toggles day-off style and recalculates
function markDayOff(event) {
    event.stopPropagation();
    const row = event.target.closest('tr');
    if (!row) return;

    row.classList.toggle('day-off');

    // Change button text dynamically
    const btn = event.target;
    if (row.classList.contains('day-off')) {
        btn.textContent = 'Undo Day Off';
    } else {
        btn.textContent = 'Day Off';
    }

    updateSummary();
}

// Renumber the rows (not heavily used if not removing rows, but kept for consistency)
function updateRowNumbers() {
    const tableRows = document.querySelectorAll('tbody tr');
    let displayCount = 0;
    tableRows.forEach((row, index) => {
        // Just renumber them all
        row.cells[0].textContent = index + 1;
    });
}

// Update summary statistics
function updateSummary() {
    const tableRows = document.querySelectorAll('tbody tr');
    let unskippedDays = 0;
    let totalMinutes = 0;

    tableRows.forEach(row => {
        if (!row.classList.contains('day-off')) {
            unskippedDays++;
            const minutesCell = row.querySelector('td:nth-child(5)');
            const minutes = parseInt(minutesCell.textContent) || 0;
            totalMinutes += minutes;
        }
    });

    const totalHoursNum = totalMinutes / 60;
    const totalHours = totalHoursNum.toFixed(1);
    const payRate = timesheetData.payRate || 0;
    const totalPay = (totalHoursNum * payRate).toFixed(2);

    document.getElementById('totalDays').textContent = unskippedDays;
    document.getElementById('totalHours').textContent = totalHours;
    document.getElementById('totalPay').textContent = totalPay;
}

// DOCX Export Functionality
function loadFile(url, callback) {
    PizZipUtils.getBinaryContent(url, callback);
}

function exportToWord() {
    // 1. Gather data from the generated table
    const tableRows = document.querySelectorAll('tbody tr');
    if (tableRows.length === 0) {
        alert("Please generate a table first!");
        return;
    }

    const name = timesheetData.name || document.getElementById('name').value;
    const className = timesheetData.class || document.getElementById('class').value;
    const month = parseInt(document.getElementById('month').value);
    const year = parseInt(document.getElementById('year').value);
    const monthName = getMonthName(month);

    let seqIndex = 1;
    let days = [];
    tableRows.forEach((row, index) => {
        if (!row.classList.contains('day-off')) {
            const cells = row.cells;
            days.push({
                rowIndex: seqIndex++,
                date: cells[1].textContent,
                className: cells[2].textContent,
                time: cells[3].textContent,
                mins: cells[4].textContent,
                remarks: cells[5].textContent
            });
        }
    });

    while (days.length < 23) {
        days.push({
            rowIndex: seqIndex++,
            date: '',
            className: '',
            time: '',
            mins: '',
            remarks: ''
        });
    }

    // 2. Load the template
    loadFile('template.docx', function (error, content) {
        if (error) {
            console.error(error);
            alert("Error loading template.docx. Ensure it exists in the timesheet directory.");
            return;
        }

        try {
            const zip = new PizZip(content);
            const doc = new window.docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
            });

            // 3. Set the data
            doc.setData({
                className: className,
                name: name,
                monthName: monthName,
                year: year,
                days: days
            });

            // 4. Render the document
            doc.render();

            // 5. Output the document
            const out = doc.getZip().generate({
                type: "blob",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });

            // 6. Download the file
            const fileName = `${monthName}-${className}.docx`;
            saveAs(out, fileName);

        } catch (error) {
            console.error("Error generating document:", error);
            alert("An error occurred while generating the document.");
        }
    });
}

function exportToImage() {
    const originalContainer = document.getElementById('tableContainer');
    if (!originalContainer || !originalContainer.querySelector('table')) {
        alert("Please generate a table first!");
        return;
    }

    // Create a clone to manipulate safely without affecting UI
    const clone = originalContainer.cloneNode(true);

    // Style the clone to look like a document page
    clone.style.width = '794px';
    clone.style.minHeight = '1123px';
    clone.style.padding = '40px';
    clone.style.background = 'white';
    clone.style.color = 'black';
    clone.style.position = 'absolute';
    clone.style.left = '-9999px'; // Hide it off-screen
    clone.style.top = '0';
    clone.style.fontFamily = 'Arial, sans-serif';
    clone.style.boxSizing = 'border-box';
    clone.style.border = '2px solid black';
    clone.style.display = 'flex';
    clone.style.flexDirection = 'column';

    // Title styling to match DOCX
    const h2 = clone.querySelector('h2');
    if (h2) {
        h2.style.textAlign = 'center';
        h2.style.fontSize = '24px';
        h2.style.marginBottom = '20px';
    }

    // Remove "Action" column header
    const ths = clone.querySelectorAll('th');
    if (ths.length > 0) {
        ths[ths.length - 1].remove();
    }

    // Process rows
    const rows = clone.querySelectorAll('tbody tr');
    let rowIndex = 1;
    rows.forEach(row => {
        if (row.classList.contains('day-off')) {
            row.remove(); // Remove day-off rows completely
        } else {
            // Remove the last cell (Action button)
            const cells = row.querySelectorAll('td');
            if (cells.length > 0) {
                cells[cells.length - 1].remove();
            }
            // Update the row number to be sequential
            cells[0].textContent = rowIndex++;

            // Make sure the borders look right for print
            cells.forEach(c => {
                c.style.border = '1px solid black';
                c.style.padding = '8px';
                c.removeAttribute('contenteditable');
                c.style.height = '35px';
            });
        }
    });

    // Pad to exactly 23 rows for the image representation as well
    const tbody = clone.querySelector('tbody');
    while (rowIndex <= 23) {
        const tr = document.createElement('tr');
        for (let i = 0; i < 6; i++) {
            const td = document.createElement('td');
            td.style.border = '1px solid black';
            td.style.padding = '8px';
            td.style.height = '35px';
            if (i === 0) td.textContent = rowIndex;
            else td.innerHTML = '&nbsp;'; // Non-breaking space keeps cell structure
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
        rowIndex++;
    }

    // Fix header borders
    clone.querySelectorAll('th').forEach(th => {
        th.style.border = '1px solid black';
        th.style.padding = '8px';
        th.style.textAlign = 'left';
        th.style.fontWeight = 'bold';
    });
    const table = clone.querySelector('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.marginTop = '20px';
    table.style.marginBottom = '20px';

    // Remove summary panel
    const summary = clone.querySelector('.summary');
    if (summary) summary.remove();

    // Add signature block
    const sigBlock = document.createElement('div');
    sigBlock.style.marginTop = 'auto'; // Pushes to the bottom of the flex container (A4 page height)
    sigBlock.style.paddingTop = '60px'; // Give ample space before signature
    sigBlock.style.fontSize = '24px';
    sigBlock.style.fontWeight = 'bold';
    sigBlock.innerHTML = 'Signature: __________________';
    clone.appendChild(sigBlock);

    // Add to body so html2canvas can properly render it
    document.body.appendChild(clone);

    const month = parseInt(document.getElementById('month').value);
    const monthName = getMonthName(month);
    const className = document.getElementById('class').value || 'Class';
    const fileName = `${monthName}-${className}.png`;

    html2canvas(clone, { scale: 2 }).then(canvas => {
        canvas.toBlob(function (blob) {
            saveAs(blob, fileName);
            // Clean up
            document.body.removeChild(clone);
        });
    }).catch(err => {
        console.error("Error generating image:", err);
        alert("An error occurred while generating the image.");
        document.body.removeChild(clone);
    });
}
