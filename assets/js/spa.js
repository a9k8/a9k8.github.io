// SPA Routing Logic - No Hashes
function showSection(sectionId) {
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
        if (link.getAttribute('data-section') === sectionId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Scroll to top when changing sections
    window.scrollTo(0, 0);
}

// Handle Navigation Clicks
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const sectionId = link.getAttribute('data-section');
            if (sectionId) {
                showSection(sectionId);
            }
        });
    });
}

// Initialize SPA
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();

    // Default to about if no hash (to handle legacy links if needed, or just default)
    // But since we want NO hashes, we just show 'about'
    showSection('about');

    // Global colorization after a slight delay for dynamic content
    setTimeout(colorizeLinks, 100);
});
