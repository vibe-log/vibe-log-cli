#!/bin/bash

# Test script to verify the npm package works correctly before publishing
# This simulates exactly what users will experience

echo "🧪 Testing npm package locally before publishing..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Build the package
echo "📦 Building package..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Step 2: Pack the package (creates .tgz file)
echo "📦 Creating package tarball..."
npm pack
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Pack failed${NC}"
    exit 1
fi

# Get the package name
PACKAGE_FILE=$(ls vibe-log-cli-*.tgz | head -n 1)
echo -e "${GREEN}✓ Created package: $PACKAGE_FILE${NC}"

# Step 3: Create a temporary test directory
TEST_DIR="temp-test-$(date +%s)"
echo "📁 Creating test directory: $TEST_DIR"
mkdir -p $TEST_DIR
cd $TEST_DIR

# Step 4: Install the package locally
echo "📥 Installing package from tarball..."
npm init -y > /dev/null 2>&1
npm install ../$PACKAGE_FILE
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Installation failed${NC}"
    cd ..
    rm -rf $TEST_DIR
    exit 1
fi

# Step 5: Test the report generation (the critical part)
echo ""
echo "🧪 Testing report template loading..."
echo ""

# Create a test script that uses the package
cat > test-report.js << 'EOF'
const { ReportTemplateEngine } = require('vibe-log-cli/dist/index.js');

async function testTemplateLoading() {
    console.log('Testing template loading...');
    const engine = new ReportTemplateEngine();
    
    try {
        await engine.loadTemplate();
        console.log('✅ Template loaded successfully!');
        return true;
    } catch (error) {
        console.error('❌ Failed to load template:', error.message);
        return false;
    }
}

testTemplateLoading().then(success => {
    process.exit(success ? 0 : 1);
});
EOF

# Run the test
node test-report.js
TEST_RESULT=$?

# Step 6: Test via npx
echo ""
echo "🧪 Testing via npx command..."
npx vibe-log-cli --version
NPX_RESULT=$?

# Cleanup
cd ..
rm -rf $TEST_DIR
rm $PACKAGE_FILE

# Report results
echo ""
echo "======================================="
if [ $TEST_RESULT -eq 0 ] && [ $NPX_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Package is ready to publish.${NC}"
    echo ""
    echo "The template file is correctly included and accessible."
    echo "You can safely run: npm publish"
else
    echo -e "${RED}❌ Tests failed! Do not publish.${NC}"
    echo ""
    echo "Please fix the issues before publishing."
    exit 1
fi