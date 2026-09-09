# 3D Jaw Viewer

A web-based 3D visualization application for viewing dental treatment progression using Three.js.

## Documentation

- **[CODEBASE_DOCUMENTATION.md](./CODEBASE_DOCUMENTATION.md)** - Comprehensive codebase documentation with detailed module explanations, data flow, and extension guide
- **[MODULAR_ARCHITECTURE.md](./MODULAR_ARCHITECTURE.md)** - Architecture overview and module descriptions
- **[BUILD_INSTRUCTIONS.md](./BUILD_INSTRUCTIONS.md)** - Build and deployment instructions

## Quick Start

1. Install dependencies: `npm install`
2. For development: `npm run dev`
3. For production build: `npm run build`

## Features

- Interactive 3D jaw model visualization
- Treatment stage progression (13 upper, 22 lower stages)
- Material presets (8 options)
- Background presets (6 options)
- Dual progress bar visualization
- Automatic GLB file discovery
- Responsive design with mobile support

## Technology Stack

- Three.js v0.146.0
- Vanilla JavaScript (no framework)
- GLTFLoader for 3D models
- OrbitControls for camera interaction