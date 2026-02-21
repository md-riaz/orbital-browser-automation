import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

/**
 * Validate URL for SSRF protection
 */
export async function validateUrl(url) {
    // Reject file:// URLs
    if (url.toLowerCase().startsWith('file://')) {
        return 'file:// URLs are not allowed';
    }

    // Parse URL
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return 'Invalid URL format';
    }

    if (!parsed.hostname) {
        return 'Invalid URL format';
    }

    const host = parsed.hostname;

    // Check if it's an IP address
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(host)) {
        if (isPrivateOrReservedIP(host)) {
            return 'Internal/private IP addresses are not allowed';
        }
    } else {
        // For hostnames, resolve and check IPs
        try {
            const ips = await resolve4(host);
            for (const ip of ips) {
                if (isPrivateOrReservedIP(ip)) {
                    return 'Hostname resolves to internal/private IP address';
                }
            }
        } catch (error) {
            // DNS resolution failed - might be external, let it proceed
            // or you could choose to block unresolvable domains
        }
    }

    return null;
}

/**
 * Check if an IP is private or reserved
 */
function isPrivateOrReservedIP(ip) {
    const parts = ip.split('.').map(Number);

    // Loopback (127.0.0.0/8)
    if (parts[0] === 127) return true;

    // Private ranges
    // 10.0.0.0/8
    if (parts[0] === 10) return true;

    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;

    // Link-local (169.254.0.0/16)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // Reserved/multicast
    // 0.0.0.0/8
    if (parts[0] === 0) return true;

    // 224.0.0.0/4 (multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return true;

    // 240.0.0.0/4 (reserved)
    if (parts[0] >= 240) return true;

    return false;
}

/**
 * Validate workflow step based on action type
 */
export function validateStep(step) {
    const { action } = step;
    const errors = [];

    switch (action) {
        case 'goto':
            if (!step.url || typeof step.url !== 'string') {
                errors.push('url is required and must be a string');
            } else {
                try {
                    new URL(step.url);
                } catch {
                    errors.push('url must be a valid URL');
                }
            }
            break;

        case 'wait':
            if (step.duration === undefined || typeof step.duration !== 'number') {
                errors.push('duration is required and must be a number');
            } else if (step.duration < 0 || step.duration > 60000) {
                errors.push('duration must be between 0 and 60000ms');
            }
            break;

        case 'click':
        case 'waitForSelector':
            if (!step.selector || typeof step.selector !== 'string') {
                errors.push('selector is required and must be a string');
            }
            break;

        case 'type':
            if (!step.selector || typeof step.selector !== 'string') {
                errors.push('selector is required and must be a string');
            }
            if (!step.value || typeof step.value !== 'string') {
                errors.push('value is required and must be a string');
            }
            break;

        case 'screenshot':
            if (step.fullPage !== undefined && typeof step.fullPage !== 'boolean') {
                errors.push('fullPage must be a boolean');
            }
            break;

        case 'waitForDownload':
            // No additional validation needed
            break;

        case 'evaluate':
            if (!step.script || typeof step.script !== 'string') {
                errors.push('script is required and must be a string');
            }
            break;

        default:
            errors.push(`Unknown action: ${action}`);
    }

    return errors;
}
