// Common functionality for all pages

// Simple markdown link parser
function parseMarkdownLinks(text) {
    if (!text) return '';
    return String(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Parse bold markdown (**text** or ***text*** to <strong>text</strong>)
function parseBold(text) {
    if (!text) return '';
    text = String(text);
    // Handle triple asterisks first
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong>$1</strong>');
    // Then handle double asterisks
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return text;
}

// Parse highlights into button-like badges
function parseHighlights(text) {
    if (!text) return '';
    text = String(text);
    // First, parse bold markdown to get <strong> tags
    text = parseBold(text);

    // Remove all <strong> tags and asterisks, keep the content
    text = text.replace(/<strong>([^<]+)<\/strong>/g, '$1');
    text = text.replace(/\*+/g, '');

    // Clean up the text - remove extra spaces
    text = text.trim();

    // Handle "at" patterns
    text = text.replace(/\s+at\s+/gi, ' ');

    return `<span class="highlight-badge">${text}</span>`;
}

// Parse colored highlights [[text]]
function parseColoredText(text) {
    if (!text) return '';
    const brightColors = [
        '#177a7e', '#1b3a4b', '#0e5256', '#2c5c3e', '#a85c3f',
        '#8a6216', '#6b4c8a', '#1a6fa8', '#a8433a', '#5e7a2a',
        '#8a4a5c', '#35357a',
    ];

    return String(text).replace(/\[\[(.+?)\]\]/g, (match, content) => {
        const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
        return `<span style="color: ${randomColor}; font-weight: 500;">${content}</span>`;
    });
}

// Apply all text formatting (Links, Bold, Colored Text)
function formatText(text) {
    if (!text) return '';
    text = parseMarkdownLinks(text);
    text = parseBold(text);
    text = parseColoredText(text);
    return text;
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Bright colors for links
const brightColors = [
    '#177a7e', '#1b3a4b', '#0e5256', '#2c5c3e', '#a85c3f',
    '#8a6216', '#6b4c8a', '#1a6fa8', '#a8433a', '#5e7a2a',
    '#8a4a5c', '#35357a',
];

// Colorize links in a specific element
function colorizeLinksInElement(element) {
    if (!element) return;
    const links = element.querySelectorAll('a');
    links.forEach(link => {
        const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
        link.style.color = randomColor;
    });
}

// Randomly assign colors to all links
function colorizeLinks() {
    const links = document.querySelectorAll('a');
    links.forEach(link => {
        // Only colorize if not already colored
        if (!link.style.color || link.style.color === 'rgb(23, 122, 126)') {
            const randomColor = brightColors[Math.floor(Math.random() * brightColors.length)];
            link.style.color = randomColor;
        }
    });
}

async function loadConfig() {
    try {
        const response = await fetch('data/config.yaml');
        const yamlText = await response.text();
        const config = jsyaml.load(yamlText);
        return config;
    } catch (error) {
        console.error('Error loading config:', error);
        return null;
    }
}
