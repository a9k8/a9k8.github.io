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

// Render contact icons on the About/Home page
async function renderAboutGeneralInfo() {
    try {
        const response = await fetch('data/cv.yaml');
        const yamlText = await response.text();
        const cvSections = jsyaml.load(yamlText);
        const container = document.getElementById('about-general-info');
        if (!container) return;

        const generalSection = cvSections.find(s => s.title.toLowerCase().includes('general information'));
        if (!generalSection) return;

        const iconMap = {
            'email': 'fa-solid fa-envelope',
            'linkedin': 'fa-brands fa-linkedin'
        };

        container.innerHTML = generalSection.contents.map(item => {
            const key = item.name.toLowerCase();
            const icon = iconMap[key];
            if (!icon) return '';

            if (key === 'email') {
                return `<div class="info-item"><a href="mailto:${item.value}" class="social-icon" title="${item.value}"><i class="${icon}"></i></a></div>`;
            } else if (key === 'linkedin') {
                return `<div class="info-item"><a href="${item.value}" target="_blank" rel="noopener noreferrer" class="social-icon" title="LinkedIn Profile"><i class="${icon}"></i></a></div>`;
            } else {
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.value)}`;
                return `<div class="info-item"><i class="${icon}"></i><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${item.value}</a></div>`;
            }
        }).join('');
    } catch (error) {
        console.error('Error loading about general info:', error);
    }
}

// Global initialization call
document.addEventListener('DOMContentLoaded', () => {
    renderAbout();
    renderAboutGeneralInfo();
});

