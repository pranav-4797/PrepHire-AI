// ── PrepHire.AI — Competitive Programming Code Sanitizer & Templates ────────
// Enforces standard competitive programming conventions (Codeforces / CodeChef / MIT AoE)
// - Mandates `using namespace std;` whenever `<iostream>` is present in C++
// - Eliminates robotic `std::cin`, `std::cout`, `std::endl`, etc.
// - Provides clean unsolved starter templates so students solve problems from scratch
// ─────────────────────────────────────────────────────────────────────────────

export const COMPETITIVE_STARTER_TEMPLATES: Record<string, string> = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Fast I/O for competitive programming
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // Write your solution here

    return 0;
}
`,
  python: `import sys

def solve():
    # Read all tokens from standard input
    input_data = sys.stdin.read().strip().split()
    if not input_data:
        return

    # Write your solution here
    pass

if __name__ == "__main__":
    solve()
`,
  javascript: `const fs = require('fs');

function solve() {
  const input = fs.readFileSync(0, 'utf-8').trim();
  if (!input) return;

  // Write your solution here

}

solve();
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        // Write your solution here

    }
}
`,
  c: `#include <stdio.h>

int main() {
    // Write your solution here

    return 0;
}
`,
}

/**
 * Sanitizes C++ code to adhere to competitive programming conventions:
 * 1. If <iostream> or <bits/stdc++.h> is included without `using namespace std;`, inserts it.
 * 2. Removes verbose `std::` prefixes from common standard library types and stream objects.
 */
export function cleanCppCode(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw || ''
  let code = raw

  const hasIostream = /#include\s*<iostream>/i.test(code) || /#include\s*<bits\/stdc\+\+\.h>/i.test(code)
  const hasUsingNamespace = /using\s+namespace\s+std\s*;/i.test(code)

  if (hasIostream && !hasUsingNamespace) {
    const lines = code.split('\n')
    let lastIncludeIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('#include')) {
        lastIncludeIdx = i
      }
    }
    if (lastIncludeIdx !== -1) {
      lines.splice(lastIncludeIdx + 1, 0, '\nusing namespace std;')
      code = lines.join('\n')
    } else {
      code = 'using namespace std;\n\n' + code
    }
  }

  // Strip redundant std:: prefixes if namespace std is in effect or iostream was included
  if (hasIostream || /using\s+namespace\s+std\s*;/i.test(code)) {
    code = code
      .replace(/\bstd::cin\b/g, 'cin')
      .replace(/\bstd::cout\b/g, 'cout')
      .replace(/\bstd::endl\b/g, 'endl')
      .replace(/\bstd::vector\b/g, 'vector')
      .replace(/\bstd::string\b/g, 'string')
      .replace(/\bstd::pair\b/g, 'pair')
      .replace(/\bstd::map\b/g, 'map')
      .replace(/\bstd::unordered_map\b/g, 'unordered_map')
      .replace(/\bstd::set\b/g, 'set')
      .replace(/\bstd::unordered_set\b/g, 'unordered_set')
      .replace(/\bstd::swap\b/g, 'swap')
      .replace(/\bstd::min\b/g, 'min')
      .replace(/\bstd::max\b/g, 'max')
      .replace(/\bstd::sort\b/g, 'sort')
      .replace(/\bstd::reverse\b/g, 'reverse')
  }

  return code
}
