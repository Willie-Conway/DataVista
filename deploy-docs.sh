#!/bin/bash
echo "íº€ Deploying to GitHub Pages..."
npm run build
git add -f docs/
git commit -m "Update docs folder"
git push origin main
echo "âœ… Done! Check https://willie-conway.github.io/datavista-app in 2-3 minutes"
