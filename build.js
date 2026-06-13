const { make } = require('@electron-forge/cli');
const config = require('./forge.config.ts').default;

async function build() {
  try {
    await make(config);
    console.log('Build complete!');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();