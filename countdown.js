// Countdown Timer for Claudetorio
// Target: 3 days from now

(function() {
    // Calculate target date: 3 days from now
    const now = new Date();
    const targetDate = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    // Store target in localStorage so it persists across refreshes
    const storedTarget = localStorage.getItem('claudetorio-countdown-target');
    let countdownTarget;

    if (storedTarget) {
        countdownTarget = new Date(parseInt(storedTarget, 10));
        // If stored target has passed, reset to 3 days from now
        if (countdownTarget <= new Date()) {
            countdownTarget = targetDate;
            localStorage.setItem('claudetorio-countdown-target', targetDate.getTime().toString());
        }
    } else {
        countdownTarget = targetDate;
        localStorage.setItem('claudetorio-countdown-target', targetDate.getTime().toString());
    }

    // DOM elements
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = countdownTarget.getTime() - now;

        if (distance <= 0) {
            // Countdown finished
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            return;
        }

        // Calculate time units
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        // Update display with leading zeros
        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');

        // Add pulse effect on second change
        secondsEl.classList.add('tick');
        setTimeout(() => secondsEl.classList.remove('tick'), 100);
    }

    // Initial update
    updateCountdown();

    // Update every second
    setInterval(updateCountdown, 1000);
})();
