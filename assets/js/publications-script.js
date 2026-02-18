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

            let authors = paper.author || '';
            authors = authors.replace(/([A-Za-z]+),\s*([A-Za-z]+)/g, '$2 $1');
            authors = authors.replace(/\s+and\s+/gi, ', ');
            authors = authors.replace(/(Aniket\s+Junghare)/gi, '<strong>$1</strong>');

            let meta = [];
            if (paper.year) meta.push(paper.year);
            if (paper.booktitle) meta.push(paper.booktitle);
            if (paper.organization) meta.push(paper.organization);

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
        colorizeLinksInElement(container);
    } catch (error) {
        console.error('Error loading publications data:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderPublications();
});
