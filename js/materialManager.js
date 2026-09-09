// Material Manager
// Handles different material presets and color schemes for better contrast and visibility

class MaterialManager {
  constructor() {
    this.currentPreset = 'realistic';
    this.materialPresets = {
      realistic: {
        name: 'Realistic Teeth',
        color: 0xf5f5f5,
        roughness: 0.3,
        metalness: 0.1,
        envMapIntensity: 0.8,
        description: 'Natural tooth color with realistic surface properties'
      },
      highContrast: {
        name: 'High Contrast',
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.0,
        envMapIntensity: 1.2,
        description: 'Bright white for maximum contrast against dark backgrounds'
      },
      warm: {
        name: 'Warm Ivory',
        color: 0xfff8dc,
        roughness: 0.4,
        metalness: 0.05,
        envMapIntensity: 0.6,
        description: 'Warm ivory tone for softer appearance'
      },
      cool: {
        name: 'Cool White',
        color: 0xf0f8ff,
        roughness: 0.2,
        metalness: 0.15,
        envMapIntensity: 1.0,
        description: 'Cool white with subtle blue undertones'
      },
      porcelain: {
        name: 'Porcelain',
        color: 0xfefefe,
        roughness: 0.05,
        metalness: 0.0,
        envMapIntensity: 1.5,
        description: 'Glossy porcelain finish for detailed examination'
      },
      matte: {
        name: 'Matte Finish',
        color: 0xf8f8f8,
        roughness: 0.8,
        metalness: 0.0,
        envMapIntensity: 0.3,
        description: 'Matte finish to reduce reflections and highlight form'
      },
      clinical: {
        name: 'Clinical View',
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.0,
        envMapIntensity: 0.9,
        description: 'Clinical white optimized for medical examination'
      },
      anatomical: {
        name: 'Anatomical',
        color: 0xf0f0f0,
        roughness: 0.6,
        metalness: 0.0,
        envMapIntensity: 0.4,
        description: 'Anatomical view emphasizing surface texture and form'
      }
    };

    this.backgroundPresets = {
      dark: {
        name: 'Dark',
        color: 0x1a1a1a,
        bodyColor: '#000000',
        exposure: 0.6,
        description: 'Dark background for high contrast'
      },
      white: {
        name: 'White',
        color: 0xffffff,
        bodyColor: '#ffffff',
        exposure: 1.0,
        description: 'White background for clinical examination'
      },
      lightGray: {
        name: 'Light Gray',
        color: 0xf5f5f5,
        bodyColor: '#f5f5f5',
        exposure: 0.9,
        description: 'Light gray for balanced contrast'
      },
      darkGray: {
        name: 'Dark Gray',
        color: 0x2a2a2a,
        bodyColor: '#2a2a2a',
        exposure: 0.7,
        description: 'Dark gray for subtle contrast'
      },
      blue: {
        name: 'Medical Blue',
        color: 0x1e3a8a,
        bodyColor: '#1e3a8a',
        exposure: 0.8,
        description: 'Medical blue background'
      },
      transparent: {
        name: 'Transparent',
        color: 0x000000,
        bodyColor: 'transparent',
        exposure: 0.7,
        description: 'Transparent background'
      }
    };
  }

  // Apply material preset to all models
  applyMaterialPreset(presetName, models, lightingManager = null) {
    if (!this.materialPresets[presetName]) {
      console.warn(`Material preset '${presetName}' not found`);
      return;
    }

    this.currentPreset = presetName;
    const preset = this.materialPresets[presetName];

    models.forEach(model => {
      if (model) {
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            // Update material properties
            child.material.color.setHex(preset.color);
            child.material.roughness = preset.roughness;
            child.material.metalness = preset.metalness;
            child.material.envMapIntensity = preset.envMapIntensity;
            child.material.needsUpdate = true;
          }
        });
      }
    });

    // Update lighting for the material type
    if (lightingManager) {
      lightingManager.updateLightingForMaterial(presetName);
    }

    console.log(`Applied material preset: ${preset.name}`);
  }

  // Apply background preset
  applyBackgroundPreset(presetName, renderer, lightingManager) {
    if (!this.backgroundPresets[presetName]) {
      console.warn(`Background preset '${presetName}' not found`);
      return;
    }

    const preset = this.backgroundPresets[presetName];
    
    // Update renderer background
    if (presetName === 'transparent') {
      renderer.setClearColor(preset.color, 0);
    } else {
      renderer.setClearColor(preset.color, 1);
    }
    
    // Update body background
    document.body.style.background = preset.bodyColor;
    
    // Update tone mapping exposure
    renderer.toneMappingExposure = preset.exposure;
    
    // Update lighting for the new background
    if (lightingManager) {
      lightingManager.updateLightingForBackground(presetName);
    }

    console.log(`Applied background preset: ${preset.name}`);
  }

  // Get optimal material preset for background
  getOptimalMaterialForBackground(backgroundName) {
    const recommendations = {
      'dark': 'highContrast',
      'white': 'anatomical',
      'lightGray': 'realistic',
      'darkGray': 'clinical',
      'blue': 'porcelain',
      'transparent': 'cool'
    };
    
    return recommendations[backgroundName] || 'realistic';
  }

  // Create material preset selector HTML
  createMaterialSelector() {
    let html = '<div class="material-control">';
    html += '<span>Material:</span>';
    html += '<select id="materialSelect" class="material-select">';
    
    Object.keys(this.materialPresets).forEach(key => {
      const preset = this.materialPresets[key];
      const selected = key === this.currentPreset ? 'selected' : '';
      html += `<option value="${key}" ${selected}>${preset.name}</option>`;
    });
    
    html += '</select>';
    html += '</div>';
    
    return html;
  }

  // Create background preset selector HTML
  createBackgroundSelector() {
    let html = '<div class="background-control">';
    html += '<span>Background:</span>';
    html += '<select id="backgroundSelect" class="background-select">';
    
    Object.keys(this.backgroundPresets).forEach(key => {
      const preset = this.backgroundPresets[key];
      html += `<option value="${key}">${preset.name}</option>`;
    });
    
    html += '</select>';
    html += '</div>';
    
    return html;
  }

  // Get current preset info
  getCurrentPresetInfo() {
    return {
      material: this.materialPresets[this.currentPreset],
      presetName: this.currentPreset
    };
  }

  // Get all presets for UI
  getAllPresets() {
    return {
      materials: this.materialPresets,
      backgrounds: this.backgroundPresets
    };
  }

  

  // Reset to default materials
  resetToDefault(models) {
    this.applyMaterialPreset('realistic', models);
  }
}

// Export for use in other modules
window.MaterialManager = MaterialManager;
