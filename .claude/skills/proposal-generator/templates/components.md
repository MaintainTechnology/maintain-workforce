# Proposal Component Patterns

Reusable HTML patterns for building proposal sections. Copy and customize as needed.

---

## Situation Section Patterns

### Pain Points List

```html
<h3>Current Challenges</h3>
<ul>
  <li><strong>Challenge 1:</strong> Description of the challenge and its impact</li>
  <li><strong>Challenge 2:</strong> Description of the challenge and its impact</li>
  <li><strong>Challenge 3:</strong> Description of the challenge and its impact</li>
</ul>
```

### Current State / Desired State

```html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin: var(--space-4) 0;">
  <div>
    <h4 style="color: var(--ink-500); margin-bottom: var(--space-2);">Where You Are</h4>
    <ul>
      <li>Current state point 1</li>
      <li>Current state point 2</li>
      <li>Current state point 3</li>
    </ul>
  </div>
  <div>
    <h4 style="color: var(--gold); margin-bottom: var(--space-2);">Where You Want to Be</h4>
    <ul>
      <li>Desired outcome 1</li>
      <li>Desired outcome 2</li>
      <li>Desired outcome 3</li>
    </ul>
  </div>
</div>
```

### Key Insight Box

```html
<div class="highlight-box">
  <p><strong>The core opportunity:</strong> Brief statement of the main opportunity or insight from the conversation.</p>
</div>
```

---

## Solution Section Patterns

### Scope Overview

```html
<p>Based on our conversation, we propose a <strong>[engagement type]</strong> focused on [primary objective]. This engagement will deliver:</p>

<ul>
  <li>Deliverable 1 with brief description</li>
  <li>Deliverable 2 with brief description</li>
  <li>Deliverable 3 with brief description</li>
</ul>
```

### Deliverables Grid

```html
<div class="deliverables-grid">
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>Deliverable Name</h4>
      <p>Brief description of what this deliverable includes and its value.</p>
    </div>
  </div>
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>Deliverable Name</h4>
      <p>Brief description of what this deliverable includes and its value.</p>
    </div>
  </div>
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>Deliverable Name</h4>
      <p>Brief description of what this deliverable includes and its value.</p>
    </div>
  </div>
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>Deliverable Name</h4>
      <p>Brief description of what this deliverable includes and its value.</p>
    </div>
  </div>
</div>
```

### Phased Approach

```html
<h3>Approach</h3>

<div class="timeline">
  <div class="timeline-item">
    <div class="timeline-label">Phase 1</div>
    <div class="timeline-content">
      <h4>Discovery & Assessment</h4>
      <p>Deep dive into current operations, identify gaps, and establish baseline metrics.</p>
    </div>
  </div>
  <div class="timeline-item">
    <div class="timeline-label">Phase 2</div>
    <div class="timeline-content">
      <h4>Strategy Development</h4>
      <p>Design protocols, frameworks, and operational improvements based on findings.</p>
    </div>
  </div>
  <div class="timeline-item">
    <div class="timeline-label">Phase 3</div>
    <div class="timeline-content">
      <h4>Implementation & Training</h4>
      <p>Roll out changes, train team, and establish ongoing measurement systems.</p>
    </div>
  </div>
</div>
```

### What's Included / What's Not

```html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin: var(--space-4) 0;">
  <div>
    <h4 style="margin-bottom: var(--space-2);">What's Included</h4>
    <ul>
      <li>Included item 1</li>
      <li>Included item 2</li>
      <li>Included item 3</li>
      <li>Included item 4</li>
    </ul>
  </div>
  <div>
    <h4 style="color: var(--ink-500); margin-bottom: var(--space-2);">Not Included</h4>
    <ul style="color: var(--ink-500);">
      <li>Excluded item 1</li>
      <li>Excluded item 2</li>
      <li>Excluded item 3</li>
    </ul>
  </div>
</div>
```

---

## Why NGM Section Patterns

### Credentials List

```html
<p>Dr. Anant Vinjamoori brings a unique combination of clinical expertise, operational experience, and technology innovation:</p>

<ul class="credentials-list">
  <li>
    <span class="credential-icon">◆</span>
    <span><strong>Harvard Medical School</strong> — Clinical foundation in evidence-based medicine</span>
  </li>
  <li>
    <span class="credential-icon">◆</span>
    <span><strong>Chief Medical Officer, Modern Age</strong> — Built the first national-scale longevity clinic in the U.S.</span>
  </li>
  <li>
    <span class="credential-icon">◆</span>
    <span><strong>Virta Health</strong> — Helped scale healthcare startup to $3B+ valuation</span>
  </li>
  <li>
    <span class="credential-icon">◆</span>
    <span><strong>Advisor to $1B+ companies</strong> — Strategic guidance to leading longevity ventures</span>
  </li>
</ul>
```

### Platform Capabilities (for Enterprise)

```html
<h3>Platform Capabilities</h3>

<p>The NGM platform provides tools purpose-built for longevity medicine:</p>

<div class="deliverables-grid">
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>Longevity Intelligence Platform</h4>
      <p>50,000+ peer-reviewed studies synthesized into actionable clinical guidance.</p>
    </div>
  </div>
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>AI Lab Report Generator</h4>
      <p>Transform raw labs into publication-quality patient reports in 5 minutes.</p>
    </div>
  </div>
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>Clinical Curriculum</h4>
      <p>150+ modules covering hormones, peptides, diagnostics, and more.</p>
    </div>
  </div>
  <div class="deliverable-item">
    <div class="deliverable-icon">◆</div>
    <div class="deliverable-content">
      <h4>Business Advisor</h4>
      <p>Operational guidance from scaling a national longevity practice.</p>
    </div>
  </div>
</div>
```

### Social Proof Quote

```html
<div class="quote-box">
  <p>"Quote from a client or relevant testimonial that speaks to results."</p>
  <p class="quote-attribution">— Attribution, Role/Company</p>
</div>
```

### Relevant Experience Highlight

```html
<div class="highlight-box">
  <p><strong>Relevant experience:</strong> When we built Modern Age, we faced similar challenges around [specific challenge]. The approach we developed—[brief description]—resulted in [outcome]. We'll apply the same methodology here.</p>
</div>
```

---

## Investment Section Patterns

### Single Option

```html
<table class="pricing-table">
  <thead>
    <tr>
      <th>Engagement</th>
      <th>Investment</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <div class="option-name">Engagement Name</div>
        <div class="option-desc">Brief description of what's included in this engagement.</div>
      </td>
      <td>
        <div class="price">$XX,XXX</div>
        <div class="price-note">one-time / per month</div>
      </td>
    </tr>
  </tbody>
</table>

<p class="text-small text-muted">Payment terms: 50% upon signing, 50% upon completion.</p>
```

### Multiple Options (Good/Better/Best)

```html
<table class="pricing-table">
  <thead>
    <tr>
      <th>Option</th>
      <th>What's Included</th>
      <th>Investment</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <div class="option-name">Essential</div>
      </td>
      <td>
        <div class="option-desc">
          <ul style="margin: 0; padding-left: 16px;">
            <li>Core deliverable 1</li>
            <li>Core deliverable 2</li>
          </ul>
        </div>
      </td>
      <td>
        <div class="price">$X,XXX</div>
      </td>
    </tr>
    <tr class="recommended">
      <td>
        <div class="option-name">Professional<span class="badge">Recommended</span></div>
      </td>
      <td>
        <div class="option-desc">
          <ul style="margin: 0; padding-left: 16px;">
            <li>Everything in Essential</li>
            <li>Additional deliverable 1</li>
            <li>Additional deliverable 2</li>
          </ul>
        </div>
      </td>
      <td>
        <div class="price">$XX,XXX</div>
      </td>
    </tr>
    <tr>
      <td>
        <div class="option-name">Comprehensive</div>
      </td>
      <td>
        <div class="option-desc">
          <ul style="margin: 0; padding-left: 16px;">
            <li>Everything in Professional</li>
            <li>Premium deliverable 1</li>
            <li>Premium deliverable 2</li>
            <li>Ongoing support</li>
          </ul>
        </div>
      </td>
      <td>
        <div class="price">$XX,XXX</div>
      </td>
    </tr>
  </tbody>
</table>
```

### Retainer Pricing

```html
<table class="pricing-table">
  <thead>
    <tr>
      <th>Retainer Level</th>
      <th>What's Included</th>
      <th>Monthly Investment</th>
    </tr>
  </thead>
  <tbody>
    <tr class="recommended">
      <td>
        <div class="option-name">Advisory Retainer<span class="badge">Recommended</span></div>
      </td>
      <td>
        <div class="option-desc">
          <ul style="margin: 0; padding-left: 16px;">
            <li>X hours/month of advisory time</li>
            <li>Weekly check-in calls</li>
            <li>Async support via [channel]</li>
            <li>Priority response (24-48 hours)</li>
          </ul>
        </div>
      </td>
      <td>
        <div class="price">$X,XXX<span class="price-note">/month</span></div>
        <div class="price-note">3-month minimum</div>
      </td>
    </tr>
  </tbody>
</table>

<p class="text-small text-muted">Billed monthly. Cancel with 30 days notice after initial term.</p>
```

### ROI Projection (for Enterprise)

```html
<div class="highlight-box">
  <h4 style="margin-bottom: var(--space-2);">Projected Return</h4>
  <p>Based on similar implementations, we project:</p>
  <ul style="margin-bottom: 0;">
    <li><strong>Time savings:</strong> X hours/week per clinician on report generation</li>
    <li><strong>Revenue opportunity:</strong> $XX,XXX additional monthly revenue from longevity services</li>
    <li><strong>Payback period:</strong> X months</li>
  </ul>
</div>
```

---

## CTA Section Variations

### Standard CTA

```html
<section class="cta-section">
  <h3>Ready to Move Forward?</h3>
  <p>Let's schedule a brief call to discuss any questions and outline next steps.</p>
  <a href="mailto:anant@nextgenerationmedicine.co?subject=Proposal%20Follow-up%20-%20ClientName" class="cta-button">Schedule a Call</a>
  <p class="cta-note">This proposal is valid for 30 days.</p>
</section>
```

### Urgency CTA

```html
<section class="cta-section">
  <h3>Let's Get Started</h3>
  <p>Based on your timeline, we recommend beginning within the next two weeks to hit your Q1 launch target.</p>
  <a href="mailto:anant@nextgenerationmedicine.co?subject=Ready%20to%20Proceed%20-%20ClientName" class="cta-button">Confirm & Begin</a>
  <p class="cta-note">Reply to this email or schedule directly: <a href="#">calendly.com/anant-ngm</a></p>
</section>
```

### Multiple Options CTA

```html
<section class="cta-section">
  <h3>Which Option Works Best?</h3>
  <p>Reply with your preferred option, or let's schedule a call to discuss which approach fits your situation.</p>
  <a href="mailto:anant@nextgenerationmedicine.co?subject=Proposal%20Selection%20-%20ClientName" class="cta-button">Let's Discuss</a>
  <p class="cta-note">Questions? Reply to this email anytime.</p>
</section>
```

---

## Additional Components

### Divider

```html
<div class="divider"></div>
```

### Note/Disclaimer

```html
<p class="text-small text-muted" style="margin-top: var(--space-4);">
  <em>Note: This proposal is confidential and intended solely for the recipient. Pricing and scope are valid for 30 days from the date above.</em>
</p>
```

### Terms Summary (for larger deals)

```html
<h3>Terms</h3>
<ul class="text-small">
  <li><strong>Payment:</strong> 50% upon signing, 50% upon completion (or monthly for retainers)</li>
  <li><strong>Timeline:</strong> Work begins within 2 weeks of signed agreement</li>
  <li><strong>Confidentiality:</strong> All information shared is kept strictly confidential</li>
  <li><strong>IP:</strong> Deliverables become client property upon final payment</li>
</ul>
```

### Team/Resources (for Enterprise)

```html
<h3>Your Team</h3>
<p>This engagement will be led by:</p>
<ul>
  <li><strong>Dr. Anant Vinjamoori</strong> — Strategic oversight and clinical guidance</li>
  <li><strong>Supporting resources</strong> — As needed for specific deliverables</li>
</ul>
```
