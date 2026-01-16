// Countdown Timer for Claudetorio
// Target: January 21, 2026

(function() {
    // Fixed launch date: January 21, 2026 at midnight PST
    const countdownTarget = new Date('2026-01-21T00:00:00-08:00');

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

// Email Signup Form Handler
(function() {
    const form = document.getElementById('signup-form');
    const emailInput = document.getElementById('email-input');
    const submitBtn = document.getElementById('submit-btn');
    const widgetPanel = document.querySelector('.widget-panel');
    const successMessage = document.getElementById('success-message');

    // Google Apps Script Web App URL (same as spooky-agent)
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzA6B_i4IACy-EcDsz_bdMu5wHmJ-pNe-z2rUl67xevVgRWP4svueHGNMs2l2A2DEGPDg/exec';

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = emailInput.value.trim();
        if (!email) return;

        // Disable form during submission
        emailInput.disabled = true;
        submitBtn.disabled = true;

        try {
            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email })
            });

            // Show success state
            widgetPanel.classList.add('submitted');
            successMessage.classList.add('visible');
            emailInput.value = '';

            // Reset after 3 seconds
            setTimeout(() => {
                widgetPanel.classList.remove('submitted');
                successMessage.classList.remove('visible');
                emailInput.disabled = false;
                submitBtn.disabled = false;
            }, 3000);

        } catch (error) {
            console.error('Error submitting email:', error);
            emailInput.disabled = false;
            submitBtn.disabled = false;
        }
    });
})();
