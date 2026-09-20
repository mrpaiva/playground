import { describe, expect, it } from 'vitest'
import type { RemoteRef } from '../shared/files'
import { parseRemote } from './remote-url'

// Every URL here is fictitious: this repository is public and the spec's
// privacy guardrail forbids a real organisation, project or repository name.

describe('parseRemote', () => {
  const recognized: Array<[string, RemoteRef]> = [
    [
      'https://github.com/acme/widget.git',
      { provider: 'github', owner: 'acme', repo: 'widget' }
    ],
    ['https://github.com/acme/widget', { provider: 'github', owner: 'acme', repo: 'widget' }],
    ['git@github.com:acme/widget.git', { provider: 'github', owner: 'acme', repo: 'widget' }],
    [
      'ssh://git@github.com/acme/widget.git',
      { provider: 'github', owner: 'acme', repo: 'widget' }
    ],
    [
      'https://acme@dev.azure.com/acme/platform/_git/widget',
      { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
    ],
    [
      'git@ssh.dev.azure.com:v3/acme/platform/widget',
      { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
    ],
    [
      'https://acme.visualstudio.com/platform/_git/widget',
      { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
    ],
    [
      'https://acme.visualstudio.com/DefaultCollection/platform/_git/widget',
      { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
    ]
  ]

  it.each(recognized)('recognizes %s', (url, expected) => {
    expect(parseRemote(url)).toEqual(expected)
  })

  it('keeps no trace of a credential carried by the remote', () => {
    const parsed = parseRemote('https://user:token@github.com/acme/widget.git')
    expect(parsed).toEqual({ provider: 'github', owner: 'acme', repo: 'widget' })
    expect(JSON.stringify(parsed)).not.toContain('token')
    expect(JSON.stringify(parsed)).not.toContain('user')
  })

  it('decodes a project named with a space', () => {
    expect(parseRemote('https://dev.azure.com/acme/My%20Project/_git/widget')).toEqual({
      provider: 'azure-devops',
      org: 'acme',
      project: 'My Project',
      repo: 'widget'
    })
  })

  const rejected: string[] = [
    'https://gitlab.com/acme/widget.git',
    'C:\\repos\\widget',
    '',
    // Right host, wrong shape: an Azure DevOps path without `_git` names no repo.
    'https://dev.azure.com/acme/platform/widget',
    // A GitHub URL with an owner and no repository.
    'https://github.com/acme'
  ]

  it.each(rejected)('returns null for %s', (url) => {
    expect(parseRemote(url)).toBeNull()
  })
})
