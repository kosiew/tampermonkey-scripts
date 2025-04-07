# GitHub Copilot Instructions

This document provides guidance for GitHub Copilot when working with this JavaScript project.

## Project Overview

This repository contains Tampermonkey scripts written in JavaScript. These scripts enhance user experience on various websites by adding custom functionality through browser extensions.

## Coding Standards

- Use modern JavaScript (ES6+) features where appropriate
- Follow strict mode with `"use strict"` in all scripts
- Use camelCase for variable and function names
- Use meaningful variable and function names that describe their purpose
- Keep functions small and focused on a single responsibility
- Add proper error handling with try/catch blocks for operations that might fail
- Avoid global variables; use closures and IIFEs to prevent namespace pollution

## Documentation

- Always include comprehensive JSDoc comments for functions
- Document parameters and return values
- Include examples where helpful
- Maintain the UserScript headers with appropriate @match directives
- Document DOM selectors used and why they were chosen

## Best Practices

- Prioritize performance with efficient DOM operations (minimize reflows and repaints)
- Use querySelector/querySelectorAll instead of older DOM selection methods
- Add descriptive console logs for debugging but comment them out in production
- Use event delegation where appropriate
- Clean up event listeners and observers when no longer needed
- Test scripts across different browsers and versions

## Project-Specific Guidelines

- All scripts should follow the Tampermonkey metadata block format
- Scripts should be self-contained and not rely on external libraries when possible
- Always provide visual feedback to users when actions are performed (like copying to clipboard)
- Consider adding user configuration options for flexible scripts

## Testing

- Test scripts manually on the target websites
- Verify scripts work with different site layouts and states
- Consider adding version checking to handle website structure changes

## Security Considerations

- Don't store sensitive information in localStorage or sessionStorage
- Sanitize any user input
- Be cautious when injecting HTML content to avoid XSS vulnerabilities
- Don't expose private API tokens or credentials in your scripts
