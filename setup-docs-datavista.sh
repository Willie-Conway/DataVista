#!/bin/bash

echo "��� Setting up DataVista with docs folder for GitHub Pages..."

# Create directories
mkdir -p public src .github/workflows

# Create package.json with docs build script
cat > package.json << 'PKG'
{
  "name": "datavista-app",
  "version": "1.0.0",
  "private": true,
  "homepage": "https://willie-conway.github.io/DataVista",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "recharts": "^2.15.4"
  },
  "devDependencies": {
    "gh-pages": "^6.0.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build && rm -rf docs && mv build docs",
    "test": "react-scripts test",
    "eject": "react-scripts eject",
    "deploy-docs": "npm run build && git add docs && git commit -m \"Update docs folder\" && git push"
  },
  "eslintConfig": {
    "extends": ["react-app"]
  },
  "browserslist": {
    "production": [">0.2%", "not dead", "not op_mini all"],
    "development": ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"]
  }
}
PKG

# Create .nojekyll
echo "" > public/.nojekyll
echo "✅ Created public/.nojekyll"

# Create .gitignore with docs
cat > .gitignore << 'GIT'
/node_modules
/build
/docs
.env
.DS_Store
.vscode/
.idea/
*.log
GIT
echo "✅ Updated .gitignore with docs/"

# Create workflow for docs approach
cat > .github/workflows/deploy.yml << 'YML'
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
        env:
          CI: false
      - name: Deploy docs folder
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/ -f
          git commit -m "Deploy docs folder" || echo "No changes"
          git push origin main
YML
echo "✅ Created GitHub Actions workflow"

# Create deploy helper script
cat > deploy-docs.sh << 'SCRIPT'
#!/bin/bash
echo "��� Deploying to GitHub Pages..."
npm run build
git add -f docs/
git commit -m "Update docs folder"
git push origin main
echo "✅ Done! Check https://willie-conway.github.io/DataVista in 2-3 minutes"
SCRIPT
chmod +x deploy-docs.sh
echo "✅ Created deploy-docs.sh helper"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy your App.js to src/App.js"
echo "2. Run: npm install"
echo "3. Run: npm start (to test locally)"
echo "4. Run: git add . && git commit -m 'Initial' && git push"
echo "5. Run: npm run build (to create docs folder)"
echo "6. Run: git add -f docs/ && git commit -m 'Add docs' && git push"
echo "7. Go to GitHub repo Settings → Pages → set branch 'main' folder '/docs'"
