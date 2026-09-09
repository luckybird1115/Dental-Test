// Scene Manager
// Handles scene, camera, renderer setup and management

class SceneManager {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.lightingManager = null;
    this.materialManager = null;
  }

  // Initialize the 3D scene
  initScene() {
    console.log("Initializing 3D scene...");
    
    // Get canvas element and check if it exists
    const canvas = document.querySelector("#c");
    if (!canvas) {
      console.error("Canvas element with id 'c' not found!");
      return false;
    }

    // Check if required DOM elements exist
    const requiredElements = [
      'loader', 'progress', 'prevBtn', 'nextBtn', 'stageSlider', 
      'hideUpperBtn', 'hideLowerBtn', 'resetCameraBtn', 
      'backgroundSelect', 'stageInfo'
    ];
    
    for (const elementId of requiredElements) {
      if (!document.getElementById(elementId)) {
        console.error(`Required element with id '${elementId}' not found!`);
        return false;
      }
    }


    // Scene setup
    this.scene = new THREE.Scene();
    AppConfig.setScene(this.scene);
    
    // Camera setup
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      (AppConfig.frustumSize * aspect) / -2,
      (AppConfig.frustumSize * aspect) / 2,
      AppConfig.frustumSize / 2,
      AppConfig.frustumSize / -2,
      1,
      1000
    );
    AppConfig.setCamera(this.camera);

    // Renderer setup with enhanced quality settings
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance", // Use dedicated GPU if available
        precision: "highp", // High precision for better quality
        logarithmicDepthBuffer: true // Better depth precision
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
      
      // Enhanced rendering settings
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.8; // Reduced exposure for better dark scene visibility
      
      // Advanced shadow settings
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = true;
      
      // Enable physically based rendering features
      this.renderer.physicallyCorrectLights = true;
      
      // Set initial background based on currentBackground variable
      this.changeBackground(AppConfig.currentBackground());
      
      AppConfig.setRenderer(this.renderer);
    } catch (error) {
      console.error("Failed to initialize WebGL renderer:", error);
      return false;
    }

    // Setup lighting
    this.lightingManager = new LightingManager(this.scene);
    this.lightingManager.setupDefaultLighting();

    // Setup material manager
    this.materialManager = new MaterialManager();

    // Setup environment map
    // this.setupEnvironmentMap();

    // Controls setup
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.update();
    this.camera.position.set(300, 400, 500);
    AppConfig.setControls(this.controls);

    // Window resize handler
    this.setupWindowResizeHandler();

    return true;
  }

  // Setup enhanced environment map with IBL
  setupEnvironmentMap() {
    const rgbeLoader = new THREE.RGBELoader();
    rgbeLoader.load(
      envHDRUrl,
      (texture) => {
        if (this.renderer && this.scene) {
          // Enhanced PMREM generator for better quality
          let pmremGenerator = new THREE.PMREMGenerator(this.renderer);
          pmremGenerator.compileEquirectangularShader();
          
          // Generate environment map with higher resolution
          const envMap = pmremGenerator.fromEquirectangular(texture).texture;
          
          // Set environment map for realistic reflections
          this.scene.environment = envMap;
          
          // Also set as background for better visual integration
          this.scene.background = envMap;
          
          // Clean up
          pmremGenerator.dispose();
          pmremGenerator = undefined;
          
          console.log("Enhanced environment map loaded successfully");
        }
      },
      (progress) => {
        console.log("Loading environment map:", (progress.loaded / progress.total * 100) + "%");
      },
      (error) => {
        console.error("Failed to load environment map:", error);
        // Fallback to a simple gradient background
        this.setupFallbackEnvironment();
      }
    );
  }

  // Fallback environment setup
  setupFallbackEnvironment() {
    const geometry = new THREE.SphereGeometry(1000, 32, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x87CEEB,
      side: THREE.BackSide
    });
    const skybox = new THREE.Mesh(geometry, material);
    this.scene.add(skybox);
    console.log("Using fallback environment");
  }

  // Setup window resize handler
  setupWindowResizeHandler() {
    const onWindowResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      this.camera.left = (-AppConfig.frustumSize * aspect) / 2;
      this.camera.right = (AppConfig.frustumSize * aspect) / 2;
      this.camera.top = AppConfig.frustumSize / 2;
      this.camera.bottom = -AppConfig.frustumSize / 2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onWindowResize, false);
  }

  // Reset camera to default position
  resetCamera() {
    this.camera.position.set(300, 400, 500);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // Snap the camera to a named orthographic view (used by the top view bar)
  setView(viewName) {
    if (!this.camera || !this.controls) return;

    const d = 700;
    const views = {
      home:   { pos: [300, 400, 500], up: [0, 1, 0] },
      front:  { pos: [0, 0, d],       up: [0, 1, 0] },
      back:   { pos: [0, 0, -d],      up: [0, 1, 0] },
      top:    { pos: [0, d, 0],       up: [0, 0, -1] },
      bottom: { pos: [0, -d, 0],      up: [0, 0, 1] },
      left:   { pos: [-d, 0, 0],      up: [0, 1, 0] },
      right:  { pos: [d, 0, 0],       up: [0, 1, 0] }
    };

    const view = views[viewName] || views.home;
    this.controls.target.set(0, 0, 0);
    this.camera.up.set(view.up[0], view.up[1], view.up[2]);
    this.camera.position.set(view.pos[0], view.pos[1], view.pos[2]);
    this.controls.update();
  }

  // Change background color using material manager
  changeBackground(backgroundType) {
    AppConfig.setCurrentBackground(backgroundType);
    
    if (this.materialManager) {
      this.materialManager.applyBackgroundPreset(backgroundType, this.renderer, this.lightingManager);
    } else {
      // Fallback to original method
      this.changeBackgroundLegacy(backgroundType);
    }
  }

  // Legacy background change method (fallback)
  changeBackgroundLegacy(backgroundType) {
    switch (backgroundType) {
      case 'white':
        this.renderer.setClearColor(0xffffff, 1);
        document.body.style.background = '#ffffff';
        this.renderer.toneMappingExposure = 1.0;
        break;
      case 'dark':
        this.renderer.setClearColor(0x1a1a1a, 1);
        document.body.style.background = '#000000';
        this.renderer.toneMappingExposure = 0.6;
        break;
      case 'transparent':
        this.renderer.setClearColor(0x000000, 0);
        document.body.style.background = 'transparent';
        this.renderer.toneMappingExposure = 0.7;
        break;
      default:
        this.renderer.setClearColor(0x1a1a1a, 1);
        document.body.style.background = '#1a1a1a';
        this.renderer.toneMappingExposure = 0.6;
    }

    if (this.lightingManager) {
      this.lightingManager.updateLightingForBackground(backgroundType);
    }
  }

  // Start animation loop with post-processing
  startAnimationLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
      this.controls.update();
    };
    animate();
  }

  // Getter methods
  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }

  getRenderer() {
    return this.renderer;
  }

  getControls() {
    return this.controls;
  }

  getLightingManager() {
    return this.lightingManager;
  }

  getMaterialManager() {
    return this.materialManager;
  }
}

// Export for use in other modules
window.SceneManager = SceneManager;
