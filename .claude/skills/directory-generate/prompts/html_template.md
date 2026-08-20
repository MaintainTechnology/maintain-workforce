# HTML Template for NGM Commons Directory

Use this template to render the final directory_page.html.

Replace placeholders with actual content:
- `{{CATEGORY_TITLE}}` - Full category title
- `{{CATEGORY_SLUG}}` - URL-friendly slug
- `{{META_DESCRIPTION}}` - SEO meta description (from Section A overview)
- `{{FAQ_JSON_LD}}` - FAQ structured data (from Section D)
- `{{ENTITY_LIST_JSON_LD}}` - ItemList structured data
- `{{SECTION_A_HTML}}` - Section A content converted to HTML
- `{{SECTION_B_HTML}}` - All entity profiles as HTML
- `{{SECTION_C_HTML}}` - Comparisons as HTML
- `{{SECTION_D_HTML}}` - NGM Perspective and FAQ as HTML
- `{{DIAGRAM_SVG}}` - SVG diagram code
- `{{SOURCES_HTML}}` - Sources section as HTML
- `{{CURRENT_YEAR}}` - Current year (2026)

## HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{CATEGORY_TITLE}}: A Comprehensive Guide {{CURRENT_YEAR}} | NGM Commons</title>
    <meta name="description" content="{{META_DESCRIPTION}}">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&family=DM+Sans:wght@400;500;600&family=Noto+Serif+JP:wght@500&display=swap" rel="stylesheet">

    <!-- FAQ Structured Data -->
    <script type="application/ld+json">
    {{FAQ_JSON_LD}}
    </script>

    <!-- ItemList Structured Data -->
    <script type="application/ld+json">
    {{ENTITY_LIST_JSON_LD}}
    </script>

    <style>
        :root {
            --paper: #FFFFFF;
            --paper-alt: #F5F2EC;
            --ink-900: #302C27;
            --ink-700: #4A4540;
            --ink-500: #706C66;
            --ink-400: #9C9890;
            --line: #E3DFD7;
            --gold: #C49A6C;
            --vermillion: #C07050;
            --forest: #2D5A4A;
            --sky: #4A90A4;

            --space-1: 8px;
            --space-2: 12px;
            --space-3: 20px;
            --space-4: 32px;
            --space-5: 48px;
            --space-6: 72px;
            --space-7: 96px;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: "DM Sans", system-ui, -apple-system, sans-serif;
            font-size: 15px;
            line-height: 1.6;
            color: var(--ink-700);
            background: var(--paper);
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: clamp(20px, 5vw, 48px);
        }

        header {
            background: var(--paper-alt);
            border-bottom: 1px solid var(--line);
            padding: var(--space-4) 0;
            margin-bottom: var(--space-6);
        }

        .header-content {
            max-width: 900px;
            margin: 0 auto;
            padding: 0 clamp(20px, 5vw, 48px);
        }

        .category-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--ink-500);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: var(--space-2);
        }

        h1 {
            font-family: "Cormorant Garamond", "Noto Serif JP", serif;
            font-size: clamp(40px, 5vw, 56px);
            line-height: 1.05;
            color: var(--ink-900);
            margin-bottom: var(--space-2);
        }

        h2 {
            font-family: "Cormorant Garamond", "Noto Serif JP", serif;
            font-size: clamp(32px, 4vw, 42px);
            line-height: 1.2;
            color: var(--ink-900);
            margin: var(--space-6) 0 var(--space-4) 0;
        }

        h3 {
            font-family: "Cormorant Garamond", "Noto Serif JP", serif;
            font-size: clamp(24px, 3vw, 32px);
            line-height: 1.2;
            color: var(--ink-900);
            margin: var(--space-5) 0 var(--space-3) 0;
        }

        h4 {
            font-family: "Cormorant Garamond", "Noto Serif JP", serif;
            font-size: clamp(18px, 2.5vw, 24px);
            line-height: 1.3;
            color: var(--ink-900);
            margin: var(--space-4) 0 var(--space-3) 0;
        }

        .subtitle {
            font-style: italic;
            color: var(--ink-500);
            font-size: 17px;
            margin-bottom: var(--space-4);
        }

        p {
            margin-bottom: var(--space-3);
        }

        /* Category Stats Box */
        .category-stats {
            background: var(--paper-alt);
            border: 2px solid var(--gold);
            border-radius: 8px;
            padding: 24px;
            margin-bottom: var(--space-6);
        }

        .stats-table {
            width: 100%;
            border-collapse: collapse;
        }

        .stats-table td {
            padding: 8px 0;
            border: none;
        }

        .stats-table td:first-child {
            font-weight: 600;
            color: var(--ink-900);
            width: 40%;
        }

        /* Entity Cards */
        .entity-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: var(--space-4);
            margin: var(--space-5) 0;
        }

        .entity-card {
            background: var(--paper-alt);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 24px;
            transition: box-shadow 0.2s ease;
        }

        .entity-card:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .entity-card h3 {
            margin: 0 0 var(--space-2) 0;
            font-size: 20px;
        }

        /* Methodology Badges */
        .methodology-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: var(--space-2);
            background: var(--forest);
            color: white;
        }

        .price {
            font-size: 18px;
            font-weight: 600;
            color: var(--gold);
            margin-bottom: var(--space-2);
        }

        .notable-for {
            font-size: 14px;
            color: var(--ink-500);
            margin-bottom: var(--space-2);
        }

        .notable-for strong {
            color: var(--ink-700);
        }

        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: var(--space-4) 0;
            font-size: 14px;
        }

        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--line);
        }

        th {
            background: var(--paper-alt);
            font-weight: 600;
            color: var(--ink-900);
        }

        tr:hover {
            background: var(--paper-alt);
        }

        /* Responsive Tables */
        @media (max-width: 768px) {
            table {
                display: block;
                overflow-x: auto;
                white-space: nowrap;
            }
        }

        /* Lists */
        ul, ol {
            margin: var(--space-3) 0;
            padding-left: var(--space-4);
        }

        li {
            margin-bottom: var(--space-1);
        }

        /* FAQ Section */
        .faq-item {
            margin-bottom: var(--space-4);
            padding-bottom: var(--space-4);
            border-bottom: 1px solid var(--line);
        }

        .faq-item:last-child {
            border-bottom: none;
        }

        .faq-question {
            font-weight: 600;
            color: var(--ink-900);
            margin-bottom: var(--space-2);
        }

        .faq-answer {
            color: var(--ink-700);
        }

        /* Sources */
        .sources-section {
            background: var(--paper-alt);
            padding: var(--space-4);
            border-radius: 8px;
            margin-top: var(--space-6);
        }

        .sources-section h3 {
            margin-top: 0;
        }

        .sources-section ol {
            font-size: 13px;
            color: var(--ink-500);
        }

        /* Diagram Container */
        .diagram-container {
            background: var(--paper-alt);
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: var(--space-4);
            margin: var(--space-5) 0;
            text-align: center;
        }

        .diagram-container svg {
            max-width: 100%;
            height: auto;
        }

        /* Footer */
        footer {
            margin-top: var(--space-7);
            padding: var(--space-4) 0;
            border-top: 1px solid var(--line);
            text-align: center;
            color: var(--ink-500);
            font-size: 13px;
        }

        footer a {
            color: var(--gold);
            text-decoration: none;
        }

        footer a:hover {
            text-decoration: underline;
        }

        /* Print Styles */
        @media print {
            header {
                background: none;
                border: none;
            }

            .entity-card {
                break-inside: avoid;
            }

            .diagram-container {
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <header>
        <div class="header-content">
            <div class="category-label">NGM Commons Directory</div>
            <h1>{{CATEGORY_TITLE}}</h1>
            <p class="subtitle">A Comprehensive Guide for Longevity Medicine Practitioners | {{CURRENT_YEAR}}</p>
        </div>
    </header>

    <main class="container">
        <!-- Section A: Overview -->
        <section id="overview">
            {{SECTION_A_HTML}}
        </section>

        <!-- Methodology Diagram -->
        <section id="diagram">
            <div class="diagram-container">
                {{DIAGRAM_SVG}}
            </div>
        </section>

        <!-- Section B: Entity Profiles -->
        <section id="profiles">
            {{SECTION_B_HTML}}
        </section>

        <!-- Section C: Comparisons -->
        <section id="comparisons">
            {{SECTION_C_HTML}}
        </section>

        <!-- Section D: NGM Perspective & FAQ -->
        <section id="perspective">
            {{SECTION_D_HTML}}
        </section>

        <!-- Sources -->
        <section id="sources" class="sources-section">
            {{SOURCES_HTML}}
        </section>
    </main>

    <footer>
        <p>Part of the <a href="https://nextgenmed.io/commons">NGM Commons</a> directory</p>
        <p>Generated {{CURRENT_YEAR}} | <a href="https://nextgenmed.io">Next Generation Medicine</a></p>
    </footer>
</body>
</html>
```

## Markdown to HTML Conversion Notes

When converting markdown sections to HTML:

1. **Headings**: `## Title` → `<h2>Title</h2>`
2. **Bold**: `**text**` → `<strong>text</strong>`
3. **Italic**: `*text*` → `<em>text</em>`
4. **Lists**: Convert to `<ul>/<ol>` and `<li>` tags
5. **Tables**: Convert to full HTML tables with `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`
6. **Paragraphs**: Wrap text blocks in `<p>` tags

## Structured Data Generation

### FAQ JSON-LD

Generate from Section D FAQs:

```json
{
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
        {
            "@type": "Question",
            "name": "[Question text]",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "[Answer text]"
            }
        }
    ]
}
```

### ItemList JSON-LD

Generate from entity list:

```json
{
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "{{CATEGORY_TITLE}}",
    "itemListElement": [
        {
            "@type": "ListItem",
            "position": 1,
            "name": "[Entity name]"
        }
    ]
}
```
