// Stage Manager
// Handles stage navigation and model visibility management

class StageManager {
  constructor(modelLoader, uiControls) {
    this.modelLoader = modelLoader;
    this.uiControls = uiControls;
  }

  // Set the current stage
  setStage(stage) {
    if (stage < 1 || stage > AppConfig.totalStages() || !AppConfig.isObjectsLoaded()) return;
    
    AppConfig.setCurrentStage(stage);
    
    // Hide all models
    const maxillaryModels = AppConfig.maxillaryModels();
    const mandibularModels = AppConfig.mandibularModels();
    
    maxillaryModels.forEach(model => model.visible = false);
    mandibularModels.forEach(model => model.visible = false);

    // Determine which indices to show for this stage based on the requested progression rules:
    // - Stages 1..13: upper and lower advance together (1..13)
    // - Stages >13: lower continues 14..N, upper stays at 13
    const maxUpperStage = maxillaryModels.length; // expected 13 with current assets
    const maxLowerStage = mandibularModels.length; // expected 22 with current assets

    const upperStageIndex = Math.min(stage, maxUpperStage) - 1; // clamp at 13
    const lowerStageIndex = Math.min(stage, maxLowerStage) - 1; // clamp at 22

    // Show mapped stage models
    if (maxillaryModels[upperStageIndex]) {
      maxillaryModels[upperStageIndex].visible = AppConfig.upperVisible();
    }
    if (mandibularModels[lowerStageIndex]) {
      mandibularModels[lowerStageIndex].visible = AppConfig.lowerVisible();
    }

    this.uiControls.updateStageInfo();
    this.uiControls.updateButtonStates();
    this.uiControls.updateSlider();
  }

  // Update jaw visibility based on current settings
  updateJawVisibility() {
    const maxillaryModels = AppConfig.maxillaryModels();
    const mandibularModels = AppConfig.mandibularModels();
    
    const stage = AppConfig.currentStage();
    const maxUpperStage = maxillaryModels.length;
    const maxLowerStage = mandibularModels.length;
    const upperStageIndex = Math.min(stage, maxUpperStage) - 1;
    const lowerStageIndex = Math.min(stage, maxLowerStage) - 1;
    
    if (maxillaryModels[upperStageIndex]) {
      maxillaryModels[upperStageIndex].visible = AppConfig.upperVisible();
    }
    if (mandibularModels[lowerStageIndex]) {
      mandibularModels[lowerStageIndex].visible = AppConfig.lowerVisible();
    }
  }

  // Initialize stage management after models are loaded
  initializeStages() {
    // Update total stages based on loaded models
    const totalStages = this.modelLoader.getTotalStages();
    AppConfig.setTotalStages(totalStages);

    // Apply initial jaw visibility (upper jaw hidden by default)
    this.updateJawVisibility();

    // Update UI with initial stage info
    this.uiControls.updateStageInfo();
    this.uiControls.updateButtonStates();
    this.uiControls.updateSlider();
    
    console.log(`Stage management initialized with ${totalStages} stages`);
  }

  // Get current stage
  getCurrentStage() {
    return AppConfig.currentStage();
  }

  // Get total stages
  getTotalStages() {
    return AppConfig.totalStages();
  }

  // Check if objects are loaded
  isObjectsLoaded() {
    return AppConfig.isObjectsLoaded();
  }

  // Set objects loaded state
  setObjectsLoaded(loaded) {
    AppConfig.setIsObjectsLoaded(loaded);
  }
}

// Export for use in other modules
window.StageManager = StageManager;
