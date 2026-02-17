// Parse markdown links [text](url)
function parseMarkdownLinks(text) {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Parse colorful highlights [[text]]
function parseColorHighlights(text) {
    // Convert [[text]] to <span class="colored-highlight">text</span>
    return text.replace(/\[\[([^\]]+)\]\]/g, '<span class="colored-highlight">$1</span>');
}

// Parse bold markdown **text**
function parseBold(text) {
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return text;
}

// Apply all text formatting
function formatText(text) {
    if (!text) return '';
    // Convert to string in case it's not already
    text = String(text);
    text = parseMarkdownLinks(text);
    text = parseColorHighlights(text);
    text = parseBold(text);
    return text;
}

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
                // General Information - map format
                html += section.contents.map(item => `
                    <div class="cv-map">
                        <div class="cv-map-name">${item.name}:</div>
                        <div class="cv-map-value">${formatText(item.value)}</div>
                    </div>
                `).join('');
            } else if (section.type === 'time_table') {
                // Education and Experience - time table format
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
                // Other Interests - list format
                html += `<ul class="cv-list">${section.contents.map(item => `<li>${formatText(item)}</li>`).join('')}</ul>`;
            }

            html += `</div>`;
            return html;
        }).join('');

        container.innerHTML = cvHTML;
    } catch (error) {
        console.error('Error loading CV data:', error);
    }
}

// Bright colors for links (kept for compatibility)
const brightColors = [
    '#4ec9b0', '#ff6b9d', '#ffd93d', '#6bcf7f', '#ff8c42',
    '#9b59b6', '#3498db', '#e74c3c', '#1abc9c', '#f39c12',
    '#e91e63', '#00bcd4',
];

// Randomly assign colors to all links
function colorizeLinks() {
    const links = document.querySelectorAll('a, .colored-highlight');
    links.forEach(link => {
        const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
        link.style.color = randomColor;
    });
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    renderCV();
    setTimeout(colorizeLinks, 50);
});
