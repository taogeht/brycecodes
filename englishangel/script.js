// State
let data = {
    classes: [],
    currentClassId: null
};

// Initial setup
function init() {
    loadData();
    setupEventListeners();
}

// Load data from server
function loadData() {
    fetch('/api/angels')
        .then(response => response.json())
        .then(serverData => {
            if (Array.isArray(serverData) || (serverData.names && !serverData.classes)) {
                // Migration: Convert old format to new format
                console.log("Migrating old data format...");
                const defaultClass = createClass("Default Class");

                if (serverData.names) {
                    defaultClass.names = serverData.names;
                } else if (Array.isArray(serverData) && serverData.length > 0) {
                    // Assuming if it's an array, it might be just names, but let's be safe
                    // The previous server code sent {names: [], englishAngels: []} usually, 
                    // or just [] if empty. 
                    // If it's the specific object structure from before:
                    if (serverData.names) defaultClass.names = serverData.names;
                }

                if (serverData.englishAngels) {
                    defaultClass.englishAngels = serverData.englishAngels;
                }

                data.classes = [defaultClass];
                data.currentClassId = defaultClass.id;
                saveData(); // Save the migrated structure
            } else if (serverData.classes) {
                // New format
                data = serverData;
                // Ensure a current class is selected if classes exist
                if (!data.currentClassId && data.classes.length > 0) {
                    data.currentClassId = data.classes[0].id;
                }
            } else {
                // No data or empty
                if (data.classes.length === 0) {
                    const defaultClass = createClass("Default Class");
                    // Add default names if creating from scratch
                    const START_NAMES = ["Pinpin", "Eva", "Andrew", "Alston", "Emma L", "Emma H", "Una L", "Jason", "Yoona W", "Anson", "Mona", "Zoey", "Yumi", "Mia", "Eason", "Ocean", "Bernie", "Kyson", "Ruby J", "Charles", "Eugene", "Felix", "Ruby T"];
                    defaultClass.names = [...START_NAMES];
                    data.classes.push(defaultClass);
                    data.currentClassId = defaultClass.id;
                    saveData();
                }
            }
            render();
        })
        .catch(err => {
            console.error('Error loading data:', err);
            // Fallback for error/offline if needed, or just init empty
            if (data.classes.length === 0) {
                const defaultClass = createClass("Default Class");
                data.classes.push(defaultClass);
                data.currentClassId = defaultClass.id;
                render();
            }
        });
}

// Create a new class object
function createClass(name) {
    return {
        id: generateUUID(),
        name: name,
        names: [],
        englishAngels: []
    };
}

// Generate simple UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Save data to server
function saveData() {
    fetch('/api/angels', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
        .catch(err => console.error('Error saving data:', err));
}

// Get current class object
function getCurrentClass() {
    return data.classes.find(c => c.id === data.currentClassId);
}

// UI Rendering
function render() {
    renderClassSelect();
    renderStudents();
    renderEnglishAngels();
}

function renderClassSelect() {
    const select = document.getElementById('classSelect');
    select.innerHTML = '';
    data.classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls.id;
        option.textContent = cls.name;
        if (cls.id === data.currentClassId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function renderStudents() {
    const currentClass = getCurrentClass();
    const list = document.getElementById('namesList');
    const countSpan = document.getElementById('studentCount');

    list.innerHTML = '';
    if (currentClass) {
        countSpan.textContent = `(${currentClass.names.length})`;
        currentClass.names.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;

            // Add delete button for student validation/management (optional but good UI)
            const deleteBtn = document.createElement('span');
            deleteBtn.textContent = ' ❌';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.fontSize = '0.8em';
            deleteBtn.title = 'Remove student';
            deleteBtn.onclick = (e) => {
                e.stopPropagation(); // prevent other clicks
                removeStudent(name);
            };
            li.appendChild(deleteBtn);

            list.appendChild(li);
        });
    } else {
        countSpan.textContent = '(0)';
    }
}

function renderEnglishAngels() {
    const currentClass = getCurrentClass();
    const list = document.getElementById('englishAngelsList');
    list.innerHTML = '';

    if (currentClass) {
        currentClass.englishAngels.forEach((name, index) => {
            const li = document.createElement('li');
            li.textContent = `Week ${index + 1}: ${name}`;
            list.appendChild(li);
        });
    }
}

// Logic Actions

function switchClass(classId) {
    data.currentClassId = classId;
    renderStudents();
    renderEnglishAngels();
}

function addNewClass() {
    const nameInput = document.getElementById('newClassName');
    const name = nameInput.value.trim();
    if (name) {
        const newClass = createClass(name);
        data.classes.push(newClass);
        data.currentClassId = newClass.id;
        saveData();

        nameInput.value = '';
        toggleNewClassInput(false);
        render(); // Re-render all to update select and lists
    } else {
        alert("Please enter a class name.");
    }
}

function addStudent() {
    const input = document.getElementById('newStudentName');
    const name = input.value.trim();
    const currentClass = getCurrentClass();

    if (name && currentClass) {
        // Prevent duplicates in active list
        if (currentClass.names.includes(name)) {
            alert("Student already in the list!");
            return;
        }

        currentClass.names.push(name);
        saveData();
        input.value = '';
        renderStudents();
    } else if (!currentClass) {
        alert("No class selected!");
    }
}

function removeStudent(name) {
    const currentClass = getCurrentClass();
    if (currentClass && confirm(`Remove ${name} from ${currentClass.name}?`)) {
        currentClass.names = currentClass.names.filter(n => n !== name);
        saveData();
        renderStudents();
    }
}

function selectEnglishAngel() {
    const currentClass = getCurrentClass();
    if (!currentClass) return;

    if (currentClass.names.length === 0) {
        alert("No more names to select in this class!");
        return;
    }

    const randomIndex = Math.floor(Math.random() * currentClass.names.length);
    const selectedName = currentClass.names.splice(randomIndex, 1)[0];

    currentClass.englishAngels.push(selectedName);
    saveData();
    renderStudents();
    renderEnglishAngels();
}

function resetCurrentClassLists() {
    const currentClass = getCurrentClass();
    if (!currentClass) return;

    if (confirm(`Are you sure you want to reset the lists for "${currentClass.name}"? This will move all English Angels back to the student list.`)) {
        // Move all angels back to names
        currentClass.names = [...currentClass.names, ...currentClass.englishAngels.map(entry => {
            // Extract just the name from "Week X: Name"
            const parts = entry.split(': ');
            return parts.length > 1 ? parts[1] : entry;
        })];
        currentClass.englishAngels = [];

        saveData();
        renderStudents();
        renderEnglishAngels();
    }
}

function drawAllClasses() {
    if (data.classes.length === 0) {
        alert("No classes created!");
        return;
    }

    // Determine the next week number
    let maxDrawn = 0;
    data.classes.forEach(c => {
        if (c.englishAngels.length > maxDrawn) {
            maxDrawn = c.englishAngels.length;
        }
    });
    const nextWeek = maxDrawn + 1;

    const results = [];

    // Iterate all classes
    let atLeastOneDrawn = false;

    data.classes.forEach(currClass => {
        if (currClass.names.length > 0) {
            const randomIndex = Math.floor(Math.random() * currClass.names.length);
            const selectedName = currClass.names.splice(randomIndex, 1)[0];

            currClass.englishAngels.push(`Week ${nextWeek}: ${selectedName}`);
            results.push({
                className: currClass.name,
                student: selectedName
            });
            atLeastOneDrawn = true;
        } else {
            results.push({
                className: currClass.name,
                student: "(No Value / Empty List)"
            });
        }
    });

    if (atLeastOneDrawn) {
        saveData();
        render();
        updateSidebarWithResults(nextWeek, results);
    } else {
        alert("All classes are empty! No students left to draw.");
    }
}

function updateSidebarWithResults(weekNum, results) {
    const title = document.getElementById('sidebarTitle');
    const body = document.getElementById('sidebarBody');

    title.textContent = `Results: Week ${weekNum}`;
    body.innerHTML = '';

    results.forEach(res => {
        const div = document.createElement('div');
        div.className = 'sidebar-card-item';

        const classSpan = document.createElement('span');
        classSpan.className = 'sidebar-card-class';
        classSpan.textContent = res.className;

        const studentSpan = document.createElement('span');
        studentSpan.className = 'sidebar-card-student';
        studentSpan.textContent = res.student;

        div.appendChild(classSpan);
        div.appendChild(studentSpan);
        body.appendChild(div);
    });
}

function showAllHistory() {
    const title = document.getElementById('sidebarTitle');
    const body = document.getElementById('sidebarBody');

    title.textContent = "All History";
    body.innerHTML = '';

    if (data.classes.length === 0) {
        body.innerHTML = '<p class="placeholder-text">No classes found.</p>';
        return;
    }

    data.classes.forEach(c => {
        const classSection = document.createElement('div');
        classSection.style.marginBottom = '20px';
        classSection.style.padding = '10px';
        classSection.style.backgroundColor = 'white';
        classSection.style.borderRadius = '6px';
        classSection.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

        const classHeader = document.createElement('h3');
        classHeader.textContent = c.name;
        classHeader.style.color = '#333';
        classHeader.style.marginTop = '0';
        classHeader.style.marginBottom = '10px';
        classHeader.style.fontSize = '1em';
        classHeader.style.borderBottom = '1px solid #eee';
        classHeader.style.paddingBottom = '5px';
        classSection.appendChild(classHeader);

        if (c.englishAngels.length === 0) {
            const noData = document.createElement('p');
            noData.textContent = "No history yet.";
            noData.style.fontStyle = 'italic';
            noData.style.color = '#999';
            noData.style.fontSize = '0.9em';
            classSection.appendChild(noData);
        } else {
            const ul = document.createElement('ul');
            ul.style.listStyleType = 'none';
            ul.style.paddingLeft = '0';

            c.englishAngels.forEach(entry => {
                const li = document.createElement('li');
                li.textContent = entry;
                li.style.padding = '5px 0';
                li.style.borderBottom = '1px dotted #eee';
                li.style.fontSize = '0.9em';
                if (li.textContent.includes('Effect')) li.style.display = 'none'; // Cleanup old test data if needed
                ul.appendChild(li);
            });
            classSection.appendChild(ul);
        }
        body.appendChild(classSection);
    });
}


// Event Listeners
function setupEventListeners() {
    // Class selection
    document.getElementById('classSelect').addEventListener('change', (e) => {
        switchClass(e.target.value);
    });

    // New Class UI toggle
    document.getElementById('newClassButton').addEventListener('click', () => {
        toggleNewClassInput(true);
    });

    document.getElementById('cancelClassButton').addEventListener('click', () => {
        toggleNewClassInput(false);
    });

    document.getElementById('saveClassButton').addEventListener('click', addNewClass);

    // Add Student
    document.getElementById('addStudentButton').addEventListener('click', addStudent);
    document.getElementById('newStudentName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addStudent();
    });

    // Game Actions
    // Game Actions
    document.getElementById('selectButton').addEventListener('click', selectEnglishAngel);
    document.getElementById('drawAllButton').addEventListener('click', drawAllClasses);
    document.getElementById('showAllHistoryButton').addEventListener('click', showAllHistory);
    document.getElementById('resetButton').addEventListener('click', resetCurrentClassLists);
}

function toggleNewClassInput(show) {
    const inputGroup = document.getElementById('newClassInputGroup');
    const createBtn = document.getElementById('newClassButton');
    const select = document.getElementById('classSelect');

    if (show) {
        inputGroup.style.display = 'block';
        createBtn.style.display = 'none';
        select.disabled = true;
        document.getElementById('newClassName').focus();
    } else {
        inputGroup.style.display = 'none';
        createBtn.style.display = 'inline-block';
        select.disabled = false;
        document.getElementById('newClassName').value = '';
    }
}

// Start
init();