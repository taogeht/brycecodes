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
