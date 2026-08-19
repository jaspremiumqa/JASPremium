document.addEventListener("DOMContentLoaded", function () {
        setupContactValidation();
});

function setupContactValidation() {
    const nameInput = document.getElementById("contact-full-name");
    const phoneInput = document.getElementById("contact-phone");
    const bookButton = document.querySelector("button[type='submit']");
    const form = document.querySelector("form");

    if (!nameInput || !phoneInput || !bookButton || !form) return;

    function validateForm() {
        const nameValid = nameInput.value.trim().length > 0;
        const phoneValid = phoneInput.value.trim().length > 0 && /^[0-9]+$/.test(phoneInput.value.trim());
        bookButton.disabled = !(nameValid && phoneValid);
    }

    nameInput.addEventListener("input", validateForm);
    phoneInput.addEventListener("input", validateForm);

    // Intercept submit
    form.addEventListener("submit", function (e) {
        e.preventDefault(); // stop default redirect
        bookButton.disabled = true;
        bookButton.textContent = "Sending...";

        fetch(form.action, {
            method: form.method,
            body: new FormData(form),
            headers: { 'Accept': 'application/json' }
        }).then(response => {
            if (response.ok) {
                alert("Thanks! We will contact you soon.");
                form.reset();
                validateForm();
            } else {
                alert("Oops! Something went wrong.");
            }
            bookButton.textContent = "SEND REQUEST";
            bookButton.disabled = false;
            // Redirect back to index.html after alert is closed
            window.location.href = "index.html";
        });
    });

    validateForm();
}