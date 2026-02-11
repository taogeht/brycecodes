document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const convertBtn = document.getElementById('convertBtn');
    const inputText = document.getElementById('inputText');
    const resultsList = document.getElementById('resultsList');
    
    // Add event listener for the convert button
    convertBtn.addEventListener('click', processPartNumbers);
    
    function processPartNumbers() {
        // Clear previous results
        resultsList.innerHTML = '';
        
        // Get input text and split into lines
        const lines = inputText.value.trim().split('\n');
        
        // Process each line
        const processedParts = [];
        const uniqueParts = new Set();
        
        lines.forEach(line => {
            // Extract M-number pattern: M followed by numbers
            const match = line.match(/M(\d+)/i);
            
            if (match && match[1]) {
                const mocNumber = match[1];
                
                // Skip if we've already processed this part number
                if (uniqueParts.has(mocNumber)) {
                    return;
                }
                
                // Add to set to avoid duplicates
                uniqueParts.add(mocNumber);
                
                // Reverse the digits
                const legoNumber = mocNumber.split('').reverse().join('');
                
                // Add to processed parts
                processedParts.push({
                    reversed: legoNumber
                });
            }
        });
        
        // Display results
        if (processedParts.length === 0) {
            resultsList.innerHTML = '<p>No valid part numbers found.</p>';
            return;
        }
        
        // Create a list for the links
        const linkList = document.createElement('ul');
        linkList.className = 'link-list';
        
        processedParts.forEach(part => {
            // Create Google search URL
            const googleUrl = `https://www.google.com/search?q=lego+part+${part.reversed}`;
            
            // Create list item with just the link
            const listItem = document.createElement('li');
            listItem.innerHTML = `<a href="${googleUrl}" target="_blank" class="search-link">LEGO Part ${part.reversed}</a>`;
            
            linkList.appendChild(listItem);
        });
        
        resultsList.appendChild(linkList);
    }
}); 