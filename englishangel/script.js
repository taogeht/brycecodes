// Initial list of names
const START_NAMES = ["Pinpin", "Eva", "Andrew", "Alston", "Emma L", "Emma H", "Una L", "Jason", "Yoona W", "Anson", "Mona", "Zoey", "Yumi", "Mia", "Eason", "Ocean", "Bernie", "Kyson", "Ruby J", "Charles", "Eugene", "Felix", "Ruby T"];
let names = [...START_NAMES];
let englishAngels = [];

// Load data from server
fetch('/api/angels')
    .then(response => response.json())
    .then(data => {
        if (data.names) {
            names = data.names;
        }
        if (data.englishAngels) {
            englishAngels = data.englishAngels;
        }
        displayNames();
        displayEnglishAngels();
    })
    .catch(err => console.error('Error loading data:', err));

// Function to save data to server
function saveData() {
    fetch('/api/angels', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ names, englishAngels }),
    })
        .catch(err => console.error('Error saving data:', err));
}

// Function to display names in the list
function displayNames() {
    const namesList = document.getElementById("namesList");
    namesList.innerHTML = ""; // Clear the list
    names.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        namesList.appendChild(li);
    });
}

// Function to display English Angels with numbers
function displayEnglishAngels() {
    const englishAngelsList = document.getElementById("englishAngelsList");
    englishAngelsList.innerHTML = ""; // Clear the list
    englishAngels.forEach((name, index) => {
        const li = document.createElement("li");
        li.textContent = `${index + 1}. ${name}`;
        englishAngelsList.appendChild(li);
    });
}

// Function to select a random name and move it to the English Angels list
function selectEnglishAngel() {
    if (names.length === 0) {
        alert("No more names to select!");
        return;
    }

    const randomIndex = Math.floor(Math.random() * names.length);
    const selectedName = names.splice(randomIndex, 1)[0]; // Remove the selected name from the list

    englishAngels.push(selectedName);
    saveData();

    displayNames();
    displayEnglishAngels();
}

// Event listener for the button
document.getElementById("selectButton").addEventListener("click", selectEnglishAngel);

// Function to reset the lists
function resetLists() {
    if (confirm("Are you sure you want to reset the lists? This will clear all English Angels.")) {
        // Reset English Angels
        englishAngels = [];

        // Reset names to original list
        names = [...START_NAMES];

        // Save to server
        saveData();

        // Update displays
        displayNames();
        displayEnglishAngels();
    }
}

// Add event listener for reset button
document.getElementById("resetButton").addEventListener("click", resetLists);

// Initial display of both lists
displayNames();
displayEnglishAngels();