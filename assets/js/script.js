// Parse colorful highlights [[text]]
function parseColorHighlights(text) {
    // Convert [[text]] to <span class="colored-highlight">text</span>
    return text.replace(/\[\[([^\]]+)\]\]/g, '<span class="colored-highlight">$1</span>');
}

// Simple markdown link parser
function parseMarkdownLinks(text) {
    // Convert [text](url) to <a href="url">text</a>
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Parse bold markdown (**text** or ***text*** to <strong>text</strong>)
function parseBold(text) {
    // Handle triple asterisks first
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong>$1</strong>');
    // Then handle double asterisks
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return text;
}

// Parse highlights into button-like badges - put everything in one badge
function parseHighlights(text) {
    // First, parse bold markdown to get <strong> tags
    text = parseBold(text);

    // Remove all <strong> tags and asterisks, keep the content
    text = text.replace(/<strong>([^<]+)<\/strong>/g, '$1');
    text = text.replace(/\*+/g, '');

    // Clean up the text - remove extra spaces
    text = text.trim();

    // Handle "at" patterns - remove "at" and keep the rest
    text = text.replace(/\s+at\s+/gi, ' ');

    // Put everything in one badge
    return `<span class="highlight-badge">${text}</span>`;
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Render About section
async function renderAbout() {
    try {
        const response = await fetch('data/about.yaml');
        const yamlText = await response.text();
        const data = jsyaml.load(yamlText);
        const aboutText = document.getElementById('about-text');

        // Convert markdown to HTML (YAML preserves newlines)
        const lines = data.content.split('\n');
        let html = '';
        let inList = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Handle list items
            if (line.trim().startsWith('- ')) {
                if (!inList) {
                    html += '<ul>';
                    inList = true;
                }
                html += `<li>${parseColorHighlights(parseBold(parseMarkdownLinks(line.trim().substring(2))))}</li>`;
            } else if (line.trim() === '') {
                // Empty line - close list if open, add paragraph break
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
                // Skip empty lines
            } else if (line.trim()) {
                // Regular paragraph
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
                html += `<p>${parseColorHighlights(parseBold(parseMarkdownLinks(line.trim())))}</p>`;
            }
        }

        if (inList) {
            html += '</ul>';
        }

        aboutText.innerHTML = html;
        // Colorize links immediately after rendering
        colorizeLinksInElement(aboutText);
    } catch (error) {
        console.error('Error loading about data:', error);
    }
}

// Render News section
async function renderNews() {
    try {
        const response = await fetch('data/news.yaml');
        const yamlText = await response.text();
        const news = jsyaml.load(yamlText);
        const container = document.getElementById('news-container');

        const newsItems = news.map(item => {
            const content = parseColorHighlights(parseBold(parseMarkdownLinks(item.content)));
            return `<li>${content}</li>`;
        }).join('');

        container.innerHTML = `<ul class="news-list">${newsItems}</ul>`;
        // Colorize links immediately after rendering
        colorizeLinksInElement(container);
    } catch (error) {
        console.error('Error loading news data:', error);
    }
}

// Render Publications section
async function renderPublications() {
    try {
        const response = await fetch('data/papers.yaml');
        const yamlText = await response.text();
        const papers = jsyaml.load(yamlText);
        const container = document.getElementById('publications-container');

        // Sort by year (newest first)
        papers.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        const papersHTML = papers.map(paper => {
            const preview = paper.preview ?
                `<img src="assets/img/publication_preview/${paper.preview}" alt="${paper.title}" class="publication-preview">` :
                '';

            const titleLink = paper.html || paper.url || '#';
            const title = `<a href="${titleLink}" target="_blank" rel="noopener noreferrer">${paper.title}</a>`;

            // Process authors: replace "and" with commas, normalize format, highlight "Vishal Nedungadi"
            let authors = paper.author || '';
            // Normalize "Last, First" format to "First Last"
            authors = authors.replace(/([A-Za-z]+),\s*([A-Za-z]+)/g, '$2 $1');
            authors = authors.replace(/\s+and\s+/gi, ', ');
            // Highlight "Vishal Nedungadi" (case insensitive) - just make it bold, not teal
            authors = authors.replace(/(Vishal\s+Nedungadi)/gi, '<strong>$1</strong>');

            // Build meta information (remove arXiv)
            let meta = [];
            if (paper.year) meta.push(paper.year);
            if (paper.booktitle) meta.push(paper.booktitle);
            if (paper.organization) meta.push(paper.organization);

            // Build links (only Paper, no arXiv)
            let links = [];
            if (paper.html) {
                links.push(`<a href="${paper.html}" target="_blank" rel="noopener noreferrer">Paper</a>`);
            } else if (paper.url) {
                links.push(`<a href="${paper.url}" target="_blank" rel="noopener noreferrer">Paper</a>`);
            }

            const selectedClass = paper.selected ? 'selected' : '';

            return `
                <div class="publication ${selectedClass}">
                    ${preview}
                    <div class="publication-content">
                        <div class="publication-title">${title}</div>
                        <div class="publication-authors">${authors}</div>
                        <div class="publication-meta">${meta.join(' • ')}</div>
                        ${links.length > 0 ? `<div class="publication-links">${links.join('')}</div>` : ''}
                        ${paper.additional_info ? `<div class="publication-additional">${parseHighlights(parseMarkdownLinks(paper.additional_info))}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = papersHTML;
        // Colorize links immediately after rendering
        colorizeLinksInElement(container);
    } catch (error) {
        console.error('Error loading publications data:', error);
    }
}

// Bright colors for links
const brightColors = [
    '#4ec9b0', // teal/cyan
    '#ff6b9d', // pink
    '#ffd93d', // yellow
    '#6bcf7f', // green
    '#ff8c42', // orange
    '#9b59b6', // purple
    '#3498db', // blue
    '#e74c3c', // red
    '#1abc9c', // turquoise
    '#f39c12', // amber
    '#e91e63', // magenta
    '#00bcd4', // cyan
];

// Colorize links in a specific element (for immediate coloring after rendering)
function colorizeLinksInElement(element) {
    const links = element.querySelectorAll('a, .colored-highlight');
    links.forEach(link => {
        const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
        link.style.color = randomColor;
    });
}

// Randomly assign colors to all links (fallback for any links that might be missed)
function colorizeLinks() {
    const links = document.querySelectorAll('a, .colored-highlight');
    links.forEach(link => {
        // Only colorize if not already colored
        if (!link.style.color || link.style.color === 'rgb(78, 201, 176)') {
            const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
            link.style.color = randomColor;
        }
    });
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    renderAbout();

    // Colorize any remaining links (like nav links) after a short delay
    setTimeout(colorizeLinks, 50);
});
