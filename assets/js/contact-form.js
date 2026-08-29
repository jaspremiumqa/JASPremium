document.addEventListener("DOMContentLoaded", function () {
    setupContactValidation();
});

function setupContactValidation() {
    const nameInput = document.getElementById("contact-full-name");
    const phoneInput = document.getElementById("contact-phone");
    const form = document.getElementById("contact-form");
    const submitButton = form ? form.querySelector("button[type='submit']") : null;

    if (!nameInput || !phoneInput || !form || !submitButton) return;

    const FORMSPREE_ENDPOINT = "https://formspree.io/f/xaeynyqp";

    function validateForm() {
        const nameValid = nameInput.value.trim().length > 0;
        const phoneValid = phoneInput.value.trim().length > 0 && /^[0-9+\\s()-]+$/.test(phoneInput.value.trim());
        submitButton.disabled = !(nameValid && phoneValid);
    }

    nameInput.addEventListener("input", validateForm);
    phoneInput.addEventListener("input", validateForm);

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (submitButton.disabled) return;

        submitButton.disabled = true;
        const originalLabel = submitButton.textContent;
        submitButton.textContent = "SENDING...";

        const payload = new FormData(form);
        payload.set("name", nameInput.value.trim());
        payload.set("phone", phoneInput.value.trim());
        payload.set("_subject", "JAS Premium website contact request");

        let crmSaved = false;
        let crmError = null;

        try {
            // Submit to Formspree using a native POST into a hidden iframe.
            // This preserves the original Formspree behaviour and avoids
            // browsers/extensions blocking an AJAX CORS request.
            form.action = FORMSPREE_ENDPOINT;
            form.method = "POST";
            form.target = "contact-formspree-frame";
            form.dataset.formspreeSubmission = "true";
            HTMLFormElement.prototype.submit.call(form);

            // Store the same enquiry in the CRM in parallel.
            if (window.salonSupabase) {
                const crmResult = await window.salonSupabase.from("contact_messages").insert({
                    name: nameInput.value.trim(),
                    phone: phoneInput.value.trim(),
                    status: "new"
                });
                if (crmResult.error) crmError = crmResult.error;
                else crmSaved = true;
            } else {
                crmError = new Error("CRM unavailable");
            }

            form.reset();
            validateForm();

            if (crmSaved) {
                alert("Thanks! We will contact you soon.");
            } else {
                console.warn("Formspree submission was sent, but the CRM record could not be saved:", crmError);
                alert("Thanks! Your request was sent. We will contact you soon.");
            }
        } catch (error) {
            console.error("Could not submit contact request:", error);
            alert("Oops! Something went wrong. Please try again.");
            validateForm();
        } finally {
            // Restore normal form behaviour for the next submission.
            form.target = "";
            form.dataset.formspreeSubmission = "";
            submitButton.textContent = originalLabel;
            submitButton.disabled = false;
        }
    });
    validateForm();
}
