# Example: RALPH-ifying Invoice Processing

This example demonstrates how `/ralph-ify` transforms a simple workflow description into a complete RALPH-style skill.

## Input

```bash
/ralph-ify "Process customer invoices: extract data, validate amounts, categorize expenses, generate payment reminders for overdue items" --name invoice-processor
```

---

## Phase 1: Analysis Output

### Workflow Analysis: Invoice Processor

**Purpose**: Process customer invoices through extraction, validation, categorization, and reminder generation.

**Trigger**: User invokes with invoice file or directory

**Output**: Processed invoices with categories and payment reminders

### Identified Work Units (4)

| ID | Unit Name | Dependencies | Complexity |
|----|-----------|--------------|------------|
| EXTRACT | Extract invoice data | None | Medium |
| VALIDATE | Validate amounts | [EXTRACT] | Low |
| CATEGORIZE | Categorize expenses | [EXTRACT] | Medium |
| REMIND | Generate reminders | [VALIDATE] | Medium |

### Success Criteria

- **EXTRACT**: All fields extracted (vendor, amount, date, line items)
- **VALIDATE**: Amounts are positive, totals match line items, dates are valid
- **CATEGORIZE**: Each line item has exactly one category
- **REMIND**: Reminders generated for invoices > 30 days overdue

### Potential Failure Modes

- PDF extraction fails on scanned documents
- Currency parsing errors for international invoices
- Missing vendor information
- Circular date formats (MM/DD vs DD/MM)

---

## Phase 2: Design Output

### PRD Structure

```json
{
  "version": "1.0",
  "skill": "invoice-processor",
  "config": {
    "maxIterations": 50,
    "maxFailuresPerItem": 3
  },
  "items": [
    {
      "id": "EXTRACT-001",
      "title": "Extract data from invoice",
      "description": "Parse the invoice file and extract: vendor name, invoice number, date, due date, line items (description, quantity, unit price, total), subtotal, tax, grand total, payment terms.",
      "priority": 1,
      "status": "pending",
      "dependsOn": [],
      "acceptanceCriteria": [
        "Vendor name is not empty",
        "Invoice number is extracted",
        "At least one line item exists",
        "Grand total is a valid number"
      ]
    },
    {
      "id": "VALIDATE-001",
      "title": "Validate invoice amounts",
      "description": "Verify mathematical accuracy: line item totals = quantity * unit price, subtotal = sum of line items, grand total = subtotal + tax. Flag any discrepancies.",
      "priority": 10,
      "status": "pending",
      "dependsOn": ["EXTRACT-001"],
      "acceptanceCriteria": [
        "All line item calculations are correct",
        "Subtotal matches sum of line items",
        "Grand total matches subtotal + tax",
        "No negative amounts"
      ]
    },
    {
      "id": "CATEGORIZE-001",
      "title": "Categorize expense line items",
      "description": "Assign each line item to exactly one expense category from: Office Supplies, Software, Hardware, Services, Travel, Marketing, Other. Use item description and vendor context.",
      "priority": 20,
      "status": "pending",
      "dependsOn": ["EXTRACT-001"],
      "acceptanceCriteria": [
        "Every line item has a category",
        "Categories are from the allowed list",
        "No item has multiple categories"
      ]
    },
    {
      "id": "REMIND-001",
      "title": "Generate payment reminder",
      "description": "If invoice is overdue (due date > 30 days ago), generate a payment reminder email. Include: invoice number, amount due, days overdue, payment instructions.",
      "priority": 100,
      "status": "pending",
      "dependsOn": ["VALIDATE-001"],
      "acceptanceCriteria": [
        "Reminder only generated if overdue > 30 days",
        "Email includes all required fields",
        "Tone is professional but firm",
        "Clear call-to-action for payment"
      ]
    }
  ]
}
```

### Quality Gates

#### Gate: EXTRACT

| Check | Criteria | Severity | Failure Suggestion |
|-------|----------|----------|-------------------|
| vendor_present | Vendor name is not empty | Critical | "To fix: Check for 'Bill To', 'From', or letterhead for vendor name" |
| valid_total | Grand total parses as number | Critical | "To fix: Look for 'Total', 'Amount Due', 'Balance' labels" |
| has_line_items | At least one line item extracted | Standard | "To fix: Look for table structures or itemized lists" |
| date_valid | Invoice date is parseable | Standard | "To fix: Try multiple date formats (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)" |

**Pass Threshold**: 75%
**Critical Failures**: vendor_present, valid_total

#### Gate: VALIDATE

| Check | Criteria | Severity | Failure Suggestion |
|-------|----------|----------|-------------------|
| line_math | Each line total = qty * price | Critical | "To fix: Recalculate line totals and flag mismatches" |
| subtotal_sum | Subtotal = sum of line totals | Standard | "To fix: Sum line totals and compare to stated subtotal" |
| total_correct | Grand total = subtotal + tax | Standard | "To fix: Verify tax calculation and total" |
| no_negatives | All amounts >= 0 | Standard | "To fix: Flag negative amounts as potential credits" |

**Pass Threshold**: 75%
**Critical Failures**: line_math

#### Gate: CATEGORIZE

| Check | Criteria | Severity | Failure Suggestion |
|-------|----------|----------|-------------------|
| all_categorized | Every item has category | Critical | "To fix: Use 'Other' for ambiguous items" |
| valid_category | Category in allowed list | Critical | "To fix: Map to nearest allowed category" |
| single_category | No item has multiple | Standard | "To fix: Choose primary category based on amount" |
| reasonable_match | Category fits description | Standard | "To fix: Re-evaluate based on vendor context" |

**Pass Threshold**: 75%
**Critical Failures**: all_categorized, valid_category

#### Gate: REMIND

| Check | Criteria | Severity | Failure Suggestion |
|-------|----------|----------|-------------------|
| only_if_overdue | Reminder only for >30 days | Critical | "To fix: Verify due date calculation" |
| has_invoice_num | Includes invoice number | Standard | "To fix: Add invoice reference to subject/body" |
| has_amount | Includes amount due | Standard | "To fix: Add outstanding amount to email body" |
| professional_tone | No aggressive language | Standard | "To fix: Replace harsh phrases with professional alternatives" |
| has_cta | Clear payment instructions | Standard | "To fix: Add specific payment method and deadline" |

**Pass Threshold**: 80%
**Critical Failures**: only_if_overdue

---

## Phase 3: Scaffold Output

### Generated Files

```
.claude/skills/invoice-processor/
├── SKILL.md              # Complete skill definition (324 lines)
├── prd-schema.json       # PRD structure template
├── quality-gates.md      # All 4 quality gates defined
└── state-template/
    ├── .gitkeep
    └── README.md
```

### SKILL.md Excerpt

```markdown
---
name: invoice-processor
description: Process customer invoices with extraction, validation, categorization, and reminder generation
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite
user_invocable: true
argument-hint: <invoice-path> [--batch] [--output DIR]
---

# Invoice Processor

## Overview

Process customer invoices through a four-stage pipeline:
1. **Extract**: Parse invoice data (vendor, amounts, line items)
2. **Validate**: Verify mathematical accuracy
3. **Categorize**: Assign expense categories to line items
4. **Remind**: Generate payment reminders for overdue invoices

## Invocation

/invoice-processor path/to/invoice.pdf
/invoice-processor path/to/invoices/ --batch

...
```

---

## Usage

After RALPH-ification, the new skill can be invoked:

```bash
/invoice-processor /path/to/invoice.pdf
```

The skill will:
1. Create `.invoice-processor/prd.json` with 4 items
2. Execute EXTRACT-001, then VALIDATE-001 and CATEGORIZE-001 (in parallel), then REMIND-001
3. Retry any failed items up to 3 times with feedback
4. Output processed invoice data and any reminders

---

## Key Transformations Applied

| Original Concept | RALPH Transformation |
|------------------|---------------------|
| "Process invoices" | 4 discrete items with dependencies |
| "Validate amounts" | Quality gate with 4 specific checks |
| "Generate reminders" | Conditional item (only if overdue) |
| Implicit ordering | Explicit dependency graph |
| No error handling | Retry loop with feedback |
| No state | prd.json + progress.txt |
