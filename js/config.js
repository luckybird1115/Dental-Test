// Configuration and Constants
// Global variables and settings for the 3D Jaw Viewer

// Scene and camera settings
const frustumSize = 300;
const modelScale = 3;

// Application state
let scene, camera, renderer, controls;
let currentStage = 1;
let totalStages = 13;
let maxillaryModels = [];
let mandibularModels = [];
let isObjectsLoaded = false;
let upperVisible = false;
let lowerVisible = true;
let savedCameraPosition = null;
let savedCameraTarget = null;
let currentBackground = 'dark';

// File discovery - automatically discover and classify GLB files
let maxillaryFiles = [];
let mandibularFiles = [];

// Export configuration for use in other modules
window.AppConfig = {
  frustumSize,
  modelScale,
  scene: () => scene,
  camera: () => camera,
  renderer: () => renderer,
  controls: () => controls,
  currentStage: () => currentStage,
  totalStages: () => totalStages,
  maxillaryModels: () => maxillaryModels,
  mandibularModels: () => mandibularModels,
  isObjectsLoaded: () => isObjectsLoaded,
  upperVisible: () => upperVisible,
  lowerVisible: () => lowerVisible,
  currentBackground: () => currentBackground,
  maxillaryFiles: () => maxillaryFiles,
  mandibularFiles: () => mandibularFiles,
  
  // Setters
  setScene: (newScene) => { scene = newScene; },
  setCamera: (newCamera) => { camera = newCamera; },
  setRenderer: (newRenderer) => { renderer = newRenderer; },
  setControls: (newControls) => { controls = newControls; },
  setCurrentStage: (stage) => { currentStage = stage; },
  setTotalStages: (stages) => { totalStages = stages; },
  setMaxillaryModels: (models) => { maxillaryModels = models; },
  setMandibularModels: (models) => { mandibularModels = models; },
  setIsObjectsLoaded: (loaded) => { isObjectsLoaded = loaded; },
  setUpperVisible: (visible) => { upperVisible = visible; },
  setLowerVisible: (visible) => { lowerVisible = visible; },
  setCurrentBackground: (background) => { currentBackground = background; },
  setMaxillaryFiles: (files) => { maxillaryFiles = files; },
  setMandibularFiles: (files) => { mandibularFiles = files; }
};
