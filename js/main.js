// Main Application Controller
// Orchestrates all modules and manages the application lifecycle

// Global application instance
let app = null;

// Loading manager
const loadModel = () => {
  document.getElementById("loader").style.display = "none";
  document.getElementById("progress").style.display = "none";
  AppConfig.setIsObjectsLoaded(true);
  app.stageManager.initializeStages();
  if (app.miniView) app.miniView.frame();
};

const manager = new THREE.LoadingManager(loadModel);
manager.onProgress = (item, loaded, total) => {
  const percentage = Math.round((loaded / total) * 100);
  document.getElementById("progress").innerHTML = percentage + "%";
};

// Main Application Class
class JawViewerApp {
  constructor() {
    this.sceneManager = null;
    this.modelLoader = null;
    this.stageManager = null;
    this.uiControls = null;
  }

  // Initialize the application
  async init() {
    console.log("Initializing 3D Jaw Viewer Application...");
    
    try {
      // Initialize scene manager
      this.sceneManager = new SceneManager();
      if (!this.sceneManager.initScene()) {
        throw new Error("Failed to initialize scene");
      }

      // Initialize model loader with material manager
      this.modelLoader = new ModelLoader(this.sceneManager.getScene(), manager);
      
      // Pass material manager to model loader for material application
      this.modelLoader.materialManager = this.sceneManager.getMaterialManager();
      
      // Initialize UI controls
      this.uiControls = new UIControls(this.stageManager, this.sceneManager);
      
      // Initialize stage manager (needs to be after UI controls)
      this.stageManager = new StageManager(this.modelLoader, this.uiControls);
      
      // Update UI controls with stage manager reference
      this.uiControls.stageManager = this.stageManager;

      // Curve drawing tool (left toolbar -> Curve)
      this.curveTool = new CurveTool(this.sceneManager, this.stageManager);
      this.uiControls.curveTool = this.curveTool;

      // Template brush tool (left toolbar -> Brush)
      this.brushTool = new BrushTool(this.sceneManager, this.stageManager);
      this.uiControls.brushTool = this.brushTool;

      // Pavé stone setter (Stones tab / Decoration -> Diamonds)
      this.stoneSetter = new StoneSetter({
        sceneManager: this.sceneManager,
        brushTool: this.brushTool,
        curveTool: this.curveTool
      });
      this.uiControls.stoneSetter = this.stoneSetter;
      // Re-fill when zones or the shell change while Diamonds is on.
      this.brushTool.onTemplatesChanged = () => this.stoneSetter.scheduleApply();
      this.curveTool.onGenerateShell = () => this.stoneSetter.scheduleApply();

      // Small "COMBINED" preview of the working scene
      const miniMount = document.getElementById('ncCombinedView');
      if (miniMount) {
        this.miniView = new MiniView(
          this.sceneManager.getScene(),
          miniMount,
          this.sceneManager.getCamera()
        );
      }

      // Setup event listeners
      this.uiControls.setupEventListeners();

      // Load models
      await this.modelLoader.loadGLBModels().catch(error => {
        console.error('Error loading models:', error);
        this.uiControls.showError('Error loading models!');
      });

      // Update global references
      AppConfig.setMaxillaryModels(this.modelLoader.getMaxillaryModels());
      AppConfig.setMandibularModels(this.modelLoader.getMandibularModels());
      AppConfig.setMaxillaryFiles(this.modelLoader.getMaxillaryFiles());
      AppConfig.setMandibularFiles(this.modelLoader.getMandibularFiles());

      // Start animation loop
      this.sceneManager.startAnimationLoop();

      console.log("3D Jaw Viewer Application initialized successfully!");
      
    } catch (error) {
      console.error("Failed to initialize application:", error);
      this.uiControls?.showError('Failed to initialize application!');
    }
  }

  // Get application components
  getSceneManager() {
    return this.sceneManager;
  }

  getModelLoader() {
    return this.modelLoader;
  }

  getStageManager() {
    return this.stageManager;
  }

  getUIControls() {
    return this.uiControls;
  }
}

// Initialize the application when window loads
window.onload = () => {
  console.log("Window loaded, initializing 3D viewer...");
  // Add a small delay to ensure all DOM elements are ready
  setTimeout(() => {
    app = new JawViewerApp();
    app.init();
  }, 100);
};

// Expose functions globally for debugging
window.refreshModelFiles = () => {
  if (app && app.modelLoader) {
    app.modelLoader.refreshModelFiles();
  }
};

window.discoverModelFiles = () => {
  if (app && app.modelLoader) {
    return app.modelLoader.discoverModelFiles();
  }
};

// Export app instance for debugging
window.app = app;