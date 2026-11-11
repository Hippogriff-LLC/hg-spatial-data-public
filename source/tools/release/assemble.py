#!/usr/bin/env python3
"""Offline, standard-library-only RC assembly. Never publishes or executes packages."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import zipfile

VERSION = '1.0.0-rc.1'
# Canonical MIT text, Copyright (c) 2026 Hippogriff Technology LLC.
# Bind the full approved license, including its permission condition and disclaimer.
LICENSE_SHA256 = 'd63f5fa6d6c7cbbaa507ad7053f8c4d43c404de37eed21133b130ab0a00a740e'
PINS = {'cytoscape': '3.34.3', 'babylonjs': '9.27.1'}
ASSETS = {'cytoscape': 'vendor/cytoscape-3.34.3.min.js',
          'babylonjs': 'vendor/babylon-9.27.1.js'}
PUBLIC_DOCS = ('README.md', 'API.md', 'CHANGELOG.md', 'ASSEMBLY.md')
TOOLS = ('tools/release/assemble.py', 'tools/release/prepare.py')
EXAMPLES = ('2d.html', '3d.html', 'page.js', 'page.css')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(obj):
    return (json.dumps(obj, indent=2, sort_keys=True) + '\n').encode()


def safe_name(name):
    p = PurePosixPath(name)
    return (bool(name) and not p.is_absolute() and '..' not in p.parts
            and '\\' not in name and str(p) == name
            and all(re.fullmatch(r'[A-Za-z0-9_.-]+', part) for part in p.parts))


def read_file(root, name):
    if not safe_name(name):
        raise ValueError('unsafe input filename')
    p = root / name
    if any(q.is_symlink() for q in [p, *p.parents]) or not p.is_file():
        raise ValueError('missing or symlink input: ' + name)
    return p.read_bytes()


def preflight(root, inputs):
    blockers = []
    if not (root / 'LICENSE').is_file():
        blockers.append('Project LICENSE absent: approved MIT text and copyright holder required.')
    else:
        if sha(read_file(root, 'LICENSE')) != LICENSE_SHA256:
            blockers.append('Project LICENSE differs from the complete approved MIT text/holder.')
    lock = None
    try:
        lock = json.loads(read_file(inputs, 'verification.json'))
        if lock.get('schema_version') != 1:
            blockers.append('Unsupported input verification schema.')
        name = lock.get('naming', {})
        if (name.get('identifier') != 'hg-spatial-data' or name.get('status') != 'AVAILABLE'
                or name.get('url') != 'https://registry.npmjs.org/hg-spatial-data'
                or name.get('http_status') != 404 or not name.get('checked_at_utc')):
            blockers.append('Preferred npm identifier lacks authoritative registry availability evidence.')
        for key, version in PINS.items():
            item = lock.get('vendors', {}).get(key, {})
            if item.get('version') != version or not item.get('registry_integrity_verified'):
                blockers.append(key + ': exact pin/registry tarball integrity unverified.')
            if item.get('runtime_dependencies'):
                blockers.append(key + ': additional runtime dependencies need a reviewed inventory.')
            for f in item.get('files', []):
                content = read_file(inputs, f['input_path'])
                if sha(content) != f['sha256'] or not safe_name(f['output_path']):
                    blockers.append(key + ': unsafe or changed file.')
            if not any(f['output_path'] == ASSETS[key] for f in item.get('files', [])):
                blockers.append(key + ': browser asset absent.')
            if not any(f['output_path'].startswith('licenses/' + key + '/')
                       for f in item.get('files', [])):
                blockers.append(key + ': license text absent.')
        review = json.loads(read_file(inputs, 'review.json'))
        if review.get('verification_sha256') != sha(read_file(inputs, 'verification.json')):
            blockers.append('Vendor review does not bind these verified inputs.')
        for key in ('license_inventory', 'runtime_asset_inventory', 'advisory_review'):
            if review.get(key) != 'PASS':
                blockers.append('Vendor review outstanding: ' + key)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        blockers.append('Verified inputs/review unavailable: ' + str(exc))
    for filename in PUBLIC_DOCS:
        if not (root / 'docs/release/rc' / filename).is_file():
            blockers.append('Public document missing: ' + filename)
    for filename in EXAMPLES:
        if not (root / 'examples/rc' / filename).is_file():
            blockers.append('Consumer example missing: ' + filename)
    return blockers, lock


def security_scan(files):
    """Heuristics report only category/path/count, never matched secret values."""
    patterns = {
        'private_key': r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
        'provider_token': r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})',
        'credential_assignment': r'''(?i)(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*["'][^"'\s]{12,}["']''',
        'workstation_path': r'/(?:srv|home)/|localhost:[0-9]+',
    }
    hits = []
    for name, content in sorted(files.items()):
        if not safe_name(name) or any(p in PurePosixPath(name).parts for p in
                                     ('.git', '.agents', '.codex', 'qa', 'governance', 'node_modules')):
            hits.append({'path': name, 'category': 'prohibited_path', 'count': 1})
        if PurePosixPath(name).name.startswith('.env'):
            hits.append({'path': name, 'category': 'environment_file', 'count': 1})
        text = content.decode('utf-8', errors='replace')
        for category, pattern in patterns.items():
            count = len(re.findall(pattern, text))
            if count:
                hits.append({'path': name, 'category': category, 'count': count})
    return {'status': 'FAIL' if hits else 'PASS', 'scope': 'bounded content/path heuristics',
            'files_scanned': len(files), 'hits': hits}


def payload(root, inputs, lock, source_commit):
    source = read_file(root, 'src/hg-spatial-default.js')
    files = {'hg-spatial.js': source, 'source/src/hg-spatial-default.js': source,
             'LICENSE': read_file(root, 'LICENSE'), 'source/LICENSE': read_file(root, 'LICENSE')}
    for filename in PUBLIC_DOCS:
        data = read_file(root, 'docs/release/rc/' + filename)
        files[filename] = data
        files['source/docs/release/rc/' + filename] = data
    for filename in TOOLS:
        files['source/' + filename] = read_file(root, filename)
    for filename in EXAMPLES:
        data = read_file(root, 'examples/rc/' + filename)
        files['examples/' + filename] = data
        files['source/examples/rc/' + filename] = data
    notices = ['HG Spatial Data ' + VERSION, '', 'Third-party assets are unmodified.',
               'Their licenses apply separately from the HG MIT license.', '']
    for key in PINS:
        vendor = lock['vendors'][key]
        notices.extend([key + ' ' + PINS[key], vendor['metadata_url'],
                        vendor['tarball_url'], 'Retrieved: ' + vendor['retrieved_at_utc'], ''])
        for item in vendor['files']:
            dest = item['output_path']
            if dest != ASSETS[key] and not dest.startswith('licenses/' + key + '/'):
                raise ValueError('unreviewed vendor output path')
            if dest in files:
                raise ValueError('duplicate output path')
            files[dest] = read_file(inputs, item['input_path'])
            if dest.startswith('licenses/'):
                notices.append('Retained license/notice: ' + dest)
    files['THIRD_PARTY_NOTICES.txt'] = ('\n'.join(notices) + '\n').encode()
    files['PROVENANCE.json'] = encoded({
        'version': VERSION, 'source_commit': source_commit,
        'source_sha256': sha(source), 'assembly_inputs_sha256': sha(read_file(inputs, 'verification.json')),
        'assembly_recipe_sha256': sha(read_file(root, TOOLS[0])),
        'vendors': lock['vendors'], 'naming': lock['naming'],
        'publication': 'not authorized', 'source_snapshot': 'source/',
    })
    files['package.json'] = encoded({
        'name': lock['naming']['identifier'], 'version': VERSION, 'private': True,
        'description': 'HG Spatial Data browser asset package; copy files to a static host',
        'license': 'MIT', 'browser': 'hg-spatial.js',
        'files': sorted([*files, 'SHA256SUMS', 'package.json']),
    })
    files['SHA256SUMS'] = ''.join(sha(data) + '  ' + name + '\n'
                                  for name, data in sorted(files.items())).encode()
    scan = security_scan(files)
    if scan['status'] != 'PASS':
        raise ValueError('artifact scan rejected: ' + json.dumps(scan['hits']))
    return files


def archives(files):
    """Same bytes, fixed order/time/owners/modes, package/ prefix for npm."""
    static = io.BytesIO()
    with zipfile.ZipFile(static, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo('hg-spatial-data-' + VERSION + '/' + name, (1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(entry, data, compresslevel=9)
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as t:
        for name, data in sorted(files.items()):
            entry = tarfile.TarInfo('package/' + name)
            entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
            t.addfile(entry, io.BytesIO(data))
    return static.getvalue(), gzip.compress(raw.getvalue(), compresslevel=9, mtime=0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--inputs', type=Path, default=Path('dist/release-inputs'))
    parser.add_argument('--output', type=Path, default=Path('dist/1.0.0-rc.1'))
    parser.add_argument('--check', action='store_true', help='read-only preflight; emits blockers')
    parser.add_argument('--source-commit', help='required when rebuilding the public source snapshot without Git')
    args = parser.parse_args()
    blockers, lock = preflight(args.root, args.inputs)
    if blockers:
        print(json.dumps({'status': 'BLOCKED', 'version': VERSION, 'blockers': blockers}, indent=2))
        return 2
    if args.check:
        print(json.dumps({'status': 'PASS', 'scope': 'assembly preflight only'}))
        return 0
    commit = args.source_commit or subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], cwd=args.root, text=True).strip()
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('source commit must be a full Git SHA-1')
    if not args.source_commit:
        accepted = subprocess.check_output(['git', 'show', commit + ':src/hg-spatial-default.js'], cwd=args.root)
        if accepted != read_file(args.root, 'src/hg-spatial-default.js'):
            raise ValueError('unreviewed runtime source differs from source commit')
    files = payload(args.root, args.inputs, lock, commit)
    static, npm = archives(files)
    if args.output.exists():
        raise ValueError('output already exists; use a fresh directory for repeat assembly')
    args.output.mkdir(parents=True)
    for name, data in files.items():
        p = args.output / 'static' / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    outputs = {'hg-spatial-data-' + VERSION + '.zip': static,
               'hg-spatial-data-' + VERSION + '.tgz': npm}
    for name, data in outputs.items():
        (args.output / name).write_bytes(data)
    report = {'version': VERSION, 'source_commit': commit, 'files': sorted(files),
              'artifacts': {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in outputs.items()},
              'assets': {name: {'bytes': len(data), 'gzip_bytes': len(gzip.compress(data, mtime=0)),
                                'sha256': sha(data)} for name, data in files.items() if name.endswith('.js')},
              'security_scan': security_scan(files)}
    (args.output / 'assembly-report.json').write_bytes(encoded(report))
    print(json.dumps(report['artifacts'], indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
