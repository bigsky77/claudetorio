def parse_vcs_directives(code: str):
    """Extract # VCS: directives from code.

    Returns:
        (directives, remaining_code) where directives is a list of strings
        after the '# VCS:' prefix and remaining_code has those lines removed.
    """
    directives = []
    remaining = []
    for line in code.strip().split('\n'):
        stripped = line.strip()
        if stripped.startswith('# VCS:'):
            directives.append(stripped[6:])
        else:
            remaining.append(line)
    return directives, '\n'.join(remaining)
