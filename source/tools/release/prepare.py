#!/usr/bin/env python3
"""Bounded anonymous registry reads; stage pinned assets without installing/executing them.

Run in the governed named execution session. No credentials, login, account changes,
plugins, lifecycle scripts, package installation or publication are used.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import urllib.error
import urllib.request

PINS = {'cytoscape': ('3.34.3', 'package/dist/cytoscape.min.js', 'vendor/cytoscape-3.34.3.min.js'),
        'babylonjs': ('9.27.1', 'package/babylon.js', 'vendor/babylon-9.27.1.js')}
LIMIT = 80 * 1024 * 1024


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('unexpected registry redirect')


def fetch(url):
    if not url.startswith('https://registry.npmjs.org/'):
        raise ValueError('only the authoritative HTTPS npm registry is allowed')
    request = urllib.request.Request(url, headers={'User-Agent': 'HG-Spatial-Data-RC-verification'})
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=30) as response:
            data = response.read(LIMIT + 1)
            if len(data) > LIMIT:
                raise ValueError('registry response exceeds bounded limit')
            return response.status, data
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return 404, exc.read(4096)
        raise


def verified_tarball(blob, integrity):
    # No weak-hash fallback. Compare the actual registry SHA-512 digest.
    expected = 'sha512-' + base64.b64encode(hashlib.sha512(blob).digest()).decode()
    if expected not in integrity.split():
        raise ValueError('registry SHA-512 integrity mismatch or missing SHA-512')


def selected_members(blob, asset):
    selected, names = {}, []
    with tarfile.open(fileobj=io.BytesIO(blob), mode='r:gz') as archive:
        total = 0
        for member in archive:
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or '\\' in member.name:
                raise ValueError('unsafe vendor archive path')
            if member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise ValueError('vendor archive link or special file')
            if member.isfile():
                total += member.size
                if total > 180 * 1024 * 1024:
                    raise ValueError('vendor archive expansion exceeds limit')
                if member.name in names:
                    raise ValueError('duplicate vendor archive member')
                names.append(member.name)
                license_file = re.match(r'(?i)^(license|licence|notice|copyright)(?:[._-].*)?$', path.name)
                if member.name == asset or license_file:
                    selected[member.name] = archive.extractfile(member).read()
    if asset not in selected or not any(n != asset for n in selected):
        raise ValueError('pinned browser asset or license inventory absent')
    return selected, sorted(names)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('dist/release-inputs'))
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('input directory exists; preserve evidence and choose a fresh path')
    url = 'https://registry.npmjs.org/hg-spatial-data'
    code, data = fetch(url)
    body = json.loads(data)
    naming = {'identifier': 'hg-spatial-data', 'url': url, 'http_status': code,
              'checked_at_utc': stamp(), 'response_sha256': hashlib.sha256(data).hexdigest(),
              'status': 'AVAILABLE' if code == 404 and body.get('error') == 'Not found' else 'UNRESOLVED',
              'scope': 'anonymous availability only; not ownership/reservation/publication clearance'}
    args.output.mkdir(parents=True)
    (args.output / 'naming-result.json').write_text(json.dumps(naming, indent=2) + '\n')
    lock, staged = {'schema_version': 1, 'naming': naming, 'vendors': {}}, {}
    for key, (version, asset, destination) in PINS.items():
        metadata_url = 'https://registry.npmjs.org/' + key + '/' + version
        status, metadata_bytes = fetch(metadata_url)
        if status != 200:
            raise ValueError('pinned registry metadata unavailable: ' + key)
        metadata = json.loads(metadata_bytes)
        if metadata.get('name') != key or metadata.get('version') != version:
            raise ValueError('registry pin identity mismatch')
        tarball_url, integrity = metadata['dist']['tarball'], metadata['dist']['integrity']
        status, blob = fetch(tarball_url)
        if status != 200:
            raise ValueError('pinned tarball unavailable')
        verified_tarball(blob, integrity)
        members, inventory = selected_members(blob, asset)
        files = []
        for name, content in sorted(members.items()):
            local = key + '/' + name.removeprefix('package/')
            output = destination if name == asset else 'licenses/' + key + '/' + name.removeprefix('package/')
            staged[local] = content
            files.append({'input_path': local, 'output_path': output,
                          'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)})
        staged[key + '/package-inventory.json'] = (json.dumps(inventory, indent=2) + '\n').encode()
        staged[key + '/registry-metadata.json'] = metadata_bytes
        staged[key + '/' + key + '-' + version + '.tgz'] = blob
        lock['vendors'][key] = {'version': version, 'metadata_url': metadata_url,
                               'metadata_sha256': hashlib.sha256(metadata_bytes).hexdigest(),
                               'tarball_url': tarball_url, 'registry_integrity': integrity,
                               'registry_integrity_verified': True, 'retrieved_at_utc': stamp(),
                               'tarball_sha256': hashlib.sha256(blob).hexdigest(),
                               'package_license': metadata.get('license'),
                               'runtime_dependencies': metadata.get('dependencies', {}), 'files': files}
    for name, content in staged.items():
        p = args.output / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)
    lock_bytes = (json.dumps(lock, indent=2, sort_keys=True) + '\n').encode()
    (args.output / 'verification.json').write_bytes(lock_bytes)
    (args.output / 'review.json').write_text(json.dumps({
        'verification_sha256': hashlib.sha256(lock_bytes).hexdigest(),
        'license_inventory': 'NOT_RUN', 'runtime_asset_inventory': 'NOT_RUN',
        'advisory_review': 'NOT_RUN'}, indent=2) + '\n')
    print(json.dumps({'naming': naming, 'vendors': list(PINS),
                      'review': 'Required: inspect asset banners/embedded dependencies, licenses/NOTICE, optional runtime loaders and current advisories.'}, indent=2))


if __name__ == '__main__':
    main()
