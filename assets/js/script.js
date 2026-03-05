// Render About section
async function renderAbout() {
    try {
        const response = await fetch('data/about.yaml');
        const yamlText = await response.text();
        const data = jsyaml.load(yamlText);
        const aboutText = document.getElementById('about-text');

        const lines = data.content.split('\n');
        let html = '';
        let inList = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.trim().startsWith('- ')) {
                if (!inList) {
                    html += '<ul>';
                    inList = true;
                }
                html += `<li>${formatText(line.trim().substring(2))}</li>`;
            } else if (line.trim() === '') {
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
            } else if (line.trim()) {
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
                html += `<p>${formatText(line.trim())}</p>`;
            }
        }

        if (inList) html += '</ul>';

        aboutText.innerHTML = html;
        colorizeLinksInElement(aboutText);
    } catch (error) {
        console.error('Error loading about data:', error);
    }
}

// Render General Info
async function renderGeneralInfo() {
    try {
        const config = await loadConfig();
        if (!config) return;

        const container = document.getElementById('general-info');
        if (!container) return;

        container.innerHTML = `
            <div class="info-item">
                <i class="fa-solid fa-user"></i>
                <span>${config.name || 'Aniket Junghare'}</span>
            </div>
            <div class="info-item">
                <i class="fa-solid fa-envelope"></i>
                <a href="mailto:${config.email}">${config.email}</a>
            </div>
            <div class="info-item">
                <a href="${config.linkedin}" target="_blank" rel="noopener noreferrer" class="social-icon" title="LinkedIn Profile">
                    <i class="fa-brands fa-linkedin"></i>
                </a>
            </div>
            <div class="info-item">
                <i class="fa-solid fa-location-dot"></i>
                <span>${config.location || 'Mumbai, India'}</span>
            </div>
        `;
    } catch (error) {
        console.error('Error loading general info:', error);
    }
}

// Global initialization call
document.addEventListener('DOMContentLoaded', () => {
    renderAbout();
    renderGeneralInfo();
});
