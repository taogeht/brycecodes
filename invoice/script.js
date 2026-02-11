const { jsPDF } = window.jspdf;

// Function to sanitize filenames by replacing problematic characters
function sanitizeFilename(name) {
    // Replace forward slashes with hyphens and any other problematic characters
    return name.replace(/\//g, '-').replace(/[\\:*?"<>|]/g, '_');
}

// Main state variables
let currentDate = new Date();
let selectedDate = null;
let bookings = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    
    try {
        // Initialize Supabase Client
        window.supabaseClient = window.supabase.createClient(
            'https://kgkhogskywnuravqxibs.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtna2hvZ3NreXdudXJhdnF4aWJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA4NDQ3MTksImV4cCI6MjA0NjQyMDcxOX0._6U0cDHTGAYiyMsIw7mOpIYmC2n_7-Z88Jr4WLV6mfA'
        );

        console.log('Supabase client initialized');

        // Initialize the application
        await init();
        
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Fatal error during application startup:', error);
        alert('Failed to start the application. Please refresh the page.');
    }
});

// Time slot generation
const timeOptions = generateTimeOptions();

function generateTimeOptions(startHour = 7, endHour = 24) {
    const times = [];
    for (let hour = startHour; hour <= endHour; hour++) {
        for (let minutes of ['00', '15', '30', '45']) {
            if (hour === 24 && minutes !== '00') {
                continue;
            }
            times.push(`${hour.toString().padStart(2, '0')}:${minutes}`);
        }
    }
    return times;
}

// Helper function to handle date formatting consistently
function formatDateForDatabase(date) {
    // Get the date in local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Calendar Functions
function generateCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('currentMonth').textContent = 
        new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysContainer = document.getElementById('calendarDays');
    daysContainer.innerHTML = '';

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay.getDay(); i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'day empty';
        daysContainer.appendChild(emptyDay);
    }

    // Add days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'day';
        dayElement.textContent = day;
        
        const currentDateToCheck = new Date(year, month, day);
        const dateStr = formatDateForDatabase(currentDateToCheck);
        
        if (bookings.some(booking => booking.booking_date === dateStr)) {
            dayElement.classList.add('has-booking');
        }
        
        if (selectedDate && currentDateToCheck.toDateString() === selectedDate.toDateString()) {
            dayElement.classList.add('selected');
        }

        dayElement.addEventListener('click', (event) => handleDayClick(currentDateToCheck, event));
        daysContainer.appendChild(dayElement);
    }
}

// Modified day click handler
function handleDayClick(date, event) {
    selectedDate = date;
    
    document.querySelectorAll('.day').forEach(day => {
        day.classList.remove('selected');
    });
    event.target.classList.add('selected');
    
    document.getElementById('selectedDate').textContent = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
    });
    
    displayDayBookings();
    updateAvailableTimeSlots();
}

function formatDateForDatabase(date) {
    // Get the date in local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Booking Management
async function fetchBookings() {
    try {
        const { data, error } = await supabaseClient
            .from('bookings')
            .select('*');

        if (error) throw error;

        bookings = data;
        console.log('Fetched bookings:', bookings);

        generateCalendar();
        displayDayBookings();
        generateStudentInvoiceButtons();
    } catch (error) {
        console.error('Error fetching bookings:', error);
        alert('Failed to load bookings. Please try again.');
    }
}

function displayDayBookings() {
    const dayBookingsDiv = document.getElementById('dayBookings');
    
    if (!selectedDate) {
        document.getElementById('selectedDate').textContent = 'Select a Day';
        dayBookingsDiv.innerHTML = '<p class="no-bookings">Select a day to view schedule</p>';
        return;
    }

    const selectedDateStr = formatDateForDatabase(selectedDate);
    const dayBookings = bookings
        .filter(booking => booking.booking_date === selectedDateStr)
        .sort((a, b) => new Date(`2000/01/01 ${a.start_time}`) - new Date(`2000/01/01 ${b.start_time}`));

    // Calculate total hours for the day
    const totalHours = dayBookings.reduce((sum, booking) => {
        const start = new Date(`2000/01/01 ${booking.start_time}`);
        const end = new Date(`2000/01/01 ${booking.end_time}`);
        return sum + (end - start) / (1000 * 60 * 60);
    }, 0);

    // Update header with date and total hours
    const formattedDate = selectedDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
    });
    
    const scheduleHeader = document.querySelector('.schedule-header');
    scheduleHeader.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2 id="selectedDate">${formattedDate}</h2>
            ${totalHours > 0 ? `<h3>Day's Hours: ${totalHours.toFixed(1)}</h3>` : ''}
        </div>
    `;

    if (dayBookings.length === 0) {
        dayBookingsDiv.innerHTML = '<p class="no-bookings">No bookings for this day</p>';
        return;
    }

    dayBookingsDiv.innerHTML = dayBookings.map(booking => `
        <div class="booking-item" data-booking-id="${booking.id}">
            <div class="booking-info">
                <h4>${booking.student_name}</h4>
                <p>${booking.start_time} - ${booking.end_time}</p>
            </div>
            <div class="booking-actions">
                <button class="edit-btn" data-booking-id="${booking.id}">Edit</button>
                <button class="delete-btn" data-booking-id="${booking.id}">Delete</button>
            </div>
        </div>
    `).join('');

    attachBookingEventListeners();
}

// Booking Management Functions
function attachBookingEventListeners() {
    const bookingsContainer = document.getElementById('dayBookings');
    bookingsContainer.removeEventListener('click', handleBookingAction);
    bookingsContainer.addEventListener('click', handleBookingAction);
}

function handleBookingAction(event) {
    const target = event.target;
    if (!target.matches('.edit-btn, .delete-btn')) return;
    
    const bookingId = target.dataset.bookingId;
    
    if (target.matches('.edit-btn')) {
        editBooking(bookingId);
    } else if (target.matches('.delete-btn')) {
        deleteBooking(bookingId);
    }
}

async function deleteBooking(bookingId) {
    // Get the booking to be deleted
    const bookingToDelete = bookings.find(b => b.id === bookingId);
    if (!bookingToDelete) return;

    // Check if it's part of a recurring series
    const { data: relatedBookings, error: findError } = await supabaseClient
        .from('bookings')
        .select('*')
        .eq('student_name', bookingToDelete.student_name)
        .eq('start_time', bookingToDelete.start_time)
        .eq('end_time', bookingToDelete.end_time);

    if (findError) {
        console.error('Error checking for recurring bookings:', findError);
        alert('Failed to check recurring bookings. Please try again.');
        return;
    }

    // If there are related bookings (more than 1), ask user what to delete
    if (relatedBookings.length > 1) {
        const isRecurring = confirm(
            `This is part of a recurring booking series with ${relatedBookings.length} bookings.\n\n` +
            'Would you like to delete all recurring bookings in this series?\n\n' +
            'Click OK to delete all recurring bookings.\n' +
            'Click Cancel to delete only this specific booking.'
        );

        if (isRecurring) {
            // Delete all related bookings
            try {
                const { error } = await supabaseClient
                    .from('bookings')
                    .delete()
                    .eq('student_name', bookingToDelete.student_name)
                    .eq('start_time', bookingToDelete.start_time)
                    .eq('end_time', bookingToDelete.end_time);

                if (error) throw error;

                // Update local bookings array to remove all related bookings
                bookings = bookings.filter(booking => 
                    booking.student_name !== bookingToDelete.student_name ||
                    booking.start_time !== bookingToDelete.start_time ||
                    booking.end_time !== bookingToDelete.end_time
                );

                alert(`Successfully deleted ${relatedBookings.length} recurring bookings.`);
            } catch (error) {
                console.error('Error deleting recurring bookings:', error);
                alert('Failed to delete recurring bookings. Please try again.');
                return;
            }
        } else {
            // Delete only the selected booking
            try {
                const { error } = await supabaseClient
                    .from('bookings')
                    .delete()
                    .eq('id', bookingId);

                if (error) throw error;

                // Update local bookings array
                bookings = bookings.filter(booking => booking.id !== bookingId);

                alert('Successfully deleted the selected booking.');
            } catch (error) {
                console.error('Error deleting booking:', error);
                alert('Failed to delete booking. Please try again.');
                return;
            }
        }
    } else {
        // Regular single booking deletion
        if (!confirm('Are you sure you want to delete this booking?')) {
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('bookings')
                .delete()
                .eq('id', bookingId);

            if (error) throw error;

            // Update local bookings array
            bookings = bookings.filter(booking => booking.id !== bookingId);

            alert('Booking deleted successfully.');
        } catch (error) {
            console.error('Error deleting booking:', error);
            alert('Failed to delete booking. Please try again.');
            return;
        }
    }

    // Refresh displays
    generateCalendar();
    displayDayBookings();
    generateStudentInvoiceButtons();
}

async function editBooking(bookingId) {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    // Check if this is part of a recurring series
    const isRecurring = await checkIfRecurring(booking);
    
    // Set selected date to booking's date if not already selected
    const bookingDate = new Date(booking.booking_date);
    if (!selectedDate || selectedDate.toDateString() !== bookingDate.toDateString()) {
        selectedDate = bookingDate;
        generateCalendar();
    }

    document.getElementById('studentSelect').value = booking.student_name;

    // Store the booking ID before updating time slots
    const bookButton = document.getElementById('bookButton');
    bookButton.textContent = 'Update Booking';
    bookButton.dataset.editingId = bookingId;

    // Show recurring checkbox if it's a recurring booking
    const recurringCheckbox = document.getElementById('recurringBooking');
    const recurringOptions = document.getElementById('recurringOptions');
    
    if (isRecurring) {
        recurringCheckbox.checked = true;
        recurringOptions.style.display = 'block';
        // Add a data attribute to track that we're editing a recurring booking
        bookButton.dataset.isRecurring = 'true';
    } else {
        recurringCheckbox.checked = false;
        recurringOptions.style.display = 'none';
        delete bookButton.dataset.isRecurring;
    }

    // Update available time slots
    updateAvailableTimeSlots();

    // Set the selected times
    document.getElementById('startTimeSelect').value = booking.start_time;
    updateEndTimeOptions(booking.start_time);
    document.getElementById('endTimeSelect').value = booking.end_time;

    let cancelButton = document.getElementById('cancelEditButton');
    if (!cancelButton) {
        cancelButton = document.createElement('button');
        cancelButton.id = 'cancelEditButton';
        cancelButton.textContent = 'Cancel Edit';
        cancelButton.className = 'cancel-btn';
        bookButton.parentNode.insertBefore(cancelButton, bookButton.nextSibling);
    }

    cancelButton.onclick = cancelEdit;
}

async function checkIfRecurring(booking) {
    // Find all bookings with same student, start time, and end time
    const { data, error } = await supabaseClient
        .from('bookings')
        .select('*')
        .eq('student_name', booking.student_name)
        .eq('start_time', booking.start_time)
        .eq('end_time', booking.end_time);

    if (error) {
        console.error('Error checking recurring bookings:', error);
        return false;
    }

    // If there's more than one booking with these characteristics,
    // and they're spaced weekly apart, consider it recurring
    if (data.length > 1) {
        const dates = data.map(b => new Date(b.booking_date));
        dates.sort((a, b) => a - b);
        
        // Check if bookings are weekly
        for (let i = 1; i < dates.length; i++) {
            const diffDays = (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
            if (diffDays !== 7) return false;
        }
        return true;
    }
    return false;
}

function cancelEdit() {
    document.getElementById('studentSelect').value = '';
    document.getElementById('startTimeSelect').value = '';
    document.getElementById('endTimeSelect').value = '';

    const bookButton = document.getElementById('bookButton');
    bookButton.textContent = 'Book Class';
    delete bookButton.dataset.editingId;

    const cancelButton = document.getElementById('cancelEditButton');
    if (cancelButton) {
        cancelButton.remove();
    }

    // Reset available time slots
    updateAvailableTimeSlots();
}

// Time Slot Management
function isTimeSlotAvailable() {
    return true; // Always return true to allow concurrent bookings
}


function updateAvailableTimeSlots() {
    if (!selectedDate) return;

    const startTimeSelect = document.getElementById('startTimeSelect');
    const selectedStartTime = startTimeSelect.value;
    
    startTimeSelect.innerHTML = '<option value="">Select start time</option>';
    timeOptions.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        option.disabled = false; // Never disable time slots
        startTimeSelect.appendChild(option);
    });

    if (selectedStartTime) {
        startTimeSelect.value = selectedStartTime;
        updateEndTimeOptions(selectedStartTime);
    }
}

function updateEndTimeOptions(startTime) {
    if (!selectedDate) return;

    const endTimeSelect = document.getElementById('endTimeSelect');
    endTimeSelect.innerHTML = '<option value="">Select end time</option>';
    
    if (startTime) {
        const startIndex = timeOptions.indexOf(startTime);
        const availableEndTimes = timeOptions.slice(startIndex + 1);
        
        availableEndTimes.forEach(time => {
            const option = document.createElement('option');
            option.value = time;
            option.textContent = time;
            option.disabled = false; // Never disable time slots
            endTimeSelect.appendChild(option);
        });
    }
}

async function createRecurringBookings(bookingData, selectedDate) {
    const untilDate = new Date(document.getElementById('recurringUntil').value);
    const bookings = [];
    
    // Start from the selected date
    let currentDate = new Date(selectedDate);
    
    // Create bookings for each week until the end date
    while (currentDate <= untilDate) {
        const bookingForDay = {
            ...bookingData,
            booking_date: formatDateForDatabase(currentDate)
        };
        bookings.push(bookingForDay);
        
        // Move to next week
        currentDate.setDate(currentDate.getDate() + 7);
    }
    
    if (bookings.length === 0) {
        throw new Error('No dates selected for recurring bookings');
    }

    try {
        // Show confirmation with booking count
        const confirmMessage = `This will create ${bookings.length} bookings for every ` +
            `${selectedDate.toLocaleDateString('en-US', { weekday: 'long' })} ` +
            `until ${untilDate.toLocaleDateString()}. Continue?`;
            
        if (!confirm(confirmMessage)) {
            throw new Error('Booking cancelled by user');
        }

        const { data, error } = await supabaseClient
            .from('bookings')
            .insert(bookings)
            .select();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error creating recurring bookings:', error);
        throw error;
    }
}

document.getElementById('recurringBooking').addEventListener('change', function() {
    const recurringOptions = document.getElementById('recurringOptions');
    recurringOptions.style.display = this.checked ? 'block' : 'none';
    
    if (this.checked) {
        // Set minimum date to selected date
        const recurringUntil = document.getElementById('recurringUntil');
        const minDate = selectedDate.toISOString().split('T')[0];
        recurringUntil.min = minDate;
        
        // Set default end date to 3 months from selected date
        const defaultEndDate = new Date(selectedDate);
        defaultEndDate.setMonth(defaultEndDate.getMonth() + 3);
        recurringUntil.value = defaultEndDate.toISOString().split('T')[0];
    }
});

// Booking Form Handler
document.getElementById('bookButton').addEventListener('click', async function() {
    const studentSelect = document.getElementById('studentSelect');
    const startTimeSelect = document.getElementById('startTimeSelect');
    const endTimeSelect = document.getElementById('endTimeSelect');
    const isRecurring = document.getElementById('recurringBooking').checked;
    const editingId = this.dataset.editingId;

    const student = studentSelect.value;
    const startTime = startTimeSelect.value;
    const endTime = endTimeSelect.value;

    if (!student || !startTime || !endTime || !selectedDate) {
        alert('Please fill in all booking details');
        return;
    }

    const start = new Date(`2000/01/01 ${startTime}`);
    const end = new Date(`2000/01/01 ${endTime}`);
    const durationHours = (end - start) / (1000 * 60 * 60);
    const hourlyRate = 1200;
    const classAmount = hourlyRate * durationHours;

    const bookingData = {
        student_name: student,
        booking_date: formatDateForDatabase(selectedDate),
        start_time: startTime,
        end_time: endTime,
        duration_hours: durationHours,
        amount: classAmount
    };

    try {
        let response;
        
        if (editingId) {
            const isRecurringEdit = this.dataset.isRecurring === 'true' && 
                                  document.getElementById('recurringBooking').checked;

            if (isRecurringEdit) {
                // Get the original booking
                const originalBooking = bookings.find(b => b.id === editingId);
                
                // Find all related recurring bookings
                const { data: relatedBookings, error: findError } = await supabaseClient
                    .from('bookings')
                    .select('*')
                    .eq('student_name', originalBooking.student_name)
                    .eq('start_time', originalBooking.start_time)
                    .eq('end_time', originalBooking.end_time);

                if (findError) throw findError;

                if (confirm(`Update all ${relatedBookings.length} recurring bookings in this series?`)) {
                    // Update all related bookings
                    const updates = relatedBookings.map(booking => ({
                        id: booking.id, // Keep original ID
                        student_name: student,
                        booking_date: booking.booking_date, // Keep original dates
                        start_time: startTime,
                        end_time: endTime,
                        duration_hours: durationHours,
                        amount: classAmount
                    }));

                    const { data, error } = await supabaseClient
                        .from('bookings')
                        .upsert(updates)
                        .select();

                    if (error) throw error;
                    response = data;

                    // Update local bookings array
                    bookings = bookings.map(booking => {
                        const update = updates.find(u => u.id === booking.id);
                        return update || booking;
                    });
                } else {
                    // Update single booking only
                    const { data, error } = await supabaseClient
                        .from('bookings')
                        .update(bookingData)
                        .eq('id', editingId)
                        .select();

                    if (error) throw error;
                    response = data;

                    // Update local bookings array
                    const index = bookings.findIndex(b => b.id === editingId);
                    if (index !== -1) {
                        bookings[index] = { ...bookings[index], ...bookingData };
                    }
                }
            } else {
                // Regular single booking update
                const { data, error } = await supabaseClient
                    .from('bookings')
                    .update(bookingData)
                    .eq('id', editingId)
                    .select();

                if (error) throw error;
                response = data;

                // Update local bookings array
                const index = bookings.findIndex(b => b.id === editingId);
                if (index !== -1) {
                    bookings[index] = { ...bookings[index], ...bookingData };
                }
            }
        } else if (isRecurring) {
            response = await createRecurringBookings(bookingData, selectedDate);
        } else {
            const { data, error } = await supabaseClient
                .from('bookings')
                .insert([bookingData])
                .select();

            if (error) throw error;
            response = data;
            
            // Update local bookings array
            if (response) {
                bookings = [...bookings, ...response];
            }
        }

        // Reset form
        studentSelect.value = '';
        startTimeSelect.value = '';
        endTimeSelect.value = '';
        document.getElementById('recurringBooking').checked = false;
        document.getElementById('recurringOptions').style.display = 'none';
        
        if (editingId) {
            // Reset editing state
            const bookButton = document.getElementById('bookButton');
            bookButton.textContent = 'Book Class';
            delete bookButton.dataset.editingId;
            delete bookButton.dataset.isRecurring;
            
            const cancelButton = document.getElementById('cancelEditButton');
            if (cancelButton) {
                cancelButton.remove();
            }
        }

        // Refresh displays
        generateCalendar();
        displayDayBookings();
        generateStudentInvoiceButtons();

    } catch (error) {
        if (error.message === 'Booking cancelled by user') {
            return;
        }
        console.error('Error saving booking:', error);
        alert('Failed to save booking. Please try again.');
    }
});

// Student Management Functions
async function setupStudentManagement() {
    console.log('Setting up student management...');
    
    // Get required elements
    const modal = document.getElementById('studentModal');
    const manageStudentsBtn = document.getElementById('manageStudentsBtn');
    
    // Debug logging
    console.log('Found elements:', {
        modal: modal ? 'Yes' : 'No',
        manageStudentsBtn: manageStudentsBtn ? 'Yes' : 'No'
    });

    if (!modal || !manageStudentsBtn) {
        console.error('Required student management elements not found', {
            modalExists: !!modal,
            buttonExists: !!manageStudentsBtn
        });
        return;
    }

    const closeBtn = modal.querySelector('.close');
    const form = document.getElementById('studentForm');
    
    // More debug logging
    console.log('Additional elements:', {
        closeBtn: closeBtn ? 'Yes' : 'No',
        form: form ? 'Yes' : 'No'
    });

    // Setup manage students button
    manageStudentsBtn.addEventListener('click', () => {
        console.log('Opening student modal');
        modal.style.display = 'block';
        loadStudentsList();
    });

    // Setup close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            console.log('Closing student modal');
            modal.style.display = 'none';
        });
    }

    // Close modal on outside click
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Form submission handler
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('studentName');
            
            try {
                await addStudent(nameInput.value);
                nameInput.value = ''; // Clear input
                await loadStudentsList();
                await updateStudentSelect();
            } catch (error) {
                console.error('Error adding student:', error);
                alert('Failed to add student. Please try again.');
            }
        });
    }

    // Initial data load
    try {
        await loadStudentsList();
        await updateStudentSelect();
        console.log('Student management setup complete');
    } catch (error) {
        console.error('Error during initial student data load:', error);
    }
}

async function loadStudentsList() {
    const studentsList = document.getElementById('studentsList');
    try {
        // Changed to order by 'name' instead of 'last_name'
        const { data: students, error } = await supabaseClient
            .from('students')
            .select('*')
            .order('name', { ascending: true });  // Changed this line

        if (error) throw error;

        studentsList.innerHTML = students.map(student => `
            <div class="student-item" data-id="${student.id}">
                <div class="student-info">
                    <span class="student-name">${student.name}</span>
                </div>
                <div class="student-actions">
                    <button onclick="editStudent('${student.id}')" class="edit-btn">Edit</button>
                    <button onclick="deleteStudent('${student.id}')" class="delete-btn">Delete</button>
                    <button 
                        onclick="toggleStudentStatus('${student.id}', ${!student.active})" 
                        class="toggle-btn ${student.active ? 'active' : 'inactive'}">
                        ${student.active ? 'Active' : 'Inactive'}
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading students:', error);
        studentsList.innerHTML = '<p class="error">Error loading students. Please try again.</p>';
    }
}

async function addStudent(name) {
    if (!name) {
        throw new Error('Name is required');
    }

    try {
        const { data, error } = await supabaseClient
            .from('students')
            .insert([{
                name: name.trim(),
                active: true
            }])
            .select();

        if (error) throw error;
        return data[0];
    } catch (error) {
        console.error('Error adding student:', error);
        throw new Error('Failed to add student');
    }
}

async function updateStudentSelect() {
    const studentSelect = document.getElementById('studentSelect');
    try {
        // Changed to order by 'name' instead of 'last_name'
        const { data: students, error } = await supabaseClient
            .from('students')
            .select('*')
            .eq('active', true)
            .order('name', { ascending: true });  // Changed this line

        if (error) throw error;

        const currentValue = studentSelect.value;
        
        studentSelect.innerHTML = '<option value="">Select student</option>';
        students.forEach(student => {
            const option = document.createElement('option');
            option.value = student.name;
            option.textContent = student.name;
            option.dataset.studentId = student.id;
            studentSelect.appendChild(option);
        });

        if (currentValue) studentSelect.value = currentValue;
    } catch (error) {
        console.error('Error updating student select:', error);
        alert('Failed to load students. Please refresh the page.');
    }
}

async function editStudent(studentId) {
    try {
        const { data: student } = await supabaseClient
            .from('students')
            .select('id, name, active')  // Only select columns that exist
            .eq('id', studentId)
            .single();

        if (!student) throw new Error('Student not found');

        const newName = prompt('Enter new name:', student.name);
        if (!newName || newName === student.name) return;

        const { error } = await supabaseClient
            .from('students')
            .update({ name: newName.trim() })
            .eq('id', studentId);

        if (error) throw error;

        // Update any existing bookings with the new name
        const { error: bookingError } = await supabaseClient
            .from('bookings')
            .update({ student_name: newName.trim() })
            .eq('student_name', student.name);

        if (bookingError) throw bookingError;

        await Promise.all([
            loadStudentsList(),
            updateStudentSelect(),
            fetchBookings()
        ]);

        alert('Student updated successfully!');
    } catch (error) {
        console.error('Error updating student:', error);
        alert('Failed to update student. Please try again.');
    }
}

async function deleteStudent(studentId) {
    try {
        const { data: student } = await supabaseClient
            .from('students')
            .select('name')
            .eq('id', studentId)
            .single();

        if (!student) throw new Error('Student not found');

        const hasBookings = bookings.some(booking => booking.student_name === student.name);
        
        if (hasBookings) {
            const shouldProceed = confirm(
                'This student has existing bookings. ' +
                'Deleting will remove all their booking history. Continue?'
            );
            if (!shouldProceed) return;

            // Delete bookings first
            const { error: bookingsError } = await supabaseClient
                .from('bookings')
                .delete()
                .eq('student_name', student.name);

            if (bookingsError) throw bookingsError;
        }

        // Delete student
        const { error } = await supabaseClient
            .from('students')
            .delete()
            .eq('id', studentId);

        if (error) throw error;

        await Promise.all([
            loadStudentsList(),
            updateStudentSelect(),
            fetchBookings()
        ]);

        alert('Student deleted successfully!');
    } catch (error) {
        console.error('Error deleting student:', error);
        alert('Failed to delete student. Please try again.');
    }
}

async function toggleStudentStatus(studentId, newStatus) {
    try {
        const { error } = await supabaseClient
            .from('students')
            .update({ active: newStatus })
            .eq('id', studentId);

        if (error) throw error;

        await Promise.all([
            loadStudentsList(),
            updateStudentSelect()
        ]);

        alert(`Student ${newStatus ? 'activated' : 'deactivated'} successfully!`);
    } catch (error) {
        console.error('Error toggling student status:', error);
        alert('Failed to update student status. Please try again.');
    }
}

// Add these to the window object for onclick handlers
Object.assign(window, {
    editStudent,
    deleteStudent,
    toggleStudentStatus
});

// Invoice Management Functions
function generateStudentInvoiceButtons() {
    const container = document.getElementById('studentInvoices');
    if (!container) {
        console.error('Student invoices container not found');
        return;
    }

    // Clear the container first
    container.innerHTML = '';

    // Add month selector
    const monthSelector = document.createElement('div');
    monthSelector.className = 'month-selector';
    
    const currentDate = new Date();
    const monthSelect = document.createElement('select');
    monthSelect.id = 'invoiceMonth';
    
    // Get all months from bookings
    const months = [...new Set(bookings.map(booking => {
        const date = new Date(booking.booking_date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }))].sort().reverse(); // Sort in reverse chronological order

    // Default to current month if exists, otherwise latest month
    const currentYearMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    
    monthSelect.innerHTML = months.map(yearMonth => {
        const [year, month] = yearMonth.split('-');
        const date = new Date(year, month - 1);
        const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        return `<option value="${yearMonth}" ${yearMonth === currentYearMonth ? 'selected' : ''}>${monthName}</option>`;
    }).join('');

    monthSelector.appendChild(monthSelect);
    container.appendChild(monthSelector);

    // Create container for invoice buttons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'invoice-buttons-container';
    container.appendChild(buttonsContainer);

    // Add change event listener for month selection
    monthSelect.addEventListener('change', updateInvoiceDisplay);
    
    // Initial display
    updateInvoiceDisplay();
}

// Separate function to update invoice display based on selected month
function updateInvoiceDisplay() {
    const monthSelect = document.getElementById('invoiceMonth');
    const buttonsContainer = document.querySelector('.invoice-buttons-container');
    if (!monthSelect || !buttonsContainer) return;

    const [selectedYear, selectedMonth] = monthSelect.value.split('-');
    const selectedBookings = bookings.filter(booking => {
        const bookingDate = new Date(booking.booking_date);
        return bookingDate.getFullYear() === parseInt(selectedYear) && 
               bookingDate.getMonth() === parseInt(selectedMonth) - 1;
    });

    // Clear existing buttons
    buttonsContainer.innerHTML = '';

    // Get unique students for the selected month
    const uniqueStudents = [...new Set(selectedBookings.map(booking => booking.student_name))];

    uniqueStudents.forEach(student => {
        const studentBookings = selectedBookings.filter(booking => booking.student_name === student);
        const totalAmount = studentBookings.reduce((sum, booking) => sum + booking.amount, 0);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'student-invoice-buttons';

        // Create view button
        const viewButton = document.createElement('button');
        viewButton.textContent = `${student} ($${totalAmount.toFixed(2)})`;
        viewButton.onclick = () => showInvoice(student, selectedYear, selectedMonth);
        viewButton.className = 'view-invoice-btn';
        
        // Create download button
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download PDF';
        downloadButton.className = 'download-btn';
        downloadButton.onclick = () => generatePDF(student, selectedYear, selectedMonth);

        buttonContainer.appendChild(viewButton);
        buttonContainer.appendChild(downloadButton);
        buttonsContainer.appendChild(buttonContainer);
    });

    // Add "All Students" buttons for the month
    if (uniqueStudents.length > 0) {
        const allContainer = document.createElement('div');
        allContainer.className = 'all-invoices-buttons';
        
        const viewAllButton = document.createElement('button');
        viewAllButton.textContent = 'View All Students';
        viewAllButton.onclick = () => showInvoice(null, selectedYear, selectedMonth);
        viewAllButton.className = 'view-all-btn';

        const downloadAllButton = document.createElement('button');
        downloadAllButton.textContent = 'Download All';
        downloadAllButton.className = 'download-all-btn';
        downloadAllButton.onclick = () => generatePDF(null, selectedYear, selectedMonth);

        allContainer.appendChild(viewAllButton);
        allContainer.appendChild(downloadAllButton);
        buttonsContainer.appendChild(allContainer);
    }
}

function showInvoice(studentName = null, year = null, month = null) {
    const invoiceDisplay = document.getElementById('invoiceDisplay');
    if (!invoiceDisplay) return;

    // Use selected month/year or get from select element
    if (!year || !month) {
        const monthSelect = document.getElementById('invoiceMonth');
        [year, month] = monthSelect.value.split('-');
    }

    // Filter bookings for selected month and student
    const monthBookings = bookings.filter(booking => {
        const bookingDate = new Date(booking.booking_date);
        const matchesMonth = bookingDate.getFullYear() === parseInt(year) && 
                           bookingDate.getMonth() === parseInt(month) - 1;
        return matchesMonth && (!studentName || booking.student_name === studentName);
    }).sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date));

    if (monthBookings.length === 0) {
        invoiceDisplay.innerHTML = '<p class="no-bookings">No bookings found for this period</p>';
        return;
    }

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    let html = `
        <div class="invoice-header">
            <h3>Invoice ${studentName ? `for ${studentName}` : '(All Students)'}</h3>
            <h4>${monthName}</h4>
            <p class="invoice-date">Generated: ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="invoice-items">
    `;

    monthBookings.forEach(booking => {
        html += `
            <div class="invoice-item">
                <div class="booking-details">
                    <span class="booking-student">${booking.student_name}</span>
                    <span class="booking-date">${new Date(booking.booking_date).toLocaleDateString()}</span>
                    <span class="booking-time">${booking.start_time} - ${booking.end_time}</span>
                    <span class="booking-duration">${booking.duration_hours} hours</span>
                </div>
                <div class="booking-amount">$${booking.amount.toFixed(2)}</div>
            </div>
        `;
    });

    const totalAmount = monthBookings.reduce((sum, booking) => sum + booking.amount, 0);
    const totalHours = monthBookings.reduce((sum, booking) => sum + booking.duration_hours, 0);
    
    html += `
        </div>
        <div class="invoice-total">
            <div class="total-wrapper">
                <div class="total-hours">Total Hours: ${totalHours.toFixed(1)}</div>
                <div class="total-amount">Total: $${totalAmount.toFixed(2)}</div>
            </div>
        </div>
    `;

    invoiceDisplay.innerHTML = html;
}

function groupBookingsByMonth(bookings) {
    return bookings.reduce((groups, booking) => {
        const date = new Date(booking.booking_date);
        const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        if (!groups[monthKey]) {
            groups[monthKey] = [];
        }
        groups[monthKey].push(booking);
        
        return groups;
    }, {});
}

// Function to generate a merged invoice from two months
function generateMergedInvoice() {
    const firstMonthSelect = document.getElementById('firstMonth');
    const secondMonthSelect = document.getElementById('secondMonth');
    const mergeStudentSelect = document.getElementById('mergeStudentSelect');
    
    const firstMonth = firstMonthSelect.value;
    const secondMonth = secondMonthSelect.value;
    const selectedStudent = mergeStudentSelect.value;
    
    if (!firstMonth || !secondMonth) {
        alert('Please select both months to merge');
        return;
    }
    
    if (firstMonth === secondMonth) {
        alert('Please select two different months to merge');
        return;
    }
    
    // Parse the selected months
    const [firstYear, firstMonthNum] = firstMonth.split('-').map(Number);
    const [secondYear, secondMonthNum] = secondMonth.split('-').map(Number);
    
    // Filter bookings for the selected months
    const firstMonthBookings = bookings.filter(booking => {
        const bookingDate = new Date(booking.booking_date);
        return bookingDate.getFullYear() === firstYear && 
               bookingDate.getMonth() === firstMonthNum - 1;
    });
    
    const secondMonthBookings = bookings.filter(booking => {
        const bookingDate = new Date(booking.booking_date);
        return bookingDate.getFullYear() === secondYear && 
               bookingDate.getMonth() === secondMonthNum - 1;
    });
    
    // Combine all bookings from both months
    const allMergedBookings = [...firstMonthBookings, ...secondMonthBookings];
    
    if (allMergedBookings.length === 0) {
        alert('No bookings found for the selected months');
        return;
    }
    
    // If a specific student is selected, generate only their invoice
    if (selectedStudent) {
        const studentBookings = allMergedBookings.filter(booking => 
            booking.student_name === selectedStudent
        ).sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date));
        
        if (studentBookings.length === 0) {
            alert(`No bookings found for ${selectedStudent} in the selected months`);
            return;
        }
        
        generateMergedPDF(studentBookings, selectedStudent, firstMonth, secondMonth);
    } 
    // If "All Students" is selected, generate individual invoices for each student
    else {
        // Get unique students from the merged bookings
        const uniqueStudents = [...new Set(allMergedBookings.map(booking => booking.student_name))].sort();
        
        if (uniqueStudents.length === 0) {
            alert('No students found with bookings in the selected months');
            return;
        }
        
        // Create a zip file to contain all the PDFs
        const zip = new JSZip();
        let invoiceCount = 0;
        
        // Generate a separate invoice for each student
        uniqueStudents.forEach(student => {
            const studentBookings = allMergedBookings.filter(booking => 
                booking.student_name === student
            ).sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date));
            
            if (studentBookings.length > 0) {
                // Generate PDF for this student
                const pdfDoc = generateMergedPDFForZip(studentBookings, student, firstMonth, secondMonth);
                
                // Add the PDF to the zip file
                if (pdfDoc) {
                    const pdfBlob = pdfDoc.output('blob');
                    const filename = `Merged_Invoice_${sanitizeFilename(student.replace(/\s+/g, '_'))}.pdf`;
                    zip.file(filename, pdfBlob);
                    invoiceCount++;
                }
            }
        });
        
        if (invoiceCount > 0) {
            // Generate and download the zip file
            zip.generateAsync({ type: 'blob' }).then(content => {
                const [firstMonthName, secondMonthName] = getMonthNames(firstMonth, secondMonth);
                const zipFilename = `Merged_Invoices_${firstMonthName.replace(/\s+/g, '_')}_and_${secondMonthName.replace(/\s+/g, '_')}.zip`;
                
                // Create a download link and trigger it
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = zipFilename;
                document.body.appendChild(link);
                link.click();
                
                // Clean up
                URL.revokeObjectURL(link.href);
            }).catch(error => {
                console.error('Error generating zip file:', error);
                alert('Failed to generate zip file. Please try again.');
            });
        } else {
            alert('No invoices were generated. Please check your selection.');
        }
    }
    
    // Close the modal
    document.getElementById('mergeInvoicesModal').style.display = 'none';
}

// Helper function to get month names
function getMonthNames(firstMonth, secondMonth) {
    const [firstYear, firstMonthNum] = firstMonth.split('-').map(Number);
    const [secondYear, secondMonthNum] = secondMonth.split('-').map(Number);
    
    const firstMonthName = new Date(firstYear, firstMonthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const secondMonthName = new Date(secondYear, secondMonthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    
    return [firstMonthName, secondMonthName];
}

// Function to generate a PDF for inclusion in a zip file (returns the PDF object instead of saving it)
function generateMergedPDFForZip(mergedBookings, studentName, firstMonth, secondMonth) {
    try {
        // Get month names
        const [firstMonthName, secondMonthName] = getMonthNames(firstMonth, secondMonth);
        
        // Create PDF document
        const doc = new jsPDF();
        let yPos = 20;
        
        // Header
        doc.setFontSize(20);
        doc.setTextColor(251, 79, 20); // #FB4F14
        doc.text('Merged Invoice', 20, yPos);
        yPos += 10;
        
        // Months and Student
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text(`${firstMonthName} + ${secondMonthName}`, 20, yPos);
        yPos += 10;
        
        doc.text(studentName, 20, yPos);
        yPos += 10;
        
        // Generation date
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPos);
        yPos += 15;
        
        // Column headers
        doc.setFontSize(10);
        doc.text('Date', 20, yPos);
        doc.text('Time', 80, yPos);
        doc.text('Hours', 145, yPos);
        doc.text('Amount', 175, yPos);
        yPos += 8;
        
        // Draw a line under the headers
        doc.setDrawColor(200, 200, 200);
        doc.line(20, yPos - 2, 190, yPos - 2);
        
        // Bookings
        let totalHours = 0;
        let totalAmount = 0;
        
        mergedBookings.forEach(booking => {
            if (yPos > 250) {  // Add a new page if we're near the bottom
                doc.addPage();
                yPos = 20;
            }
            
            const dateStr = new Date(booking.booking_date).toLocaleDateString();
            const timeStr = `${booking.start_time} - ${booking.end_time}`;
            totalHours += booking.duration_hours;
            totalAmount += booking.amount;
            
            doc.text(dateStr, 20, yPos);
            doc.text(timeStr, 80, yPos);
            doc.text(booking.duration_hours.toString(), 145, yPos);
            doc.text(`$${booking.amount.toFixed(2)}`, 175, yPos);
            
            yPos += 8;
        });
        
        // Draw a line above the totals
        yPos += 5;
        doc.setDrawColor(200, 200, 200);
        doc.line(20, yPos - 2, 190, yPos - 2);
        
        // Totals
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Total:', 105, yPos + 5);
        doc.text(totalHours.toString(), 145, yPos + 5);
        doc.text(`$${totalAmount.toFixed(2)}`, 175, yPos + 5);
        
        // Add footer text
        yPos = doc.internal.pageSize.height - 30; // Position footer 30 units from bottom
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.setFont(undefined, 'normal');
        doc.text('Thank you for your business. If you have any questions please feel free to ask.', 20, yPos);
        yPos += 10;
        doc.text('Sincerely yours,', 20, yPos);
        yPos += 7;
        doc.text('Ryan Lazowski', 20, yPos);
        
        return doc;
        
    } catch (error) {
        console.error('Error generating merged PDF for zip:', error);
        return null;
    }
}

// Function to generate a PDF with merged bookings from two months
function generateMergedPDF(mergedBookings, studentName, firstMonth, secondMonth) {
    try {
        // Get month names
        const [firstMonthName, secondMonthName] = getMonthNames(firstMonth, secondMonth);
        
        // Create PDF document
        const doc = new jsPDF();
        let yPos = 20;
        
        // Header
        doc.setFontSize(20);
        doc.setTextColor(251, 79, 20); // #FB4F14
        doc.text('Merged Invoice', 20, yPos);
        yPos += 10;
        
        // Months and Student
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text(`${firstMonthName} + ${secondMonthName}`, 20, yPos);
        yPos += 10;
        
        if (studentName) {
            doc.text(studentName, 20, yPos);
            yPos += 10;
        }
        
        // Generation date
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPos);
        yPos += 15;
        
        // Column headers
        doc.setFontSize(10);
        doc.text('Date', 20, yPos);
        if (!studentName) {
            doc.text('Student', 55, yPos);
            doc.text('Time', 105, yPos);
        } else {
            doc.text('Time', 80, yPos);
        }
        doc.text('Hours', 145, yPos);
        doc.text('Amount', 175, yPos);
        yPos += 8;
        
        // Draw a line under the headers
        doc.setDrawColor(200, 200, 200);
        doc.line(20, yPos - 2, 190, yPos - 2);
        
        // Bookings
        let totalHours = 0;
        let totalAmount = 0;
        
        mergedBookings.forEach(booking => {
            if (yPos > 250) {  // Add a new page if we're near the bottom
                doc.addPage();
                yPos = 20;
            }
            
            const dateStr = new Date(booking.booking_date).toLocaleDateString();
            const timeStr = `${booking.start_time} - ${booking.end_time}`;
            totalHours += booking.duration_hours;
            totalAmount += booking.amount;
            
            doc.text(dateStr, 20, yPos);
            if (!studentName) {
                doc.text(booking.student_name, 55, yPos);
                doc.text(timeStr, 105, yPos);
            } else {
                doc.text(timeStr, 80, yPos);
            }
            doc.text(booking.duration_hours.toString(), 145, yPos);
            doc.text(`$${booking.amount.toFixed(2)}`, 175, yPos);
            
            yPos += 8;
        });
        
        // Draw a line above the totals
        yPos += 5;
        doc.setDrawColor(200, 200, 200);
        doc.line(20, yPos - 2, 190, yPos - 2);
        
        // Totals
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Total:', 105, yPos + 5);
        doc.text(totalHours.toString(), 145, yPos + 5);
        doc.text(`$${totalAmount.toFixed(2)}`, 175, yPos + 5);
        
        // Add footer text
        yPos = doc.internal.pageSize.height - 30; // Position footer 30 units from bottom
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.setFont(undefined, 'normal');
        doc.text('Thank you for your business. If you have any questions please feel free to ask.', 20, yPos);
        yPos += 10;
        doc.text('Sincerely yours,', 20, yPos);
        yPos += 7;
        doc.text('Ryan Lazowski', 20, yPos);
        
        // Save the PDF
        const shortMonthName = new Date(year, month - 1).toLocaleString('default', { month: 'short' });
        const filename = studentName 
            ? `Invoice_${shortMonthName}_${year}_${sanitizeFilename(studentName.replace(/\s+/g, '_'))}.pdf` 
            : `Invoice_${shortMonthName}_${year}_All_Students.pdf`;
        
        doc.save(filename);
    } catch (error) {
        console.error('Error generating merged PDF:', error);
        alert('Failed to generate merged invoice. Please try again.');
    }
}

// Function to generate a PDF
function generatePDF(studentName = null, year = null, month = null) {
    try {
        // Use selected month/year or get from select element
        if (!year || !month) {
            const monthSelect = document.getElementById('invoiceMonth');
            [year, month] = monthSelect.value.split('-');
        }

        // Filter bookings for selected month and student
        const monthBookings = bookings.filter(booking => {
            const bookingDate = new Date(booking.booking_date);
            const matchesMonth = bookingDate.getFullYear() === parseInt(year) && 
                               bookingDate.getMonth() === parseInt(month) - 1;
            return matchesMonth && (!studentName || booking.student_name === studentName);
        }).sort((a, b) => new Date(a.booking_date) - new Date(b.booking_date));

        if (monthBookings.length === 0) {
            alert('No bookings found for this period');
            return;
        }

        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
        const doc = new jsPDF();
        let yPos = 20;

        // Header
        doc.setFontSize(20);
        doc.setTextColor(251, 79, 20); // #FB4F14
        doc.text('Class Schedule Invoice', 20, yPos);
        yPos += 10;

        // Month and Student
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text(monthName, 20, yPos);
        yPos += 10;
        if (studentName) {
            doc.text(studentName, 20, yPos);
            yPos += 10;
        }

        // Generation date
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPos);
        yPos += 15;

        // Column headers
        doc.setFontSize(10);
        doc.text('Date', 20, yPos);
        doc.text('Student', 55, yPos);
        doc.text('Time', 105, yPos);
        doc.text('Hours', 145, yPos);
        doc.text('Amount', 175, yPos);
        yPos += 8;

        // Bookings
        let totalHours = 0;
        monthBookings.forEach(booking => {
            if (yPos > 250) {  // Reduced max height to accommodate footer
                doc.addPage();
                yPos = 20;
            }

            const dateStr = new Date(booking.booking_date).toLocaleDateString();
            const timeStr = `${booking.start_time} - ${booking.end_time}`;
            totalHours += booking.duration_hours;

            doc.text(dateStr, 20, yPos);
            doc.text(booking.student_name, 55, yPos);
            doc.text(timeStr, 105, yPos);
            doc.text(booking.duration_hours.toString(), 145, yPos);
            doc.text(`$${booking.amount.toFixed(2)}`, 175, yPos);

            yPos += 8;
        });

        // Totals
        const totalAmount = monthBookings.reduce((sum, booking) => sum + booking.amount, 0);
        yPos += 5;
        doc.setFontSize(12);
        doc.setTextColor(251, 79, 20);
        doc.text(`Total Hours: ${totalHours.toFixed(1)}`, 105, yPos);
        doc.text(`Total: $${totalAmount.toFixed(2)}`, 150, yPos);
        
        // Add footer text
        yPos = doc.internal.pageSize.height - 30; // Position footer 30 units from bottom
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text('Thank you for your business. If you have any questions please feel free to ask.', 20, yPos);
        yPos += 10;
        doc.text('Sincerely yours,', 20, yPos);
        yPos += 7;
        doc.text('Ryan Lazowski', 20, yPos);

        // Save the PDF
        const shortMonthName = new Date(year, month - 1).toLocaleString('default', { month: 'short' });
        const filename = studentName 
            ? `Invoice_${shortMonthName}_${year}_${sanitizeFilename(studentName.replace(/\s+/g, '_'))}.pdf` 
            : `Invoice_${shortMonthName}_${year}_All_Students.pdf`;
        
        doc.save(filename);
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate PDF. Please try again.');
    }
}

// Function to generate all PDFs for a month
async function generateAllPDFs(year = null, month = null) {
    try {
        // Use selected month/year or get from select element
        if (!year || !month) {
            const monthSelect = document.getElementById('invoiceMonth');
            [year, month] = monthSelect.value.split('-');
        }

        // Get all bookings for the selected month
        const monthBookings = bookings.filter(booking => {
            const bookingDate = new Date(booking.booking_date);
            return bookingDate.getFullYear() === parseInt(year) && 
                   bookingDate.getMonth() === parseInt(month) - 1;
        });

        if (monthBookings.length === 0) {
            alert('No bookings found for this period');
            return;
        }

        // Group bookings by student
        const studentBookings = monthBookings.reduce((acc, booking) => {
            if (!acc[booking.student_name]) {
                acc[booking.student_name] = [];
            }
            acc[booking.student_name].push(booking);
            return acc;
        }, {});

        // Generate a PDF for each student
        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
        const shortMonthName = new Date(year, month - 1).toLocaleString('default', { month: 'short' });
        const zip = new JSZip();

        // Process each student's bookings
        for (const [studentName, bookings] of Object.entries(studentBookings)) {
            const doc = new jsPDF();
            let yPos = 20;

            // Header
            doc.setFontSize(20);
            doc.setTextColor(251, 79, 20); // #FB4F14
            doc.text('Class Schedule Invoice', 20, yPos);
            yPos += 10;

            // Month and Student
            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text(monthName, 20, yPos);
            yPos += 10;
            doc.text(studentName, 20, yPos);
            yPos += 10;

            // Generation date
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPos);
            yPos += 15;

            // Column headers
            doc.setFontSize(10);
            doc.text('Date', 20, yPos);
            doc.text('Time', 80, yPos);
            doc.text('Duration', 140, yPos);
            doc.text('Amount', 175, yPos);
            yPos += 8;

            // Sort bookings by date
            const sortedBookings = bookings.sort((a, b) => 
                new Date(a.booking_date) - new Date(b.booking_date)
            );

            // Add bookings
            let totalAmount = 0;
            sortedBookings.forEach(booking => {
                if (yPos > 270) {  // Check if we need a new page
                    doc.addPage();
                    yPos = 20;
                }

                const dateStr = new Date(booking.booking_date).toLocaleDateString();
                const timeStr = `${booking.start_time} - ${booking.end_time}`;
                const durationStr = `${booking.duration_hours}hrs`;
                const amountStr = `$${booking.amount.toFixed(2)}`;

                doc.text(dateStr, 20, yPos);
                doc.text(timeStr, 80, yPos);
                doc.text(durationStr, 140, yPos);
                doc.text(amountStr, 175, yPos);

                totalAmount += booking.amount;
                yPos += 8;
            });

            // Total
            yPos += 5;
            doc.setFontSize(12);
            doc.setTextColor(251, 79, 20);
            doc.text(`Total: $${totalAmount.toFixed(2)}`, 150, yPos);
            
            // Add footer text
            yPos = doc.internal.pageSize.height - 30; // Position footer 30 units from bottom
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text('Thank you for your business. If you have any questions please feel free to ask.', 20, yPos);
            yPos += 10;
            doc.text('Sincerely yours,', 20, yPos);
            yPos += 7;
            doc.text('Ryan Lazowski', 20, yPos);

            // Add PDF to zip
            const pdfBlob = doc.output('blob');
            const filename = `Invoice_${shortMonthName}_${year}_${sanitizeFilename(studentName.replace(/\s+/g, '_'))}.pdf`;
            zip.file(filename, pdfBlob);
        }

        // Generate and download zip file
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipFilename = `Invoices_${shortMonthName}_${year}.zip`;
        
        // Create download link and trigger download
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(zipBlob);
        downloadLink.download = zipFilename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadLink.href);

    } catch (error) {
        console.error('Error generating PDFs:', error);
        alert('Failed to generate PDFs. Please try again.');
    }
}

// Event Listeners for Invoice Buttons
document.getElementById('showAllInvoices')?.addEventListener('click', () => showInvoice());
document.getElementById('downloadAllInvoices').addEventListener('click', () => generateAllPDFs());
document.getElementById('mergeInvoices').addEventListener('click', () => {
    populateMergeInvoicesModal();
    document.getElementById('mergeInvoicesModal').style.display = 'block';
});

// Month Navigation Setup
function setupMonthNavigation() {
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    if (prevMonthBtn && nextMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
            currentDate = newDate;
            generateCalendar();
        });

        nextMonthBtn.addEventListener('click', () => {
            const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            currentDate = newDate;
            generateCalendar();
        });
    }
}

// Time Selection Event Handlers
function setupTimeSelectionHandlers() {
    const startTimeSelect = document.getElementById('startTimeSelect');
    if (startTimeSelect) {
        startTimeSelect.addEventListener('change', function() {
            updateEndTimeOptions(this.value);
        });
    }
}

// Export function for global access to student management
function setupGlobalFunctions() {
    // These functions need to be globally accessible for HTML onclick handlers
    window.deleteStudent = deleteStudent;
    window.editStudent = editStudent;
    window.toggleStudentStatus = toggleStudentStatus;
}

// Modal Event Handlers
function setupModalHandlers() {
    // Student modal handlers
    const studentModal = document.getElementById('studentModal');
    const manageStudentsBtn = document.getElementById('manageStudentsBtn');
    const closeStudentModal = studentModal.querySelector('.close');

    manageStudentsBtn.addEventListener('click', () => {
        studentModal.style.display = 'block';
    });

    closeStudentModal.addEventListener('click', () => {
        studentModal.style.display = 'none';
    });

    // Merge Invoices modal handlers
    const mergeInvoicesModal = document.getElementById('mergeInvoicesModal');
    const mergeInvoicesBtn = document.getElementById('mergeInvoices');
    const closeMergeModal = mergeInvoicesModal.querySelector('.close');

    mergeInvoicesBtn.addEventListener('click', () => {
        populateMergeInvoicesModal();
        mergeInvoicesModal.style.display = 'block';
    });

    closeMergeModal.addEventListener('click', () => {
        mergeInvoicesModal.style.display = 'none';
    });

    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === studentModal) {
            studentModal.style.display = 'none';
        }
        if (event.target === mergeInvoicesModal) {
            mergeInvoicesModal.style.display = 'none';
        }
    });
}

// Function to populate the merge invoices modal with available months and students
function populateMergeInvoicesModal() {
    const firstMonthSelect = document.getElementById('firstMonth');
    const secondMonthSelect = document.getElementById('secondMonth');
    const mergeStudentSelect = document.getElementById('mergeStudentSelect');
    
    // Clear existing options
    firstMonthSelect.innerHTML = '';
    secondMonthSelect.innerHTML = '';
    mergeStudentSelect.innerHTML = '<option value="">All Students</option>';
    
    // Get all months from bookings
    const months = [...new Set(bookings.map(booking => {
        const date = new Date(booking.booking_date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }))].sort().reverse(); // Sort in reverse chronological order
    
    // Populate month selects
    months.forEach(yearMonth => {
        const [year, month] = yearMonth.split('-');
        const date = new Date(year, month - 1);
        const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        const firstOption = document.createElement('option');
        firstOption.value = yearMonth;
        firstOption.textContent = monthName;
        
        const secondOption = document.createElement('option');
        secondOption.value = yearMonth;
        secondOption.textContent = monthName;
        
        firstMonthSelect.appendChild(firstOption);
        secondMonthSelect.appendChild(secondOption);
    });
    
    // Set default second month to be different from first if possible
    if (months.length > 1) {
        secondMonthSelect.selectedIndex = 1;
    }
    
    // Get all unique students
    const uniqueStudents = [...new Set(bookings.map(booking => booking.student_name))].sort();
    
    // Populate student select
    uniqueStudents.forEach(student => {
        const option = document.createElement('option');
        option.value = student;
        option.textContent = student;
        mergeStudentSelect.appendChild(option);
    });
    
    // Add event listener for the generate button
    document.getElementById('generateMergedInvoice').onclick = generateMergedInvoice;
}

// Error Handler Setup
function setupErrorHandling() {
    window.onerror = function(msg, url, lineNo, columnNo, error) {
        console.error('Error: ', msg, '\nURL: ', url, '\nLine: ', lineNo, '\nColumn: ', columnNo, '\nError object: ', error);
        return false;
    };

    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection:', event.reason);
    });
}

// Main initialization function
async function init() {
    try {
        console.log('Initializing application...');

        // Setup error handling first
        setupErrorHandling();

        // Setup all event handlers and UI components
        setupMonthNavigation();
        setupTimeSelectionHandlers();
        setupModalHandlers();
        setupFormHandlers();
        setupKeyboardHandlers();
        setupGlobalFunctions();
        
        // Initialize student management
        await setupStudentManagement();
        
        // Initial data loading
        await Promise.all([
            fetchBookings(),
            updateStudentSelect()
        ]);

        // Generate initial calendar
        generateCalendar();

        // Set up initial time slots
        const startTimeSelect = document.getElementById('startTimeSelect');
        const endTimeSelect = document.getElementById('endTimeSelect');
        
        if (startTimeSelect && endTimeSelect) {
            // Initialize time select options
            timeOptions.forEach(time => {
                const option = document.createElement('option');
                option.value = time;
                option.textContent = time;
                startTimeSelect.appendChild(option.cloneNode(true));
            });
        }

        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
        alert('Failed to initialize the application. Please refresh the page.');
    }
}

// Utility function for date formatting
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Utility function for time calculations
function calculateDuration(startTime, endTime) {
    const start = new Date(`2000/01/01 ${startTime}`);
    const end = new Date(`2000/01/01 ${endTime}`);
    return (end - start) / (1000 * 60 * 60); // Duration in hours
}

// Utility function for currency formatting
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Utility function for input validation
function validateInput(input, type = 'text') {
    const patterns = {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phone: /^\+?[\d\s-()]{10,}$/,
        text: /^.+$/
    };

    return patterns[type].test(input);
}

// Form Handlers
function setupFormHandlers() {
    // Student Form Handler
    const studentForm = document.getElementById('studentForm');
    if (studentForm) {
        studentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const studentName = document.getElementById('studentName').value.trim();
            if (studentName) {
                await addStudent(studentName);
                document.getElementById('studentName').value = '';
            }
        });
    }

    // Cancel buttons in forms
    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
}

// Setup keyboard event listeners
function setupKeyboardHandlers() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Close any open modals
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        }
    });
}