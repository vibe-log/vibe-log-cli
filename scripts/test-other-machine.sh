#!/bin/bash

# Quick Test Script for Other Machine
# This tests the NPX auto-update mechanism in one go

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}NPX Auto-Update Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check pre-requisites
echo -e "${YELLOW}Checking pre-requisites...${NC}"
command -v node >/dev/null 2>&1 || { echo -e "${RED}Node.js not found. Please install Node.js first.${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}npm not found. Please install npm first.${NC}"; exit 1; }
echo -e "${GREEN}✓ Node.js and npm found${NC}"
echo "  Node version: $(node --version)"
echo "  npm version: $(npm --version)"
echo ""

# Test 1: Check current installation
echo -e "${YELLOW}Test 1: Checking current installation...${NC}"
if [ -d ~/.vibe-log ]; then
    echo -e "${GREEN}✓ vibe-log directory exists${NC}"
    if [ -f ~/.vibe-log/update.log ]; then
        echo "  Last update:"
        tail -1 ~/.vibe-log/update.log
    fi
else
    echo -e "${YELLOW}  No existing vibe-log installation${NC}"
fi
echo ""

# Test 2: Check NPX cache state
echo -e "${YELLOW}Test 2: Checking NPX cache...${NC}"
CACHED_VERSIONS=$(find ~/.npm/_npx -name "vibe-log-cli" -type d 2>/dev/null)
if [ -n "$CACHED_VERSIONS" ]; then
    echo -e "${GREEN}✓ vibe-log-cli found in NPX cache${NC}"
    find ~/.npm/_npx -name "vibe-log-cli" -type d -exec cat {}/package.json \; 2>/dev/null | grep '"version"' | while read line; do
        echo "  $line"
    done
else
    echo -e "${YELLOW}  No cached version found${NC}"
fi
echo ""

# Test 3: Simulate update trigger
echo -e "${YELLOW}Test 3: Simulating update check with old version...${NC}"
echo -e "${BLUE}Running: SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test --verbose${NC}"
echo ""

SIMULATE_OLD_VERSION=0.5.0 npx vibe-log-cli send --hook-trigger=sessionstart --test --verbose 2>&1 | tee /tmp/vibe-log-test-output.log

echo ""
echo -e "${YELLOW}Analyzing test output...${NC}"

# Check if update was triggered
if grep -q "Update available" /tmp/vibe-log-test-output.log; then
    echo -e "${GREEN}✓ Update detection working${NC}"
else
    echo -e "${YELLOW}  No update detected (might be already up to date)${NC}"
fi

if grep -q "Acquired update lock" /tmp/vibe-log-test-output.log; then
    echo -e "${GREEN}✓ Lock acquisition working${NC}"
else
    echo -e "${YELLOW}  Lock not acquired (another update may be in progress)${NC}"
fi

if grep -q "Cleared NPX cache" /tmp/vibe-log-test-output.log; then
    echo -e "${GREEN}✓ Cache clearing working${NC}"
fi

echo ""

# Test 4: Wait for background update
echo -e "${YELLOW}Test 4: Checking background update completion...${NC}"
echo "Waiting 5 seconds for background update..."
sleep 5

if [ -f ~/.vibe-log/update.log ]; then
    LAST_UPDATE=$(tail -5 ~/.vibe-log/update.log)
    echo "Recent update log:"
    echo "$LAST_UPDATE"

    if echo "$LAST_UPDATE" | grep -q "Update completed"; then
        echo -e "${GREEN}✓ Background update completed successfully${NC}"
    elif echo "$LAST_UPDATE" | grep -q "Update failed"; then
        echo -e "${RED}✗ Background update failed${NC}"
        echo "Check ~/.vibe-log/update.log for details"
    fi
else
    echo -e "${YELLOW}  No update log found${NC}"
fi
echo ""

# Test 5: Verify new cache
echo -e "${YELLOW}Test 5: Verifying NPX cache after update...${NC}"
NEW_CACHED=$(find ~/.npm/_npx -name "vibe-log-cli" -type d 2>/dev/null)
if [ -n "$NEW_CACHED" ]; then
    echo -e "${GREEN}✓ vibe-log-cli in NPX cache${NC}"
    NEW_VERSION=$(find ~/.npm/_npx -name "vibe-log-cli" -type d -exec cat {}/package.json \; 2>/dev/null | grep '"version"' | sed 's/.*"version": "\(.*\)".*/\1/')
    echo "  Cached version: $NEW_VERSION"
else
    echo -e "${RED}✗ No vibe-log-cli found in cache${NC}"
fi
echo ""

# Test 6: Check hooks installation
echo -e "${YELLOW}Test 6: Checking hooks installation...${NC}"
if [ -f ~/.claude/settings.json ]; then
    if grep -q "SessionStart" ~/.claude/settings.json; then
        echo -e "${GREEN}✓ Hooks are installed${NC}"

        # Check if using @latest (should NOT be)
        if grep "vibe-log-cli@latest" ~/.claude/settings.json >/dev/null 2>&1; then
            echo -e "${RED}✗ WARNING: Hooks using @latest (should not)${NC}"
            echo "  Hook command should be: npx vibe-log-cli send ..."
        else
            echo -e "${GREEN}✓ Hooks using correct command (no @latest)${NC}"
        fi

        echo "  Hook command:"
        grep -A 1 "SessionStart" ~/.claude/settings.json | grep "command" | head -1
    else
        echo -e "${YELLOW}  Hooks not installed yet${NC}"
        echo "  Run 'npx vibe-log-cli' to install hooks"
    fi
else
    echo -e "${YELLOW}  Claude settings not found${NC}"
fi
echo ""

# Test 7: Check for lock issues
echo -e "${YELLOW}Test 7: Checking for lock issues...${NC}"
if [ -f ~/.vibe-log/update.lock ]; then
    echo -e "${YELLOW}⚠ Update lock file exists${NC}"
    LOCK_CONTENT=$(cat ~/.vibe-log/update.lock)
    echo "  Lock content: $LOCK_CONTENT"

    LOCK_TIME=$(echo "$LOCK_CONTENT" | grep -o '"timestamp":[0-9]*' | cut -d: -f2)
    CURRENT_TIME=$(($(date +%s)*1000))
    AGE=$(($CURRENT_TIME - $LOCK_TIME))
    AGE_MINUTES=$(($AGE / 60000))

    echo "  Lock age: $AGE_MINUTES minutes"

    if [ $AGE_MINUTES -gt 5 ]; then
        echo -e "${RED}  Stale lock detected (>5 minutes old)${NC}"
        echo "  This should be cleaned up automatically on next run"
    else
        echo -e "${GREEN}  Lock is fresh (update in progress)${NC}"
    fi
else
    echo -e "${GREEN}✓ No lock file (good - no update in progress)${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Machine info:"
echo "  OS: $(uname -a)"
echo "  Node: $(node --version)"
echo "  npm: $(npm --version)"
echo ""
echo "vibe-log-cli status:"
if [ -n "$NEW_VERSION" ]; then
    echo "  Cached version: $NEW_VERSION"
else
    echo "  Not cached yet"
fi
echo ""
echo "Next steps:"
echo "  1. Review logs: tail -f ~/.vibe-log/update.log"
echo "  2. Test hooks: npx vibe-log-cli send --hook-trigger=sessionstart --test"
echo "  3. Full docs: see TESTING_GUIDE_OTHER_MACHINE.md"
echo ""
echo -e "${GREEN}Testing complete!${NC}"
echo ""
echo "Share results:"
echo "  cat ~/.vibe-log/update.log"
echo "  find ~/.npm/_npx -name 'vibe-log-cli' -type d -exec cat {}/package.json \\; | grep version"

# Cleanup temp file
rm -f /tmp/vibe-log-test-output.log
