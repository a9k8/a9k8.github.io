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

// Global initialization call
document.addEventListener('DOMContentLoaded', () => {
    renderAbout();
});
