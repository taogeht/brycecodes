// Initial list of names
let names = ["Pinpin", "Eva", "Andrew", "Alston", "Emma L", "Emma H", "Una L", "Jason", "Yoona W", "Anson", "Mona", "Zoey", "Yumi", "Mia", "Eason","Ocean","Bernie","Kyson","Ruby J", "Charles", "Eugene", "Felix", "Ruby T"];

// Get saved English Angels from localStorage or initialize empty array
let englishAngels = JSON.parse(localStorage.getItem('englishAngels')) || [];

// Function to save English Angels to localStorage
function saveEnglishAngels() {
    localStorage.setItem('englishAngels', JSON.stringify(englishAngels));
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
    saveEnglishAngels();

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
        localStorage.removeItem('englishAngels');
        
        // Reset names to original list
        names = ["Pinpin", "Andrew", "Alston", "Emma L", "Emma H", "Una L", "Yoona W", "Anson", "Mona", "Zoey", "Yumi", "Mia", "Eason","Ocean","Bernie","Kyson","Ruby J", "Charles", "Eugene", "Felix", "Ruby T"];
        
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