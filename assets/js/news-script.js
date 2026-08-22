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
            const formattedDate = formatDate(item.date);
            const content = formatText(item.content);

            return `
                <div class="news-item">
                    <div class="news-date">${formattedDate}</div>
                    <div class="news-content">${content}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = newsItems;
        colorizeLinksInElement(container);
    } catch (error) {
        console.error('Error loading news data:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderNews();
});
