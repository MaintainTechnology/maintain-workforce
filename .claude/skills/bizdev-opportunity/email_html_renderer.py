"""
Email HTML Renderer for BizDev Opportunity Intelligence

Converts markdown email drafts to browser-viewable HTML with:
- Styled header with To/Subject metadata
- Properly formatted body (bold, lists, paragraphs)
- Copy Email button for one-click clipboard copy
- Back to Dashboard link

Usage:
    python email_html_renderer.py [--source-dir DIR] [--output-dir DIR]
    
Defaults:
    --source-dir: .bizdev/drafts/emails/
    --output-dir: content/docs/bizdev-drafts/emails/
"""

import os
import re
import argparse
from pathlib import Path
from typing import Dict, Optional


HTML_TEMPLATE = '''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Email: {subject}</title>
  <style>
    body {{ 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      max-width: 700px; 
      margin: 40px auto; 
      padding: 20px; 
      line-height: 1.6; 
      background: #f5f5f5; 
    }}
    .email-container {{ 
      background: white; 
      border-radius: 12px; 
      box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
      overflow: hidden; 
    }}
    .email-header {{ 
      background: #1a1a2e; 
      color: white; 
      padding: 20px; 
    }}
    .email-header h2 {{ 
      margin: 0 0 5px 0; 
      font-size: 14px; 
      opacity: 0.7; 
    }}
    .email-header h1 {{ 
      margin: 0; 
      font-size: 18px; 
    }}
    .email-meta {{ 
      padding: 15px 20px; 
      background: #f8f9fa; 
      border-bottom: 1px solid #eee; 
      font-size: 14px; 
    }}
    .email-meta span {{ 
      display: block;
      margin-bottom: 5px;
    }}
    .email-meta strong {{ 
      color: #666; 
    }}
    .email-body {{ 
      padding: 25px; 
      font-size: 15px; 
      color: #333; 
    }}
    .email-body p {{ 
      margin: 0 0 15px 0; 
    }}
    .email-body strong {{ 
      font-weight: 600; 
    }}
    .email-body ul {{ 
      margin: 10px 0 15px 0; 
      padding-left: 20px; 
    }}
    .email-body li {{ 
      margin: 5px 0; 
    }}
    .copy-btn {{ 
      position: fixed; 
      top: 20px; 
      right: 20px; 
      background: #2563eb; 
      color: white; 
      border: none; 
      padding: 12px 20px; 
      border-radius: 8px; 
      cursor: pointer; 
      font-size: 14px; 
      font-weight: 500; 
    }}
    .copy-btn:hover {{ 
      background: #1d4ed8; 
    }}
    .copy-btn.copied {{ 
      background: #059669; 
    }}
    .back-link {{ 
      display: inline-block; 
      margin-bottom: 15px; 
      color: #2563eb; 
      text-decoration: none; 
      font-size: 14px; 
    }}
    .back-link:hover {{
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <a href="../../bizdev-pipeline-deep-scan.html" class="back-link">← Back to Dashboard</a>
  <button class="copy-btn" onclick="copyEmail()">Copy Email</button>
  
  <div class="email-container">
    <div class="email-header">
      <h2>TO</h2>
      <h1>{to}</h1>
    </div>
    <div class="email-meta">
      <span><strong>Subject:</strong> {subject}</span>
    </div>
    <div class="email-body" id="emailBody">
{body_html}
    </div>
  </div>
  
  <script>
    function copyEmail() {{
      const body = document.getElementById('emailBody').innerText;
      navigator.clipboard.writeText(body).then(() => {{
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {{ 
          btn.textContent = 'Copy Email'; 
          btn.classList.remove('copied'); 
        }}, 2000);
      }});
    }}
  </script>
</body>
</html>'''


def parse_email_markdown(content: str) -> Dict[str, str]:
    """
    Parse email markdown file to extract metadata and body.
    
    Expected format:
    ---
    To: Name
    Subject: Subject line
    Type: consulting
    ...
    ---
    
    Email body here...
    """
    # Extract frontmatter
    frontmatter_match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', content, re.DOTALL)
    
    if not frontmatter_match:
        # No frontmatter, treat entire content as body
        return {
            'to': 'Unknown',
            'subject': 'Email Draft',
            'body': content
        }
    
    frontmatter = frontmatter_match.group(1)
    body = frontmatter_match.group(2).strip()
    
    # Parse frontmatter
    metadata = {}
    for line in frontmatter.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            metadata[key.strip().lower()] = value.strip()
    
    return {
        'to': metadata.get('to', 'Unknown'),
        'subject': metadata.get('subject', 'Email Draft'),
        'type': metadata.get('type', 'general'),
        'priority': metadata.get('priority', 'medium'),
        'body': body
    }


def markdown_to_html(markdown_body: str) -> str:
    """
    Convert markdown body to HTML.
    
    Handles:
    - **bold** -> <strong>bold</strong>
    - Bullet lists (- item)
    - Paragraphs (double newlines)
    """
    html = markdown_body
    
    # Convert **bold** to <strong>
    html = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', html)
    
    # Convert bullet lists
    lines = html.split('\n')
    result_lines = []
    in_list = False
    
    for line in lines:
        if line.strip().startswith('- '):
            if not in_list:
                result_lines.append('<ul>')
                in_list = True
            item_content = line.strip()[2:]
            result_lines.append(f'  <li>{item_content}</li>')
        else:
            if in_list:
                result_lines.append('</ul>')
                in_list = False
            
            if line.strip():
                result_lines.append(f'<p>{line}</p>')
            else:
                result_lines.append('')
    
    if in_list:
        result_lines.append('</ul>')
    
    html = '\n'.join(result_lines)
    
    # Clean up empty paragraphs
    html = re.sub(r'<p>\s*</p>', '', html)
    
    # Clean up multiple newlines
    html = re.sub(r'\n{3,}', '\n\n', html)
    
    return html


def render_email_html(
    source_path: str,
    output_path: Optional[str] = None
) -> str:
    """
    Render a markdown email to HTML.
    
    Args:
        source_path: Path to the .md email file
        output_path: Path for output .html file (optional)
        
    Returns:
        Path to the generated HTML file
    """
    with open(source_path, 'r') as f:
        content = f.read()
    
    parsed = parse_email_markdown(content)
    body_html = markdown_to_html(parsed['body'])
    
    html = HTML_TEMPLATE.format(
        to=parsed['to'],
        subject=parsed['subject'],
        body_html=body_html
    )
    
    if output_path is None:
        # Default: same name with .html extension in output dir
        source_name = Path(source_path).stem
        output_path = f"content/docs/bizdev-drafts/emails/{source_name}.html"
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w') as f:
        f.write(html)
    
    return output_path


def render_all_emails(
    source_dir: str = ".bizdev/drafts/emails/",
    output_dir: str = "content/docs/bizdev-drafts/emails/"
) -> list:
    """
    Render all markdown emails in source_dir to HTML in output_dir.
    
    Returns:
        List of generated HTML file paths
    """
    source_path = Path(source_dir)
    output_path = Path(output_dir)
    
    # Ensure output directory exists
    output_path.mkdir(parents=True, exist_ok=True)
    
    generated = []
    
    for md_file in source_path.glob("*.md"):
        html_file = output_path / f"{md_file.stem}.html"
        render_email_html(str(md_file), str(html_file))
        generated.append(str(html_file))
        print(f"Generated: {html_file}")
    
    return generated


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Render email markdown to HTML")
    parser.add_argument(
        "--source-dir", 
        default=".bizdev/drafts/emails/",
        help="Source directory containing .md email files"
    )
    parser.add_argument(
        "--output-dir",
        default="content/docs/bizdev-drafts/emails/",
        help="Output directory for .html files"
    )
    parser.add_argument(
        "--file",
        help="Render a single file instead of all files"
    )
    
    args = parser.parse_args()
    
    if args.file:
        output = render_email_html(args.file)
        print(f"Generated: {output}")
    else:
        generated = render_all_emails(args.source_dir, args.output_dir)
        print(f"\nGenerated {len(generated)} HTML email files")
