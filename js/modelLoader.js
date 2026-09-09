// Model Loader
// Handles GLB file discovery and loading for maxillary and mandibular models

class ModelLoader {
  constructor(scene, manager) {
    this.scene = scene;
    this.manager = manager;
    this.maxillaryFiles = [];
    this.mandibularFiles = [];
    this.maxillaryModels = [];
    this.mandibularModels = [];
    this.maxStages = 100;
  }

  // Function to discover GLB files in model directories
  async discoverModelFiles() {
    try {
      console.log('Starting optimized file discovery...');
      
      // Use parallel requests with Promise.allSettled for better performance
      const maxillaryPromises = [];
      const mandibularPromises = [];
      
      // Create promises for maxillary files (checking up to 25 files)
      for (let i = 1; i <= this.maxStages; i++) {
        const filename = `Maxillary BL ${i}.glb`;
        const testUrl = maxillaryPath + filename;
        maxillaryPromises.push(
          fetch(testUrl, { method: 'HEAD' })
            .then(response => response.ok ? filename : null)
            .catch(() => null)
        );
      }
      
      // Create promises for mandibular files (checking up to 25 files)
      for (let i = 1; i <= this.maxStages; i++) {
        const filename = `Mandibular BL ${i}.glb`;
        const testUrl = mandibularPath + filename;
        mandibularPromises.push(
          fetch(testUrl, { method: 'HEAD' })
            .then(response => response.ok ? filename : null)
            .catch(() => null)
        );
      }
      
      // Execute all requests in parallel
      const [maxillaryResults, mandibularResults] = await Promise.all([
        Promise.allSettled(maxillaryPromises),
        Promise.allSettled(mandibularPromises)
      ]);
      
      // Filter out null results and sort by number
      const discoveredMaxillary = maxillaryResults
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter(filename => filename !== null)
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.match(/\d+/)?.[0] || '0');
          return numA - numB;
        });
      
      const discoveredMandibular = mandibularResults
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter(filename => filename !== null)
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.match(/\d+/)?.[0] || '0');
          return numA - numB;
        });
      
      this.maxillaryFiles = discoveredMaxillary;
      this.mandibularFiles = discoveredMandibular;
      
      console.log(`File discovery complete: ${this.maxillaryFiles.length} maxillary, ${this.mandibularFiles.length} mandibular files`);
      
      return { maxillaryFiles: this.maxillaryFiles, mandibularFiles: this.mandibularFiles };
    } catch (error) {
      console.error('Error discovering model files:', error);
      // Fallback to empty arrays if discovery fails
      this.maxillaryFiles = [];
      this.mandibularFiles = [];
      return { maxillaryFiles: this.maxillaryFiles, mandibularFiles: this.mandibularFiles };
    }
  }

  // Apply realistic dental materials to a model using MaterialManager
  applyDentalMaterials(model, materialManager = null) {
    model.traverse((child) => {
      if (child.isMesh) {
        // Enable shadows
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Apply realistic dental material
        if (child.material) {
          // Convert to MeshStandardMaterial for PBR
          if (!child.material.isMeshStandardMaterial) {
            child.material = new THREE.MeshStandardMaterial({
              color: child.material.color || 0xf5f5f5,
              map: child.material.map,
              normalMap: child.material.normalMap,
              roughnessMap: child.material.roughnessMap,
              metalnessMap: child.material.metalnessMap,
              envMap: child.material.envMap,
              envMapIntensity: child.material.envMapIntensity || 1.0
            });
          }
          
          // Use MaterialManager if available, otherwise use default settings
          if (materialManager) {
            const currentPreset = materialManager.getCurrentPresetInfo();
            child.material.color.setHex(currentPreset.material.color);
            child.material.roughness = currentPreset.material.roughness;
            child.material.metalness = currentPreset.material.metalness;
            child.material.envMapIntensity = currentPreset.material.envMapIntensity;
          } else {
            // Default realistic settings
            child.material.color.setHex(0xf5f5f5); // Off-white tooth color
            child.material.roughness = 0.3; // Slightly rough surface
            child.material.metalness = 0.1; // Non-metallic
            child.material.envMapIntensity = 0.8; // Moderate reflections
          }
          
          // Add subsurface scattering effect (simulated)
          child.material.transparent = false;
          child.material.opacity = 1.0;
          
          // Enable physically based rendering
          child.material.needsUpdate = true;
        }
      }
    });
  }

  // Load GLB models with enhanced materials
  async loadGLBModels() {
    // First discover the available files
    await this.discoverModelFiles();
    
    if (this.maxillaryFiles.length === 0 && this.mandibularFiles.length === 0) {
      console.error('No model files discovered! Please check that GLB files exist in the model directories.');
      // Show user-friendly error message
      document.getElementById("loader").style.display = "none";
      document.getElementById("progress").innerHTML = "No model files found!";
      document.getElementById("progress").style.color = "#ff4444";
      return;
    }
    
    console.log(`Loading ${this.maxillaryFiles.length} maxillary and ${this.mandibularFiles.length} mandibular models...`);
    
    const loader = new THREE.GLTFLoader(this.manager);
    
    // Load maxillary models
    this.maxillaryFiles.forEach((filename, index) => {
      loader.load(maxillaryPath + filename, (gltf) => {
        const model = gltf.scene;
        model.scale.set(modelScale, modelScale, modelScale);
        model.rotation.set(Math.PI/2, 0, 0);
        
        // Apply realistic dental materials with material manager
        this.applyDentalMaterials(model, this.materialManager);
        
        model.visible = index === 0; // Only show first stage initially
        this.scene.add(model);
        this.maxillaryModels[index] = model;
        console.log(`Loaded maxillary model: ${filename}`);
      }, undefined, (error) => {
        console.error(`Error loading maxillary model ${filename}:`, error);
      });
    });

    // Load mandibular models
    this.mandibularFiles.forEach((filename, index) => {
      loader.load(mandibularPath + filename, (gltf) => {
        const model = gltf.scene;
        model.scale.set(modelScale, modelScale, modelScale);
        model.rotation.set(Math.PI/2, 0, 0);
        
        // Apply realistic dental materials with material manager
        this.applyDentalMaterials(model, this.materialManager);
        
        model.visible = index === 0; // Only show first stage initially
        this.scene.add(model);
        this.mandibularModels[index] = model;
        console.log(`Loaded mandibular model: ${filename}`);
      }, undefined, (error) => {
        console.error(`Error loading mandibular model ${filename}:`, error);
      });
    });
  }

  // Function to refresh file discovery (useful for development)
  async refreshModelFiles() {
    console.log('Refreshing model files...');
    await this.discoverModelFiles();
    console.log('File discovery refreshed. You may need to reload the page to see changes.');
  }

  // Getter methods
  getMaxillaryModels() {
    return this.maxillaryModels;
  }

  getMandibularModels() {
    return this.mandibularModels;
  }

  getMaxillaryFiles() {
    return this.maxillaryFiles;
  }

  getMandibularFiles() {
    return this.mandibularFiles;
  }

  getTotalStages() {
    // Total stages should reflect the complete progression across jaws.
    // Upper typically has fewer stages (e.g., 13) while lower continues (e.g., 22).
    // Use the maximum so the UI can advance lower beyond upper's count.
    return Math.max(this.maxillaryFiles.length, this.mandibularFiles.length);
  }
}

// Export for use in other modules
window.ModelLoader = ModelLoader;
