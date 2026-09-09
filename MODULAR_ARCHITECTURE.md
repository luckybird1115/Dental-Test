# 3D Jaw Viewer - Modular Architecture

## Overview
The 3D Jaw Viewer has been refactored from a single `main.js` file into a modular architecture for better maintainability and organization.

## File Structure

```
js/
├── config.js          # Global variables and configuration
├── lighting.js         # Lighting system management
├── modelLoader.js     # GLB file discovery and loading
├── uiControls.js      # UI event handlers and controls
├── sceneManager.js    # Scene, camera, and renderer setup
├── stageManager.js    # Stage navigation and model visibility
└── main.js           # Main application controller
```

## Module Descriptions

### 1. config.js
- **Purpose**: Centralized configuration and global state management
- **Key Features**:
  - Global variables (scene, camera, renderer, etc.)
  - Application state (current stage, visibility settings)
  - Configuration constants (frustum size, model scale)
  - Getter/setter methods for state access

### 2. lighting.js
- **Purpose**: Lighting system setup and management
- **Key Features**:
  - `LightingManager` class for lighting control
  - Directional lights with shadow casting
  - Ambient lighting
  - Dynamic lighting adjustment based on background

### 3. modelLoader.js
- **Purpose**: GLB model file discovery and loading
- **Key Features**:
  - `ModelLoader` class for model management
  - Automatic file discovery with multiple naming patterns
  - GLB model loading with proper scaling and rotation
  - Error handling for missing files

### 4. uiControls.js
- **Purpose**: User interface event handling and controls
- **Key Features**:
  - `UIControls` class for UI management
  - Event listeners for all UI interactions
  - Button state management
  - Progress and loading indicators

### 5. sceneManager.js
- **Purpose**: 3D scene, camera, and renderer setup
- **Key Features**:
  - `SceneManager` class for scene management
  - Orthographic camera setup
  - WebGL renderer configuration
  - Environment map loading
  - Window resize handling

### 6. stageManager.js
- **Purpose**: Stage navigation and model visibility
- **Key Features**:
  - `StageManager` class for stage control
  - Stage navigation logic
  - Model visibility management
  - Stage initialization

### 7. main.js
- **Purpose**: Main application controller and orchestration
- **Key Features**:
  - `JawViewerApp` class for application lifecycle
  - Module initialization and coordination
  - Loading manager setup
  - Global debugging functions

## Benefits of Modular Architecture

1. **Maintainability**: Each module has a single responsibility
2. **Readability**: Code is organized by functionality
3. **Reusability**: Modules can be reused or extended
4. **Debugging**: Easier to isolate and fix issues
5. **Collaboration**: Multiple developers can work on different modules
6. **Testing**: Individual modules can be tested separately

## Usage

The application loads modules in the correct order via the HTML file:

```html
<script src="./js/config.js"></script>
<script src="./js/lighting.js"></script>
<script src="./js/modelLoader.js"></script>
<script src="./js/uiControls.js"></script>
<script src="./js/sceneManager.js"></script>
<script src="./js/stageManager.js"></script>
<script src="./js/main.js"></script>
```

## Global Access

- `AppConfig`: Global configuration and state management
- `LightingManager`: Lighting system class
- `ModelLoader`: Model loading class
- `UIControls`: UI controls class
- `SceneManager`: Scene management class
- `StageManager`: Stage management class
- `app`: Main application instance (for debugging)

## Debugging

Global functions available for debugging:
- `window.refreshModelFiles()`: Refresh model file discovery
- `window.discoverModelFiles()`: Discover model files
- `window.app`: Access to main application instance
