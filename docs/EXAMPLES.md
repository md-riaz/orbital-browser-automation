# Workflow Examples

This document contains example workflows for Orbital Browser Automation.

## Example 1: Simple Screenshot

Takes a screenshot of a webpage.

```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com" },
      { "action": "screenshot", "fullPage": true }
    ]
  }
}
```

## Example 2: Form Filling

Fills out a form and submits it.

```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com/contact" },
      { "action": "type", "selector": "#name", "value": "John Doe" },
      { "action": "type", "selector": "#email", "value": "john@example.com" },
      { "action": "type", "selector": "#message", "value": "Hello World" },
      { "action": "click", "selector": "button[type='submit']" },
      { "action": "waitForSelector", "selector": ".success-message" },
      { "action": "screenshot", "fullPage": false }
    ]
  }
}
```

## Example 3: Data Extraction

Navigate to a page, wait for content, and extract data using JavaScript.

```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com/products" },
      { "action": "waitForSelector", "selector": ".product-list" },
      {
        "action": "evaluate",
        "script": "Array.from(document.querySelectorAll('.product')).map(p => ({ name: p.querySelector('.name').textContent, price: p.querySelector('.price').textContent }))"
      }
    ]
  }
}
```

## Example 4: Multi-step Navigation

Navigate through multiple pages with custom viewport.

```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com" },
      { "action": "click", "selector": "a.login" },
      { "action": "waitForSelector", "selector": "#login-form" },
      { "action": "type", "selector": "#username", "value": "user@example.com" },
      { "action": "type", "selector": "#password", "value": "password123" },
      { "action": "click", "selector": "button.login-btn" },
      { "action": "waitForSelector", "selector": ".dashboard" },
      { "action": "screenshot", "fullPage": true }
    ]
  },
  "options": {
    "timeout": 60000,
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

## Example 5: File Download

Download a file from a webpage.

```json
{
  "workflow": {
    "steps": [
      { "action": "goto", "url": "https://example.com/downloads" },
      { "action": "click", "selector": "a.download-link" },
      { "action": "waitForDownload" }
    ]
  }
}
```

## Common Patterns

### Waiting for Dynamic Content

```json
{
  "action": "waitForSelector",
  "selector": ".dynamic-content"
}
```

### Adding Delays

```json
{
  "action": "wait",
  "duration": 5000
}
```

### Taking Full Page Screenshots

```json
{
  "action": "screenshot",
  "fullPage": true
}
```

### Custom Viewport Sizes

Mobile:
```json
{
  "options": {
    "viewport": {
      "width": 375,
      "height": 667
    }
  }
}
```

Tablet:
```json
{
  "options": {
    "viewport": {
      "width": 768,
      "height": 1024
    }
  }
}
```

Desktop (HD):
```json
{
  "options": {
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

## Error Handling

If a workflow fails, check the error message in the job response:

```bash
curl http://localhost:8058/api/v1/jobs/{job_id}
```

Common errors:
- `net::ERR_NAME_NOT_RESOLVED` - Invalid URL or network issue
- `Timeout` - Page took too long to load
- `selector not found` - Element doesn't exist on the page
- `SSRF protection` - URL targets internal/private IP address
