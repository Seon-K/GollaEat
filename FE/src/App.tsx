import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('확인 중…')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health/', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('API 요청 실패')
        return response.json()
      })
      .then(data => setStatus(data.status === 'ok' ? '연결됨' : '응답 확인 필요'))
      .catch(error => {
        if (error.name !== 'AbortError') setStatus('BE 서버를 실행해 주세요')
      })
    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>GollaEat</h1>
      <p>React + TypeScript 개발 환경이 준비되었습니다.</p>
      <p>Django API: {status}</p>
    </main>
  )
}
