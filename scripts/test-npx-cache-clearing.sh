#!/bin/bash

# NPX Cache Clearing Verification Script
# Tests the surgical deletion approach for vibe-log-cli from NPX cache

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}NPX Cache Clearing Verification Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Check if NPX cache exists
echo -e "${YELLOW}Step 1: Checking NPX cache directory...${NC}"
NPX_CACHE_DIR="$HOME/.npm/_npx"

if [ ! -d "$NPX_CACHE_DIR" ]; then
    echo -e "${RED}✗ NPX cache directory not found: $NPX_CACHE_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}✓ NPX cache directory exists${NC}"
CACHE_COUNT=$(ls -1 "$NPX_CACHE_DIR" | wc -l | xargs)
echo -e "  Found $CACHE_COUNT cache entries"
echo ""

# Step 2: Find vibe-log-cli in cache (before deletion)
echo -e "${YELLOW}Step 2: Finding vibe-log-cli in cache...${NC}"
VIBE_LOG_DIRS=$(find "$NPX_CACHE_DIR" -name "vibe-log-cli" -type d 2>/dev/null)

if [ -z "$VIBE_LOG_DIRS" ]; then
    echo -e "${YELLOW}  No vibe-log-cli found in cache${NC}"
    echo -e "${YELLOW}  Installing vibe-log-cli to create cache entry...${NC}"
    npx vibe-log-cli@latest --version > /dev/null 2>&1
    VIBE_LOG_DIRS=$(find "$NPX_CACHE_DIR" -name "vibe-log-cli" -type d 2>/dev/null)
fi

if [ -z "$VIBE_LOG_DIRS" ]; then
    echo -e "${RED}✗ Failed to create cache entry${NC}"
    exit 1
fi

ENTRY_COUNT=$(echo "$VIBE_LOG_DIRS" | wc -l | xargs)
echo -e "${GREEN}✓ Found $ENTRY_COUNT vibe-log-cli cache entry/entries${NC}"

# Show versions
echo -e "  Cached versions:"
while IFS= read -r dir; do
    if [ -f "$dir/package.json" ]; then
        VERSION=$(grep '"version"' "$dir/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
        echo -e "    - $VERSION (at $dir)"
    fi
done <<< "$VIBE_LOG_DIRS"
echo ""

# Step 3: Delete vibe-log-cli from cache (surgical approach)
echo -e "${YELLOW}Step 3: Deleting vibe-log-cli from cache (surgical)...${NC}"
find "$NPX_CACHE_DIR" -name "vibe-log-cli" -type d -exec rm -rf {} + 2>/dev/null || true
echo -e "${GREEN}✓ Deletion command executed${NC}"
echo ""

# Step 4: Verify deletion
echo -e "${YELLOW}Step 4: Verifying deletion...${NC}"
REMAINING=$(find "$NPX_CACHE_DIR" -name "vibe-log-cli" -type d 2>/dev/null)

if [ -n "$REMAINING" ]; then
    echo -e "${RED}✗ vibe-log-cli still found in cache!${NC}"
    echo "$REMAINING"
    exit 1
fi

echo -e "${GREEN}✓ vibe-log-cli successfully removed from cache${NC}"
echo ""

# Step 5: Verify NPX re-downloads
echo -e "${YELLOW}Step 5: Testing NPX re-download...${NC}"
VERSION=$(npx vibe-log-cli@latest --version 2>&1 | head -1)
echo -e "${GREEN}✓ NPX downloaded version: $VERSION${NC}"
echo ""

# Step 6: Confirm new cache entry
echo -e "${YELLOW}Step 6: Confirming new cache entry created...${NC}"
NEW_DIRS=$(find "$NPX_CACHE_DIR" -name "vibe-log-cli" -type d 2>/dev/null)

if [ -z "$NEW_DIRS" ]; then
    echo -e "${RED}✗ No new cache entry found!${NC}"
    exit 1
fi

NEW_COUNT=$(echo "$NEW_DIRS" | wc -l | xargs)
echo -e "${GREEN}✓ Found $NEW_COUNT new cache entry/entries${NC}"

while IFS= read -r dir; do
    if [ -f "$dir/package.json" ]; then
        VERSION=$(grep '"version"' "$dir/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
        echo -e "    - $VERSION (at $dir)"
    fi
done <<< "$NEW_DIRS"
echo ""

# Step 7: Test nuclear approach (optional - commented out by default)
echo -e "${YELLOW}Step 7: Testing nuclear approach (delete entire _npx)...${NC}"
echo -e "${YELLOW}  [SKIPPED - Too aggressive for production]${NC}"
echo -e "  To test: rm -rf ~/.npm/_npx && npx vibe-log-cli@latest --version"
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ All tests passed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Summary:"
echo -e "  ✓ NPX cache directory exists"
echo -e "  ✓ Surgical deletion works (find + rm)"
echo -e "  ✓ NPX re-downloads after cache clear"
echo -e "  ✓ New cache entry created correctly"
echo ""
echo -e "${GREEN}Recommended approach: Surgical deletion${NC}"
echo -e "  find ~/.npm/_npx -name \"vibe-log-cli\" -type d -exec rm -rf {} +"
