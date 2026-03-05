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
                const isGeneralInfo = section.title && section.title.toLowerCase().includes('general information');
                if (isGeneralInfo) {
                    const iconMap = {
                        'full name': 'fa-solid fa-user',
                        'email': 'fa-solid fa-envelope',
                        'linkedin': 'fa-brands fa-linkedin',
                        'location': 'fa-solid fa-location-dot'
                    };
                    html += `<div class="general-info-container">`;
                    html += section.contents.map(item => {
                        const key = item.name.toLowerCase();
                        const icon = iconMap[key] || 'fa-solid fa-circle-info';
                        let valueHtml;
                        if (key === 'email') {
                            valueHtml = `<a href="mailto:${item.value}">${item.value}</a>`;
                        } else if (key === 'linkedin') {
                            valueHtml = `<a href="${item.value}" target="_blank" rel="noopener noreferrer" class="social-icon" title="LinkedIn Profile"><i class="${icon}"></i></a>`;
                            return `<div class="info-item">${valueHtml}</div>`;
                        } else {
                            valueHtml = `<span>${item.value}</span>`;
                        }
                        return `<div class="info-item"><i class="${icon}"></i>${valueHtml}</div>`;
                    }).join('');
                    html += `</div>`;
                } else {
                    html += section.contents.map(item => `
                    <div class="cv-map">
                        <div class="cv-map-name">${item.name}:</div>
                        <div class="cv-map-value">${formatText(item.value)}</div>
                    </div>
                `).join('');
                }
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

document.addEventListener('DOMContentLoaded', () => {
    renderCV();
});
