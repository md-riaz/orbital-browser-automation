export const workflowTemplates = {
    'screenshot': {
        name: 'Take Screenshot',
        description: 'Navigate to a URL and take a screenshot',
        workflow: {
            steps: [
                { action: 'goto', url: '{{url}}' },
                { action: 'wait', duration: 2000 },
                { action: 'screenshot', fullPage: true }
            ]
        },
        options: {
            timeout: 30000,
            viewport: { width: 1920, height: 1080 }
        },
        parameters: {
            url: { type: 'string', required: true, description: 'URL to visit' }
        }
    },
    'pdf-export': {
        name: 'Export to PDF',
        description: 'Navigate to a URL and export as PDF',
        workflow: {
            steps: [
                { action: 'goto', url: '{{url}}' },
                { action: 'wait', duration: 3000 },
                { action: 'evaluate', script: 'window.print()' }
            ]
        },
        options: {
            timeout: 40000,
            viewport: { width: 1920, height: 1080 }
        },
        parameters: {
            url: { type: 'string', required: true, description: 'URL to visit' }
        }
    },
    'form-fill': {
        name: 'Fill Form',
        description: 'Navigate to a form and fill it with data',
        workflow: {
            steps: [
                { action: 'goto', url: '{{url}}' },
                { action: 'waitForSelector', selector: '{{form_selector}}' },
                { action: 'type', selector: '{{field1_selector}}', value: '{{field1_value}}' },
                { action: 'type', selector: '{{field2_selector}}', value: '{{field2_value}}' },
                { action: 'click', selector: '{{submit_selector}}' },
                { action: 'wait', duration: 2000 },
                { action: 'screenshot', fullPage: true }
            ]
        },
        options: {
            timeout: 60000,
            viewport: { width: 1280, height: 800 }
        },
        parameters: {
            url: { type: 'string', required: true },
            form_selector: { type: 'string', required: true },
            field1_selector: { type: 'string', required: true },
            field1_value: { type: 'string', required: true },
            field2_selector: { type: 'string', required: true },
            field2_value: { type: 'string', required: true },
            submit_selector: { type: 'string', required: true }
        }
    },
    'monitor-changes': {
        name: 'Monitor Page Changes',
        description: 'Visit a page periodically and detect changes',
        workflow: {
            steps: [
                { action: 'goto', url: '{{url}}' },
                { action: 'waitForSelector', selector: '{{watch_selector}}' },
                { action: 'evaluate', script: 'document.querySelector("{{watch_selector}}").innerText' },
                { action: 'screenshot', fullPage: false }
            ]
        },
        options: {
            timeout: 30000,
            viewport: { width: 1920, height: 1080 }
        },
        parameters: {
            url: { type: 'string', required: true },
            watch_selector: { type: 'string', required: true, description: 'CSS selector of element to watch' }
        }
    },
    'scrape-data': {
        name: 'Scrape Data',
        description: 'Extract data from a webpage',
        workflow: {
            steps: [
                { action: 'goto', url: '{{url}}' },
                { action: 'waitForSelector', selector: '{{data_selector}}' },
                { action: 'evaluate', script: 'Array.from(document.querySelectorAll("{{data_selector}}")).map(el => el.textContent)' }
            ]
        },
        options: {
            timeout: 30000,
            viewport: { width: 1920, height: 1080 }
        },
        parameters: {
            url: { type: 'string', required: true },
            data_selector: { type: 'string', required: true, description: 'CSS selector of data elements' }
        }
    },
    'login-flow': {
        name: 'Login Flow',
        description: 'Automated login to a website',
        workflow: {
            steps: [
                { action: 'goto', url: '{{url}}' },
                { action: 'waitForSelector', selector: '{{username_selector}}' },
                { action: 'type', selector: '{{username_selector}}', value: '{{username}}' },
                { action: 'type', selector: '{{password_selector}}', value: '{{password}}' },
                { action: 'click', selector: '{{submit_selector}}' },
                { action: 'wait', duration: 3000 },
                { action: 'screenshot', fullPage: true }
            ]
        },
        options: {
            timeout: 60000,
            viewport: { width: 1920, height: 1080 }
        },
        parameters: {
            url: { type: 'string', required: true },
            username_selector: { type: 'string', required: true },
            password_selector: { type: 'string', required: true },
            submit_selector: { type: 'string', required: true },
            username: { type: 'string', required: true },
            password: { type: 'string', required: true, secure: true }
        }
    }
};

export function interpolateTemplate(template, params) {
    const workflowStr = JSON.stringify(template);
    let interpolated = workflowStr;

    for (const [key, value] of Object.entries(params)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        interpolated = interpolated.replace(regex, value);
    }

    return JSON.parse(interpolated);
}
