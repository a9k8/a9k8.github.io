// SPA Routing Logic
function handleRouting() {
    const hash = window.location.hash || '#about';
    const sectionId = hash.substring(1);
    const sections = document.querySelectorAll('.spa-section');
    const navLinks = document.querySelectorAll('.nav-link');

    let sectionFound = false;

    sections.forEach(section => {
        if (section.id === sectionId) {
            section.classList.remove('hidden');
            sectionFound = true;
        } else {
            section.classList.add('hidden');
        }
    });

    // Fallback if sectionId is not found
    if (!sectionFound) {
        const aboutSection = document.getElementById('about');
        if (aboutSection) aboutSection.classList.remove('hidden');
    }

    // Update active nav link
    navLinks.forEach(link => {
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Scroll to top when changing sections
    window.scrollTo(0, 0);
}

// Initialize SPA
window.addEventListener('hashchange', handleRouting);

// Call on initial load
document.addEventListener('DOMContentLoaded', () => {
    handleRouting();

    // Global colorization after a slight delay for dynamic content
    setTimeout(colorizeLinks, 100);
});
