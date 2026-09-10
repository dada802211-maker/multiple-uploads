import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'node:net'

// WindowsのPHPでは同じポートへの二重起動が成功する場合があるため、先に確認します。
try {
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen({ host: '127.0.0.1', port: 8011, exclusive: true }, () => probe.close(resolve))
  })
} catch (error) {
  console.error(`8011番ポートを使用できません (${error.code})。起動済みのPHPを停止してから再実行してください。`)
  process.exit(1)
}

const front = fileURLToPath(new URL('../', import.meta.url))
const root = path.resolve(front, '..')
const storage = path.join(root, 'storage')
const temporary = path.join(storage, 'tmp')
mkdirSync(temporary, { recursive: true })

const children = new Set()
let stopping = false
let startupTimer

function stop(code = 0) {
  if (stopping) return
  stopping = true
  clearTimeout(startupTimer)
  process.exitCode = code
  for (const child of children) child.kill()
}

function launch(command, args, options) {
  const child = spawn(command, args, options)
  children.add(child)
  child.on('error', (error) => {
    console.error(`起動できません: ${command}: ${error.message}`)
    stop(1)
  })
  child.on('close', (code) => {
    children.delete(child)
    if (!stopping) stop(code || 1)
  })
  return child
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
process.on('exit', () => {
  for (const child of children) child.kill()
})

console.log(`PHP: http://127.0.0.1:8011\nZIP: ${path.join(storage, 'archives')}`)
const php = launch('php', [
  '-d', `upload_tmp_dir=${temporary}`,
  '-d', 'upload_max_filesize=100M',
  '-d', 'post_max_size=110M',
  '-d', 'max_file_uploads=20',
  '-d', 'display_errors=0',
  '-d', 'log_errors=1',
  '-S', '127.0.0.1:8011', path.join(root, 'php', 'router.php'),
], { cwd: root, env: { ...process.env, APP_STORAGE: storage }, stdio: ['ignore', 'inherit', 'pipe'] })

let startupOutput = ''
let ready = false
startupTimer = setTimeout(() => {
  console.error('PHPの起動を確認できませんでした。8011番ポートとPHPの設定を確認してください。')
  stop(1)
}, 10000)

php.stderr.on('data', (chunk) => {
  process.stderr.write(chunk)
  if (ready || stopping) return
  startupOutput = (startupOutput + chunk.toString()).slice(-8192)
  if (!/Development Server .* started/.test(startupOutput)) return
  ready = true
  clearTimeout(startupTimer)
  launch(process.execPath, [path.join(front, 'node_modules', 'vite', 'bin', 'vite.js'), ...process.argv.slice(2)], {
    cwd: front, stdio: 'inherit',
  })
})
