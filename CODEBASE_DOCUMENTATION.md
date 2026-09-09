# 3D Jaw Viewer - Comprehensive Codebase Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Module Details](#module-details)
4. [Data Flow](#data-flow)
5. [Configuration](#configuration)
6. [Key Features](#key-features)
7. [File Structure](#file-structure)
8. [Extension Guide](#extension-guide)

---

## Overview

The 3D Jaw Viewer is a web-based application for visualizing dental treatment progression using Three.js. It displays 3D models of maxillary (upper) and mandibular (lower) jaws across multiple treatment stages, allowing users to navigate through the treatment timeline.

### Key Technologies
- **Three.js** (v0.146.0): 3D rendering engine
- **GLTFLoader**: For loading GLB model files
- **OrbitControls**: Camera interaction (rotate, pan, zoom)
- **RGBELoader**: Environment map loading (optional)
- **Vanilla JavaScript**: No framework dependencies

### Main Purpose
- Display treatment progression stages (typically 13 upper, 22 lower)
- Allow interactive 3D navigation
- Provide material and background customization
- Show dual progress bars for upper and lower jaw progression

---

## Architecture

### Modular Design
The application follows a modular architecture where each module has a specific responsibility:

```
┌─────────────────────────────────────────┐
│           index.html                     │
│  (UI Structure & Module Loading)        │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           main.js                        │
│  (Application Controller)               │
└─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Scene   │ │  Model   │ │   UI     │
│ Manager  │ │  Loader  │ │ Controls │
└──────────┘ └──────────┘ └──────────┘
        │           │           │
        ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Lighting │ │ Material │ │  Stage   │
│ Manager  │ │ Manager   │ │ Manager  │
└──────────┘ └──────────┘ └──────────┘
```

### Module Loading Order
Modules are loaded in a specific order (defined in `index.html`):
1. `config.js` - Global configuration (must load first)
2. `lighting.js` - Lighting system
3. `materialManager.js` - Material presets
4. `modelLoader.js` - Model loading
5. `uiControls.js` - UI event handlers
6. `sceneManager.js` - Scene setup
7. `stageManager.js` - Stage navigation
8. `main.js` - Application initialization

---

## Module Details

### 1. config.js
**Purpose**: Centralized configuration and global state management

**Key Components**:
- **Constants**:
  - `frustumSize`: Camera frustum size (300)
  - `modelScale`: Model scaling factor (3)
  
- **Global State Variables**:
  - `scene`, `camera`, `renderer`, `controls`: Three.js core objects
  - `currentStage`: Current treatment stage (1-based)
  - `totalStages`: Maximum number of stages
  - `maxillaryModels[]`, `mandibularModels[]`: Loaded 3D models
  - `isObjectsLoaded`: Loading state flag
  - `upperVisible`, `lowerVisible`: Jaw visibility flags
  - `currentBackground`: Current background preset name
  - `maxillaryFiles[]`, `mandibularFiles[]`: Discovered file names

- **AppConfig Object**:
  - Provides getter/setter methods for all state variables
  - Ensures controlled access to global state
  - Prevents direct variable manipulation

**Usage Example**:
```javascript
// Get current stage
const stage = AppConfig.currentStage();

// Set new stage
AppConfig.setCurrentStage(5);

// Check if models are loaded
if (AppConfig.isObjectsLoaded()) {
  // Proceed with operations
}
```

---

### 2. sceneManager.js
**Purpose**: Manages 3D scene, camera, renderer, and environment

**Class**: `SceneManager`

**Key Methods**:
- `initScene()`: Initializes the complete 3D environment
  - Creates Three.js Scene
  - Sets up OrthographicCamera
  - Configures WebGLRenderer with quality settings
  - Initializes OrbitControls
  - Sets up lighting via LightingManager
  - Creates MaterialManager instance
  - Handles window resize events

- `resetCamera()`: Resets camera to default position (300, 400, 500)

- `changeBackground(backgroundType)`: Changes background color/preset
  - Updates renderer clear color
  - Adjusts tone mapping exposure
  - Updates lighting for background

- `startAnimationLoop()`: Begins the render loop
  - Uses `requestAnimationFrame`
  - Updates controls each frame
  - Renders the scene

**Renderer Settings**:
- Antialiasing: Enabled
- Shadow maps: PCFSoftShadowMap
- Tone mapping: ACESFilmicToneMapping
- Physically correct lights: Enabled
- High precision: Enabled
- Logarithmic depth buffer: Enabled

**Camera Configuration**:
- Type: OrthographicCamera
- Frustum size: 300 units
- Near plane: 1
- Far plane: 1000
- Initial position: (300, 400, 500)
- Target: (0, 0, 0)

---

### 3. modelLoader.js
**Purpose**: Discovers and loads GLB model files

**Class**: `ModelLoader`

**Key Methods**:
- `discoverModelFiles()`: Automatically discovers available GLB files
  - Checks for files named "Maxillary BL {1-100}.glb"
  - Checks for files named "Mandibular BL {1-100}.glb"
  - Uses parallel HEAD requests for performance
  - Sorts files numerically
  - Returns object with `maxillaryFiles` and `mandibularFiles` arrays

- `loadGLBModels()`: Loads all discovered GLB models
  - Uses THREE.GLTFLoader
  - Applies scaling (modelScale = 3)
  - Rotates models 90° on X-axis (Math.PI/2)
  - Applies dental materials via MaterialManager
  - Sets initial visibility (only first stage visible)
  - Adds models to scene

- `applyDentalMaterials(model, materialManager)`: Applies realistic dental materials
  - Traverses model hierarchy
  - Converts materials to MeshStandardMaterial (PBR)
  - Enables shadow casting/receiving
  - Applies material preset if MaterialManager available
  - Sets default properties (color, roughness, metalness)

**File Discovery Logic**:
```javascript
// Checks files in parallel using Promise.allSettled
for (let i = 1; i <= 100; i++) {
  fetch(`Maxillary BL ${i}.glb`, { method: 'HEAD' })
    .then(response => response.ok ? filename : null)
}
```

**Model Processing**:
- Scale: 3x in all dimensions
- Rotation: 90° on X-axis (π/2 radians)
- Initial visibility: Only index 0 (first stage) visible
- Material: PBR (Physically Based Rendering) enabled

---

### 4. stageManager.js
**Purpose**: Manages stage navigation and model visibility

**Class**: `StageManager`

**Key Methods**:
- `setStage(stage)`: Sets the current treatment stage
  - Validates stage range (1 to totalStages)
  - Hides all models
  - Calculates which models to show based on stage
  - **Stage Logic**:
    - Stages 1-13: Both upper and lower advance together
    - Stages >13: Lower continues, upper stays at stage 13
  - Updates UI controls

- `updateJawVisibility()`: Updates visibility based on current settings
  - Respects `upperVisible` and `lowerVisible` flags
  - Shows/hides current stage models accordingly

- `initializeStages()`: Initializes stage system after models load
  - Calculates total stages (max of upper/lower counts)
  - Updates UI with stage information
  - Enables navigation controls

**Stage Calculation Logic**:
```javascript
// Upper jaw: clamps at maxUpperStage (typically 13)
const upperStageIndex = Math.min(stage, maxUpperStage) - 1;

// Lower jaw: clamps at maxLowerStage (typically 22)
const lowerStageIndex = Math.min(stage, maxLowerStage) - 1;
```

**Example**:
- Stage 1: Shows Maxillary BL 1, Mandibular BL 1
- Stage 13: Shows Maxillary BL 13, Mandibular BL 13
- Stage 14: Shows Maxillary BL 13 (stays), Mandibular BL 14
- Stage 22: Shows Maxillary BL 13 (stays), Mandibular BL 22

---

### 5. uiControls.js
**Purpose**: Handles all UI interactions and event listeners

**Class**: `UIControls`

**Key Methods**:
- `setupEventListeners()`: Sets up all UI event handlers
  - Previous/Next button clicks
  - Stage slider input
  - Hide/Show jaw buttons
  - Reset camera button
  - Background selector
  - Material selector
  - Help overlay controls
  - Keyboard shortcuts ('?' for help)

- `updateStageInfo()`: Updates stage information display
  - Updates progress bars
  - Updates timeline numbers
  - Updates slider labels

- `updateJawProgressBars()`: Updates dual progress bar visualization
  - Upper bar: Progresses 0-13, then shows outline for stages >13
  - Lower bar: Progresses 0-22
  - Both bars use same total width (max of both counts)
  - Shows outline when stage exceeds that jaw's maximum

- `applyMaterialPreset(presetName)`: Applies material preset to all models
  - Gets all models from stage manager
  - Applies preset via MaterialManager
  - Updates lighting if needed

- `suggestOptimalMaterial(backgroundName)`: Auto-suggests material for background
  - Uses MaterialManager recommendations
  - Automatically applies optimal preset

**UI Elements**:
- **Top Controls**:
  - Hide/Show Upper Jaw button
  - Hide/Show Lower Jaw button
  - Material selector (8 presets)
  - Background selector (6 presets)
  - Reset View button
  - Help button

- **Bottom Controls**:
  - Previous/Next buttons
  - Stage slider (1 to max stages)
  - Dual progress bars (upper/lower)
  - Stage labels (0 to max for each jaw)

- **Help Overlay**:
  - Keyboard shortcuts
  - Mouse/touch controls
  - Auto-shows on first visit
  - Persists preference in localStorage

**Progress Bar Logic**:
```javascript
// Upper bar fills up to maxUpperStage, then outlined
const upperFillWidth = (Math.min(currentStage, maxUpperStage) / maxStage) * 100;

// Lower bar fills up to maxLowerStage, then outlined
const lowerFillWidth = (Math.min(currentStage, maxLowerStage) / maxStage) * 100;
```

---

### 6. lighting.js
**Purpose**: Manages 3D scene lighting system

**Class**: `LightingManager`

**Key Methods**:
- `setupDefaultLighting()`: Sets up realistic dental lighting
  - Hemisphere light (sky/ground)
  - Key light (main illumination, front-right)
  - Fill light (softer, front-left)
  - Rim light (back lighting for edges)
  - Top light (overhead)
  - Ambient light (overall fill)

- `updateLightingForBackground(backgroundType)`: Adjusts lighting for background
  - Dark backgrounds: Higher intensity lights
  - Light backgrounds: Lower intensity lights
  - Adjusts each light type individually

- `updateLightingForMaterial(materialType)`: Adjusts lighting for material
  - High contrast: Stronger rim lighting
  - Porcelain: Enhanced key light
  - Matte: Increased fill light
  - Anatomical: Balanced top/fill lights

**Light Configuration**:
- **Hemisphere Light**: Sky (0x87CEEB), Ground (0x3626B0), Intensity 0.15
- **Key Light**: Position (50, 30, 50), Color white, Intensity 0.8
- **Fill Light**: Position (-30, 20, 40), Color light blue, Intensity 0.4
- **Rim Light**: Position (0, 20, -50), Color white, Intensity 0.5
- **Top Light**: Position (0, 50, 0), Color white, Intensity 0.4
- **Ambient Light**: Color gray, Intensity 0.1

**Background-Specific Adjustments**:
- **Dark**: 1.6x key, 1.0x fill, 1.2x rim, 0.9x top
- **White**: 1.0x key, 0.5x fill, 0.6x rim, 0.5x top
- **Light Gray**: 1.2x key, 0.7x fill, 0.9x rim, 0.6x top

---

### 7. materialManager.js
**Purpose**: Manages material presets and background presets

**Class**: `MaterialManager`

**Material Presets** (8 total):
1. **Realistic Teeth**: Natural color (0xf5f5f5), roughness 0.3
2. **High Contrast**: Bright white (0xffffff), roughness 0.1
3. **Warm Ivory**: Warm tone (0xfff8dc), roughness 0.4
4. **Cool White**: Cool tone (0xf0f8ff), roughness 0.2
5. **Porcelain**: Glossy (0xfefefe), roughness 0.05
6. **Matte Finish**: Matte (0xf8f8f8), roughness 0.8
7. **Clinical View**: Clinical white (0xffffff), roughness 0.15
8. **Anatomical**: Anatomical (0xf0f0f0), roughness 0.6

**Background Presets** (6 total):
1. **Dark**: Color 0x1a1a1a, exposure 0.6
2. **White**: Color 0xffffff, exposure 1.0
3. **Light Gray**: Color 0xf5f5f5, exposure 0.9
4. **Dark Gray**: Color 0x2a2a2a, exposure 0.7
5. **Medical Blue**: Color 0x1e3a8a, exposure 0.8
6. **Transparent**: Color 0x000000 (alpha 0), exposure 0.7

**Key Methods**:
- `applyMaterialPreset(presetName, models, lightingManager)`: Applies material to all models
- `applyBackgroundPreset(presetName, renderer, lightingManager)`: Applies background
- `getOptimalMaterialForBackground(backgroundName)`: Returns recommended material

**Material Properties**:
- `color`: Hex color value
- `roughness`: 0.0 (glossy) to 1.0 (matte)
- `metalness`: 0.0 (non-metallic) to 1.0 (metallic)
- `envMapIntensity`: Environment map reflection intensity

**Background Recommendations**:
- Dark → High Contrast
- White → Anatomical
- Light Gray → Realistic
- Dark Gray → Clinical
- Blue → Porcelain
- Transparent → Cool

---

### 8. main.js
**Purpose**: Main application controller and orchestration

**Class**: `JawViewerApp`

**Initialization Flow**:
1. Creates SceneManager and initializes scene
2. Creates ModelLoader with scene and loading manager
3. Creates UIControls (before StageManager)
4. Creates StageManager with ModelLoader and UIControls
5. Links UIControls to StageManager
6. Sets up event listeners
7. Loads GLB models
8. Updates AppConfig with loaded models
9. Starts animation loop

**Loading Manager**:
- Uses THREE.LoadingManager
- Tracks loading progress
- Hides loader when complete
- Triggers stage initialization

**Global Access**:
- `window.app`: Main application instance
- `window.refreshModelFiles()`: Refresh file discovery
- `window.discoverModelFiles()`: Discover files manually

**Error Handling**:
- Catches initialization errors
- Shows error messages in UI
- Logs errors to console

---

## Data Flow

### Application Startup
```
1. index.html loads
   ↓
2. Three.js libraries load
   ↓
3. Modules load in order (config → lighting → ... → main)
   ↓
4. window.onload fires
   ↓
5. JawViewerApp.init() called
   ↓
6. SceneManager.initScene() - Creates 3D environment
   ↓
7. ModelLoader.loadGLBModels() - Discovers and loads files
   ↓
8. LoadingManager tracks progress
   ↓
9. When complete: StageManager.initializeStages()
   ↓
10. Animation loop starts
```

### Stage Navigation
```
User clicks Next/Previous or moves slider
   ↓
UIControls event handler fires
   ↓
StageManager.setStage(newStage) called
   ↓
AppConfig.setCurrentStage(newStage)
   ↓
All models hidden
   ↓
Calculate which models to show:
   - upperStageIndex = min(stage, maxUpperStage) - 1
   - lowerStageIndex = min(stage, maxLowerStage) - 1
   ↓
Show models at calculated indices
   ↓
UIControls.updateStageInfo() - Updates UI
```

### Material Change
```
User selects material preset
   ↓
UIControls.applyMaterialPreset(presetName)
   ↓
Get all models from StageManager
   ↓
MaterialManager.applyMaterialPreset()
   ↓
Traverse each model, update material properties
   ↓
LightingManager.updateLightingForMaterial()
   ↓
Scene re-renders with new materials
```

### Background Change
```
User selects background preset
   ↓
UIControls event handler fires
   ↓
SceneManager.changeBackground(backgroundType)
   ↓
MaterialManager.applyBackgroundPreset()
   ↓
Renderer.setClearColor() - Updates background
   ↓
LightingManager.updateLightingForBackground()
   ↓
MaterialManager.getOptimalMaterialForBackground()
   ↓
Auto-apply optimal material (optional)
```

---

## Configuration

### Global Constants (config.js)
```javascript
const frustumSize = 300;      // Camera frustum size
const modelScale = 3;         // Model scaling factor
```

### Model Paths (index.html)
```javascript
const maxillaryPath = "./assets/models/maxillary/";
const mandibularPath = "./assets/models/mandibular/";
const envHDRUrl = "./assets/env.hdr";
```

### File Discovery Settings (modelLoader.js)
```javascript
this.maxStages = 100;  // Maximum files to check (1-100)
```

### Camera Settings (sceneManager.js)
```javascript
// Initial camera position
camera.position.set(300, 400, 500);

// Camera target
controls.target.set(0, 0, 0);

// Damping (smooth controls)
controls.dampingFactor = 0.05;
```

### Renderer Settings (sceneManager.js)
```javascript
antialias: true
alpha: true
powerPreference: "high-performance"
precision: "highp"
logarithmicDepthBuffer: true
shadowMap.type: THREE.PCFSoftShadowMap
toneMapping: THREE.ACESFilmicToneMapping
toneMappingExposure: 0.8
```

---

## Key Features

### 1. Automatic File Discovery
- Scans for GLB files without manual configuration
- Supports files named "Maxillary BL {N}.glb" and "Mandibular BL {N}.glb"
- Uses parallel requests for fast discovery
- Handles missing files gracefully

### 2. Dual Progress Visualization
- Two progress bars (upper/lower) in one slider
- Upper bar: 0-13 stages, then outlined for >13
- Lower bar: 0-22 stages
- Visual indication when one jaw reaches maximum

### 3. Material Presets
- 8 different material presets for various viewing needs
- Realistic dental materials with PBR
- Auto-suggestion based on background
- Real-time material switching

### 4. Background Presets
- 6 background options
- Automatic lighting adjustment
- Tone mapping exposure control
- Transparent background option

### 5. Stage Progression Logic
- Stages 1-13: Both jaws advance together
- Stages >13: Lower jaw continues, upper stays at 13
- Flexible system supports different jaw stage counts

### 6. Interactive 3D Controls
- OrbitControls: Rotate, pan, zoom
- Smooth damping for natural feel
- Reset camera button
- Keyboard shortcuts (Help: '?')

### 7. Responsive Design
- Mobile-friendly UI
- Touch controls support
- Adaptive layout for different screen sizes

### 8. Loading Management
- Progress indicator during model loading
- LoadingManager tracks all resources
- Error handling for missing files

---

## File Structure

```
Jaw_3D_Viewer/
├── index.html                 # Main HTML file with UI structure
├── js/
│   ├── config.js             # Global configuration and state
│   ├── lighting.js           # Lighting system management
│   ├── materialManager.js    # Material and background presets
│   ├── modelLoader.js        # GLB file discovery and loading
│   ├── uiControls.js         # UI event handlers
│   ├── sceneManager.js       # Scene, camera, renderer setup
│   ├── stageManager.js       # Stage navigation logic
│   └── main.js               # Application controller
├── assets/
│   ├── env.hdr              # Environment map (optional)
│   ├── models/
│   │   ├── maxillary/       # Upper jaw GLB files
│   │   └── mandibular/      # Lower jaw GLB files
│   └── *.stl                # STL files (not used in current version)
├── dist/                    # Production build output
├── package.json             # NPM dependencies
├── build-script.js          # Build automation
├── obfuscator-config.json   # Code obfuscation settings
├── README.md                # Basic project info
├── BUILD_INSTRUCTIONS.md    # Build and deployment guide
├── MODULAR_ARCHITECTURE.md  # Architecture overview
└── CODEBASE_DOCUMENTATION.md # This file
```

---

## Extension Guide

### Adding a New Material Preset

1. **Edit `materialManager.js`**:
```javascript
// Add to materialPresets object
newPreset: {
  name: 'New Preset Name',
  color: 0xffffff,
  roughness: 0.5,
  metalness: 0.0,
  envMapIntensity: 1.0,
  description: 'Description of the preset'
}
```

2. **Add to HTML select** (`index.html`):
```html
<option value="newPreset">New Preset Name</option>
```

3. **Update lighting if needed** (`lighting.js`):
```javascript
case 'newPreset':
  // Adjust lighting for this material
  break;
```

### Adding a New Background Preset

1. **Edit `materialManager.js`**:
```javascript
// Add to backgroundPresets object
newBackground: {
  name: 'New Background',
  color: 0x000000,
  bodyColor: '#000000',
  exposure: 0.8,
  description: 'Description'
}
```

2. **Add to HTML select** (`index.html`):
```html
<option value="newBackground">New Background</option>
```

3. **Update lighting** (`lighting.js`):
```javascript
case 'newBackground':
  // Adjust lighting intensities
  break;
```

### Changing Model File Naming Convention

1. **Edit `modelLoader.js`**:
```javascript
// Modify discoverModelFiles() method
const filename = `YourPrefix ${i}.glb`;  // Change naming pattern
```

2. **Update paths if needed** (`index.html`):
```javascript
const maxillaryPath = "./assets/models/your-path/";
```

### Adding New UI Controls

1. **Add HTML element** (`index.html`):
```html
<button id="newControlBtn" class="btn">New Control</button>
```

2. **Add event listener** (`uiControls.js`):
```javascript
document.getElementById('newControlBtn').addEventListener('click', () => {
  // Handle click
});
```

3. **Add styling** (`index.html` in `<style>` section):
```css
#newControlBtn {
  /* Your styles */
}
```

### Modifying Stage Progression Logic

1. **Edit `stageManager.js`**:
```javascript
// Modify setStage() method
// Change the calculation logic for upperStageIndex and lowerStageIndex
```

**Example**: Make both jaws advance independently:
```javascript
const upperStageIndex = Math.min(stage, maxUpperStage) - 1;
const lowerStageIndex = Math.min(stage, maxLowerStage) - 1;
// This already does independent progression, but you could add offsets:
// const upperStageIndex = Math.min(stage + offset, maxUpperStage) - 1;
```

### Adding Post-Processing Effects

1. **Add Three.js post-processing libraries** (`index.html`):
```html
<script src="path/to/EffectComposer.js"></script>
<script src="path/to/RenderPass.js"></script>
<script src="path/to/YourEffect.js"></script>
```

2. **Modify `sceneManager.js`**:
```javascript
// In initScene(), after renderer setup:
const composer = new THREE.EffectComposer(this.renderer);
const renderPass = new THREE.RenderPass(this.scene, this.camera);
composer.addPass(renderPass);

// Add your effect pass
const yourEffect = new THREE.YourEffect();
composer.addPass(yourEffect);

// In startAnimationLoop():
composer.render();  // Instead of renderer.render()
```

### Customizing Camera Behavior

1. **Edit `sceneManager.js`**:
```javascript
// Change camera type (OrthographicCamera → PerspectiveCamera)
this.camera = new THREE.PerspectiveCamera(
  75,  // FOV
  aspect,
  1,
  1000
);

// Modify controls settings
this.controls.enableDamping = true;
this.controls.dampingFactor = 0.05;
this.controls.minDistance = 100;  // For perspective camera
this.controls.maxDistance = 1000;
```

### Adding Model Animation

1. **Create animation in `modelLoader.js`**:
```javascript
// After loading model
const mixer = new THREE.AnimationMixer(model);
const clips = gltf.animations;
clips.forEach((clip) => {
  const action = mixer.clipAction(clip);
  action.play();
});

// Store mixer for update
this.mixers.push(mixer);
```

2. **Update in animation loop** (`sceneManager.js`):
```javascript
// In startAnimationLoop():
const clock = new THREE.Clock();
const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  
  // Update animations
  mixers.forEach(mixer => mixer.update(delta));
  
  this.renderer.render(this.scene, this.camera);
  this.controls.update();
};
```

---

## Common Tasks

### Debugging

**Access application instance**:
```javascript
// In browser console
window.app
```

**Refresh model files**:
```javascript
window.refreshModelFiles()
```

**Check current state**:
```javascript
AppConfig.currentStage()
AppConfig.isObjectsLoaded()
AppConfig.maxillaryModels()
```

**Access managers**:
```javascript
app.sceneManager
app.modelLoader
app.stageManager
app.uiControls
```

### Performance Optimization

1. **Reduce model complexity**: Use lower-poly models
2. **Limit shadow resolution**: Reduce `shadow.mapSize`
3. **Cap pixel ratio**: Already set to `Math.min(window.devicePixelRatio, 2)`
4. **Disable shadows**: Set `renderer.shadowMap.enabled = false`
5. **Reduce lighting**: Fewer lights = better performance

### Troubleshooting

**Models not loading**:
- Check file paths in `index.html`
- Verify GLB files exist in correct directories
- Check browser console for errors
- Ensure CORS is configured if loading from different domain

**Stage navigation not working**:
- Verify models are loaded: `AppConfig.isObjectsLoaded()`
- Check stage range: `AppConfig.totalStages()`
- Verify UI event listeners are set up

**Materials not applying**:
- Check MaterialManager is initialized
- Verify models have materials (check in Three.js inspector)
- Ensure MaterialManager is passed to ModelLoader

**Lighting issues**:
- Check LightingManager is initialized
- Verify lights are added to scene
- Check background preset is applied correctly

---

## Best Practices

1. **State Management**: Always use `AppConfig` getters/setters, never access variables directly
2. **Error Handling**: Wrap async operations in try-catch blocks
3. **Performance**: Use `requestAnimationFrame` for animations, not `setInterval`
4. **Memory**: Dispose of geometries, materials, and textures when no longer needed
5. **Modularity**: Keep modules focused on single responsibilities
6. **Documentation**: Comment complex logic and algorithms
7. **Testing**: Test on multiple browsers and devices
8. **Loading**: Show progress indicators for long operations

---

## Version History

- **v1.0.0**: Initial modular architecture
  - Separated monolithic code into modules
  - Added MaterialManager for presets
  - Implemented dual progress bars
  - Added automatic file discovery

---

## Support

For issues or questions:
1. Check browser console for errors
2. Verify all files are in correct locations
3. Check module loading order
4. Review this documentation
5. Check BUILD_INSTRUCTIONS.md for build issues

---

**Last Updated**: 2024
**Documentation Version**: 1.0

