/**
 * AI Fetch Helper
 * 通过 Electron 主进程发送请求，以正确使用代理
 */

interface FetchOptions {
  method: string
  headers: Record<string, string>
  body?: string
}

interface FetchResponse {
  ok: boolean
  status: number
  data: any
  error?: string
}

/**
 * 通过主进程发送 AI API 请求
 * 这样可以正确使用 Electron 的代理配置
 */
export async function aiFetch(url: string, options: FetchOptions): Promise<FetchResponse> {
  // 检查是否在 Electron 环境中
  if (typeof window !== 'undefined' && window.electron?.ai?.fetch) {
    console.log(`[aiFetch] 使用 IPC 请求: ${url}`)
    return window.electron.ai.fetch(url, options)
  }

  // 回退到普通 fetch（用于测试或非 Electron 环境）
  console.log(`[aiFetch] 使用普通 fetch: ${url}`)
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body
    })

    let data: any
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error.message || '网络请求失败'
    }
  }
}
