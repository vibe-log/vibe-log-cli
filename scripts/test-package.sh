#!/bin/bash

# Test script to verify package before publishing
# This simulates what users will receive from npm

set -e

echo "🔍 Testing vibe-log-cli package..."
echo ""

# Clean up any previous test
rm -rf test-package
mkdir -p test-package
cd test-package

echo "📦 Creating package tarball..."
npm pack ../

echo ""
echo "📂 Extracting package..."
tar -xzf vibe-log-cli-*.tgz

echo ""
echo "✅ Verifying package contents..."
echo "─────────────────────────────"

# Check that dist files exist
if [ -f "package/dist/index.js" ]; then
    echo "✓ dist/index.js found"
else
    echo "✗ dist/index.js missing!"
    exit 1
fi

if [ -f "package/dist/index.js.map" ]; then
    echo "✓ dist/index.js.map found"
else
    echo "✗ dist/index.js.map missing!"
    exit 1
fi

if [ -f "package/bin/vibe-log.js" ]; then
    echo "✓ bin/vibe-log.js found"
else
    echo "✗ bin/vibe-log.js missing!"
    exit 1
fi

echo ""
echo "🔍 Checking code is not minified..."
echo "─────────────────────────────────"

# Check if code appears minified by looking for readable function declarations
if grep -q "function " package/dist/index.js 2>/dev/null; then
    echo "✓ Code contains readable function declarations"
else
    echo "⚠ Warning: No function declarations found"
fi

# Check line length (minified code typically has very long lines)
MAX_LINE=$(awk '{print length}' package/dist/index.js | sort -rn | head -1)
if [ "$MAX_LINE" -lt 500 ]; then
    echo "✓ Maximum line length: $MAX_LINE (not minified)"
else
    echo "✗ Code appears minified (max line: $MAX_LINE chars)"
fi

echo ""
echo "🔍 Verifying checksums..."
echo "─────────────────────────────"

if [ -f "package/dist/checksums.sha256" ]; then
    cd package/dist
    if sha256sum -c checksums.sha256 > /dev/null 2>&1; then
        echo "✓ Checksums verified successfully"
    else
        echo "✗ Checksum verification failed!"
        exit 1
    fi
    cd ../..
else
    echo "⚠ No checksums file found (optional)"
fi

echo ""
echo "🔍 Checking package.json..."
echo "─────────────────────────────"

# Check repository field
if grep -q '"repository"' package/package.json; then
    echo "✓ Repository field present"
    grep '"repository"' package/package.json -A 3 | head -4 | sed 's/^/  /'
else
    echo "✗ Repository field missing!"
fi

echo ""
echo "📋 Package Summary:"
echo "─────────────────────────────"
echo "Size: $(du -sh vibe-log-cli-*.tgz | cut -f1)"
echo "Files in package: $(tar -tzf vibe-log-cli-*.tgz | wc -l)"
echo ""

# Show first few lines of the built code
echo "📝 First 10 lines of dist/index.js:"
echo "─────────────────────────────────"
head -10 package/dist/index.js

echo ""
echo "✅ Package verification complete!"
echo ""
echo "To test installation locally:"
echo "  cd test-package/package && npm link"
echo "  vibe-log --version"

cd ..