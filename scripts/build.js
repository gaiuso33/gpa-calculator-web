
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const SHIPPABLE_FILES = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "css",
  "js",
  "assets",
  "icons",
  "LICENSE",
];

function build() {
  console.log("Building GPA Calculator Web...\n");

  // Clean previous build
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Copy production files
  for (const item of SHIPPABLE_FILES) {
    const source = path.join(ROOT_DIR, item);
    const destination = path.join(DIST_DIR, item);

    if (!fs.existsSync(source)) {
      throw new Error(`Required file or directory missing: ${item}`);
    }

    fs.cpSync(source, destination, {
      recursive: true,
      force: true,
    });

    console.log(`  ✓ ${item}`);
  }

  // Verify essential output files
  const requiredOutput = [
    "index.html",
    "manifest.webmanifest",
    "sw.js",
    "css/style.css",
    "js/app.js",
    "js/pwa.js",
  ];

  for (const file of requiredOutput) {
    if (!fs.existsSync(path.join(DIST_DIR, file))) {
      throw new Error(`Build verification failed: ${file} missing`);
    }
  }

  console.log("\n✓ Build completed successfully!");
  console.log(`Output directory: ${DIST_DIR}`);
}

try {
  build();
} catch (error) {
  console.error("\n✗ Build failed:", error.message);
  process.exit(1);
}
