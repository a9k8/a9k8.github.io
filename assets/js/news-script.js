// Render News section
async function renderNews() {
    try {
        const response = await fetch('data/news.yaml');
        const yamlText = await response.text();
        const news = jsyaml.load(yamlText);
        const container = document.getElementById('news-container');

        // Sort by date (newest first)
        news.sort((a, b) => new Date(b.date) - new Date(a.date));

        const newsItems = news.map(item => {
            const date = new Date(item.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const content = parseColorHighlights(parseBold(parseMarkdownLinks(item.content)));

            return `
                <div class="news-item">
                    <div class="news-date">${formattedDate}</div>
                    <div class="news-content">${content}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = newsItems;
        // Colorize links immediately after rendering
        colorizeLinksInElement(container);
    } catch (error) {
        console.error('Error loading news data:', error);
    }
}

// Parse colorful highlights [[text]]
function parseColorHighlights(text) {
    // Convert [[text]] to <span class="colored-highlight">text</span>
    return text.replace(/\[\[([^\]]+)\]\]/g, '<span class="colored-highlight">$1</span>');
}

// Simple markdown link parser
function parseMarkdownLinks(text) {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Parse bold markdown
function parseBold(text) {
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return text;
}

// Bright colors for links
const brightColors = [
    '#4ec9b0', '#ff6b9d', '#ffd93d', '#6bcf7f', '#ff8c42',
    '#9b59b6', '#3498db', '#e74c3c', '#1abc9c', '#f39c12',
    '#e91e63', '#00bcd4',
];

function colorizeLinksInElement(element) {
    const links = element.querySelectorAll('a, .colored-highlight');
    links.forEach(link => {
        const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
        link.style.color = randomColor;
    });
}

function colorizeLinks() {
    const links = document.querySelectorAll('a, .colored-highlight');
    links.forEach(link => {
        if (!link.style.color || link.style.color === 'rgb(78, 201, 176)') {
            const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
            link.style.color = randomColor;
        }
    });
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    renderNews();
    setTimeout(colorizeLinks, 50);
});
