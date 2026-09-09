// Enhanced Lighting System
// Handles realistic lighting setup and management for dental 3D visualization

class LightingManager {
  constructor(scene) {
    this.scene = scene;
    this.lights = [];
    this.hemisphereLight = null;
    this.directionalLights = [];
    this.pointLights = [];
  }

  // Add a directional light with enhanced shadow casting
  addDirectionalLight(x, y, z, color, intensity, name = '') {
    const directionalLight = new THREE.DirectionalLight(color, intensity);
    directionalLight.position.set(x, y, z);
    directionalLight.name = name;
    this.scene.add(directionalLight);
    this.lights.push(directionalLight);
    this.directionalLights.push(directionalLight);
    return directionalLight;
  }

  // Add point light for localized illumination
  addPointLight(x, y, z, color, intensity, distance = 100, decay = 2) {
    const pointLight = new THREE.PointLight(color, intensity, distance, decay);
    pointLight.position.set(x, y, z);
    pointLight.castShadow = true;
    
    // Configure point light shadows
    pointLight.shadow.mapSize.width = 1024;
    pointLight.shadow.mapSize.height = 1024;
    pointLight.shadow.camera.near = 0.1;
    pointLight.shadow.camera.far = distance;
    
    this.scene.add(pointLight);
    this.lights.push(pointLight);
    this.pointLights.push(pointLight);
    return pointLight;
  }

  // Add hemisphere light for realistic sky/ground lighting
  addHemisphereLight(skyColor, groundColor, intensity) {
    this.hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    this.scene.add(this.hemisphereLight);
    this.lights.push(this.hemisphereLight);
    return this.hemisphereLight;
  }

  // Add ambient light
  addAmbientLight(color, intensity) {
    const ambientLight = new THREE.AmbientLight(color, intensity);
    this.scene.add(ambientLight);
    this.lights.push(ambientLight);
    return ambientLight;
  }

  // Setup realistic dental lighting setup
  setupRealisticLighting() {
    // Clear existing lights
    this.clearLights();
    
    // Hemisphere light for natural sky/ground lighting
    this.addHemisphereLight(0x87CEEB, 0x3626B0, 0.15); // Reduced from 0.3 to 0.15
    
    // Key light - main illumination from front-right
    const keyLight = this.addDirectionalLight(50, 30, 50, 0xffffff, 0.8, 'key'); // Reduced from 1.2 to 0.8
    keyLight.target.position.set(0, 0, 0);
    this.scene.add(keyLight.target);
    
    // Fill light - softer illumination from front-left
    const fillLight = this.addDirectionalLight(-30, 20, 40, 0xf0f8ff, 0.4, 'fill'); // Reduced from 0.6 to 0.4
    fillLight.target.position.set(0, 0, 0);
    this.scene.add(fillLight.target);
    
    // Rim light - back lighting for edge definition
    const rimLight = this.addDirectionalLight(0, 20, -50, 0xffffff, 0.5, 'rim'); // Reduced from 0.8 to 0.5
    rimLight.target.position.set(0, 0, 0);
    this.scene.add(rimLight.target);
    
    // Top light - overhead illumination
    const topLight = this.addDirectionalLight(0, 50, 0, 0xffffff, 0.4, 'top'); // Reduced from 0.7 to 0.4
    topLight.target.position.set(0, 0, 0);
    this.scene.add(topLight.target);
    
    // Point lights for detailed illumination
    // this.addPointLight(20, 10, 20, 0xffffff, 0.3, 30, 1); // Reduced from 0.5 to 0.3
    // this.addPointLight(-20, 10, 20, 0xf0f8ff, 0.2, 30, 1); // Reduced from 0.3 to 0.2
    
    // Ambient light for overall fill
    this.addAmbientLight(0x404040, 0.1); // Reduced from 0.2 to 0.1
  }

  // Setup default lighting for the jaw viewer (legacy method)
  setupDefaultLighting() {
    this.setupRealisticLighting();
  }

  // Update lighting based on background changes
  updateLightingForBackground(backgroundType) {
    // Adjust light intensity based on background for realistic lighting
    switch (backgroundType) {
      case 'white':
        this.directionalLights.forEach(light => {
          if (light.name === 'key') light.intensity = 1.0;
          else if (light.name === 'fill') light.intensity = 0.5;
          else if (light.name === 'rim') light.intensity = 0.6;
          else if (light.name === 'top') light.intensity = 0.5;
          else light.intensity = 0.7;
        });
        this.pointLights.forEach(light => {
          light.intensity *= 0.8;
        });
        if (this.hemisphereLight) {
          this.hemisphereLight.intensity = 0.2;
        }
        break;
      case 'dark':
        this.directionalLights.forEach(light => {
          if (light.name === 'key') light.intensity = 1.6;
          else if (light.name === 'fill') light.intensity = 1.0;
          else if (light.name === 'rim') light.intensity = 1.2;
          else if (light.name === 'top') light.intensity = 0.9;
          else light.intensity = 1.1;
        });
        this.pointLights.forEach(light => {
          light.intensity *= 1.4;
        });
        if (this.hemisphereLight) {
          this.hemisphereLight.intensity = 0.5;
        }
        break;
      case 'lightGray':
        this.directionalLights.forEach(light => {
          if (light.name === 'key') light.intensity = 1.2;
          else if (light.name === 'fill') light.intensity = 0.7;
          else if (light.name === 'rim') light.intensity = 0.9;
          else if (light.name === 'top') light.intensity = 0.6;
          else light.intensity = 0.8;
        });
        this.pointLights.forEach(light => {
          light.intensity *= 1.0;
        });
        if (this.hemisphereLight) {
          this.hemisphereLight.intensity = 0.3;
        }
        break;
      case 'darkGray':
        this.directionalLights.forEach(light => {
          if (light.name === 'key') light.intensity = 1.4;
          else if (light.name === 'fill') light.intensity = 0.8;
          else if (light.name === 'rim') light.intensity = 1.1;
          else if (light.name === 'top') light.intensity = 0.7;
          else light.intensity = 0.9;
        });
        this.pointLights.forEach(light => {
          light.intensity *= 1.2;
        });
        if (this.hemisphereLight) {
          this.hemisphereLight.intensity = 0.4;
        }
        break;
      case 'blue':
        this.directionalLights.forEach(light => {
          if (light.name === 'key') light.intensity = 1.3;
          else if (light.name === 'fill') light.intensity = 0.8;
          else if (light.name === 'rim') light.intensity = 1.0;
          else if (light.name === 'top') light.intensity = 0.7;
          else light.intensity = 0.9;
        });
        this.pointLights.forEach(light => {
          light.intensity *= 1.1;
        });
        if (this.hemisphereLight) {
          this.hemisphereLight.intensity = 0.35;
        }
        break;
      case 'transparent':
        this.directionalLights.forEach(light => {
          if (light.name === 'key') light.intensity = 1.4;
          else if (light.name === 'fill') light.intensity = 0.8;
          else if (light.name === 'rim') light.intensity = 1.0;
          else if (light.name === 'top') light.intensity = 0.7;
          else light.intensity = 0.9;
        });
        this.pointLights.forEach(light => {
          light.intensity *= 1.2;
        });
        if (this.hemisphereLight) {
          this.hemisphereLight.intensity = 0.4;
        }
        break;
    }
  }

  // Update lighting for specific material types
  updateLightingForMaterial(materialType) {
    // Adjust lighting based on material properties for optimal visibility
    switch (materialType) {
      case 'highContrast':
        // Increase rim lighting for edge definition
        this.directionalLights.forEach(light => {
          if (light.name === 'rim') light.intensity *= 1.3;
          if (light.name === 'key') light.intensity *= 1.1;
        });
        break;
      case 'porcelain':
        // Enhance reflections with stronger key light
        this.directionalLights.forEach(light => {
          if (light.name === 'key') light.intensity *= 1.2;
          if (light.name === 'fill') light.intensity *= 0.9;
        });
        break;
      case 'matte':
        // Reduce reflections, increase fill lighting
        this.directionalLights.forEach(light => {
          if (light.name === 'fill') light.intensity *= 1.3;
          if (light.name === 'key') light.intensity *= 0.9;
        });
        break;
      case 'anatomical':
        // Balanced lighting for surface detail visibility
        this.directionalLights.forEach(light => {
          if (light.name === 'top') light.intensity *= 1.2;
          if (light.name === 'fill') light.intensity *= 1.1;
        });
        break;
    }
  }

  // Remove all lights from scene
  clearLights() {
    this.lights.forEach(light => {
      this.scene.remove(light);
      // Also remove light targets
      if (light.target) {
        this.scene.remove(light.target);
      }
    });
    this.lights = [];
    this.directionalLights = [];
    this.pointLights = [];
    this.hemisphereLight = null;
  }

  // Get lighting information for debugging
  getLightingInfo() {
    return {
      totalLights: this.lights.length,
      directionalLights: this.directionalLights.length,
      pointLights: this.pointLights.length,
      hasHemisphereLight: !!this.hemisphereLight
    };
  }
}

// Export for use in other modules
window.LightingManager = LightingManager;
