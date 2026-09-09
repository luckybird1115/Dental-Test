# Build Instructions for 3D Jaw Viewer

## Overview
This document explains how to build a production-ready, obfuscated version of the 3D Jaw Viewer application that protects your source code from being easily readable in browser developer tools.

## Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation
1. Install dependencies:
```bash
npm install
```

## Building for Production

### Quick Build
```bash
npm run build
```

This command will:
- Obfuscate all JavaScript files
- Minify the obfuscated code
- Copy assets to the dist folder
- Create a production HTML file with developer tools protection

### Manual Steps
If you prefer to run steps individually:

1. **Obfuscate JavaScript files:**
```bash
npm run obfuscate
```

2. **Minify JavaScript files:**
```bash
npm run minify
```

## What Gets Protected

### 1. JavaScript Obfuscation
- Variable and function names are replaced with random characters
- Control flow is flattened and obfuscated
- String arrays are encoded and shuffled
- Dead code injection makes reverse engineering harder
- Debug protection prevents debugging tools

### 2. Developer Tools Protection
- Detects when developer tools are opened
- Disables right-click context menu
- Blocks F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U shortcuts
- Prevents text selection and drag-and-drop
- Shows warning message when dev tools are detected

### 3. Code Minification
- Removes whitespace and comments
- Shortens variable names
- Removes console.log statements
- Optimizes code structure

## Output Structure
After building, you'll have a `dist/` folder with:
```
dist/
├── index.html          # Production HTML with protection
├── js/                 # Obfuscated and minified JavaScript files
│   ├── config.js
│   ├── lighting.js
│   ├── main.js
│   ├── modelLoader.js
│   ├── sceneManager.js
│   ├── stageManager.js
│   └── uiControls.js
└── assets/             # Copied assets
    ├── env.hdr
    ├── models/
    └── *.stl files
```

## Deployment
1. Build the application: `npm run build`
2. Upload the entire contents of the `dist/` folder to your web server
3. Your application is now protected!

## Important Notes

### ⚠️ Limitations
- **Complete source code protection is impossible** in client-side web applications
- Determined users can still access your code, but it will be extremely difficult to understand
- The obfuscation makes the code unreadable and very hard to reverse engineer

### 🔧 Customization
You can modify the obfuscation settings in `obfuscator-config.json` to adjust the level of protection vs. performance.

### 🚀 Performance
- Obfuscated code may run slightly slower than original code
- File sizes will be larger due to obfuscation
- The protection scripts add minimal overhead

## Development Mode
For development, use:
```bash
npm run dev
```
This starts a local development server without obfuscation.

## Troubleshooting
- If build fails, ensure all dependencies are installed: `npm install`
- Check that all JavaScript files in `js/` folder are valid
- Ensure you have write permissions in the project directory

## Security Best Practices
1. **Never put sensitive data in client-side code** (API keys, passwords, etc.)
2. **Use server-side validation** for all critical operations
3. **Implement proper authentication** on your backend
4. **Use HTTPS** in production
5. **Regularly update dependencies** to patch security vulnerabilities

Remember: Client-side obfuscation is a deterrent, not absolute protection. For truly sensitive applications, consider server-side rendering or hybrid approaches.
