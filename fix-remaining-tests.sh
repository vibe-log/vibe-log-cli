#!/bin/bash

echo "Fixing control characters in remaining test files..."

# Fix styles.test.ts
sed -i.bak 's/\\x1b/\\u001b/g' src/lib/ui/__tests__/styles.test.ts
sed -i.bak 's/\\x00/\\u0000/g' src/lib/ui/__tests__/styles.test.ts

# Fix progress.test.ts
sed -i.bak 's/\\x1b/\\u001b/g' src/lib/ui/__tests__/progress.test.ts
sed -i.bak 's/\\x00/\\u0000/g' src/lib/ui/__tests__/progress.test.ts

# Remove backup files
rm src/lib/ui/__tests__/*.bak

echo "Done fixing control characters in test files!"
echo "Now run: npm run lint"