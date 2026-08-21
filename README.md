# Qinfeng Zhu — Academic Portfolio

Source code for [zhuqinfeng1999.github.io](https://zhuqinfeng1999.github.io/), an interactive academic portfolio focused on spatial intelligence, remote sensing, panoramic vision, multimodal learning and 3D scene understanding.

## Site map

- `/` — portfolio, research overview and complete publication record
- `/research/` — interactive research atlas
- `/publications/` — searchable publication library with BibTeX
- `/projects/` — datasets, methods and research maps
- `/SemanticUrban/` and `/IndoorMS/` — dataset project pages

## Architecture

The site is dependency-free at build time and is served directly by GitHub Pages:

- semantic HTML pages
- custom CSS in `assets/css/`
- vanilla JavaScript and Canvas interactions in `assets/js/`
- structured research content in `assets/data/research.json`

## Local preview

Serve the repository root with any static HTTP server. For example:

```bash
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Content updates

Publication metadata, links, research directions and the timeline are maintained in [`assets/data/research.json`](assets/data/research.json). The homepage's editorially selected layouts remain in [`index.html`](index.html).

## License

The website code and visual design are available for personal, academic,
educational, research, and other non-commercial use under the
[Qinfeng Zhu Portfolio Non-Commercial License 1.0](LICENSE).

Commercial use—including paid website work, resale, commercial product
integration, or company marketing—requires prior written permission. Personal
data, the portrait, CV, publication figures, and third-party research artifacts
are not licensed for reuse.

© Qinfeng Zhu.
