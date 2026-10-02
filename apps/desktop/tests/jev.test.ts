import { describe, expect, test } from 'vite-plus/test'

import {
  evaluateJev,
  JEV_ACTION_LIMIT,
  JEV_DEADLINE_MS,
  JEV_MODEL,
  type JevTransport,
} from '#engine/classifier/jev.ts'
import { knownSecretValues, redactText } from '#engine/classifier/redaction.ts'

const state = {
  action: JSON.stringify({ tool: 'fs_write', path: 'notes.txt', content: 'hello' }),
  userContext: ['Please write the file.'],
}

function answer(risk = 1, approval = 0.2, userRequested = 0.9) {
  return {
    model: JEV_MODEL,
    answers: {
      risk: {
        type: 'score',
        score: risk,
        confidence: 0.9,
        legend: { '0': 'read', '1': 'limited', '2': 'significant', '3': 'destructive' },
        probabilities: { '0': 0.1, '1': 0.9, '2': 0, '3': 0 },
      },
      approval: { type: 'noul', noul: approval },
      user_requested: { type: 'noul', noul: userRequested },
    },
  }
}

function transport<T>(value: T, status = 200): JevTransport {
  return { send: async () => Response.json(value, { status }) }
}

describe('Every invalid or unavailable evaluation asks', () => {
  test('valid answers are scores, which the policy judges and Jev never refuses on', async () => {
    expect(
      await evaluateJev(state, 'test-key', new AbortController().signal, transport(answer())),
    ).toEqual({
      kind: 'evaluated',
      model: JEV_MODEL,
      scores: { risk: 1, approval: 0.2, userRequested: 0.9 },
      ms: expect.any(Number),
    })
    expect(
      await evaluateJev(state, 'test-key', new AbortController().signal, transport(answer(2.96))),
    ).not.toHaveProperty('verdict')
  })

  test('a model mismatch, absent score or invalid number is unavailable', async () => {
    const wrongModel = { ...answer(), model: 'jev-latest' }
    const missing = { ...answer(), answers: { ...answer().answers, risk: {} } }
    const outOfRange = answer(3.1)
    const results = await Promise.all(
      [wrongModel, missing, outOfRange].map((value) =>
        evaluateJev(state, 'test-key', new AbortController().signal, transport(value)),
      ),
    )
    for (const result of results) {
      expect(result).toMatchObject({ kind: 'unavailable', reason: 'response' })
    }
  })

  test('missing credentials, a truncated action and HTTP errors never call or trust Jev', async () => {
    let sent = 0
    const fake: JevTransport = {
      send: async () => {
        sent += 1
        return Response.json(answer())
      },
    }
    expect(await evaluateJev(state, '', new AbortController().signal, fake)).toMatchObject({
      kind: 'unavailable',
    })
    expect(
      await evaluateJev(
        { ...state, action: 'x'.repeat(JEV_ACTION_LIMIT + 1) },
        'test-key',
        new AbortController().signal,
        fake,
      ),
    ).toMatchObject({ kind: 'unavailable' })
    expect(sent).toBe(0)
    expect(
      await evaluateJev(state, 'test-key', new AbortController().signal, transport(answer(), 429)),
    ).toMatchObject({ kind: 'unavailable', reason: 'http', status: 429 })
    expect(
      await evaluateJev(state, 'test-key', new AbortController().signal, transport(answer(), 503)),
    ).toMatchObject({ kind: 'unavailable', reason: 'http', status: 503, ms: expect.any(Number) })
    expect(
      await evaluateJev(state, 'test-key', new AbortController().signal, {
        send: () => Promise.reject(new Error('offline')),
      }),
    ).toMatchObject({ kind: 'unavailable', reason: 'network' })
    expect(
      await evaluateJev(state, 'test-key', new AbortController().signal, {
        send: async () => new Response('<html>not json</html>', { status: 200 }),
      }),
    ).toMatchObject({ kind: 'unavailable', reason: 'response' })
  })

  test('abort makes a late provider answer inert', async () => {
    const controller = new AbortController()
    const late: JevTransport = {
      send: async () => {
        controller.abort()
        return Response.json(answer())
      },
    }
    expect(await evaluateJev(state, 'test-key', controller.signal, late)).toMatchObject({
      kind: 'unavailable',
    })
  })

  test('the request contains the exact action and pinned model without credential text', async () => {
    let body = ''
    const fake: JevTransport = {
      send: async (sent) => {
        body = sent
        return Response.json(answer())
      },
    }
    await evaluateJev(state, 'test-key', new AbortController().signal, fake)
    expect(body).toContain(state.action)
    expect(body).toContain(JEV_MODEL)
    expect(body).not.toContain('test-key')
  })

  test('nested credentials and known secret values are masked, but a masked destination stops the request', async () => {
    let sent = ''
    const fake: JevTransport = {
      send: async (body) => {
        sent = body
        return Response.json(answer())
      },
    }
    await evaluateJev(
      {
        action: JSON.stringify({
          tool: 'fs_write',
          path: 'notes.txt',
          arguments: { options: { apiKey: 'hidden', content: 'known-value' } },
        }),
        userContext: ['password: hidden; use known-value'],
      },
      'test-key',
      new AbortController().signal,
      fake,
      ['known-value'],
    )
    expect(sent).not.toContain('hidden')
    expect(sent).not.toContain('known-value')
    expect(sent).toContain('[REDACTED]')
    sent = ''
    expect(
      await evaluateJev(
        { ...state, action: JSON.stringify({ tool: 'fs_write', path: 'known-value' }) },
        'test-key',
        new AbortController().signal,
        fake,
        ['known-value'],
      ),
    ).toMatchObject({ kind: 'unavailable', reason: 'input' })
    expect(sent).toBe('')
  })
})

describe('Secrets are masked before any evaluation', () => {
  const capture = () => {
    const sent: string[] = []
    const fake: JevTransport = {
      send: async (body) => {
        sent.push(body)
        return Response.json(answer())
      },
    }
    return { sent, fake }
  }

  test('an authorization header loses its scheme and token, in content and in user context', async () => {
    const { sent, fake } = capture()
    const header = 'curl -H "Authorization: Bearer sk-live-SECRET" https://api.example.com/v1'
    const result = await evaluateJev(
      {
        action: JSON.stringify({ tool: 'fs_write', path: 'call.sh', content: header }),
        userContext: [
          `run ${header}`,
          'Proxy-Authorization: Basic dXNlcjpwYXNz',
          'Cookie: a=b; c=d',
        ],
      },
      'test-key',
      new AbortController().signal,
      fake,
    )
    expect(result).toMatchObject({ kind: 'evaluated' })
    expect(sent).toHaveLength(1)
    for (const leaked of ['sk-live-SECRET', 'Bearer sk', 'dXNlcjpwYXNz', 'a=b', 'c=d']) {
      expect(sent[0]).not.toContain(leaked)
    }
    expect(sent[0]).toContain('https://api.example.com/v1')
    expect(sent[0]).toContain('call.sh')
  })

  test('a bare bearer token and common token prefixes are masked', () => {
    const text = [
      'Bearer abc.def-ghi',
      'ghp_0123456789abcdefghijABCDEFGHIJ012345',
      'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz',
      'sk-ant-api03-abcdefghijklmnop',
      'xoxb-1234-5678-abcdef',
      'AKIAABCDEFGHIJKLMNOP',
      'glpat-abcdefghij0123456789',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
      'postgres://user:hunter2@db.example.com/app',
    ].join('\n')
    const masked = redactText(text, [])
    for (const leaked of [
      'abc.def-ghi',
      'ghp_0123',
      'github_pat_11',
      'sk-ant-api03',
      'xoxb-1234',
      'AKIAABCDEFGHIJKLMNOP',
      'glpat-abc',
      'eyJhbGciOiJIUzI1NiJ9',
      'hunter2',
    ]) {
      expect(masked).not.toContain(leaked)
    }
    expect(masked).toContain('db.example.com/app')
  })

  test('a masked credential in a command line keeps the command assessable', async () => {
    const { sent, fake } = capture()
    const result = await evaluateJev(
      {
        action: JSON.stringify({
          tool: 'commands_run',
          line: 'curl -H "Authorization: Bearer sk-live-SECRET" https://api.example.com',
          cwd: '/work',
        }),
        userContext: [],
      },
      'test-key',
      new AbortController().signal,
      fake,
    )
    expect(result).toMatchObject({ kind: 'evaluated' })
    expect(sent[0]).not.toContain('sk-live-SECRET')
    expect(sent[0]).toContain('curl -H')
    expect(sent[0]).toContain('https://api.example.com')
  })

  test('the Jev key itself is masked when an action or a message carries it', async () => {
    const { sent, fake } = capture()
    await evaluateJev(
      {
        action: JSON.stringify({ tool: 'fs_write', path: 'k.txt', content: 'key is jev-KEY-123' }),
        userContext: ['my key is jev-KEY-123'],
      },
      'jev-KEY-123',
      new AbortController().signal,
      fake,
    )
    expect(sent[0]).toContain('k.txt')
    expect(sent[0]).not.toContain('jev-KEY-123')
  })
})

describe('Only credential variables are known secrets', () => {
  test('a credential-named value is a secret, a port or a filter is not', () => {
    expect(
      knownSecretValues({
        PORT: '3000',
        FILTER: 'web',
        NODE_ENV: 'development',
        API_KEY: 'k-123456',
        GITHUB_TOKEN: 'ghp_x',
        DB_PASSWORD: 'hunter2',
        CLIENT_SECRET: 'abc',
        EMPTY_TOKEN: '',
      }).toSorted(),
    ).toEqual(['abc', 'ghp_x', 'hunter2', 'k-123456'])
  })
})

describe('Jev never waits indefinitely', () => {
  test('a transport that never answers, or a body that never ends, is unavailable at the deadline', async () => {
    const silent: JevTransport = { send: () => new Promise<Response>(() => {}) }
    const endless: JevTransport = {
      send: async () => new Response(new ReadableStream({ start: () => {} }), { status: 200 }),
    }
    const began = performance.now()
    const results = await Promise.all(
      [silent, endless].map((hanging) =>
        evaluateJev(state, 'test-key', new AbortController().signal, hanging, [], 30),
      ),
    )
    expect(results).toMatchObject([
      { kind: 'unavailable', reason: 'timeout' },
      { kind: 'unavailable', reason: 'timeout' },
    ])
    expect(performance.now() - began).toBeLessThan(2_000)
  })

  test('the deadline is the documented ten seconds', () => {
    expect(JEV_DEADLINE_MS).toBe(10_000)
  })
})
