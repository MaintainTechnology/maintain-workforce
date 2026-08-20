# Email HTML Builder

Convert markdown email content into HubSpot-compatible HTML with NGM editorial styling.

## Overview

This skill transforms markdown email files into production-ready HTML that can be pasted directly into HubSpot's email editor. The output uses inline styles for maximum email client compatibility while maintaining the NGM editorial design aesthetic.

## When to Use

Use this skill when:
- Converting markdown email sequences to HubSpot HTML
- Building single promotional emails
- Creating nurture sequence emails
- Any email that needs to match NGM's editorial brand

## Input Requirements

Provide one of the following:
1. **File path(s)** to markdown email file(s) in the repository
2. **Raw markdown content** for the email(s)

If providing a sequence file (like `elite-mentorship-nurture.md`), specify which email(s) to convert:
- "Convert email 1"
- "Convert all emails"
- "Convert emails 3-5"

---

## Email HTML Structure

Every email follows this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{{EMAIL_SUBJECT}}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #F5F2EC; font-family: 'DM Sans', Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Email Container -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F2EC;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <!-- Content Container -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E3DFD7;">

          {{EMAIL_CONTENT}}

        </table>

        <!-- Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px;">
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 14px; color: #302C27;">
                Next Generation Medicine
              </p>
              <p style="margin: 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 12px; color: #9C9890;">
                nextgenerationmedicine.co
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
```

---

## Style Reference (Inline Values)

### Colors (use hex values, not CSS variables)
```
Paper (background):     #FFFFFF
Paper Alt:              #F5F2EC
Ink 900 (primary text): #302C27
Ink 700:                #4A4540
Ink 500 (secondary):    #706C66
Ink 400 (tertiary):     #9C9890
Line (borders):         #E3DFD7
Gold (accent):          #C49A6C
Vermillion (CTA):       #C07050
```

### Typography (email-safe stacks)
```
Serif:     'Cormorant Garamond', Georgia, serif
Sans:      'DM Sans', Arial, sans-serif
Monospace: 'Courier New', monospace
```

### Font Sizes
```
Headline:    28px (line-height: 1.2)
Subhead:     20px (line-height: 1.3)
Body:        16px (line-height: 1.6)
Small:       14px (line-height: 1.5)
Caption:     12px (line-height: 1.4)
```

---

## Component Patterns

### Header Block
```html
<tr>
  <td style="padding: 40px 40px 32px 40px; border-bottom: 1px solid #E3DFD7;">
    <p style="margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500; color: #302C27;">
      Next Generation Medicine
    </p>
  </td>
</tr>
```

### Body Content Block
```html
<tr>
  <td style="padding: 40px;">
    <!-- Content goes here -->
  </td>
</tr>
```

### Paragraph
```html
<p style="margin: 0 0 20px 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
  {{TEXT}}
</p>
```

### Headline (H2 equivalent)
```html
<h2 style="margin: 0 0 16px 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; font-weight: 500; line-height: 1.3; color: #302C27;">
  {{HEADLINE}}
</h2>
```

### Subhead (H3 equivalent)
```html
<h3 style="margin: 32px 0 12px 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500; line-height: 1.3; color: #302C27;">
  {{SUBHEAD}}
</h3>
```

### Bold Text
```html
<strong style="font-weight: 600; color: #302C27;">{{TEXT}}</strong>
```

### Italic Text
```html
<em style="font-style: italic; color: #706C66;">{{TEXT}}</em>
```

### Bullet List
```html
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px 0;">
  <tr>
    <td width="20" valign="top" style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #C49A6C;">—</td>
    <td style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
      {{ITEM_TEXT}}
    </td>
  </tr>
</table>
```

### Numbered List
```html
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px 0;">
  <tr>
    <td width="24" valign="top" style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #C49A6C; font-weight: 600;">1.</td>
    <td style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
      {{ITEM_TEXT}}
    </td>
  </tr>
</table>
```

### Blockquote / Highlight Box
```html
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
  <tr>
    <td style="padding: 20px 24px; background-color: #F5F2EC; border-left: 4px solid #C49A6C;">
      <p style="margin: 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #4A4540; font-style: italic;">
        {{QUOTE_TEXT}}
      </p>
    </td>
  </tr>
</table>
```

### Primary CTA Button
```html
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
  <tr>
    <td style="background-color: #302C27; border-radius: 2px;">
      <a href="{{URL}}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; font-weight: 600; color: #FFFFFF; text-decoration: none; letter-spacing: 0.02em;">
        {{BUTTON_TEXT}} →
      </a>
    </td>
  </tr>
</table>
```

### Secondary CTA (Text Link)
```html
<p style="margin: 24px 0 0 0;">
  <a href="{{URL}}" target="_blank" style="font-family: 'DM Sans', Arial, sans-serif; font-size: 14px; color: #C49A6C; text-decoration: underline;">
    {{LINK_TEXT}} →
  </a>
</p>
```

### Divider Line
```html
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
  <tr>
    <td style="border-top: 1px solid #E3DFD7;"></td>
  </tr>
</table>
```

### Signature Block
```html
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 32px;">
  <tr>
    <td>
      <p style="margin: 0 0 4px 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
        — Anant
      </p>
      <p style="margin: 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; color: #9C9890;">
        Dr. Anant Vinjamoori<br>
        Harvard-trained physician | Chief Longevity Officer, Superpower
      </p>
    </td>
  </tr>
</table>
```

### P.S. Block
```html
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #E3DFD7;">
  <tr>
    <td>
      <p style="margin: 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #706C66;">
        <strong style="color: #302C27;">P.S.</strong> — {{PS_TEXT}}
      </p>
    </td>
  </tr>
</table>
```

---

## Conversion Rules

When converting markdown to HTML:

1. **Paragraphs**: Each paragraph becomes a `<p>` with proper margin
2. **Bold** (`**text**`): Use `<strong>` with `color: #302C27`
3. **Italic** (`*text*`): Use `<em>` with `color: #706C66`
4. **Links** (`[text](url)`): Use `<a>` with `color: #C49A6C`
5. **Bullet lists**: Convert to table-based layout with gold em-dash
6. **Numbered lists**: Convert to table-based layout with gold numbers
7. **Headers** (`##`, `###`): Use h2/h3 with Cormorant Garamond font
8. **Horizontal rules** (`---`): Use divider table
9. **Blockquotes** (`>`): Use highlight box with gold left border
10. **CTA links**: If link text contains "Join", "Get", "Start", etc., make it a button

---

## HubSpot Personalization Tokens

Replace these placeholders with HubSpot tokens:
- `[First Name]` → `{{ contact.firstname }}`
- `[Email]` → `{{ contact.email }}`
- `[Company]` → `{{ contact.company }}`

---

## Output Format

When generating emails, output:

1. **Subject line** (for HubSpot subject field)
2. **Preview text** (for HubSpot preview text field)
3. **Full HTML** (ready to paste into HubSpot HTML editor)

For sequences, output each email separately with clear dividers.

---

## Example Input → Output

### Input (Markdown):
```markdown
## Email 1
**Subject:** Why I stopped advising and started teaching
**Preview:** The gap I couldn't ignore anymore

---

Hey [First Name],

Thanks for your interest in Elite.

Here's what I noticed:

- The same questions kept coming up
- I was giving the same advice over and over
- Talented clinicians were building alone

**That's why I built Elite.**

[Join Elite →](https://buy.stripe.com/xxx)

— Anant
```

### Output (HTML):
```html
<!-- SUBJECT: Why I stopped advising and started teaching -->
<!-- PREVIEW: The gap I couldn't ignore anymore -->

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Why I stopped advising and started teaching</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F2EC; font-family: 'DM Sans', Arial, sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F2EC;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E3DFD7;">

          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 32px 40px; border-bottom: 1px solid #E3DFD7;">
              <p style="margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; font-weight: 500; color: #302C27;">
                Next Generation Medicine
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">

              <p style="margin: 0 0 20px 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                Hey {{ contact.firstname }},
              </p>

              <p style="margin: 0 0 20px 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                Thanks for your interest in Elite.
              </p>

              <p style="margin: 0 0 20px 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                Here's what I noticed:
              </p>

              <!-- Bullet List -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 8px 0;">
                <tr>
                  <td width="20" valign="top" style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #C49A6C;">—</td>
                  <td style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                    The same questions kept coming up
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 8px 0;">
                <tr>
                  <td width="20" valign="top" style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #C49A6C;">—</td>
                  <td style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                    I was giving the same advice over and over
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px 0;">
                <tr>
                  <td width="20" valign="top" style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #C49A6C;">—</td>
                  <td style="font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                    Talented clinicians were building alone
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                <strong style="font-weight: 600; color: #302C27;">That's why I built Elite.</strong>
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td style="background-color: #302C27; border-radius: 2px;">
                    <a href="https://buy.stripe.com/xxx" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; font-weight: 600; color: #FFFFFF; text-decoration: none; letter-spacing: 0.02em;">
                      Join Elite →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <p style="margin: 32px 0 0 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #4A4540;">
                — Anant
              </p>

            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px;">
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 14px; color: #302C27;">
                Next Generation Medicine
              </p>
              <p style="margin: 0; font-family: 'DM Sans', Arial, sans-serif; font-size: 12px; color: #9C9890;">
                nextgenerationmedicine.co
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
```

---

## Usage Instructions

Invoke this skill with:

```
Convert [file path or content reference] to HubSpot HTML

Options:
- Which email(s): "all" | "email 1" | "emails 3-5"
- Include header: yes/no (default: yes)
- Include footer: yes/no (default: yes)
```

Example:
```
Convert content/email-sequences/elite-mentorship-nurture.md email 1 to HubSpot HTML
```
