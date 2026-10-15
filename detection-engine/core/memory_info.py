"""Read-only process/container counters. No raw logs or profiling allocations."""
from pathlib import Path
import os


def memory_info(read=None):
    read = read or (lambda path: Path(path).read_text())
    process = {'pid': os.getpid(), 'rss_bytes': None, 'peak_rss_bytes': None}
    try:
        fields = dict(line.split(':', 1) for line in read('/proc/self/status').splitlines() if ':' in line)
        for field, key in [('VmRSS', 'rss_bytes'), ('VmHWM', 'peak_rss_bytes')]:
            if field in fields:
                process[key] = int(fields[field].split()[0]) * 1024
    except (OSError, ValueError):
        pass
    container = None
    for version, base, current_file, limit_file in [
        (2, '/sys/fs/cgroup', 'memory.current', 'memory.max'),
        (1, '/sys/fs/cgroup/memory', 'memory.usage_in_bytes', 'memory.limit_in_bytes')]:
        try:
            current = int(read(base + '/' + current_file).strip())
            limit_text = read(base + '/' + limit_file).strip()
            limit = None if limit_text == 'max' else int(limit_text)
            if limit is not None and limit >= 2**60:
                limit = None
            stats = {}
            try:
                stats = {key: int(value) for key, value in (line.split() for line in read(base + '/memory.stat').splitlines())}
            except (OSError, ValueError):
                pass
            container = dict(version=version, current_bytes=current, limit_bytes=limit,
                             anonymous_bytes=stats.get('anon', stats.get('total_rss', stats.get('rss'))),
                             file_bytes=stats.get('file', stats.get('total_cache', stats.get('cache'))),
                             inactive_file_bytes=stats.get('inactive_file', stats.get('total_inactive_file', 0)))
            break
        except (OSError, ValueError):
            continue
    return dict(process=process, cgroup=container)
