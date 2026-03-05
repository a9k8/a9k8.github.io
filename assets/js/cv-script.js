// Render CV section
async function renderCV() {
    try {
        const response = await fetch('data/cv.yaml');
        const yamlText = await response.text();
        const cvSections = jsyaml.load(yamlText);
        const container = document.getElementById('cv-container');

        const cvHTML = cvSections.map(section => {
            let html = `<div class="cv-section">
                <h2 class="cv-section-title">${formatText(section.title)}</h2>`;

            if (section.type === 'map') {
                html += section.contents.map(item => `
                    <div class="cv-map">
                        <div class="cv-map-name">${item.name}:</div>
                        <div class="cv-map-value">${formatText(item.value)}</div>
                    </div>
                `).join('');
            } else if (section.type === 'time_table') {
                html += section.contents.map(item => {
                    let itemHtml = `
                        <div class="cv-timetable-item">
                            <div class="cv-timetable-title">${formatText(item.title)}</div>
                            <div class="cv-timetable-institution">${formatText(item.institution || '')}</div>
                            <div class="cv-timetable-year">${item.year || ''}</div>`;

                    if (item.description && Array.isArray(item.description)) {
                        itemHtml += `<div class="cv-timetable-description">
                            <ul>${item.description.map(desc => `<li>${formatText(desc)}</li>`).join('')}</ul>
                        </div>`;
                    }

                    itemHtml += `</div>`;
                    return itemHtml;
                }).join('');
            } else if (section.type === 'list') {
                html += `<ul class="cv-list">${section.contents.map(item => `<li>${formatText(item)}</li>`).join('')}</ul>`;
            }

            html += `</div>`;
            return html;
        }).join('');

        container.innerHTML = cvHTML;
        colorizeLinksInElement(container);
    } catch (error) {
        console.error('Error loading CV data:', error);
    }
}

// Render General Info (contact details with icons) in CV section
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

document.addEventListener('DOMContentLoaded', () => {
    renderCV();
    renderGeneralInfo();
});
