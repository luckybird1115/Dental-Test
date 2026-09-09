// UI Controls
// Handles all UI event listeners and user interactions

class UIControls {
  constructor(stageManager, sceneManager) {
    this.stageManager = stageManager;
    this.sceneManager = sceneManager;
  }

  // Setup all event listeners
  setupEventListeners() {
    // Stage navigation
    document.getElementById('prevBtn').addEventListener('click', () => {
      if (AppConfig.currentStage() > 1) {
        this.stageManager.setStage(AppConfig.currentStage() - 1);
      }
    });

    document.getElementById('nextBtn').addEventListener('click', () => {
      if (AppConfig.currentStage() < AppConfig.totalStages()) {
        this.stageManager.setStage(AppConfig.currentStage() + 1);
      }
    });

    // Slider
    document.getElementById('stageSlider').addEventListener('input', (e) => {
      const stage = parseInt(e.target.value);
      this.updateSliderValueDisplay(stage);
      this.stageManager.setStage(stage);
    });

    // Jaw visibility controls
    document.getElementById('hideUpperBtn').addEventListener('click', () => {
      AppConfig.setUpperVisible(!AppConfig.upperVisible());
      this.stageManager.updateJawVisibility();
      this.updateHideButtonText();
    });

    document.getElementById('hideLowerBtn').addEventListener('click', () => {
      AppConfig.setLowerVisible(!AppConfig.lowerVisible());
      this.stageManager.updateJawVisibility();
      this.updateHideButtonText();
    });

    // Reset camera
    document.getElementById('resetCameraBtn').addEventListener('click', () => {
      this.sceneManager.resetCamera();
    });

    // Background control
    document.getElementById('backgroundSelect').addEventListener('change', (e) => {
      this.sceneManager.changeBackground(e.target.value);
      // Auto-suggest optimal material for the background
      this.suggestOptimalMaterial(e.target.value);
    });

    // Material control
    document.getElementById('materialSelect').addEventListener('change', (e) => {
      this.applyMaterialPreset(e.target.value);
    });

    // Help overlay controls
    const helpBtn = document.getElementById('helpBtn');
    const helpBackdrop = document.getElementById('helpOverlayBackdrop');
    const helpClose = document.getElementById('helpClose');
    const helpDontShow = document.getElementById('helpDontShow');

    const showHelp = () => {
      if (helpBackdrop) helpBackdrop.style.display = 'flex';
    };

    const hideHelp = (persist = false) => {
      if (helpBackdrop) helpBackdrop.style.display = 'none';
      if (persist) {
        try { localStorage.setItem('viewerHelpShown', 'true'); } catch (e) {}
      }
    };

    helpBtn?.addEventListener('click', () => showHelp());
    helpClose?.addEventListener('click', () => hideHelp(false));
    helpDontShow?.addEventListener('click', () => hideHelp(true));
    helpBackdrop?.addEventListener('click', (e) => {
      if (e.target === helpBackdrop) hideHelp(false);
    });

    // Keyboard shortcut: '?' to toggle help
    document.addEventListener('keydown', (e) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        if (helpBackdrop && helpBackdrop.style.display === 'flex') hideHelp(false); else showHelp();
      }
    });

    // First-visit auto show disabled - the help overlay only opens on demand
    // (Help button / "?" key).

    // New design UI (left toolbar, top view bar, right sidebar)
    this.setupDesignUI();
  }

  // Wire up the new design UI. Camera view buttons are functional;
  // tool / tab / toggle buttons are visual selection only for now.
  setupDesignUI() {
    // Left toolbar - tool selection. Curve and Brush are wired to behaviour;
    // the rest are visual selection only for now.
    const toolButtons = document.querySelectorAll('#ncLeftToolbar .nc-tool-btn');
    toolButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        toolButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool;
        if (this.curveTool) this.curveTool.setActive(tool === 'curve');
        if (this.brushTool) this.brushTool.setActive(tool === 'brush');
      });
    });

    // Top bar - camera view presets
    const viewButtons = document.querySelectorAll('#ncTopBar .nc-view-btn');
    viewButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        viewButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.sceneManager.setView(btn.dataset.view);
      });
    });

    document.getElementById('ncFitBtn')?.addEventListener('click', () => {
      this.sceneManager.setView('home');
    });

    // Sidebar tabs - visual selection
    const tabButtons = document.querySelectorAll('#ncSidebar .nc-tab');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Toggle groups (MODE, Decoration) - visual selection
    document.querySelectorAll('#ncSidebar .nc-toggle-group').forEach((group) => {
      const toggles = group.querySelectorAll('.nc-toggle');
      toggles.forEach((btn) => {
        btn.addEventListener('click', () => {
          toggles.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    });

    // Model thumbnail cards - visual selection
    const thumbCards = document.querySelectorAll('#ncThumbPanel .nc-thumb-card');
    thumbCards.forEach((card) => {
      card.addEventListener('click', () => {
        thumbCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
      });
    });
  }

  // Update button text based on visibility state
  updateHideButtonText() {
    document.getElementById('hideUpperBtn').textContent = AppConfig.upperVisible() ? 'Hide Upper' : 'Show Upper';
    document.getElementById('hideLowerBtn').textContent = AppConfig.lowerVisible() ? 'Hide Lower' : 'Show Lower';
  }

  // Update stage information display
  updateStageInfo() {
    // Stage info is now hidden
    this.updateJawProgressBars();
    this.updateTimelineNumbers();
    this.updateUpperSliderNumbers();
  }

  // Update button states (enabled/disabled)
  updateButtonStates() {
    document.getElementById('prevBtn').disabled = AppConfig.currentStage() <= 1;
    document.getElementById('nextBtn').disabled = AppConfig.currentStage() >= AppConfig.totalStages();
  }

  // Update slider value and max
  updateSlider() {
    const currentStage = AppConfig.currentStage();
    document.getElementById('stageSlider').value = currentStage;
    document.getElementById('stageSlider').max = AppConfig.totalStages();
    this.updateSliderValueDisplay(currentStage);
    this.updateJawProgressBars();
    this.updateTimelineNumbers();
    this.updateUpperSliderNumbers();
  }

  // Update slider value display at bottom
  updateSliderValueDisplay(value) {
    const sliderValueDisplay = document.getElementById('sliderValueDisplay');
    if (sliderValueDisplay) {
      sliderValueDisplay.textContent = value;
    }
  }

  // Update timeline numbers (0, 5, 10, 15, etc.)
  updateTimelineNumbers() {
    const maxillaryModels = AppConfig.maxillaryModels();
    const mandibularModels = AppConfig.mandibularModels();
    
    // Get file counts from ModelLoader if available, otherwise use model counts
    let maxUpperStage = maxillaryModels.length || 13;
    let maxLowerStage = mandibularModels.length || 22;
    
    // Try to get file counts from ModelLoader (more accurate since files are discovered first)
    if (this.stageManager && this.stageManager.modelLoader) {
      const maxillaryFiles = this.stageManager.modelLoader.getMaxillaryFiles();
      const mandibularFiles = this.stageManager.modelLoader.getMandibularFiles();
      if (maxillaryFiles && maxillaryFiles.length > 0) {
        maxUpperStage = maxillaryFiles.length;
      }
      if (mandibularFiles && mandibularFiles.length > 0) {
        maxLowerStage = mandibularFiles.length;
      }
    }
    
    const maxStage = Math.max(maxUpperStage, maxLowerStage);
    
    const timelineNumbersContainer = document.getElementById('timelineNumbers');
    if (!timelineNumbersContainer) return;
    
    // Clear existing numbers
    timelineNumbersContainer.innerHTML = '';
    
    // Generate numbers in increments of 5
    const numbers = [];
    for (let i = 0; i <= maxStage; i += 5) {
      numbers.push(i);
    }
    
    // Create number elements and position them
    numbers.forEach((num) => {
      const numberElement = document.createElement('span');
      numberElement.className = 'timeline-number';
      numberElement.textContent = num.toString();
      timelineNumbersContainer.appendChild(numberElement);
      
      // Calculate position as percentage of width
      const positionPercent = (num / maxStage) * 100;
      numberElement.style.left = `${positionPercent}%`;
    });
  }

  // Update upper slider numbers (0 to maxUpperStage)
  updateUpperSliderNumbers() {
    const maxillaryModels = AppConfig.maxillaryModels();
    let maxUpperStage = maxillaryModels.length || 13;
    
    // Try to get file counts from ModelLoader (more accurate since files are discovered first)
    if (this.stageManager && this.stageManager.modelLoader) {
      const maxillaryFiles = this.stageManager.modelLoader.getMaxillaryFiles();
      if (maxillaryFiles && maxillaryFiles.length > 0) {
        maxUpperStage = maxillaryFiles.length;
      }
    }
    
    const upperSliderNumbersContainer = document.getElementById('upperSliderNumbers');
    if (!upperSliderNumbersContainer) return;
    
    // Clear existing numbers
    upperSliderNumbersContainer.innerHTML = '';
    
    // Generate numbers from 0 to maxUpperStage
    for (let i = 0; i <= maxUpperStage; i++) {
      const numberElement = document.createElement('span');
      numberElement.className = 'upper-slider-number';
      numberElement.textContent = i.toString();
      upperSliderNumbersContainer.appendChild(numberElement);
      
      // Calculate position as percentage of width
      const positionPercent = (i / maxUpperStage) * 100;
      numberElement.style.left = `${positionPercent}%`;
    }
  }

  // Update dual jaw progress bars
  updateJawProgressBars() {
    const currentStage = AppConfig.currentStage();
    const maxillaryModels = AppConfig.maxillaryModels();
    const mandibularModels = AppConfig.mandibularModels();
    
    // Get file counts from ModelLoader if available, otherwise use model counts
    let maxUpperStage = maxillaryModels.length || 13;
    let maxLowerStage = mandibularModels.length || 22;
    
    // Try to get file counts from ModelLoader (more accurate since files are discovered first)
    if (this.stageManager && this.stageManager.modelLoader) {
      const maxillaryFiles = this.stageManager.modelLoader.getMaxillaryFiles();
      const mandibularFiles = this.stageManager.modelLoader.getMandibularFiles();
      if (maxillaryFiles && maxillaryFiles.length > 0) {
        maxUpperStage = maxillaryFiles.length;
      }
      if (mandibularFiles && mandibularFiles.length > 0) {
        maxLowerStage = mandibularFiles.length;
      }
    }
    
    const maxStage = Math.max(maxUpperStage, maxLowerStage);

    console.log('maxStage', maxStage);
    console.log('maxUpperStage', maxUpperStage);
    console.log('maxLowerStage', maxLowerStage);
    console.log('currentStage', currentStage);
    // Calculate progress based on max stage (both bars use same total length)
    // Upper bar: fills up to maxUpperStage, then outlined remainder
    const upperFillProgress = Math.min(currentStage, maxUpperStage);
    const upperFillWidth = (upperFillProgress / maxStage) * 100;
    const upperShouldShowOutline = currentStage > maxUpperStage;
    
    // Lower bar: fills up to maxLowerStage, then outlined remainder
    const lowerFillProgress = Math.min(currentStage, maxLowerStage);
    const lowerFillWidth = (lowerFillProgress / maxStage) * 100;
    const lowerShouldShowOutline = currentStage > maxLowerStage;
    
    // Update upper progress bar
    const upperProgressBarFill = document.getElementById('upperProgressBarFill');
    const upperProgressBarOutline = document.getElementById('upperProgressBarOutline');
    
    if (upperProgressBarFill) {
      upperProgressBarFill.style.width = `${upperFillWidth}%`;
    }
    
    if (upperProgressBarOutline) {
      if (upperShouldShowOutline) {
        upperProgressBarOutline.style.display = 'block';
        // Show outline only for the portion beyond maxUpperStage
        const outlineStart = (maxUpperStage / maxStage) * 100;
        const outlineWidth = ((currentStage - maxUpperStage) / maxStage) * 100;
        upperProgressBarOutline.style.left = `${outlineStart}%`;
        upperProgressBarOutline.style.width = `${Math.min(outlineWidth, (maxStage - maxUpperStage) / maxStage * 100)}%`;
      } else {
        upperProgressBarOutline.style.display = 'none';
      }
    }
    
    // Update lower progress bar
    const lowerProgressBarFill = document.getElementById('lowerProgressBarFill');
    const lowerProgressBarOutline = document.getElementById('lowerProgressBarOutline');
    
    if (lowerProgressBarFill) {
      lowerProgressBarFill.style.width = `${lowerFillWidth}%`;
    }
    
    if (lowerProgressBarOutline) {
      if (lowerShouldShowOutline) {
        lowerProgressBarOutline.style.display = 'block';
        // Show outline only for the portion beyond maxLowerStage
        const outlineStart = (maxLowerStage / maxStage) * 100;
        const outlineWidth = ((currentStage - maxLowerStage) / maxStage) * 100;
        lowerProgressBarOutline.style.left = `${outlineStart}%`;
        lowerProgressBarOutline.style.width = `${Math.min(outlineWidth, (maxStage - maxLowerStage) / maxStage * 100)}%`;
      } else {
        lowerProgressBarOutline.style.display = 'none';
      }
    }
    
    // Update stage labels
    const upperStageLabel = document.getElementById('upperStageLabel');
    const lowerStageLabel = document.getElementById('lowerStageLabel');
    
    if (upperStageLabel) {
      upperStageLabel.textContent = maxUpperStage.toString();
    }
    
    if (lowerStageLabel) {
      lowerStageLabel.textContent = maxLowerStage.toString();
    }
  }

  // Show/hide loading elements
  showLoader() {
    document.getElementById("loader").style.display = "block";
    document.getElementById("progress").style.display = "block";
  }

  hideLoader() {
    document.getElementById("loader").style.display = "none";
    document.getElementById("progress").style.display = "none";
  }

  // Update progress percentage
  updateProgress(percentage) {
    document.getElementById("progress").innerHTML = percentage + "%";
  }

  // Show error message
  showError(message) {
    document.getElementById("loader").style.display = "none";
    document.getElementById("progress").innerHTML = message;
    document.getElementById("progress").style.color = "#ff4444";
  }

  // Apply material preset to all models
  applyMaterialPreset(presetName) {
    const materialManager = this.sceneManager.getMaterialManager();
    const lightingManager = this.sceneManager.getLightingManager();
    
    if (!materialManager) {
      console.warn('MaterialManager not available');
      return;
    }

    // Get all models from stage manager
    const maxillaryModels = this.stageManager.modelLoader?.getMaxillaryModels() || [];
    const mandibularModels = this.stageManager.modelLoader?.getMandibularModels() || [];
    const allModels = [...maxillaryModels, ...mandibularModels].filter(model => model);

    // Apply the material preset with lighting manager
    materialManager.applyMaterialPreset(presetName, allModels, lightingManager);
    
    console.log(`Applied material preset: ${presetName}`);
  }

  

  // Suggest optimal material for background
  suggestOptimalMaterial(backgroundName) {
    const materialManager = this.sceneManager.getMaterialManager();
    if (!materialManager) {
      return;
    }

    const optimalPreset = materialManager.getOptimalMaterialForBackground(backgroundName);
    const materialSelect = document.getElementById('materialSelect');
    
    if (materialSelect && optimalPreset) {
      // Update the select value
      materialSelect.value = optimalPreset;
      
      // Apply the optimal material
      this.applyMaterialPreset(optimalPreset);
      
      console.log(`Auto-applied optimal material: ${optimalPreset} for background: ${backgroundName}`);
    }
  }

  // Reset all material settings to default
  resetMaterialSettings() {
    const materialManager = this.sceneManager.getMaterialManager();
    if (!materialManager) {
      return;
    }

    // Reset material preset
    document.getElementById('materialSelect').value = 'realistic';
    
    // Apply default settings
    this.applyMaterialPreset('realistic');
    
    console.log('Reset material settings to default');
  }
}

// Export for use in other modules
window.UIControls = UIControls;
