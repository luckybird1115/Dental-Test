const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify } = require('terser');

// Configuration
const config = {
  inputDir: './js',
  outputDir: './dist',
  obfuscate: true,
  minify: true,
  copyAssets: true
};

// Create output directory if it doesn't exist
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

if (!fs.existsSync(path.join(config.outputDir, 'js'))) {
  fs.mkdirSync(path.join(config.outputDir, 'js'), { recursive: true });
}

if (!fs.existsSync(path.join(config.outputDir, 'assets'))) {
  fs.mkdirSync(path.join(config.outputDir, 'assets'), { recursive: true });
}

console.log('🔧 Building 3D Jaw Viewer Application...');

// Function to obfuscate JavaScript files
async function obfuscateJS() {
  console.log('🔒 Obfuscating JavaScript files...');
  
  const jsFiles = fs.readdirSync(config.inputDir).filter(file => file.endsWith('.js'));
  
  for (const file of jsFiles) {
    const filePath = path.join(config.inputDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const obfuscated = JavaScriptObfuscator.obfuscate(content, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 1,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      debugProtection: true,
      debugProtectionInterval: 2000,
      disableConsoleOutput: true,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: true,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 5,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 1,
      transformObjectKeys: true,
      unicodeEscapeSequence: false
    });
    
    const outputPath = path.join(config.outputDir, 'js', file);
    fs.writeFileSync(outputPath, obfuscated.getObfuscatedCode());
    console.log(`✅ Obfuscated: ${file}`);
  }
}

// Function to minify JavaScript files
async function minifyJS() {
  console.log('📦 Minifying JavaScript files...');
  
  const jsFiles = fs.readdirSync(path.join(config.outputDir, 'js')).filter(file => file.endsWith('.js'));
  
  for (const file of jsFiles) {
    const filePath = path.join(config.outputDir, 'js', file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const minified = await minify(content, {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
      },
      mangle: {
        toplevel: true
      }
    });
    
    fs.writeFileSync(filePath, minified.code);
    console.log(`✅ Minified: ${file}`);
  }
}

// Function to copy assets
function copyAssets() {
  console.log('📁 Copying assets...');
  
  // Copy entire assets directory
  const assetsSource = './assets';
  const assetsDest = path.join(config.outputDir, 'assets');
  
  if (fs.existsSync(assetsSource)) {
    copyDir(assetsSource, assetsDest);
    console.log('✅ Assets copied');
  }
}

// Function to copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Function to create production HTML
function createProductionHTML() {
  console.log('📄 Creating production HTML...');
  
  let htmlContent = fs.readFileSync('./index.html', 'utf8');
  
  // Replace script paths to point to obfuscated files
  htmlContent = htmlContent.replace(/src="\.\/js\//g, 'src="./js/');
  
  // Add developer tools protection
  const devToolsProtection = `
    <script>
      // Developer Tools Protection
      (function() {
        'use strict';
        let devtools = {open: false, orientation: null};
        const threshold = 160;
        
        setInterval(function() {
          if (window.outerHeight - window.innerHeight > threshold || 
              window.outerWidth - window.innerWidth > threshold) {
            if (!devtools.open) {
              devtools.open = true;
              console.clear();
              console.log('%c⚠️ Developer Tools Detected!', 'color: red; font-size: 20px; font-weight: bold;');
              console.log('%cThis application is protected. Please close developer tools.', 'color: red; font-size: 14px;');
              document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#000;color:#fff;font-family:Arial;"><h1>⚠️ Developer Tools Detected</h1></div>';
            }
          } else {
            devtools.open = false;
          }
        }, 500);
        
        // Disable right-click context menu
        document.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          return false;
        });
        
        // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
        document.addEventListener('keydown', function(e) {
          if (e.key === 'F12' || 
              (e.ctrlKey && e.shiftKey && e.key === 'I') ||
              (e.ctrlKey && e.shiftKey && e.key === 'J') ||
              (e.ctrlKey && e.key === 'U')) {
            e.preventDefault();
            return false;
          }
        });
        
        // Disable text selection
        document.addEventListener('selectstart', function(e) {
          e.preventDefault();
          return false;
        });
        
        // Disable drag and drop
        document.addEventListener('dragover', function(e) {
          e.preventDefault();
          return false;
        });
        
        document.addEventListener('drop', function(e) {
          e.preventDefault();
          return false;
        });
      })();
    </script>
  `;
  
  // Insert protection script before closing head tag
  htmlContent = htmlContent.replace('</head>', devToolsProtection + '</head>');
  
  // Write production HTML
  fs.writeFileSync(path.join(config.outputDir, 'index.html'), htmlContent);
  console.log('✅ Production HTML created');
}

// Main build function
async function build() {
  try {
    if (config.obfuscate) {
      await obfuscateJS();
    }
    
    if (config.minify) {
      await minifyJS();
    }
    
    if (config.copyAssets) {
      copyAssets();
    }
    
    createProductionHTML();
    
    console.log('🎉 Build completed successfully!');
    console.log('📁 Output directory: ./dist');
    console.log('🚀 Deploy the contents of ./dist to your web server');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();
