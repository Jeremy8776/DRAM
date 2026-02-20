#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_ROOT = path.join(ROOT, 'resources', 'engine');
const POLICY_FILE = path.join(ROOT, 'src', 'renderer', 'modules', 'skill-onboarding-policy.ts');
const DOC_FILE = path.join(ROOT, 'docs', 'skills-clickpath-matrix.md');

const SETUP_PATH_ORDER = [
  'direct',
  'in-app-config',
  'native-installer',
  'wsl-homebrew',
  'manual'
];

const SETUP_PATH_FLOW = {
  'direct': 'Enable toggle -> skill enables immediately with no setup.',
  'in-app-config': 'Enable toggle -> DRAM asks for keys/config in-app -> DRAM retries enable.',
  'native-installer': 'Enable toggle -> DRAM installs required runtimes -> DRAM runs installer -> DRAM enables skill.',
  'wsl-homebrew': 'Enable toggle -> DRAM prepares Windows runtime layer -> DRAM installs dependency -> DRAM enables skill.',
  'manual': 'Enable toggle -> DRAM applies automatic parts first -> DRAM explains remaining manual setup in-app.'
};

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    writeDoc: argv.includes('--write-doc'),
    strict: argv.includes('--strict')
  };
}

function extractPoliciesObjectSource(sourceText) {
  const marker = 'const POLICIES';
  const markerIndex = sourceText.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error('Unable to locate POLICIES map in skill-onboarding-policy.ts');
  }

  const assignIndex = sourceText.indexOf('=', markerIndex);
  if (assignIndex === -1) {
    throw new Error('Unable to locate POLICIES assignment');
  }

  const objectStart = sourceText.indexOf('{', assignIndex);
  if (objectStart === -1) {
    throw new Error('Unable to locate POLICIES object start');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let quoteChar = '';
  for (let i = objectStart; i < sourceText.length; i++) {
    const ch = sourceText[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quoteChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      quoteChar = ch;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(objectStart, i + 1);
      }
    }
  }

  throw new Error('Unbalanced braces while parsing POLICIES object');
}

function loadPolicies() {
  const text = fs.readFileSync(POLICY_FILE, 'utf8');
  const objectSource = extractPoliciesObjectSource(text);
  const wrapped = `(${objectSource})`;
  const policies = vm.runInNewContext(wrapped, Object.create(null), { timeout: 1000 });
  if (!policies || typeof policies !== 'object') {
    throw new Error('Parsed POLICIES map is invalid');
  }
  return Object.values(policies);
}

function buildMatrix(policies) {
  const byPath = new Map();
  const errors = [];

  for (const policy of policies) {
    const skillId = String(policy?.id || '').trim();
    const setupPath = String(policy?.windows?.setupPath || '').trim();
    const skillPath = String(policy?.path || '').trim();

    if (!skillId) {
      errors.push('Policy entry missing id');
      continue;
    }
    if (!setupPath) {
      errors.push(`Policy "${skillId}" missing windows.setupPath`);
      continue;
    }

    const fullSkillPath = path.join(ENGINE_ROOT, skillPath);
    if (!fs.existsSync(fullSkillPath)) {
      errors.push(`Policy "${skillId}" points to missing SKILL.md: ${skillPath}`);
    }

    if (!byPath.has(setupPath)) byPath.set(setupPath, []);
    byPath.get(setupPath).push(policy);
  }

  const presentPaths = [...byPath.keys()].sort((a, b) => {
    const left = SETUP_PATH_ORDER.indexOf(a);
    const right = SETUP_PATH_ORDER.indexOf(b);
    if (left === -1 && right === -1) return a.localeCompare(b);
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  });

  const rows = [];
  const orderedPaths = [...SETUP_PATH_ORDER, ...presentPaths.filter((entry) => !SETUP_PATH_ORDER.includes(entry))];
  for (const setupPath of orderedPaths) {
    const entries = [...(byPath.get(setupPath) || [])]
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    if (!entries.length) {
      rows.push({
        setupPath,
        representativeSkill: 'n/a',
        policyPath: 'n/a',
        totalSkillsInPath: 0,
        flow: 'No skills are currently mapped to this setup path.'
      });
      continue;
    }

    const rep = entries[0];
    rows.push({
      setupPath,
      representativeSkill: rep.id,
      policyPath: rep.path,
      totalSkillsInPath: entries.length,
      flow: SETUP_PATH_FLOW[setupPath] || 'Enable toggle -> DRAM follows the skill policy route.'
    });
  }

  return {
    totalPolicies: policies.length,
    pathsPresent: presentPaths,
    missingPaths: SETUP_PATH_ORDER.filter((entry) => !presentPaths.includes(entry)),
    rows,
    errors
  };
}

function toMarkdown(summary) {
  const generatedAt = new Date().toISOString();
  const header = [
    '# Skills Click-Path Matrix',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This matrix picks one representative skill for each setup path currently used by policy metadata.',
    '',
    '| Setup Path | Representative Skill | Policy Source | Skills In Path | Expected Click Path |',
    '| --- | --- | --- | ---: | --- |'
  ];
  const body = summary.rows.map((row) =>
    `| \`${row.setupPath}\` | \`${row.representativeSkill}\` | \`${row.policyPath}\` | ${row.totalSkillsInPath} | ${row.flow} |`
  );
  const footer = [
    '',
    `Total policies: ${summary.totalPolicies}`,
    `Setup paths covered: ${summary.pathsPresent.map((entry) => `\`${entry}\``).join(', ') || 'none'}`,
    `Setup paths without mapped skills: ${summary.missingPaths.map((entry) => `\`${entry}\``).join(', ') || 'none'}`
  ];
  if (summary.errors.length > 0) {
    footer.push('', '## Policy Issues', '');
    summary.errors.forEach((issue) => footer.push(`- ${issue}`));
  }
  return [...header, ...body, ...footer, ''].join('\n');
}

function printSummary(summary) {
  console.log('Skills Click-Path Matrix');
  console.log('========================');
  console.log(`Total policies: ${summary.totalPolicies}`);
  console.log(`Setup paths covered: ${summary.pathsPresent.join(', ') || 'none'}`);
  console.log(`Setup paths without mapped skills: ${summary.missingPaths.join(', ') || 'none'}`);
  for (const row of summary.rows) {
    console.log(`- ${row.setupPath}: ${row.representativeSkill} (${row.totalSkillsInPath} skills)`);
  }
  if (summary.errors.length > 0) {
    console.log('');
    console.log('Policy issues:');
    summary.errors.forEach((issue) => console.log(`- ${issue}`));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policies = loadPolicies();
  const summary = buildMatrix(policies);

  if (args.writeDoc) {
    const markdown = toMarkdown(summary);
    fs.writeFileSync(DOC_FILE, markdown, 'utf8');
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSummary(summary);
    if (args.writeDoc) {
      console.log(`\nWrote: ${path.relative(ROOT, DOC_FILE)}`);
    }
  }

  if (args.strict && (summary.errors.length > 0 || summary.missingPaths.length > 0)) {
    process.exitCode = 1;
  }
}

main();
